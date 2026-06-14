// Destination imagery via the Unsplash API, with a keyless fallback so the app
// looks good even before a key is configured.
//
// To enable high-quality curated photos, add to frontend/.env:
//   VITE_UNSPLASH_KEY=your_unsplash_access_key
// (free at https://unsplash.com/developers — create an app, copy the Access Key)

import { useEffect, useState } from "react";
import { photoUrl } from "./format";

const KEY = import.meta.env.VITE_UNSPLASH_KEY;
const cache = new Map(); // query -> resolved URL (or fallback)

export function hasUnsplash() {
  return Boolean(KEY);
}

// Resolve a destination image URL. Uses Unsplash when a key is present,
// otherwise the keyless fallback. Never throws.
export async function resolveImage(query, w = 1200, h = 800) {
  const fallback = photoUrl(query, w, h);
  if (!KEY) return fallback;
  if (cache.has(query)) return cache.get(query);
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
        query
      )}&orientation=landscape&content_filter=high&per_page=1`,
      { headers: { Authorization: `Client-ID ${KEY}` } }
    );
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const url = data?.results?.[0]?.urls?.regular || fallback;
    cache.set(query, url);
    return url;
  } catch {
    cache.set(query, fallback);
    return fallback;
  }
}

// Hook: returns a destination image URL once resolved (null while loading, so
// callers can show a gradient placeholder and avoid a flash of a wrong image).
export function useDestinationImage(query, w, h) {
  const [url, setUrl] = useState(() => (cache.get(query) ?? null));
  useEffect(() => {
    let alive = true;
    if (cache.has(query)) {
      setUrl(cache.get(query));
      return;
    }
    resolveImage(query, w, h).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [query, w, h]);
  return url;
}
