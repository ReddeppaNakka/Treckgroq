"""
Hidden-gems discovery — real points of interest (waterfalls, forts, caves, lakes,
viewpoints, temples, peaks, wildlife reserves) near a location, sourced live from
**OpenStreetMap** via the free, key-less Overpass API.

Design note: we never invent a POI or its coordinates — that would betray the
"never hallucinate facts" rule. Every result is a real, community-mapped OSM
feature, returned with its OSM id/link so it's fully citable. Overpass can be slow
or rate-limited, so this client tries mirrors, caches aggressively (POIs barely
change), and degrades gracefully to an empty list.
"""

from __future__ import annotations

import math
import time
from typing import Any, Dict, List, Optional

import requests

# Overpass mirrors, tried in order until one answers with JSON.
_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
_HEADERS = {"User-Agent": "Atlas-Travel/1.0 (hidden-gems discovery; contact: demo)"}
_TIMEOUT = 30.0
_CACHE_TTL = 24 * 60 * 60  # POIs are stable → cache a day
_cache: Dict[str, tuple] = {}

# Category -> OSM (key, value) selectors + a display label + an emoji/colour for
# the map/list. Storing selectors as tuples lets us BOTH build Overpass queries
# and classify a mixed "what's around" result back to its category.
CATEGORIES: Dict[str, Dict[str, Any]] = {
    "waterfalls": {"label": "Waterfalls", "emoji": "💧", "color": "#38bdf8",
                   "sel": [("natural", "waterfall"), ("waterway", "waterfall")]},
    "forts": {"label": "Forts & palaces", "emoji": "🏰", "color": "#f59e0b",
              "sel": [("historic", "fort"), ("historic", "castle"), ("historic", "palace")]},
    "caves": {"label": "Caves", "emoji": "🕳️", "color": "#a78bfa",
              "sel": [("natural", "cave_entrance")]},
    "lakes": {"label": "Lakes", "emoji": "🏞️", "color": "#22d3ee",
              "sel": [("water", "lake"), ("natural", "water")]},
    "viewpoints": {"label": "Viewpoints", "emoji": "🌄", "color": "#fb7185",
                   "sel": [("tourism", "viewpoint")]},
    "temples": {"label": "Temples & shrines", "emoji": "🛕", "color": "#e7c66b",
                "sel": [("historic", "temple"), ("amenity", "place_of_worship")]},
    "peaks": {"label": "Peaks & treks", "emoji": "⛰️", "color": "#818cf8",
              "sel": [("natural", "peak"), ("natural", "volcano")]},
    "wildlife": {"label": "Wildlife & nature", "emoji": "🦌", "color": "#34d399",
                 "sel": [("leisure", "nature_reserve"), ("boundary", "protected_area")]},
    "beaches": {"label": "Beaches", "emoji": "🏖️", "color": "#2dd4bf",
                "sel": [("natural", "beach")]},
}

# Categories mixed into the "what's around" view on a destination page.
_AROUND_CATS = ["viewpoints", "waterfalls", "forts", "lakes", "caves", "peaks", "temples", "beaches"]


def _sel_str(kv) -> str:
    return f'["{kv[0]}"="{kv[1]}"]'


def _classify(tags: Dict[str, str], cats):
    """Return the (key, meta) of the first category whose selector matches these
    OSM tags — used to label results of a mixed multi-category query."""
    for key in cats:
        meta = CATEGORIES[key]
        for k, v in meta["sel"]:
            if tags.get(k) == v:
                return key, meta
    return None, None


def _haversine(lat1, lon1, lat2, lon2) -> float:
    a1, o1, a2, o2 = map(math.radians, [lat1, lon1, lat2, lon2])
    h = math.sin((a2 - a1) / 2) ** 2 + math.cos(a1) * math.cos(a2) * math.sin((o2 - o1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def _cache_get(key: str):
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    return None


def _cache_put(key: str, value):
    _cache[key] = (time.time() + _CACHE_TTL, value)


def _query(ql: str) -> Optional[dict]:
    """POST a QL query to Overpass, trying mirrors; return parsed JSON or None."""
    for url in _ENDPOINTS:
        try:
            r = requests.post(url, data={"data": ql}, headers=_HEADERS, timeout=_TIMEOUT)
            if r.status_code == 200 and "json" in r.headers.get("content-type", ""):
                return r.json()
        except Exception:
            continue
    return None


def categories() -> List[Dict[str, str]]:
    """Public category list for the UI (key + label + emoji)."""
    return [{"key": k, "label": v["label"], "emoji": v["emoji"]} for k, v in CATEGORIES.items()]


def nearby(lat: float, lng: float, category: str, radius_km: float = 60,
           limit: int = 30) -> List[Dict[str, Any]]:
    """Real POIs of `category` within `radius_km` of (lat, lng), nearest first.
    Returns [] on any failure (never raises, never fabricates)."""
    cat = CATEGORIES.get(category)
    if not cat:
        return []
    radius_m = int(max(1, min(radius_km, 200)) * 1000)
    key = f"poi:{category}:{round(lat, 2)}:{round(lng, 2)}:{radius_m}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    # Union of node/way/relation for every selector, around the point.
    parts = "".join(
        f'nwr{_sel_str(sel)}(around:{radius_m},{lat},{lng});' for sel in cat["sel"]
    )
    ql = f"[out:json][timeout:25];({parts});out center tags 80;"
    data = _query(ql)
    if not data:
        _cache_put(key, [])  # cache the miss briefly-ish to avoid hammering
        return []

    seen = set()
    out: List[Dict[str, Any]] = []
    for e in data.get("elements", []):
        tags = e.get("tags") or {}
        name = tags.get("name") or tags.get("name:en")
        if not name:
            continue
        plat = e.get("lat") or (e.get("center") or {}).get("lat")
        plon = e.get("lon") or (e.get("center") or {}).get("lon")
        if plat is None or plon is None:
            continue
        dedupe = name.strip().lower()
        if dedupe in seen:
            continue
        seen.add(dedupe)
        dist = _haversine(lat, lng, plat, plon)
        otype = e.get("type", "node")
        out.append({
            "id": f"{otype}/{e.get('id')}",
            "name": name,
            "category": category,
            "category_label": cat["label"],
            "emoji": cat["emoji"],
            "color": cat["color"],
            "lat": round(plat, 5),
            "lng": round(plon, 5),
            "distance_km": round(dist, 1),
            "elevation": tags.get("ele"),
            "wikipedia": tags.get("wikipedia"),
            "osm_url": f"https://www.openstreetmap.org/{otype}/{e.get('id')}",
            "gmaps_url": f"https://www.google.com/maps/search/?api=1&query={plat},{plon}",
            "source": "OpenStreetMap",
        })

    out.sort(key=lambda p: p["distance_km"])
    out = out[:limit]
    _cache_put(key, out)
    return out


def around(lat: float, lng: float, radius_km: float = 45, limit: int = 24) -> List[Dict[str, Any]]:
    """A MIXED set of nearby highlights (viewpoints, waterfalls, forts, lakes…) in a
    single Overpass call — powers the 'what's around' map on a destination page.
    Each result is classified back to its category. Nearest first; [] on failure."""
    radius_m = int(max(1, min(radius_km, 120)) * 1000)
    key = f"around:{round(lat, 2)}:{round(lng, 2)}:{radius_m}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    seen_sel = []
    for c in _AROUND_CATS:
        seen_sel.extend(CATEGORIES[c]["sel"])
    parts = "".join(f'nwr{_sel_str(kv)}(around:{radius_m},{lat},{lng});' for kv in set(seen_sel))
    ql = f"[out:json][timeout:25];({parts});out center tags 120;"
    data = _query(ql)
    if not data:
        _cache_put(key, [])
        return []

    seen = set()
    out: List[Dict[str, Any]] = []
    for e in data.get("elements", []):
        tags = e.get("tags") or {}
        name = tags.get("name") or tags.get("name:en")
        if not name:
            continue
        plat = e.get("lat") or (e.get("center") or {}).get("lat")
        plon = e.get("lon") or (e.get("center") or {}).get("lon")
        if plat is None or plon is None:
            continue
        cat_key, meta = _classify(tags, _AROUND_CATS)
        if not meta:
            continue
        dedupe = name.strip().lower()
        if dedupe in seen:
            continue
        seen.add(dedupe)
        otype = e.get("type", "node")
        out.append({
            "id": f"{otype}/{e.get('id')}",
            "name": name,
            "category": cat_key,
            "category_label": meta["label"],
            "emoji": meta["emoji"],
            "color": meta["color"],
            "lat": round(plat, 5),
            "lng": round(plon, 5),
            "distance_km": round(_haversine(lat, lng, plat, plon), 1),
            "osm_url": f"https://www.openstreetmap.org/{otype}/{e.get('id')}",
            "gmaps_url": f"https://www.google.com/maps/search/?api=1&query={plat},{plon}",
            "source": "OpenStreetMap",
        })

    out.sort(key=lambda p: p["distance_km"])
    out = out[:limit]
    _cache_put(key, out)
    return out
