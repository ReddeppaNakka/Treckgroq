// Thin API client. In dev, "/api" is proxied to the FastAPI backend (see
// vite.config.js). For a deployed build, set VITE_API_BASE to the backend URL.
const BASE = import.meta.env.VITE_API_BASE || "";

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export function getMeta() {
  return request("/api/meta");
}

// Full destination catalog for the Explore experience (browse + map). Pure data,
// no LLM — instant. Cached in-module so we fetch it once per session.
let _catalog = null;
export async function getDestinations() {
  if (_catalog) return _catalog;
  _catalog = (await request("/api/destinations")).destinations;
  return _catalog;
}

export function recommend(message, history, origin, mode) {
  return request("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, origin, mode }),
  });
}

// Streaming variant: invokes callbacks as each agent step arrives, then onResult.
export async function recommendStream(
  message,
  history,
  origin,
  mode,
  { onStep, onResult, onError } = {}
) {
  const res = await fetch(`${BASE}/api/recommend/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, origin, mode }),
  });

  if (!res.ok || !res.body) {
    let detail = `Request failed (${res.status})`;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* ignore */
    }
    onError?.(new Error(detail));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "step") onStep?.(ev);
      else if (ev.type === "result") onResult?.(ev);
      else if (ev.type === "error") onError?.(new Error(ev.detail));
    }
  }
}

// Full card for one destination (story + neutral estimate), no LLM. Used when a
// user taps a place in Explore to open its detail directly.
export function getDestinationCard(name) {
  return request(`/api/destination/${encodeURIComponent(name)}`);
}

// Instant hybrid search (keyword + semantic + geo). No LLM — fast + explainable.
export async function searchDestinations(query, mode) {
  const body = JSON.stringify({ query, mode, limit: 24 });
  const res = await request("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return res.results || [];
}

// Live on-the-ground conditions (air quality, sunrise/sunset, rain chance).
export function getConditions(name) {
  return request(`/api/conditions/${encodeURIComponent(name)}`);
}

// Hidden-gems POI discovery categories (waterfalls, forts, caves…).
let _poiCats = null;
export async function getNearbyCategories() {
  if (_poiCats) return _poiCats;
  _poiCats = (await request("/api/nearby/categories")).categories;
  return _poiCats;
}

// Destination coordinates + a mixed set of nearby highlights (for its detail map).
export function getAround(name) {
  return request(`/api/around/${encodeURIComponent(name)}`);
}

// Real POIs (OpenStreetMap) of a category near a point or a named place.
export function getNearby({ category, lat, lng, near, radiusKm = 60, limit = 30 }) {
  return request("/api/nearby", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, lat, lng, near, radius_km: radiusKm, limit }),
  });
}

export function getItinerary(name, days, interests) {
  return request("/api/itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, days, interests }),
  });
}
