"""
FastAPI backend for the AI Tourist Place Recommender.

Endpoints
---------
    GET  /api/health        liveness + model info
    GET  /api/meta          dataset stats + available interest tags
    POST /api/recommend     run the agentic workflow on a user message
"""

import os
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

import json  # noqa: E402

from fastapi.responses import StreamingResponse  # noqa: E402

from agent import (  # noqa: E402
    run_workflow, workflow_events, generate_itinerary, build_destination_card,
    SMART_MODEL, FAST_MODEL, USD_TO_INR,
)
from destinations import DESTINATIONS, ALL_TAGS  # noqa: E402
import pricing  # noqa: E402
import rich_data  # noqa: E402
import search as search_engine  # noqa: E402
import poi  # noqa: E402


def _key_ready() -> bool:
    key = (os.getenv("GROQ_API_KEY") or "").strip()
    # Reject empty and the placeholder shipped in .env.example.
    return bool(key) and key != "your_groq_api_key_here"

app = FastAPI(title="AI Tourist Place Recommender", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev-friendly; lock down for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatTurn(BaseModel):
    role: str
    content: str


class RecommendRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: Optional[List[ChatTurn]] = None
    origin: Optional[str] = Field(None, max_length=60)  # departure city/IATA for live flight prices
    mode: Optional[str] = Field(None, pattern="^(domestic|international)$")  # India-only vs global


class ItineraryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    days: int = Field(5, ge=1, le=14)
    interests: Optional[List[str]] = None


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=300)
    mode: Optional[str] = Field(None, pattern="^(domestic|international)$")
    limit: int = Field(24, ge=1, le=60)


class NearbyRequest(BaseModel):
    category: str = Field(..., min_length=1, max_length=40)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)
    near: Optional[str] = Field(None, max_length=80)   # place name if no lat/lng
    radius_km: float = Field(60, ge=1, le=200)
    limit: int = Field(30, ge=1, le=60)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model": SMART_MODEL,
        "fast_model": FAST_MODEL,
        "groq_key_configured": _key_ready(),
        "live_pricing": pricing.enabled(),
    }


@app.get("/api/meta")
def meta():
    return {
        "destination_count": len(DESTINATIONS),
        "country_count": len({d["country"] for d in DESTINATIONS}),
        "continent_count": len({d["continent"] for d in DESTINATIONS}),
        "tags": ALL_TAGS,
        "model": SMART_MODEL,
        "usd_to_inr": USD_TO_INR,
        "live_pricing": pricing.enabled(),
    }


def _load_geo() -> dict:
    """{name: [lat, lon]} for the Explore map. Pinned coords (pricing._COORDS)
    win over the geocoded file so authoritative points can't be overridden."""
    path = os.path.join(os.path.dirname(__file__), "destinations_geo.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            geo = json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        geo = {}
    for name, coords in pricing._COORDS.items():
        geo[name] = [round(coords[0], 4), round(coords[1], 4)]
    return geo


_GEO = _load_geo()


@app.get("/api/destinations")
def destinations():
    """Full destination catalog for the Explore experience (browse + map). Pure
    data, no LLM — instant. Coordinates come from the pre-built geo file; `story`
    flags whether deep rich content (must-visit, food, tips, visa…) is available."""
    out = []
    for d in DESTINATIONS:
        rich = rich_data.get_rich(d["name"])
        coords = _GEO.get(d["name"])
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
            "daily_cost_usd": d["daily_cost_usd"],
            "daily_cost_inr": int(round(d["daily_cost_usd"] * USD_TO_INR)),
            "best_months": d["best_months"],
            "image_query": d["image_query"],
            "is_domestic": d["country"] == "India",
            "lat": coords[0] if coords else None,
            "lng": coords[1] if coords else None,
            "story": bool(rich.get("must_visit")),
        })
    return {"destinations": out, "count": len(out)}


@app.get("/api/nearby/categories")
def nearby_categories():
    """The POI categories the hidden-gems engine can discover."""
    return {"categories": poi.categories()}


@app.post("/api/nearby")
def nearby(req: NearbyRequest):
    """Real hidden-gem POIs (from OpenStreetMap) of a category near a point or a
    named place. Every result is a real, citable OSM feature — nothing invented."""
    lat, lng, where = req.lat, req.lng, None
    if lat is None or lng is None:
        if not req.near:
            raise HTTPException(status_code=400, detail="Provide lat/lng or a 'near' place name.")
        coords = pricing._geocode(req.near, "India") or pricing._geocode(req.near, "")
        if not coords:
            raise HTTPException(status_code=404, detail=f"Couldn't locate '{req.near}'.")
        lat, lng = coords
        where = req.near
    try:
        results = poi.nearby(lat, lng, req.category, req.radius_km, req.limit)
        return {"center": {"lat": lat, "lng": lng}, "where": where,
                "category": req.category, "count": len(results), "results": results}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Discovery failed: {exc}")


@app.post("/api/search")
def search_destinations(req: SearchRequest):
    """Instant hybrid search (keyword + semantic themes + geo + season) over the
    catalog. No LLM — fast and fully explainable (each hit carries `reasons`)."""
    try:
        return {"query": req.query, "results": search_engine.search(req.query, req.mode, req.limit)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}")


@app.get("/api/around/{name}")
def around(name: str):
    """Destination coordinates + a mixed set of real nearby highlights (viewpoints,
    waterfalls, forts…) from OpenStreetMap — powers the 'what's around' map on a
    destination page. Returns {lat, lng, pois: [...]}."""
    coords = _GEO.get(name)
    if not coords:
        raise HTTPException(status_code=404, detail=f"No coordinates for '{name}'.")
    lat, lng = coords[0], coords[1]
    try:
        pois = poi.around(lat, lng, radius_km=45, limit=24)
    except Exception:
        pois = []
    return {"name": name, "lat": lat, "lng": lng, "pois": pois}


@app.get("/api/destination/{name}")
def destination(name: str):
    """Full card for one destination (story + neutral cost estimate), no LLM —
    powers 'tap a place to open it' in Explore. The day-by-day itinerary is still
    fetched separately (that one uses the model)."""
    try:
        return build_destination_card(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to build destination: {exc}")


@app.get("/api/conditions/{name}")
def conditions(name: str):
    """Live on-the-ground conditions (air quality, sunrise/sunset, rain chance) for
    a destination — free Open-Meteo data, best-effort. Returns {} if unavailable."""
    dest = next((d for d in DESTINATIONS if d["name"] == name), None)
    if not dest:
        raise HTTPException(status_code=404, detail=f"Unknown destination: {name}")
    return pricing.live_conditions(name, dest["country"]) or {}


@app.post("/api/recommend")
def recommend(req: RecommendRequest):
    if not _key_ready():
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not set. Add your key to backend/.env "
                   "(get one free at https://console.groq.com/keys) and restart the backend.",
        )
    try:
        history = [t.model_dump() for t in req.history] if req.history else None
        return run_workflow(req.message, history, origin=req.origin, mode=req.mode)
    except Exception as exc:  # surface a clean error to the client
        raise HTTPException(status_code=500, detail=f"Agent failed: {exc}")


@app.post("/api/recommend/stream")
def recommend_stream(req: RecommendRequest):
    """Same pipeline as /api/recommend, but streams each agent step as NDJSON
    ({"type":"step",...}) as it completes, then a final {"type":"result",...}."""
    if not _key_ready():
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not set. Add your key to backend/.env "
                   "(get one free at https://console.groq.com/keys) and restart the backend.",
        )

    history = [t.model_dump() for t in req.history] if req.history else None

    def gen():
        try:
            for ev in workflow_events(req.message, history, origin=req.origin, mode=req.mode):
                yield json.dumps(ev) + "\n"
        except Exception as exc:  # stream a clean error event instead of dropping the connection
            yield json.dumps({"type": "error", "detail": f"Agent failed: {exc}"}) + "\n"

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/itinerary")
def itinerary(req: ItineraryRequest):
    if not _key_ready():
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not set. Add your key to backend/.env and restart.",
        )
    try:
        return generate_itinerary(req.name, req.days, req.interests)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Itinerary failed: {exc}")


@app.get("/")
def root():
    return {"name": "AI Tourist Place Recommender API", "docs": "/docs"}
