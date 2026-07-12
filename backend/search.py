"""
Hybrid destination search — keyword + semantic-theme + geospatial + season, in
pure Python (no vector DB, no API key, no model download). Built for the 145-item
catalog, where an in-process scorer is instant and fully explainable.

Why not embeddings? True ONNX/torch embeddings need system runtimes this target
machine lacks; for a small, curated catalog a weighted lexical + concept-expansion
+ geo scorer is fast, robust and — crucially — can say *why* each result matched,
which suits the product's "never a black box" goal.

Public API:
    search(query, mode=None, limit=24) -> list[dict]   # catalog cards + score + reasons
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional

import pricing
import rich_data
from destinations import DESTINATIONS

# ---------------------------------------------------------------------------
# Tokenisation
# ---------------------------------------------------------------------------
_STOP = {
    "a", "an", "the", "and", "or", "for", "to", "in", "on", "of", "with", "near",
    "around", "close", "by", "at", "some", "any", "my", "me", "i", "we", "trip",
    "trips", "place", "places", "want", "looking", "like", "good", "best", "nice",
    "under", "budget", "cheap", "day", "days", "week", "weekend", "get", "getaway",
    "getaways", "vacation", "holiday", "travel", "go", "going", "visit", "somewhere",
}


def _tok(text: str) -> List[str]:
    """Lowercase alnum tokens, minus stopwords, with a crude plural stem."""
    out = []
    for w in re.findall(r"[a-z0-9]+", (text or "").lower()):
        if w in _STOP or len(w) < 2:
            continue
        if len(w) > 4 and w.endswith("s"):
            w = w[:-1]
        out.append(w)
    return out


# ---------------------------------------------------------------------------
# Semantic theme lexicon: concept words -> interest tags (+ months / hints).
# This is the "semantic" layer — it lets "peaceful temples", "monsoon greenery"
# or "sunrise viewpoints" resolve to the right destinations even when those exact
# words never appear in the data.
# ---------------------------------------------------------------------------
MONSOON = [6, 7, 8, 9]
WINTER = [12, 1, 2]
SUMMER = [4, 5, 6]

THEMES = [
    {"trig": ["temple", "spiritual", "meditat", "pilgrim", "peaceful", "quiet", "serene", "monastery", "ashram", "yoga", "sacred", "calm"],
     "tags": ["spiritual", "wellness", "culture"], "label": "peaceful & spiritual"},
    {"trig": ["waterfall", "monsoon", "green", "lush", "rain", "misty", "valley", "river", "cascade"],
     "tags": ["nature"], "months": MONSOON, "label": "green & monsoon"},
    {"trig": ["offbeat", "hidden", "lesser", "underrated", "secret", "unexplored", "remote", "village", "backpack"],
     "tags": ["nature", "adventure", "budget"], "hidden": True, "label": "offbeat & hidden"},
    {"trig": ["sunrise", "sunset", "viewpoint", "trek", "hike", "hiking", "trekking", "summit", "peak", "ridge"],
     "tags": ["trekking", "mountains", "nature", "adventure"], "label": "treks & viewpoints"},
    {"trig": ["beach", "coast", "sea", "shore", "sand", "island", "surf", "snorkel"],
     "tags": ["beach", "water sports", "island hopping"], "label": "beaches & coast"},
    {"trig": ["mountain", "himalaya", "alpine", "snow", "peak", "hill", "highland"],
     "tags": ["mountains", "trekking", "nature"], "label": "mountains"},
    {"trig": ["wildlife", "safari", "tiger", "jungle", "forest", "sanctuary", "bird", "animal"],
     "tags": ["wildlife", "safari", "nature"], "label": "wildlife & safari"},
    {"trig": ["food", "cuisine", "culinary", "street", "eat", "foodie", "restaurant"],
     "tags": ["food"], "label": "food"},
    {"trig": ["nightlife", "party", "club", "bar", "vibrant"],
     "tags": ["nightlife", "city"], "label": "nightlife"},
    {"trig": ["romantic", "honeymoon", "couple", "romance", "intimate"],
     "tags": ["romance", "honeymoon"], "label": "romantic"},
    {"trig": ["adventure", "thrill", "adrenaline", "raft", "paraglid", "diving", "scuba", "bungee"],
     "tags": ["adventure", "water sports"], "label": "adventure"},
    {"trig": ["desert", "dune", "sand"],
     "tags": ["desert"], "label": "desert"},
    {"trig": ["heritage", "history", "fort", "palace", "ruin", "ancient", "colonial", "museum"],
     "tags": ["history", "culture"], "label": "heritage & history"},
    {"trig": ["road", "drive", "roadtrip", "scenic", "bike", "motorcycle", "ride"],
     "tags": ["road trip", "adventure"], "label": "road trips"},
    {"trig": ["coffee", "tea", "plantation", "estate"],
     "tags": ["coffee", "nature"], "label": "plantations"},
    {"trig": ["luxury", "luxe", "premium", "resort", "spa"],
     "tags": ["luxury", "wellness"], "label": "luxury"},
    {"trig": ["winter", "cold", "snow", "ski"],
     "tags": ["winter", "skiing"], "months": WINTER, "label": "winter"},
    {"trig": ["summer", "warm", "sunny"],
     "months": SUMMER, "tags": [], "label": "summer"},
]

_SEASON_WORDS = {
    "spring": [3, 4, 5], "summer": SUMMER, "autumn": [9, 10, 11], "fall": [9, 10, 11],
    "winter": WINTER, "monsoon": MONSOON, "rainy": MONSOON,
}
_MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], start=1)}

# ---------------------------------------------------------------------------
# Small Indian-city gazetteer for instant "near <city>" geo (no network). Any
# other place falls back to pricing._geocode (free Open-Meteo, cached).
# ---------------------------------------------------------------------------
_CITY_COORDS = {
    "hyderabad": (17.3850, 78.4867), "bangalore": (12.9716, 77.5946),
    "bengaluru": (12.9716, 77.5946), "mumbai": (19.0760, 72.8777),
    "delhi": (28.6139, 77.2090), "chennai": (13.0827, 80.2707),
    "kolkata": (22.5726, 88.3639), "pune": (18.5204, 73.8567),
    "ahmedabad": (23.0225, 72.5714), "jaipur": (26.9124, 75.7873),
    "kochi": (9.9312, 76.2673), "cochin": (9.9312, 76.2673),
    "goa": (15.2993, 74.1240), "lucknow": (26.8467, 80.9462),
    "chandigarh": (30.7333, 76.7794), "coimbatore": (11.0168, 76.9558),
    "visakhapatnam": (17.6868, 83.2185), "vizag": (17.6868, 83.2185),
    "nagpur": (21.1458, 79.0882), "indore": (22.7196, 75.8577),
    "bhopal": (23.2599, 77.4126), "guwahati": (26.1445, 91.7362),
    "surat": (21.1702, 72.8311), "vijayawada": (16.5062, 80.6480),
    "trivandrum": (8.5241, 76.9366), "thiruvananthapuram": (8.5241, 76.9366),
}

_GEO_TRIGGER = re.compile(
    r"\b(?:near|around|close to|from|beyond|outside|nearby)\s+([a-z][a-z .&'-]{2,40})",
    re.IGNORECASE,
)


def _detect_geo(query: str):
    """Return (place_label, (lat, lon)) if the query references a location, else None."""
    m = _GEO_TRIGGER.search(query)
    candidate = None
    if m:
        candidate = m.group(1).strip().strip(".").strip()
    else:
        # Also catch a bare known city anywhere in the text.
        low = query.lower()
        for city in _CITY_COORDS:
            if re.search(rf"\b{re.escape(city)}\b", low):
                candidate = city
                break
    if not candidate:
        return None
    key = candidate.lower().split(" near ")[-1].strip()
    # First word(s) up to a known city token.
    for city, coords in _CITY_COORDS.items():
        if city in key:
            return city.title(), coords
    # Fall back to the free geocoder (cached); assume India unless it looks foreign.
    coords = None
    try:
        coords = pricing._geocode(candidate, "India")
    except Exception:
        coords = None
    if coords:
        return candidate.title(), coords
    return None


def _haversine(a, b) -> float:
    """Great-circle distance in km between (lat, lon) tuples."""
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------------------
# Build a lexical index over the catalog once at import.
# ---------------------------------------------------------------------------
def _corpus_for(d: Dict[str, Any]) -> Dict[str, List[str]]:
    rich = rich_data.get_rich(d["name"])
    rich_text = " ".join([
        " ".join(rich.get("highlights") or []),
        " ".join(m.get("name", "") + " " + m.get("desc", "") for m in (rich.get("must_visit") or [])),
        " ".join(rich.get("food") or []),
        " ".join(rich.get("hidden_gems") or []),
        rich.get("tagline") or "",
    ])
    return {
        "name": _tok(d["name"]),
        "geo": _tok(f"{d['country']} {d['region']} {d['continent']}"),
        "tags": _tok(" ".join(d["tags"])),
        "blurb": _tok(d["blurb"]),
        "rich": _tok(rich_text),
    }


_FIELD_WEIGHT = {"name": 3.0, "tags": 3.0, "geo": 2.0, "rich": 1.5, "blurb": 1.0}

_INDEX: List[Dict[str, Any]] = []
_IDF: Dict[str, float] = {}


def _build_index() -> None:
    df: Dict[str, int] = {}
    for d in DESTINATIONS:
        fields = _corpus_for(d)
        allwords = set().union(*fields.values()) if fields else set()
        for w in allwords:
            df[w] = df.get(w, 0) + 1
        _INDEX.append({"d": d, "fields": fields})
    n = len(DESTINATIONS)
    for w, c in df.items():
        _IDF[w] = math.log(1 + n / (1 + c))


_build_index()


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def _lexical(qtokens: List[str], fields: Dict[str, List[str]]):
    """Weighted IDF token overlap across fields. Returns (score, matched_words)."""
    score = 0.0
    matched = set()
    fieldsets = {f: set(ws) for f, ws in fields.items()}
    for w in qtokens:
        idf = _IDF.get(w, 0.6)
        for f, weight in _FIELD_WEIGHT.items():
            if w in fieldsets[f]:
                score += idf * weight
                matched.add(w)
                break
    return score, matched


def search(query: str, mode: Optional[str] = None, limit: int = 24) -> List[Dict[str, Any]]:
    """Hybrid search over the catalog. `mode`: 'domestic' (India only) |
    'international' | None. Returns catalog cards with `score` (0-1) and `reasons`."""
    query = (query or "").strip()
    qtokens = _tok(query)
    low = query.lower()

    # --- Concept expansion: which interest tags / months does the query imply? ---
    wanted_tags: Dict[str, str] = {}   # tag -> theme label (for reasons)
    wanted_months: set = set()
    want_hidden = False
    for th in THEMES:
        if any(t in low for t in th["trig"]):
            for tag in th.get("tags", []):
                wanted_tags.setdefault(tag, th["label"])
            for m in th.get("months", []):
                wanted_months.add(m)
            if th.get("hidden"):
                want_hidden = True

    # --- Explicit season / month words ---
    for word, months in _SEASON_WORDS.items():
        if re.search(rf"\b{word}\b", low):
            wanted_months.update(months)
    for name, num in _MONTHS.items():
        if re.search(rf"\b{name}\b", low):
            wanted_months.add(num)

    # --- Geo ---
    geo = _detect_geo(query)
    geo_coords = geo[1] if geo else None

    results = []
    for entry in _INDEX:
        d = entry["d"]
        is_india = d["country"] == "India"
        if mode == "domestic" and not is_india:
            continue
        if mode == "international" and is_india:
            continue

        reasons: List[str] = []
        lex, matched = _lexical(qtokens, entry["fields"])

        # Theme/interest overlap.
        dtags = set(d["tags"])
        theme_hits = [t for t in wanted_tags if t in dtags]
        theme_score = 0.0
        if theme_hits:
            theme_score = 3.2 * len(theme_hits)
            labels = sorted({wanted_tags[t] for t in theme_hits})
            reasons.append("matches " + ", ".join(labels))

        # Season overlap.
        season_score = 0.0
        if wanted_months:
            overlap = wanted_months & set(d["best_months"])
            if overlap:
                season_score = 2.2
                mn = min(overlap)
                reasons.append(f"in season ({_MONTH_NAME(mn)})")

        # Offbeat/hidden preference -> favour budget, non-iconic.
        hidden_score = 0.0
        if want_hidden and d["budget_tier"] == "budget":
            hidden_score = 1.6
            reasons.append("offbeat & budget-friendly")

        # Geo proximity.
        geo_score = 0.0
        coords = pricing._COORDS.get(d["name"]) or _GEO.get(d["name"])
        if geo_coords and coords:
            dist = _haversine(geo_coords, coords)
            geo_score = 6.0 / (1 + dist / 250.0)   # strong pull, decays over ~hundreds of km
            if dist <= 600:
                reasons.append(f"~{int(round(dist))} km from {geo[0]}")

        if matched:
            kw = sorted(matched)[:3]
            reasons.append("mentions " + ", ".join(kw))

        total = lex + theme_score + season_score + hidden_score + geo_score
        if total <= 0:
            continue
        results.append({"d": d, "raw": total, "reasons": reasons})

    if not results:
        return []

    top = max(r["raw"] for r in results)
    results.sort(key=lambda r: r["raw"], reverse=True)
    out = []
    for r in results[:limit]:
        d = r["d"]
        rich = rich_data.get_rich(d["name"])
        coords = pricing._COORDS.get(d["name"]) or _GEO.get(d["name"])
        out.append({
            "id": d["id"],
            "name": d["name"],
            "country": d["country"],
            "region": d["region"],
            "continent": d["continent"],
            "tags": d["tags"],
            "blurb": d["blurb"],
            "tagline": rich.get("tagline"),
            "budget_tier": d["budget_tier"],
            "daily_cost_inr": int(round(d["daily_cost_usd"] * pricing._FX_FALLBACK)),
            "best_months": d["best_months"],
            "image_query": d["image_query"],
            "is_domestic": d["country"] == "India",
            "lat": coords[0] if coords else None,
            "lng": coords[1] if coords else None,
            "story": bool(rich.get("must_visit")),
            "score": round(r["raw"] / top, 3),
            "reasons": r["reasons"][:3],
        })
    return out


def _MONTH_NAME(m: int) -> str:
    names = ["", "January", "February", "March", "April", "May", "June", "July",
             "August", "September", "October", "November", "December"]
    return names[m] if 1 <= m <= 12 else ""


# Coordinates lookup shared with the map endpoint (geocoded file + pinned coords).
def _load_geo() -> dict:
    import json
    import os
    path = os.path.join(os.path.dirname(__file__), "destinations_geo.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            geo = {k: tuple(v) for k, v in json.load(fh).items()}
    except (FileNotFoundError, json.JSONDecodeError):
        geo = {}
    return geo


_GEO = _load_geo()
