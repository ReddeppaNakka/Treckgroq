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

from agent import run_workflow, SMART_MODEL, FAST_MODEL, USD_TO_INR  # noqa: E402
from destinations import DESTINATIONS, ALL_TAGS  # noqa: E402


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


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model": SMART_MODEL,
        "fast_model": FAST_MODEL,
        "groq_key_configured": _key_ready(),
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
    }


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
        return run_workflow(req.message, history)
    except Exception as exc:  # surface a clean error to the client
        raise HTTPException(status_code=500, detail=f"Agent failed: {exc}")


@app.get("/")
def root():
    return {"name": "AI Tourist Place Recommender API", "docs": "/docs"}
