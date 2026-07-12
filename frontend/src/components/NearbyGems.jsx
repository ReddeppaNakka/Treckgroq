import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Navigation, MapPin, Search, ExternalLink, Compass, Loader2 } from "lucide-react";
import { getNearbyCategories, getNearby } from "../api";

const ExploreMap = lazy(() => import("./ExploreMap"));

const RADII = [25, 60, 120];

// Hidden-gems discovery: real POIs (waterfalls, forts, caves…) near the user's
// location or a named place, sourced live from OpenStreetMap. Every result is a
// real, citable OSM feature — we never invent a place or its coordinates.
export default function NearbyGems() {
  const [cats, setCats] = useState([]);
  const [category, setCategory] = useState("waterfalls");
  const [loc, setLoc] = useState(null); // {lat,lng} | {near}
  const [locLabel, setLocLabel] = useState("");
  const [placeInput, setPlaceInput] = useState("");
  const [radiusKm, setRadiusKm] = useState(60);
  const [results, setResults] = useState([]);
  const [center, setCenter] = useState(null); // [lng,lat] for the map
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    getNearbyCategories().then(setCats).catch(() => {});
  }, []);

  // Fetch whenever the user has a location + category (+ radius).
  useEffect(() => {
    if (!loc) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    getNearby({ category, ...loc, radiusKm, limit: 40 })
      .then((res) => {
        if (id !== reqId.current) return;
        setResults(res.results || []);
        setCenter([res.center.lng, res.center.lat]);
        if (!(res.results || []).length) setError("nomatch");
      })
      .catch((e) => id === reqId.current && setError(e.message || "failed"))
      .finally(() => id === reqId.current && setLoading(false));
  }, [loc, category, radiusKm]);

  const useMyLocation = () => {
    setError(null);
    setTouched(true);
    if (!navigator.geolocation) {
      setError("Geolocation isn't available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocLabel("your location");
        setPlaceInput("");
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location — allow access or type a place below.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const submitPlace = (e) => {
    e?.preventDefault();
    const p = placeInput.trim();
    if (!p) return;
    setTouched(true);
    setLoc({ near: p });
    setLocLabel(p);
  };

  // Shape POIs for the shared map (subtitle + colour + emoji come from the API).
  const points = results.map((r) => ({
    ...r,
    subtitle: `${r.category_label} · ${r.distance_km} km away`,
  }));

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Compass size={18} className="text-gold-400" />
        <div>
          <h2 className="font-display text-lg font-bold text-white sm:text-xl">
            Hidden gems near you
          </h2>
          <p className="text-[12.5px] text-slate-500">
            Real spots from OpenStreetMap — waterfalls, forts, caves & more within reach
          </p>
        </div>
      </div>

      {/* Location controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          onClick={useMyLocation}
          disabled={locating}
          className="flex flex-none items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-sky-400 hover:to-indigo-400 disabled:opacity-60"
        >
          {locating ? <Loader2 size={15} className="animate-spin" /> : <Navigation size={15} />}
          Use my location
        </button>
        <span className="hidden text-xs text-slate-500 sm:block">or</span>
        <form onSubmit={submitPlace} className="glass ring-hairline flex flex-1 items-center gap-2 rounded-xl px-3 py-1.5">
          <Search size={16} className="flex-none text-slate-400" />
          <input
            value={placeInput}
            onChange={(e) => setPlaceInput(e.target.value)}
            placeholder="Near a city… e.g. Pune, Hyderabad, Manali"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            className="flex-none rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            Find
          </button>
        </form>
      </div>

      {/* Category chips */}
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        {cats.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={
              "flex flex-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition " +
              (category === c.key
                ? "border-gold/50 bg-gold/10 text-white"
                : "border-white/10 bg-white/5 text-slate-300 hover:text-white")
            }
          >
            <span>{c.emoji}</span> {c.label}
          </button>
        ))}
      </div>

      {/* Radius + status */}
      {loc && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
          <MapPin size={13} className="text-sky-400" /> Near <b className="text-slate-200">{locLabel}</b>
          <span className="text-slate-600">·</span>
          <span>within</span>
          {RADII.map((r) => (
            <button
              key={r}
              onClick={() => setRadiusKm(r)}
              className={
                "rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition " +
                (radiusKm === r ? "bg-white/15 text-white" : "text-slate-400 hover:text-white")
              }
            >
              {r} km
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      {!touched ? (
        <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <Compass size={26} className="text-slate-600" />
          <p className="mt-2 max-w-sm text-sm text-slate-400">
            Share your location or type a nearby city to uncover real waterfalls, forts,
            caves, lakes and viewpoints around it.
          </p>
        </div>
      ) : error && error !== "nomatch" ? (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Map */}
          <div className="glass ring-hairline order-2 overflow-hidden rounded-3xl lg:order-1">
            <Suspense fallback={<div className="h-[340px] w-full animate-pulse bg-white/5 sm:h-[420px]" />}>
              <ExploreMap
                destinations={points}
                center={center}
                zoom={radiusKm <= 25 ? 10 : radiusKm <= 60 ? 9 : 8}
                onOpen={(p) => p.gmaps_url && window.open(p.gmaps_url, "_blank", "noopener")}
                className="h-[340px] w-full sm:h-[420px]"
              />
            </Suspense>
          </div>

          {/* List */}
          <div className="order-1 lg:order-2">
            {loading ? (
              <div className="space-y-2.5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
                No mapped {catLabel(cats, category)} within {radiusKm} km. Try a wider radius
                or another category.
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[12px] text-slate-400">
                    {results.length} {catLabel(cats, category)} nearby
                  </span>
                </div>
                <div className="no-scrollbar max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {results.map((r, i) => (
                    <POIRow key={r.id} r={r} index={i} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Honest source attribution */}
      {touched && results.length > 0 && (
        <p className="mt-3 text-[11px] text-slate-600">
          Community-mapped data © OpenStreetMap contributors. Locations are real but
          crowd-sourced — verify access, timings and safety before you go.
        </p>
      )}
    </section>
  );
}

function POIRow({ r, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.3) }}
      className="glass ring-hairline flex items-center gap-3 rounded-xl p-3"
    >
      <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-white/5 text-lg">
        {r.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{r.name}</div>
        <div className="text-[11.5px] text-slate-400">
          {r.distance_km} km away{r.elevation ? ` · ${r.elevation} m` : ""}
        </div>
      </div>
      <a
        href={r.gmaps_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-none items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-sky-300 transition hover:bg-sky-500/15"
      >
        Directions <ExternalLink size={11} />
      </a>
    </motion.div>
  );
}

function catLabel(cats, key) {
  return (cats.find((c) => c.key === key)?.label || "places").toLowerCase();
}
