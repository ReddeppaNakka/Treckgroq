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

export function getItinerary(name, days, interests) {
  return request("/api/itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, days, interests }),
  });
}
