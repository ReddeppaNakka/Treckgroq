"""
One-time (resumable) enrichment of the destination dataset with the Groq LLM.

For every destination in destinations.py it asks the model for itinerary-style
detail and writes it to destinations_rich.json, keyed by destination name.

Usage (from backend/, with GROQ_API_KEY in .env):
    python enrich.py                # enrich everything still missing
    python enrich.py --only India   # only destinations whose country == India
    python enrich.py --force        # regenerate even already-done entries

It writes after every destination, so it is safe to stop and re-run — already
generated entries are skipped (unless --force).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()

from langchain_core.messages import HumanMessage, SystemMessage  # noqa: E402

from agent import _make_llm, _safe_json, SMART_MODEL, MONTH_NAMES  # noqa: E402
from destinations import DESTINATIONS  # noqa: E402

OUT_PATH = os.path.join(os.path.dirname(__file__), "destinations_rich.json")

_SYSTEM = """You are a meticulous travel editor writing structured trip data for a
premium travel app. Given a destination, reply with ONLY a JSON object that
matches this schema exactly (no prose, no markdown):

{
  "tagline": string,                 // one vivid 6-12 word hook
  "ideal_days_min": number,          // realistic minimum trip length in days
  "ideal_days_max": number,          // comfortable maximum in days
  "highlights": string[],            // 4 short phrases on what makes it special
  "must_visit": [                    // 5 specific real places/experiences
    {"name": string, "desc": string} // desc = one short sentence
  ],
  "covers": string[],                // 3-4 nearby areas/towns a trip can fold in
  "food": string[],                  // 4 iconic dishes or food experiences
  "best_for": string[],             // subset of: couples, families, solo, friends, adventurers, luxury, backpackers
  "getting_around": string,          // one sentence on local transport
  "tips": string[]                   // 2 concise practical tips
}

Use real, well-known place names. Be accurate and specific to THIS destination;
never invent landmarks. Keep every string tight and scannable."""


def _prompt_for(d: dict) -> str:
    months = ", ".join(MONTH_NAMES[m] for m in d["best_months"])
    return (
        f"Destination: {d['name']}, {d['country']} ({d['continent']}).\n"
        f"Vibe: {d['blurb']}\n"
        f"Themes: {', '.join(d['tags'])}.\n"
        f"Best months: {months}.\n"
        f"Write the JSON trip data for this destination."
    )


def _load_existing() -> dict:
    try:
        with open(OUT_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save(data: dict) -> None:
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="restrict to a country (e.g. India)")
    ap.add_argument("--force", action="store_true", help="regenerate existing entries")
    ap.add_argument("--limit", type=int, default=0, help="cap how many to generate this run")
    args = ap.parse_args()

    if not (os.getenv("GROQ_API_KEY") or "").strip():
        sys.exit("GROQ_API_KEY missing — add it to backend/.env first.")

    out = _load_existing()
    llm = _make_llm(SMART_MODEL, temperature=0.5, json_mode=True)

    targets = [d for d in DESTINATIONS if not args.only or d["country"] == args.only]
    todo = [d for d in targets if args.force or d["name"] not in out]
    if args.limit:
        todo = todo[: args.limit]

    print(f"{len(out)} already done | {len(todo)} to generate "
          f"({'all' if not args.only else args.only}).")

    for i, d in enumerate(todo, 1):
        name = d["name"]
        try:
            resp = llm.invoke([
                SystemMessage(content=_SYSTEM),
                HumanMessage(content=_prompt_for(d)),
            ])
            data = _safe_json(resp.content)
            if not data.get("tagline"):
                raise ValueError("empty/invalid JSON")
            out[name] = data
            _save(out)
            print(f"  [{i}/{len(todo)}] ok: {name}")
        except Exception as exc:
            print(f"  [{i}/{len(todo)}] FAILED {name}: {exc} (will retry next run)")
            time.sleep(2)  # back off briefly on errors / rate limits

    print(f"Done. {len(out)} destinations enriched -> {OUT_PATH}")


if __name__ == "__main__":
    main()
