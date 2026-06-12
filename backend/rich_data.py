"""
Loader for the LLM pre-generated rich destination content
(`destinations_rich.json`). Each entry deepens a destination with
itinerary-style detail: tagline, ideal duration, highlights, must-visit
spots, food, who it's best for, and getting-around tips.

The file is produced by `enrich.py`. If it's missing or a destination isn't
covered yet, callers get {} and the app falls back to base fields — so nothing
breaks before enrichment has run.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict

_PATH = os.path.join(os.path.dirname(__file__), "destinations_rich.json")

# Shape every entry is normalised to, so the API/card schema is stable.
_EMPTY: Dict[str, Any] = {
    "tagline": None,
    "ideal_days_min": None,
    "ideal_days_max": None,
    "highlights": [],
    "must_visit": [],      # [{"name": str, "desc": str}]
    "covers": [],          # nearby areas / towns the trip can fold in
    "food": [],
    "best_for": [],        # couples / families / solo / friends / adventurers
    "getting_around": None,
    "tips": [],
}


def _load() -> Dict[str, Dict[str, Any]]:
    try:
        with open(_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


_RICH: Dict[str, Dict[str, Any]] = _load()


def get_rich(name: str) -> Dict[str, Any]:
    """Return normalised rich content for a destination name (never raises)."""
    data = _RICH.get(name) or {}
    merged = dict(_EMPTY)
    merged.update({k: v for k, v in data.items() if k in _EMPTY and v is not None})
    return merged


def has(name: str) -> bool:
    return name in _RICH


def coverage() -> int:
    return len(_RICH)


def reload() -> int:
    """Re-read the file (used after enrichment runs). Returns entry count."""
    global _RICH
    _RICH = _load()
    return len(_RICH)
