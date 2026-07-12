"""
Multi-step agentic recommendation workflow built on LangChain + Groq (LLaMA 3).

Pipeline
--------
    1. extract_intent        (LLM)   natural language  ->  structured trip brief
    2. filter_destinations   (logic) shortlist by season / budget / interests
    3. estimate_costs        (logic) per-destination trip cost vs. the budget
    4. rank_destinations     (logic) weighted season + interest + budget score
    5. generate_reply        (LLM)   warm, grounded recommendation text

Each stage records a human-readable trace so the frontend can show the agent
"thinking" through the problem rather than emitting a single opaque answer.
"""

from __future__ import annotations

import json
import os
import random
import re
from typing import Any, Dict, List, Optional

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

import pricing
import rich_data
from destinations import DESTINATIONS, ALL_TAGS

# Common departure cities -> IATA, so a user can type "from Mumbai" or "BLR".
ORIGIN_IATA = {
    "delhi": "DEL", "new delhi": "DEL", "mumbai": "BOM", "bombay": "BOM",
    "bangalore": "BLR", "bengaluru": "BLR", "hyderabad": "HYD", "chennai": "MAA",
    "kolkata": "CCU", "calcutta": "CCU", "pune": "PNQ", "ahmedabad": "AMD",
    "goa": "GOI", "kochi": "COK", "cochin": "COK", "jaipur": "JAI",
    "lucknow": "LKO", "chandigarh": "IXC", "guwahati": "GAU", "indore": "IDR",
    "london": "LON", "new york": "NYC", "dubai": "DXB", "singapore": "SIN",
    "paris": "PAR", "tokyo": "TYO", "sydney": "SYD", "toronto": "YTO",
}


def resolve_origin(text: Optional[str]) -> Optional[str]:
    """Turn a free-text origin ('Mumbai', 'from Bangalore', 'DEL') into an IATA code."""
    if not text:
        return None
    t = text.strip().lower()
    # Bare 3-letter IATA code.
    m = re.fullmatch(r"[a-z]{3}", t)
    if m:
        return t.upper()
    for city, code in ORIGIN_IATA.items():
        if re.search(rf"\b{re.escape(city)}\b", t):
            return code
    return None


def _infer_mode(message: str) -> Optional[str]:
    """Sniff a domestic/international preference from the user's words."""
    low = message.lower()
    if re.search(r"\b(within india|in india|domestic|indian|desi|inside india)\b", low):
        return "domestic"
    if re.search(r"\b(international|abroad|overseas|foreign|out of india|outside india)\b", low):
        return "international"
    return None


def _infer_style(message: str, intent: Dict[str, Any]) -> str:
    """Decide the traveller's spending style: shoestring | budget | mid | luxury.

    Students and backpackers get the cheapest realistic plan (bus/train + hostels).
    We look for explicit words first, then fall back to the per-day budget if the
    traveller gave an amount, then to the budget tier word.
    """
    low = message.lower()
    if re.search(
        r"\b(students?|backpack\w*|shoestring|hostels?|dirt[\s-]?cheap|super[\s-]?cheap|"
        r"ultra[\s-]?budget|broke|cheapest|very (?:low|tight) budget|low[\s-]?cost)\b",
        low,
    ):
        return "shoestring"
    if re.search(r"\b(luxury|luxe|premium|five[\s-]?star|lavish|splurge)\b", low):
        return "luxury"

    budget = intent.get("budget_total_usd")
    days = max(1, int(intent.get("trip_days") or 7))
    if budget:
        per_day = budget / days
        if per_day < 22:      # < ~₹1,800/day
            return "shoestring"
        if per_day < 55:      # < ~₹4,500/day
            return "budget"
        if per_day > 200:     # > ~₹16,500/day
            return "luxury"
        return "mid"

    tier = intent.get("budget_tier")
    if tier == "luxury":
        return "luxury"
    if tier == "budget":
        return "budget"
    return "mid"


def _transport_cost_usd(dest: Dict[str, Any], style: str) -> tuple[float, str]:
    """Choose a travel cost + mode. Budget/shoestring travellers within India go by
    overnight bus or sleeper train; everyone else, and all international trips, fly."""
    is_india = dest["country"] == "India"
    band = dest["flight_band"]
    if is_india and style in ("shoestring", "budget"):
        return float(DOMESTIC_SURFACE_COST.get(band, 20)), "bus/train"
    if is_india:
        return float(FLIGHT_BAND_COST.get(band, 45)), "flight"
    return float(FLIGHT_BAND_COST.get(band, 600)), "flight"


def _is_domestic(intent: Dict[str, Any], dests: Optional[List[Dict[str, Any]]] = None) -> bool:
    """True when we should speak purely in rupees: an explicit domestic request, or
    a shortlist that is entirely within India."""
    if intent.get("mode") == "domestic":
        return True
    if dests:
        return all(d.get("country") == "India" for d in dests)
    return False

# ---------------------------------------------------------------------------
# Model configuration
# ---------------------------------------------------------------------------
# Groq's free tier serves the current LLaMA 3 family. The original
# `llama3-70b-8192` ids were retired, so we default to LLaMA 3.3 70B (the
# strongest free LLaMA on Groq) and fall back to the fast 8B for cheap stages.
SMART_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
FAST_MODEL = os.getenv("GROQ_FAST_MODEL", "llama-3.1-8b-instant")

MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]

SEASON_TO_MONTHS = {
    "spring": [3, 4, 5],
    "summer": [6, 7, 8],
    "autumn": [9, 10, 11],
    "fall": [9, 10, 11],
    "winter": [12, 1, 2],
}

# Rough round-trip airfare per flight band (USD), from an Indian origin.
# Band 0 is a domestic India hop (cheap flight / train); 1-4 climb to long-haul.
FLIGHT_BAND_COST = {0: 45, 1: 150, 2: 450, 3: 750, 4: 1100}

# Cheap domestic surface transport (overnight bus / sleeper train), round-trip
# USD, keyed by the same flight band. Budget travellers rarely fly within India —
# an overnight bus both costs a fraction of the fare and saves a night's stay.
DOMESTIC_SURFACE_COST = {0: 15, 1: 24, 2: 34, 3: 44, 4: 55}

# Daily on-the-ground spend multiplier by travel style, applied to the dataset's
# mid-range daily_cost_usd. Shoestring = hostels/dorms, street food, local buses;
# luxury = boutique stays and private transport.
STYLE_DAILY_MULT = {"shoestring": 0.5, "budget": 0.7, "mid": 1.0, "luxury": 1.7}

# USD -> INR conversion (override via env when rates move).
USD_TO_INR = float(os.getenv("USD_TO_INR", "83"))

# Approximate units of each currency per 1 USD. Used to convert any stated
# budget into USD *in code* — we never trust the LLM to do the arithmetic.
CURRENCY_PER_USD: Dict[str, float] = {
    "USD": 1.0, "INR": 83.0, "EUR": 0.92, "GBP": 0.79, "JPY": 150.0,
    "AED": 3.67, "SGD": 1.35, "AUD": 1.52, "CAD": 1.36, "CNY": 7.2,
    "KRW": 1330.0, "RUB": 90.0, "BRL": 5.0, "THB": 36.0, "IDR": 15700.0,
    "MYR": 4.7, "ZAR": 18.5, "CHF": 0.88, "NZD": 1.65, "HKD": 7.8,
    "SAR": 3.75, "QAR": 3.64, "TRY": 32.0, "MXN": 17.0, "PHP": 56.0,
    "VND": 25000.0, "EGP": 48.0, "NGN": 1500.0, "PKR": 280.0, "BDT": 110.0,
    "LKR": 300.0, "NPR": 133.0,
}

# Map symbols and common words to ISO currency codes, for a code-side fallback
# when the model forgets to tag the currency.
_CURRENCY_SYMBOLS = {
    "₹": "INR", "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY",
    "₩": "KRW", "₽": "RUB", "₺": "TRY", "₱": "PHP", "₫": "VND", "฿": "THB",
}
_CURRENCY_WORDS = {
    "rupee": "INR", "rupees": "INR", "inr": "INR", "rs": "INR", "₹": "INR",
    "dollar": "USD", "dollars": "USD", "usd": "USD", "buck": "USD", "bucks": "USD",
    "euro": "EUR", "euros": "EUR", "eur": "EUR",
    "pound": "GBP", "pounds": "GBP", "gbp": "GBP", "quid": "GBP", "sterling": "GBP",
    "yen": "JPY", "jpy": "JPY", "yuan": "CNY", "rmb": "CNY", "cny": "CNY",
    "dirham": "AED", "dirhams": "AED", "aed": "AED",
    "krw": "KRW", "ruble": "RUB", "rubles": "RUB", "rouble": "RUB", "rub": "RUB",
    "riyal": "SAR", "sar": "SAR", "baht": "THB", "thb": "THB",
    "ringgit": "MYR", "myr": "MYR", "peso": "MXN", "pesos": "MXN",
    "rand": "ZAR", "zar": "ZAR", "franc": "CHF", "chf": "CHF",
    "sgd": "SGD", "aud": "AUD", "cad": "CAD", "nzd": "NZD", "hkd": "HKD",
    "pkr": "PKR", "bdt": "BDT", "taka": "BDT", "lkr": "LKR",
}


def usd_to_inr(amount_usd: float) -> int:
    return int(round(amount_usd * USD_TO_INR))


def to_usd(amount: float, currency: Optional[str]) -> float:
    """Convert an amount in the given currency code to USD using CURRENCY_PER_USD."""
    code = (currency or "USD").upper()
    rate = CURRENCY_PER_USD.get(code, 1.0)
    return amount / rate


def detect_currency(text: str) -> Optional[str]:
    """Best-effort currency detection from raw user text (symbols or words).

    Tolerates currency tokens glued to digits, e.g. "8000rs", "rs8000", "₹8000",
    "8000inr" — only letters on either side block a match (so "first"/"yours"
    never read as "rs"), while adjacent digits are fine.
    """
    for sym, code in _CURRENCY_SYMBOLS.items():
        if sym in text:
            return code
    low = text.lower()
    # Longer tokens first so "rupees" wins over "rs" etc.
    for word in sorted(_CURRENCY_WORDS, key=len, reverse=True):
        if re.search(rf"(?<![a-z]){re.escape(word)}(?![a-z])", low):
            return _CURRENCY_WORDS[word]
    return None


# Shorthand multipliers (Indian + Western). "lakh"/"crore" imply an INR budget.
_MULTIPLIERS = {
    "k": 1_000, "thousand": 1_000,
    "lakh": 100_000, "lakhs": 100_000, "lac": 100_000, "lacs": 100_000,
    "crore": 10_000_000, "crores": 10_000_000, "cr": 10_000_000,
    "m": 1_000_000, "mn": 1_000_000, "million": 1_000_000,
}
_INDIAN_MULTIPLIERS = {"lakh", "lakhs", "lac", "lacs", "crore", "crores", "cr"}


def parse_budget(text: str, default_currency: Optional[str] = None) -> tuple[Optional[float], Optional[str]]:
    """Deterministically pull (amount, currency_code) out of the user's text.

    Returns (amount_in_that_currency, currency_code). Either may be None.
    Handles symbols/words/codes for the currency and Indian/Western shorthand
    (lakh, crore, k, million) for the amount. We do this in code rather than
    trusting the small intent model to read currencies correctly.

    ``default_currency`` is assumed when the text names no currency at all — in
    India/domestic mode this is "INR", so a bare "under 4000" reads as ₹4,000
    (not $4,000). This also lets a plain number count as a budget in that mode.
    """
    currency = detect_currency(text) or default_currency
    low = text.lower()

    # 1) Amount written with a shorthand multiplier: "2 lakh", "1.5k", "3 crore".
    m = re.search(
        r"(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr|thousand|million|k|mn|m)\b", low
    )
    if m:
        amount = float(m.group(1)) * _MULTIPLIERS[m.group(2)]
        if currency is None and m.group(2) in _INDIAN_MULTIPLIERS:
            currency = "INR"
        return amount, currency

    # 2) Plain number. Only treat it as a budget when we actually saw a currency
    #    (otherwise a bare "5 day trip" would be misread as a budget). Strip
    #    thousands separators, then take the largest number >= 100.
    if currency is not None:
        cleaned = text.replace(",", "").replace(" ", " ")
        nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", cleaned)]
        big = [n for n in nums if n >= 100]
        if big:
            return max(big), currency

    return None, currency


def format_inr(amount: float) -> str:
    """Format a rupee amount with Indian lakh/crore digit grouping. e.g. 118000 -> '1,18,000'."""
    n = int(round(amount))
    s = str(abs(n))
    if len(s) <= 3:
        grouped = s
    else:
        head, tail = s[:-3], s[-3:]
        # group the head in pairs from the right
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        parts.insert(0, head)
        grouped = ",".join(parts) + "," + tail
    return ("-" if n < 0 else "") + "₹" + grouped


def format_usd(amount: float) -> str:
    return "$" + format(int(round(amount)), ",")


def _make_llm(model: str, temperature: float = 0.4, json_mode: bool = False) -> ChatGroq:
    kwargs: Dict[str, Any] = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    return ChatGroq(
        model=model,
        temperature=temperature,
        max_tokens=1024,
        model_kwargs=kwargs,
    )


def _is_rate_limit(exc: Exception) -> bool:
    s = str(exc).lower()
    return "429" in s or "rate_limit" in s or "rate limit" in s


def _invoke_resilient(messages, temperature: float = 0.5, json_mode: bool = False,
                      prefer: str = SMART_MODEL):
    """Invoke the preferred model; if it's rate-limited (Groq free-tier daily
    cap), transparently retry on the fast model so the app keeps responding."""
    try:
        return _make_llm(prefer, temperature=temperature, json_mode=json_mode).invoke(messages)
    except Exception as exc:
        if _is_rate_limit(exc) and prefer != FAST_MODEL:
            return _make_llm(FAST_MODEL, temperature=temperature, json_mode=json_mode).invoke(messages)
        raise


def _safe_json(text: str) -> Dict[str, Any]:
    """Parse a JSON object out of an LLM response, tolerating stray prose."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    return {}


# ===========================================================================
# Stage 1 — Intent extraction
# ===========================================================================
_INTENT_SYSTEM = f"""You are the intake module of a travel-recommendation agent.
Extract a structured trip brief from the user's message and reply with ONLY a JSON object.

Schema (use null when unknown — never invent values):
{{
  "budget_amount": number|null,      // the raw budget number the user stated, in their OWN currency. Do NOT convert. Expand Indian shorthand: 1 lakh = 100000, 1 crore = 10000000.
  "budget_currency": string|null,    // ISO code of the currency the user mentioned, e.g. "INR", "USD", "EUR". Infer from symbol/word (₹/rupees -> INR, $/dollars -> USD, €/euros -> EUR).
  "budget_tier": "budget"|"mid"|"luxury"|null,
  "trip_days": number|null,          // length of trip in days
  "travel_month": number|null,       // 1-12 if a specific month is named
  "season": "spring"|"summer"|"autumn"|"winter"|null,
  "interests": string[],             // choose from: {", ".join(ALL_TAGS)}
  "preferred_continents": string[],  // e.g. ["Asia","Europe"] if the user constrains region
  "traveler_type": "solo"|"couple"|"family"|"friends"|null,
  "notes": string                    // one short sentence capturing anything else relevant
}}

CURRENCY: Understand budgets in ANY world currency — symbols (₹ $ € £ ¥ ₩ ₽ R$ etc.),
codes (INR, USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CNY, ...) or words ("rupees", "lakh",
"euros", "dirhams", "yen"). Put the number EXACTLY as the user said it in budget_amount
(do NOT do any currency conversion — our system handles that), and put the matching ISO
currency code in budget_currency. If the user gives no currency at all, leave budget_currency null.
Indian shorthand: 1 lakh = 100,000; 1 crore = 10,000,000 (expand these into budget_amount).
If the user gives a budget tier word (cheap/budget, moderate/mid, luxury/premium) map it to budget_tier.
Map any interests onto the allowed tag list as closely as possible."""


def extract_intent(message: str, history: Optional[List[Dict[str, str]]] = None,
                   mode: Optional[str] = None) -> Dict[str, Any]:
    llm = _make_llm(FAST_MODEL, temperature=0.1, json_mode=True)
    convo = ""
    if history:
        convo = "Earlier conversation:\n" + "\n".join(
            f"{m['role']}: {m['content']}" for m in history[-6:]
        ) + "\n\n"
    resp = llm.invoke([
        SystemMessage(content=_INTENT_SYSTEM),
        HumanMessage(content=f"{convo}User message: {message}"),
    ])
    data = _safe_json(resp.content)

    # This app is India-first: in domestic mode a bare number is rupees, so a
    # plain "under 4000" means ₹4,000 — never $4,000.
    eff_mode = mode or _infer_mode(message)
    default_ccy = "INR" if eff_mode == "domestic" else None

    # --- Budget: parse + convert to USD deterministically in code ---
    # Primary source is a regex parse of the raw message (reliable for currency);
    # the small intent model is only a fallback when we can't find a number.
    raw_amount, currency = parse_budget(message, default_ccy)

    if raw_amount is None:
        # Fall back to whatever the model extracted.
        model_amount = data.get("budget_amount")
        if model_amount is None:
            model_amount = data.get("budget_total_usd")  # tolerate old field name
        if isinstance(model_amount, str):
            model_amount = re.sub(r"[^\d.]", "", model_amount) or None
            model_amount = float(model_amount) if model_amount else None
        if isinstance(model_amount, (int, float)):
            raw_amount = float(model_amount)
        model_currency = data.get("budget_currency")
        if currency is None and isinstance(model_currency, str):
            currency = model_currency.strip().upper() or None
        # Still nothing? In domestic mode assume rupees rather than dollars.
        if currency is None:
            currency = default_ccy

    budget_total_usd = None
    if isinstance(raw_amount, (int, float)) and raw_amount > 0:
        budget_total_usd = round(to_usd(float(raw_amount), currency), 2)

    # Normalise / default.
    intent: Dict[str, Any] = {
        "budget_total_usd": budget_total_usd,
        "budget_amount": raw_amount if isinstance(raw_amount, (int, float)) else None,
        "budget_currency": currency,
        "budget_tier": data.get("budget_tier"),
        "trip_days": int(data["trip_days"]) if data.get("trip_days") else 7,
        "travel_month": data.get("travel_month"),
        "season": (data.get("season") or "").lower() or None,
        "interests": [t.lower() for t in (data.get("interests") or []) if isinstance(t, str)],
        "preferred_continents": data.get("preferred_continents") or [],
        "traveler_type": data.get("traveler_type"),
        "notes": data.get("notes") or "",
    }
    if isinstance(intent["travel_month"], (int, float)):
        intent["travel_month"] = int(intent["travel_month"])
        if not 1 <= intent["travel_month"] <= 12:
            intent["travel_month"] = None
    return intent


def _target_months(intent: Dict[str, Any]) -> List[int]:
    if intent.get("travel_month"):
        return [intent["travel_month"]]
    if intent.get("season"):
        return SEASON_TO_MONTHS.get(intent["season"], [])
    return []


# ===========================================================================
# Stage 2 — Filtering
# ===========================================================================
def filter_destinations(intent: Dict[str, Any]) -> List[Dict[str, Any]]:
    months = _target_months(intent)
    continents = {c.lower() for c in intent.get("preferred_continents", [])}
    interests = set(intent.get("interests", []))
    mode = intent.get("mode")  # "domestic" (India only) | "international" | None

    candidates = []
    for d in DESTINATIONS:
        is_india = d["country"] == "India"
        if mode == "domestic" and not is_india:
            continue
        if mode == "international" and is_india:
            continue
        if continents and d["continent"].lower() not in continents:
            continue
        candidates.append(d)

    # Prefer destinations that match the season; if too few do, keep all so we
    # can still rank and explain rather than returning an empty list.
    if months:
        in_season = [d for d in candidates if set(months) & set(d["best_months"])]
        if len(in_season) >= 5:
            candidates = in_season

    # Same graceful-relaxation idea for interests.
    if interests:
        matched = [d for d in candidates if interests & set(d["tags"])]
        if len(matched) >= 5:
            candidates = matched

    return candidates


# ===========================================================================
# Stage 3 — Cost estimation
# ===========================================================================
def estimate_costs(candidates: List[Dict[str, Any]], intent: Dict[str, Any]) -> List[Dict[str, Any]]:
    days = max(1, int(intent.get("trip_days") or 7))
    budget = intent.get("budget_total_usd")
    tier = intent.get("budget_tier")
    style = intent.get("travel_style") or "mid"
    mult = STYLE_DAILY_MULT.get(style, 1.0)

    enriched = []
    for d in candidates:
        # Transport scales with style (budget travellers take the bus/train within
        # India); daily spend scales with style too (dorm vs boutique).
        transport, transport_mode = _transport_cost_usd(d, style)
        per_day = max(6, round(d["daily_cost_usd"] * mult))
        ground = per_day * days
        total = transport + ground
        item = dict(d)
        item["estimate"] = {
            "days": days,
            "style": style,
            "transport_mode": transport_mode,   # "flight" | "bus/train"
            # Kept under the flight_* keys so the rest of the pipeline/UI is unchanged.
            "flight_usd": transport,
            "ground_usd": ground,
            "total_usd": total,
            "per_day_usd": per_day,
            # Mirror every figure in INR so the UI can show rupees by default.
            "flight_inr": usd_to_inr(transport),
            "ground_inr": usd_to_inr(ground),
            "total_inr": usd_to_inr(total),
            "per_day_inr": usd_to_inr(per_day),
            "source": "estimate",  # upgraded to "live"/"partly live" if real prices arrive
        }
        _score_budget_fit(item, total, budget, tier)
        enriched.append(item)
    return enriched


def _score_budget_fit(item: Dict[str, Any], total: float,
                      budget: Optional[float], tier: Optional[str]) -> None:
    """Set budget_fit / within_budget on an item for a given trip total (in place)."""
    if budget:
        if total <= budget:
            item["budget_fit"] = 1.0
        elif total <= budget * 1.25:
            item["budget_fit"] = 0.6  # a stretch
        else:
            # Well over budget: keep a gradient (budget/total) so cheaper options
            # still rank above pricier ones instead of all collapsing to 0, but
            # cap it well below any genuinely in-budget option.
            item["budget_fit"] = round(min(0.5, budget / total), 3)
        item["within_budget"] = total <= budget
        item["over_budget_ratio"] = round(total / budget, 2)
    elif tier:
        item["budget_fit"] = 1.0 if item["budget_tier"] == tier else 0.45
        item["within_budget"] = item["budget_tier"] == tier
    else:
        item["budget_fit"] = 0.7
        item["within_budget"] = None


# ===========================================================================
# Stage 4 — Seasonal + interest ranking
# ===========================================================================
def rank_destinations(items: List[Dict[str, Any]], intent: Dict[str, Any]) -> List[Dict[str, Any]]:
    months = _target_months(intent)
    interests = set(intent.get("interests", []))

    for d in items:
        # Season fit.
        if months:
            season_fit = 1.0 if set(months) & set(d["best_months"]) else 0.25
        else:
            season_fit = 0.7
        # Interest fit.
        if interests:
            overlap = interests & set(d["tags"])
            interest_fit = min(1.0, len(overlap) / max(1, len(interests)))
        else:
            interest_fit = 0.7

        budget_fit = d.get("budget_fit", 0.7)
        # When the traveller actually stated a number, let budget drive the
        # ranking much harder so cheap, in-season options rise to the top.
        if intent.get("budget_total_usd"):
            score = 0.30 * season_fit + 0.25 * interest_fit + 0.45 * budget_fit
        else:
            score = 0.45 * season_fit + 0.40 * interest_fit + 0.15 * budget_fit

        d["scores"] = {
            "season_fit": round(season_fit, 2),
            "interest_fit": round(interest_fit, 2),
            "budget_fit": round(budget_fit, 2),
            "overall": round(score, 3),
        }
        d["matched_interests"] = sorted(interests & set(d["tags"]))

    items.sort(key=lambda x: x["scores"]["overall"], reverse=True)
    return items


def select_top(ranked: List[Dict[str, Any]], k: int = 3, margin: float = 0.05
               ) -> List[Dict[str, Any]]:
    """Choose the k destinations to feature — with rotation among near-ties.

    Taking the deterministic top-k makes every similar (or vague) search return the
    exact same places: when a query doesn't pin down season/interest/budget, every
    candidate scores the same, and a stable sort just keeps dataset order, so the
    head of the list wins every time. Instead we gather all destinations scoring
    within ``margin`` of the best and rotate randomly among them, so repeat/similar
    searches surface fresh — but still strong — picks. We also avoid featuring k
    places from the same country when the pool allows it.
    """
    if not ranked:
        return []
    top_score = ranked[0]["scores"]["overall"]
    pool = [d for d in ranked if d["scores"]["overall"] >= top_score - margin]
    random.shuffle(pool)

    chosen: List[Dict[str, Any]] = []
    chosen_ids: set = set()
    seen_countries: set = set()

    # First pass: prefer one pick per country for a more varied shortlist.
    for d in pool:
        if len(chosen) >= k:
            break
        if d["country"] in seen_countries:
            continue
        chosen.append(d)
        chosen_ids.add(d["id"])
        seen_countries.add(d["country"])

    # If country-diversity left us short, fill from the rest of the (shuffled) pool.
    for d in pool:
        if len(chosen) >= k:
            break
        if d["id"] not in chosen_ids:
            chosen.append(d)
            chosen_ids.add(d["id"])

    # Tiny pool? Top up from the remaining ranked list in score order.
    for d in ranked:
        if len(chosen) >= k:
            break
        if d["id"] not in chosen_ids:
            chosen.append(d)
            chosen_ids.add(d["id"])

    return chosen[:k]


# ===========================================================================
# Stage 4.5 — Live pricing (best-effort overlay on the top shortlist)
# ===========================================================================
def apply_live_prices(top: List[Dict[str, Any]], intent: Dict[str, Any]) -> int:
    """Overlay live flight/hotel prices on the top shortlist, in place.

    Returns the number of destinations that got at least one live figure. Any
    failure leaves the static estimate untouched (source stays "estimate").
    """
    if not pricing.enabled() or not top:
        return 0

    origin = intent.get("origin_iata")
    month = intent.get("travel_month")
    days = max(1, int(intent.get("trip_days") or 7))
    inr_rate = pricing.usd_to_inr_rate()

    live = pricing.live_estimates([d["name"] for d in top], origin, month, days)
    updated = 0
    for d in top:
        # Budget bus/train trips shouldn't be overwritten with airfares/hotel rates —
        # keep the cheap surface estimate that matches how the traveller will go.
        if d["estimate"].get("transport_mode") == "bus/train":
            continue
        got = live.get(d["name"])
        if not got:
            continue
        est = d["estimate"]
        flight = got.get("flight_usd", est["flight_usd"])
        per_day = got.get("per_night_usd", est["per_day_usd"])
        ground = per_day * est["days"]
        total = flight + ground
        est.update({
            "flight_usd": flight,
            "ground_usd": ground,
            "total_usd": total,
            "per_day_usd": per_day,
            "flight_inr": int(round(flight * inr_rate)),
            "ground_inr": int(round(ground * inr_rate)),
            "total_inr": int(round(total * inr_rate)),
            "per_day_inr": int(round(per_day * inr_rate)),
            # "live" if both legs are real, otherwise "partly live".
            "source": "live" if {"flight_usd", "per_night_usd"} <= got.keys() else "partly live",
        })
        # Re-evaluate budget fit against the now-live total so re-ranking is correct.
        _score_budget_fit(d, total, intent.get("budget_total_usd"), intent.get("budget_tier"))
        updated += 1
    return updated


# ===========================================================================
# Stage 4.6 — Live climate (free, key-less Open-Meteo overlay)
# ===========================================================================
def apply_climate(top: List[Dict[str, Any]], intent: Dict[str, Any]) -> int:
    """Attach a live climate block to each shortlisted destination, in place.

    Uses the traveller's chosen month when they named one; otherwise each
    destination's own first best-month, so the card still shows honest weather.
    Returns the number of destinations that got a climate reading.
    """
    if not pricing.climate_enabled() or not top:
        return 0
    tmonth = intent.get("travel_month")
    reqs = [
        (d["name"], d["country"], tmonth or (d["best_months"][0] if d.get("best_months") else 1))
        for d in top
    ]
    got = pricing.climate_estimates(reqs)
    updated = 0
    for d in top:
        c = got.get(d["name"])
        if c:
            # Flag when the traveller's own month is a poor-weather window but the
            # destination has better (often cheaper, less crowded) months to offer.
            if tmonth and not c.get("pleasant"):
                better = [MONTH_NAMES[m] for m in d.get("best_months", []) if m != tmonth]
                if better:
                    c["better_months"] = better[:3]
            d["climate"] = c
            updated += 1
    return updated


# ===========================================================================
# Stage 5 — Recommendation text
# ===========================================================================
def _format_for_prompt(top: List[Dict[str, Any]], intent: Dict[str, Any]) -> str:
    domestic = _is_domestic(intent, top)
    lines = []
    for d in top:
        est = d["estimate"]
        mode = est.get("transport_mode", "flights")
        if domestic:
            # Rupees only, and name the real way there (overnight bus/train vs flight).
            cost = format_inr(est["total_inr"])
            per = f"{format_inr(est['per_day_inr'])}/day"
            trans = f"~{format_inr(est['flight_inr'])} {mode}"
        else:
            cost = f"{format_usd(est['total_usd'])} ({format_inr(est['total_inr'])})"
            per = f"{format_usd(est['per_day_usd'])}/day"
            trans = f"~{format_usd(est['flight_usd'])} {mode}"
        tag = "LIVE price" if est.get("source") == "live" else (
            "part-live price" if est.get("source") == "partly live" else "estimate")
        clim = d.get("climate")
        weather = ""
        if clim:
            weather = (f" Weather in {MONTH_NAMES[clim['month']]}: {clim['verdict']}, "
                       f"~{clim['high_c']}°C day / {clim['low_c']}°C night.")
            if clim.get("better_months"):
                weather += (f" (That month is not ideal here — {', '.join(clim['better_months'])} "
                            f"are pleasanter and usually cheaper/less crowded.)")
        lines.append(
            f"- {d['name']}, {d['country']} ({d['continent']}). "
            f"Best months: {', '.join(MONTH_NAMES[m] for m in d['best_months'])}. "
            f"{est['days']}-day cost ~{cost} [{tag}] "
            f"({per} + {trans}). "
            f"Vibe: {d['blurb']} Tags: {', '.join(d['tags'])}.{weather}"
        )
    return "\n".join(lines)


_REPLY_SYSTEM = """You are Atlas, a warm, sharp travel-recommendation agent.
You are given a traveller's brief and a pre-computed shortlist of destinations
(already filtered by season, costed, and ranked). Recommend the BEST 3 from the
shortlist only — never invent destinations or numbers.

Write naturally and concisely (about 130-200 words):
- Open with one friendly sentence acknowledging what they asked for.
- For each of the 3 picks: a bold destination name, then 1-2 sentences on why it
  fits their season, budget and interests, weaving in the estimated cost.
- CURRENCY: use the cost figures from the shortlist verbatim — never recompute or
  invent numbers. Obey the brief's "currency_instruction": if it is "INR only",
  quote EVERY price in Indian rupees only (e.g. "around ₹4,200") and do NOT mention
  US dollars at all; otherwise give both, e.g. "around $1,135 (₹94,205)".
- TRAVEL STYLE: the brief carries "travel_style", and each shortlist line names how
  you get there ("bus/train" or "flight"). For budget/shoestring travellers (e.g.
  students), lean into saving money: recommend the overnight bus or sleeper train
  (it also saves a night's stay), hostels/dorms and local street food, and give a
  clear all-in total. For luxury, match that tone instead. Never push flights on a
  budget traveller when the shortlist says bus/train.
- BUDGET HONESTY: never claim a trip fits a budget it exceeds. If the brief says the
  options are over the traveller's budget, say so plainly up front — these are the
  closest matches but cost more than they set — and tell them roughly how much more,
  then suggest a nearer/shorter trip or a cheaper travel style. Do not gloss over it.
- WEATHER: some shortlist lines include real climate for the travel month. Weave it in
  naturally when it helps ("late November is warm and dry, ~28°C"). If a line says the
  chosen month isn't ideal and names pleasanter months, gently suggest shifting to one of
  those — they're usually cheaper and less crowded, which serves a budget traveller.
- LIVE PRICES: a shortlist line tagged [LIVE price] is a real fetched fare/rate — you
  may call it a "live price"; lines tagged [estimate] are planning estimates, so don't
  call those "live". Only when the trip involves flights and the brief says
  origin_known is false, briefly invite the traveller to share their departure city
  for live flight prices — never ask this for a bus/train trip.
- Close with one short follow-up question to refine further.
Use light markdown (bold names, short paragraphs). No bullet-point spam, no headings."""


def generate_reply(top: List[Dict[str, Any]], intent: Dict[str, Any]) -> str:
    budget = intent.get("budget_total_usd")
    picks = top[:6]
    cheapest = min((d["estimate"]["total_usd"] for d in picks), default=None)
    domestic = _is_domestic(intent, picks)

    def money(usd: float) -> str:
        """Rupees only for domestic trips; dollars + rupees otherwise."""
        if domestic:
            return format_inr(usd_to_inr(usd))
        return f"{format_usd(usd)} ({format_inr(usd_to_inr(usd))})"

    budget_status = None
    if budget and cheapest is not None:
        if cheapest > budget:
            budget_status = (
                f"OVER BUDGET: the traveller's budget is ~{money(budget)}, but the cheapest "
                f"option here is ~{money(cheapest)} (~{round(cheapest / budget, 1)}x their budget). "
                f"EVERY option below is over budget. Be honest about this up front and suggest a "
                f"nearer/shorter trip or a cheaper travel style (bus/train, hostels)."
            )
        elif not any(d.get("within_budget") for d in picks):
            budget_status = (
                f"The traveller's budget is ~{money(budget)}; most options are a stretch — flag the "
                f"closest ones honestly."
            )
        else:
            budget_status = (
                f"The traveller's budget is ~{money(budget)}; prioritise options that fit and clearly "
                f"flag any that are a stretch."
            )

    brief = {
        "currency_instruction": "INR only" if domestic else "USD and INR",
        "domestic_trip": domestic,
        "travel_style": intent.get("travel_style"),
        "budget_total_usd": None if domestic else budget,
        "budget_in_rupees": format_inr(usd_to_inr(budget)) if budget else None,
        "budget_currency": intent.get("budget_currency"),
        "budget_tier": intent.get("budget_tier"),
        "budget_status": budget_status,
        "trip_days": intent.get("trip_days"),
        "travel_month": MONTH_NAMES[intent["travel_month"]] if intent.get("travel_month") else None,
        "season": intent.get("season"),
        "interests": intent.get("interests"),
        "traveler_type": intent.get("traveler_type"),
        "notes": intent.get("notes"),
        "origin_known": bool(intent.get("origin_iata")),
        "live_pricing_on": pricing.enabled(),
    }
    resp = _invoke_resilient([
        SystemMessage(content=_REPLY_SYSTEM),
        HumanMessage(content=(
            f"Traveller brief: {json.dumps(brief)}\n\n"
            f"Ranked shortlist (pick the top 3):\n{_format_for_prompt(picks, intent)}"
        )),
    ], temperature=0.55)
    return resp.content.strip()


# ===========================================================================
# Orchestrator
# ===========================================================================
def workflow_events(message: str, history: Optional[List[Dict[str, str]]] = None,
                    origin: Optional[str] = None, mode: Optional[str] = None):
    """Run the pipeline as a generator, yielding each step the moment it finishes
    so the UI can show the agent "thinking" live. Yields {"type":"step", ...} per
    stage, then a final {"type":"result", ...} with reply + cards.

    mode: "domestic" (India only), "international", or None (auto/all). An
    explicit UI mode wins; otherwise we sniff intent from the message.
    """
    trace: List[Dict[str, Any]] = []

    def emit(step: str, detail: str) -> Dict[str, Any]:
        entry = {"step": step, "detail": detail}
        trace.append(entry)
        return {"type": "step", **entry}

    intent = extract_intent(message, history, mode)
    # Origin: explicit field from the UI wins; otherwise sniff "from <city>".
    origin_iata = resolve_origin(origin) or resolve_origin(message)
    intent["origin_iata"] = origin_iata
    intent["mode"] = mode or _infer_mode(message)
    intent["travel_style"] = _infer_style(message, intent)
    yield emit("Understanding your request", _describe_intent(intent))

    candidates = filter_destinations(intent)
    scope = {"domestic": "within India", "international": "international"}.get(
        intent.get("mode"), "across all regions")
    yield emit("Filtering destinations",
               f"Searched {scope}: narrowed {len(DESTINATIONS)} destinations down "
               f"to {len(candidates)} that fit your season and region.")

    costed = estimate_costs(candidates, intent)
    yield emit("Estimating trip costs",
               f"Costed each option for a {intent['trip_days']}-day trip "
               f"(flights + on-the-ground spend).")

    ranked = rank_destinations(costed, intent)

    # Best-effort: overlay live flight/hotel prices on the shortlist we'll show.
    shortlist = ranked[:6]
    n_live = apply_live_prices(shortlist, intent)
    if pricing.enabled():
        if n_live:
            src = "Pulled live flight & hotel prices" + (
                f" from {origin_iata}" if origin_iata else "")
            yield emit("Fetching live prices",
                       f"{src} for {n_live} of the top picks "
                       f"(falling back to estimates where unavailable).")
        else:
            yield emit("Fetching live prices",
                       "Live prices weren't available right now — showing planning estimates.")

    # Live totals can shift which picks fit the budget, so re-rank the shortlist.
    ranked = rank_destinations(shortlist, intent) + ranked[6:]
    # Rotate among near-ties instead of always taking the same deterministic top 3,
    # so repeat/similar searches don't keep surfacing the same handful of places.
    top = select_top(ranked, 3)
    yield emit("Ranking by season, budget & interests",
               "Top match: " + ", ".join(
                   f"{d['name']} ({int(d['scores']['overall']*100)}%)" for d in top
               ) if top else "No destinations matched.")

    # Free, key-less: overlay real climate on the final picks so travellers can
    # judge the weather (and dodge pricey peak months for pleasant cheaper ones).
    if top and pricing.climate_enabled():
        n_clim = apply_climate(top, intent)
        if n_clim:
            when = MONTH_NAMES[intent["travel_month"]] if intent.get("travel_month") else "their best season"
            yield emit("Checking the weather window",
                       f"Pulled typical {when} weather for {n_clim} of the top picks "
                       f"so you know what to expect on the ground.")

    yield {"type": "step", "step": "Writing your recommendation",
           "detail": "Drafting a personal pick from the shortlist…"}

    # Generate the reply from exactly the rotated picks, so the written
    # recommendation names the same places shown on the cards.
    reply = generate_reply(top, intent) if top else (
        "I couldn't find a good match — could you tell me your budget, travel "
        "month and what kind of trip you're after?"
    )

    yield {
        "type": "result",
        "reply": reply,
        "intent": intent,
        "trace": trace,
        "recommendations": [_card(d) for d in top],
    }


def run_workflow(message: str, history: Optional[List[Dict[str, str]]] = None,
                 origin: Optional[str] = None, mode: Optional[str] = None) -> Dict[str, Any]:
    """Non-streaming entry point: drain the event generator and return the final
    result dict (reply + trace + cards)."""
    result: Dict[str, Any] = {}
    for ev in workflow_events(message, history, origin, mode):
        if ev.get("type") == "result":
            result = {k: v for k, v in ev.items() if k != "type"}
    return result


def _describe_intent(intent: Dict[str, Any]) -> str:
    domestic = intent.get("mode") == "domestic"
    bits = []
    if intent.get("budget_total_usd"):
        b = intent["budget_total_usd"]
        bits.append(
            f"{format_inr(usd_to_inr(b))} budget" if domestic
            else f"~{format_usd(b)} / {format_inr(usd_to_inr(b))} budget"
        )
    elif intent.get("budget_tier"):
        bits.append(f"{intent['budget_tier']} budget")
    if intent.get("travel_style") in ("shoestring", "budget"):
        bits.append("budget / backpacker style")
    if intent.get("travel_month"):
        bits.append(f"travel in {MONTH_NAMES[intent['travel_month']]}")
    elif intent.get("season"):
        bits.append(f"{intent['season']} travel")
    if intent.get("trip_days"):
        bits.append(f"{intent['trip_days']} days")
    if intent.get("interests"):
        bits.append("interests: " + ", ".join(intent["interests"]))
    return "Detected " + ("; ".join(bits) if bits else "an open-ended request") + "."


def _card(d: Dict[str, Any]) -> Dict[str, Any]:
    rich = rich_data.get_rich(d["name"])
    return {
        "id": d["id"],
        "name": d["name"],
        "country": d["country"],
        "continent": d["continent"],
        "blurb": d["blurb"],
        "tags": d["tags"],
        "matched_interests": d.get("matched_interests", []),
        "best_months": [MONTH_NAMES[m] for m in d["best_months"]],
        "budget_tier": d["budget_tier"],
        "estimate": d["estimate"],
        "within_budget": d.get("within_budget"),
        "scores": d["scores"],
        "image_query": d["image_query"],
        "is_domestic": d["country"] == "India",
        # Live climate for the travel month (None if Open-Meteo had no reading).
        "climate": d.get("climate"),
        # Rich, itinerary-style detail (empty lists/None until enrichment runs).
        "tagline": rich["tagline"],
        "ideal_days_min": rich["ideal_days_min"],
        "ideal_days_max": rich["ideal_days_max"],
        "highlights": rich["highlights"],
        "must_visit": rich["must_visit"],
        "hidden_gems": rich["hidden_gems"],
        "covers": rich["covers"],
        "food": rich["food"],
        "stay_areas": rich["stay_areas"],
        "budget_split": rich["budget_split"],
        "getting_there": rich["getting_there"],
        "getting_around": rich["getting_around"],
        "visa": rich["visa"],
        "safety": rich["safety"],
        "sim_connectivity": rich["sim_connectivity"],
        "language": rich["language"],
        "events": rich["events"],
        "best_for": rich["best_for"],
        "tips": rich["tips"],
    }


def build_destination_card(name: str, days: Optional[int] = None) -> Dict[str, Any]:
    """Build a full destination card for ONE named place, with no LLM call — used
    by the Explore experience so tapping a place opens exactly that destination's
    story + costs instantly. Costs are neutral planning estimates (mid style, no
    stated budget); the day-by-day itinerary is still fetched on demand elsewhere.
    """
    dest = next((d for d in DESTINATIONS if d["name"] == name), None)
    if not dest:
        raise ValueError(f"Unknown destination: {name}")
    rich = rich_data.get_rich(name)
    trip_days = int(days or rich.get("ideal_days_min") or 5)
    intent: Dict[str, Any] = {
        "trip_days": trip_days,
        "travel_style": "mid",
        "budget_total_usd": None,
        "budget_tier": None,
        "interests": [],
        "preferred_continents": [],
        "travel_month": None,
        "season": None,
    }
    costed = estimate_costs([dict(dest)], intent)   # -> estimate block
    ranked = rank_destinations(costed, intent)      # -> scores + matched_interests
    card_src = ranked[0]
    card_src["within_budget"] = None
    return _card(card_src)


# ===========================================================================
# On-demand: tailored day-by-day itinerary for one destination
# ===========================================================================
_ITINERARY_SYSTEM = """You are Atlas, a travel-planning agent crafting a vivid,
realistic day-by-day itinerary for ONE destination. Reply with ONLY a JSON object:

{
  "summary": string,                  // one-sentence overview of the trip arc
  "days": [
    {
      "day": number,
      "title": string,                // short theme for the day, e.g. "Old town & sunset"
      "morning": string,              // one concrete activity sentence
      "afternoon": string,
      "evening": string,
      "cost_usd": number              // realistic per-person spend for THIS day in USD
                                      // (stay + food + local transport + that day's activities)
    }
  ]
}

Rules: produce EXACTLY the requested number of days. Use real, specific places
for this destination (lean on the provided must-visit list). Pace it sensibly
(arrival/easing in on day 1, a marquee sight mid-trip, wind-down at the end).
Tailor to the stated interests. Keep each line tight and evocative.
COSTS: base each day's cost_usd around the given typical daily spend, varying it
sensibly — higher on activity/excursion-heavy days, lower on relaxed/beach days.
Be realistic for this destination; never return 0."""


def generate_itinerary(name: str, days: int,
                       interests: Optional[List[str]] = None) -> Dict[str, Any]:
    """Generate a tailored day-by-day plan for a destination (on demand)."""
    dest = next((d for d in DESTINATIONS if d["name"] == name), None)
    if not dest:
        raise ValueError(f"Unknown destination: {name}")
    days = max(1, min(14, int(days or 5)))
    rich = rich_data.get_rich(name)
    must = "; ".join(f"{m['name']} ({m.get('desc','')})" for m in rich["must_visit"]) \
        or ", ".join(dest["tags"])

    typical_day_usd = dest["daily_cost_usd"]
    brief = (
        f"Destination: {name}, {dest['country']} ({dest['continent']}).\n"
        f"Vibe: {dest['blurb']}\n"
        f"Must-visit anchors: {must}.\n"
        f"Trip length: {days} days.\n"
        f"Typical on-the-ground spend: about ${typical_day_usd} per person per day.\n"
        f"Traveller interests: {', '.join(interests) if interests else 'general sightseeing'}.\n"
        f"Write the {days}-day itinerary JSON now."
    )
    resp = _invoke_resilient([
        SystemMessage(content=_ITINERARY_SYSTEM),
        HumanMessage(content=brief),
    ], temperature=0.6, json_mode=True)
    data = _safe_json(resp.content)
    plan = data.get("days") or []

    inr_rate = pricing.usd_to_inr_rate()
    # Sanity bounds so an LLM slip can't show an absurd day cost.
    lo, hi = typical_day_usd * 0.4, typical_day_usd * 4

    cleaned = []
    total_usd = 0
    for i, day in enumerate(plan[:days], 1):
        cost = day.get("cost_usd")
        try:
            cost = float(cost)
        except (TypeError, ValueError):
            cost = typical_day_usd
        if not (lo <= cost <= hi):
            cost = typical_day_usd
        cost = round(cost)
        total_usd += cost
        cleaned.append({
            "day": i,
            "title": (day.get("title") or "").strip(),
            "morning": (day.get("morning") or "").strip(),
            "afternoon": (day.get("afternoon") or "").strip(),
            "evening": (day.get("evening") or "").strip(),
            "cost_usd": cost,
            "cost_inr": int(round(cost * inr_rate)),
        })
    return {
        "destination": name,
        "country": dest["country"],
        "days": len(cleaned),
        "summary": (data.get("summary") or "").strip(),
        "plan": cleaned,
        "total_usd": total_usd,
        "total_inr": int(round(total_usd * inr_rate)),
        "note": "Per-day costs are planning estimates (stay, food, local travel & activities), excluding flights.",
    }
