"""
One-shot builder for destinations_geo.json — a {name: [lat, lon]} map used by the
Explore map. Resolves every destination via pricing._geocode (authoritative pins
first, then Open-Meteo's free geocoder), so the map can plot pins without doing
live geocoding on every request.

Run from backend/ (no API key needed — Open-Meteo geocoding is free/key-less):
    python build_geo.py

Safe to re-run; it overwrites the file. Any destination that can't be resolved is
simply omitted (the map skips it) rather than guessed.
"""

from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor

import pricing
from destinations import DESTINATIONS

OUT = os.path.join(os.path.dirname(__file__), "destinations_geo.json")


def _resolve(d: dict):
    try:
        coords = pricing._geocode(d["name"], d["country"])
    except Exception:
        coords = None
    return d["name"], coords


def main() -> None:
    geo: dict = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for name, coords in pool.map(_resolve, DESTINATIONS):
            if coords:
                geo[name] = [round(coords[0], 4), round(coords[1], 4)]
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(geo, fh, ensure_ascii=False, indent=0)
    print(f"Resolved {len(geo)}/{len(DESTINATIONS)} destinations -> {OUT}")
    missing = [d["name"] for d in DESTINATIONS if d["name"] not in geo]
    if missing:
        print("Unresolved (skipped on map):", ", ".join(missing))


if __name__ == "__main__":
    main()
