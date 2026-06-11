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
import re
from typing import Any, Dict, List, Optional

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

from destinations import DESTINATIONS, ALL_TAGS

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
    "won": "KRW", "krw": "KRW", "ruble": "RUB", "rubles": "RUB", "rouble": "RUB", "rub": "RUB",
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
    """Best-effort currency detection from raw user text (symbols or words)."""
    for sym, code in _CURRENCY_SYMBOLS.items():
        if sym in text:
            return code
    low = text.lower()
    for word, code in _CURRENCY_WORDS.items():
        if re.search(rf"\b{re.escape(word)}\b", low):
            return code
    return None


# Shorthand multipliers (Indian + Western). "lakh"/"crore" imply an INR budget.
_MULTIPLIERS = {
    "k": 1_000, "thousand": 1_000,
    "lakh": 100_000, "lakhs": 100_000, "lac": 100_000, "lacs": 100_000,
    "crore": 10_000_000, "crores": 10_000_000, "cr": 10_000_000,
    "m": 1_000_000, "mn": 1_000_000, "million": 1_000_000,
}
_INDIAN_MULTIPLIERS = {"lakh", "lakhs", "lac", "lacs", "crore", "crores", "cr"}


def parse_budget(text: str) -> tuple[Optional[float], Optional[str]]:
    """Deterministically pull (amount, currency_code) out of the user's text.

    Returns (amount_in_that_currency, currency_code). Either may be None.
    Handles symbols/words/codes for the currency and Indian/Western shorthand
    (lakh, crore, k, million) for the amount. We do this in code rather than
    trusting the small intent model to read currencies correctly.
    """
    currency = detect_currency(text)
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


def extract_intent(message: str, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
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

    # --- Budget: parse + convert to USD deterministically in code ---
    # Primary source is a regex parse of the raw message (reliable for currency);
    # the small intent model is only a fallback when we can't find a number.
    raw_amount, currency = parse_budget(message)

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

    candidates = []
    for d in DESTINATIONS:
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

    enriched = []
    for d in candidates:
        flight = FLIGHT_BAND_COST.get(d["flight_band"], 600)
        ground = d["daily_cost_usd"] * days
        total = flight + ground
        item = dict(d)
        item["estimate"] = {
            "days": days,
            "flight_usd": flight,
            "ground_usd": ground,
            "total_usd": total,
            "per_day_usd": d["daily_cost_usd"],
            # Mirror every figure in INR so the UI can show both by default.
            "flight_inr": usd_to_inr(flight),
            "ground_inr": usd_to_inr(ground),
            "total_inr": usd_to_inr(total),
            "per_day_inr": usd_to_inr(d["daily_cost_usd"]),
        }
        # Budget fit score (1.0 = comfortably within budget).
        if budget:
            if total <= budget:
                item["budget_fit"] = 1.0
            elif total <= budget * 1.25:
                item["budget_fit"] = 0.6  # a stretch
            else:
                # Well over budget: keep a gradient (budget/total) so cheaper
                # options still rank above pricier ones instead of all collapsing
                # to 0, but cap it well below any genuinely in-budget option.
                item["budget_fit"] = round(min(0.5, budget / total), 3)
            item["within_budget"] = total <= budget
            item["over_budget_ratio"] = round(total / budget, 2)
        elif tier:
            item["budget_fit"] = 1.0 if d["budget_tier"] == tier else 0.45
            item["within_budget"] = d["budget_tier"] == tier
        else:
            item["budget_fit"] = 0.7
            item["within_budget"] = None
        enriched.append(item)
    return enriched


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


# ===========================================================================
# Stage 5 — Recommendation text
# ===========================================================================
def _format_for_prompt(top: List[Dict[str, Any]], intent: Dict[str, Any]) -> str:
    lines = []
    for d in top:
        est = d["estimate"]
        cost = f"{format_usd(est['total_usd'])} ({format_inr(est['total_inr'])})"
        lines.append(
            f"- {d['name']}, {d['country']} ({d['continent']}). "
            f"Best months: {', '.join(MONTH_NAMES[m] for m in d['best_months'])}. "
            f"Est. {est['days']}-day cost ~{cost} "
            f"({format_usd(est['per_day_usd'])}/day + ~{format_usd(est['flight_usd'])} flights). "
            f"Vibe: {d['blurb']} Tags: {', '.join(d['tags'])}."
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
- ALWAYS state each cost in BOTH US dollars and Indian rupees exactly as given in
  the shortlist, e.g. "around $1,135 (₹94,205)". Use the figures verbatim; never
  recompute or drop a currency.
- BUDGET HONESTY: never claim a trip fits a budget it exceeds. If the brief says
  the options are over the traveller's budget, say so plainly up front — these are
  the closest matches but cost more than they set — and tell them roughly how much
  more, then suggest raising the budget or a nearer/shorter trip. Do not gloss over it.
- Close with one short follow-up question to refine further.
Use light markdown (bold names, short paragraphs). No bullet-point spam, no headings."""


def generate_reply(top: List[Dict[str, Any]], intent: Dict[str, Any]) -> str:
    llm = _make_llm(SMART_MODEL, temperature=0.55)
    budget = intent.get("budget_total_usd")
    picks = top[:6]
    cheapest = min((d["estimate"]["total_usd"] for d in picks), default=None)

    budget_status = None
    if budget and cheapest is not None:
        budget_inr = format_inr(usd_to_inr(budget))
        if cheapest > budget:
            budget_status = (
                f"OVER BUDGET: the traveller's budget is ~{format_usd(budget)} ({budget_inr}), "
                f"but the cheapest option here is ~{format_usd(cheapest)} "
                f"(~{round(cheapest / budget, 1)}x their budget). EVERY option below is over budget. "
                f"Be honest about this up front and suggest raising the budget or a nearer/shorter trip."
            )
        elif not any(d.get("within_budget") for d in picks):
            budget_status = (
                f"The traveller's budget is ~{format_usd(budget)} ({budget_inr}); most options are a "
                f"stretch — flag the closest ones honestly."
            )
        else:
            budget_status = (
                f"The traveller's budget is ~{format_usd(budget)} ({budget_inr}); prioritise options "
                f"that fit and clearly flag any that are a stretch."
            )

    brief = {
        "budget_total_usd": budget,
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
    }
    resp = llm.invoke([
        SystemMessage(content=_REPLY_SYSTEM),
        HumanMessage(content=(
            f"Traveller brief: {json.dumps(brief)}\n\n"
            f"Ranked shortlist (pick the top 3):\n{_format_for_prompt(picks, intent)}"
        )),
    ])
    return resp.content.strip()


# ===========================================================================
# Orchestrator
# ===========================================================================
def run_workflow(message: str, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
    """Run the full agentic pipeline and return reply + trace + cards."""
    trace: List[Dict[str, Any]] = []

    intent = extract_intent(message, history)
    trace.append({
        "step": "Understanding your request",
        "detail": _describe_intent(intent),
    })

    candidates = filter_destinations(intent)
    trace.append({
        "step": "Filtering destinations",
        "detail": f"Narrowed {len(DESTINATIONS)} destinations down to "
                  f"{len(candidates)} that fit your season and region.",
    })

    costed = estimate_costs(candidates, intent)
    trace.append({
        "step": "Estimating trip costs",
        "detail": f"Costed each option for a {intent['trip_days']}-day trip "
                  f"(flights + on-the-ground spend).",
    })

    ranked = rank_destinations(costed, intent)
    top = ranked[:3]
    trace.append({
        "step": "Ranking by season, budget & interests",
        "detail": "Top match: " + ", ".join(
            f"{d['name']} ({int(d['scores']['overall']*100)}%)" for d in top
        ) if top else "No destinations matched.",
    })

    reply = generate_reply(ranked, intent) if top else (
        "I couldn't find a good match — could you tell me your budget, travel "
        "month and what kind of trip you're after?"
    )

    return {
        "reply": reply,
        "intent": intent,
        "trace": trace,
        "recommendations": [_card(d) for d in top],
    }


def _describe_intent(intent: Dict[str, Any]) -> str:
    bits = []
    if intent.get("budget_total_usd"):
        b = intent["budget_total_usd"]
        bits.append(f"~{format_usd(b)} / {format_inr(usd_to_inr(b))} budget")
    elif intent.get("budget_tier"):
        bits.append(f"{intent['budget_tier']} budget")
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
    }
