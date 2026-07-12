import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Waves,
  Mountain,
  Landmark,
  TreePine,
  PawPrint,
  Castle,
  Backpack,
  Car,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
} from "lucide-react";
import { getDestinations, searchDestinations } from "../api";
import { useDestinationImage } from "../lib/images";
import SearchBar from "./SearchBar";
import ExploreCard from "./ExploreCard";
import NearbyGems from "./NearbyGems";

// Code-split the map: maplibre-gl is ~800KB, so it loads only when Explore
// mounts, keeping the initial bundle lean.
const ExploreMap = lazy(() => import("./ExploreMap"));

// Evocative natural-language prompts. These are phrased so the recommendation
// agent extracts real signals (interest / season / budget) from them — so the
// example actually returns something relevant rather than a broken demo.
const EXAMPLES = {
  domestic: [
    "Peaceful temples & quiet spiritual towns",
    "Monsoon-season green getaways",
    "Offbeat mountain villages under ₹15,000",
    "Backpacker beaches on a tight budget",
    "Sunrise treks & viewpoints",
    "A relaxed weekend in the hills",
  ],
  international: [
    "Beaches in December, mid budget",
    "Culture & food in Europe in spring",
    "Adventure & mountains in August",
    "A warm romantic honeymoon",
    "Budget backpacking in Southeast Asia",
    "Northern lights in winter",
  ],
};

// Category tiles map to a search the agent can genuinely answer.
const CATEGORIES = [
  { label: "Beaches", icon: Waves, query: "a relaxed beach getaway", tag: "beach", tint: "from-cyan-500/30 to-sky-500/10" },
  { label: "Mountains", icon: Mountain, query: "mountains and valleys trip", tag: "mountains", tint: "from-indigo-500/30 to-blue-500/10" },
  { label: "Temples", icon: Landmark, query: "peaceful spiritual temple towns", tag: "spiritual", tint: "from-amber-500/30 to-orange-500/10" },
  { label: "Hill stations", icon: TreePine, query: "a cool green hill station escape", tag: "nature", tint: "from-emerald-500/30 to-teal-500/10" },
  { label: "Wildlife", icon: PawPrint, query: "wildlife and nature safari trip", tag: "wildlife", tint: "from-lime-500/30 to-green-500/10" },
  { label: "Heritage", icon: Castle, query: "history, forts and heritage", tag: "history", tint: "from-rose-500/30 to-red-500/10" },
  { label: "Backpacking", icon: Backpack, query: "budget backpacker trip", tag: "budget", tint: "from-fuchsia-500/30 to-purple-500/10" },
  { label: "Road trips", icon: Car, query: "a scenic road trip", tag: "road trip", tint: "from-orange-500/30 to-amber-500/10" },
];

export default function Explore({
  mode,
  setMode,
  query,
  setQuery,
  origin,
  setOrigin,
  onSubmit,
  loading,
  meta,
  recent = [],
  onOpenDestination,
}) {
  const [dests, setDests] = useState([]);
  const [instant, setInstant] = useState([]);
  const [searching, setSearching] = useState(false);
  const domestic = mode === "domestic";
  const q = (query || "").trim();
  const isSearching = q.length >= 2;
  const heroImg = useDestinationImage(
    domestic ? "himalayas india valley sunrise" : "santorini greece sunset aerial",
    1800,
    1100
  );

  useEffect(() => {
    getDestinations().then(setDests).catch(() => {});
  }, []);

  // Debounced instant hybrid search as the user types (no LLM — fast).
  useEffect(() => {
    if (!isSearching) {
      setInstant([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchDestinations(q, mode)
        .then((r) => alive && setInstant(r))
        .catch(() => alive && setInstant([]))
        .finally(() => alive && setSearching(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, mode, isSearching]);

  // Pool the catalog by the active mode so rails + map stay coherent with search.
  const pool = useMemo(
    () => dests.filter((d) => (domestic ? d.is_domestic : !d.is_domestic)),
    [dests, domestic]
  );

  // Personalization: resolve recently-viewed names against the full catalog
  // (across modes, since history isn't mode-specific).
  const recentItems = recent
    .map((name) => dests.find((d) => d.name === name))
    .filter(Boolean)
    .slice(0, 10);

  const byTag = (tag, n = 12) => pool.filter((d) => (d.tags || []).includes(tag)).slice(0, n);
  const featured = pool.slice(0, 12);
  const hiddenGems = pool
    .filter((d) => d.budget_tier === "budget" && (d.tags || []).some((t) =>
      ["nature", "trekking", "adventure", "spiritual"].includes(t)))
    .slice(0, 12);

  const examples = EXAMPLES[mode];

  return (
    <div className="relative">
      {/* ---------------- Cinematic hero ---------------- */}
      <section className="relative overflow-hidden px-4 pb-10 pt-12 sm:pt-16">
        <div className="pointer-events-none absolute inset-0 -z-10">
          {heroImg && (
            <img
              src={heroImg}
              alt=""
              className="h-full w-full animate-ken-burns object-cover opacity-[0.22]"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/85 to-ink" />
          <div className="absolute -left-40 top-6 h-[30rem] w-[30rem] animate-float rounded-full bg-sky-500/15 blur-[130px]" />
          <div
            className="absolute right-[-8rem] top-1/4 h-[26rem] w-[26rem] animate-float rounded-full bg-gold/10 blur-[130px]"
            style={{ animationDelay: "-3s" }}
          />
        </div>

        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[12px] font-medium text-slate-300 backdrop-blur animate-fade-up">
            <Sparkles size={13} className="text-gold-400" />
            Explore, then let the agent plan
          </div>

          <h1 className="font-serif text-4xl font-semibold leading-[1.04] text-white animate-fade-up sm:text-6xl">
            {domestic ? (
              <>
                Wander <span className="text-gradient-gold italic">incredible</span> India
              </>
            ) : (
              <>
                Find your next <span className="text-gradient-gold italic">escape</span>
              </>
            )}
          </h1>

          <p
            className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-300 animate-fade-up sm:text-base"
            style={{ animationDelay: "60ms" }}
          >
            Ask in your own words — or your own language — and discover places with
            real stories, honest costs and day-by-day plans.
          </p>

          <div className="mx-auto mt-8 max-w-2xl animate-fade-up" style={{ animationDelay: "120ms" }}>
            <SearchBar
              mode={mode}
              setMode={setMode}
              value={query}
              onChange={setQuery}
              origin={origin}
              setOrigin={setOrigin}
              onSubmit={onSubmit}
              loading={loading}
              livePricing={meta?.live_pricing}
            />
          </div>

          {/* NL example chips */}
          <div
            className="mt-6 flex flex-wrap justify-center gap-2 animate-fade-up"
            style={{ animationDelay: "180ms" }}
          >
            {examples.map((s) => (
              <button
                key={s}
                onClick={() => onSubmit(s)}
                disabled={loading}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-slate-300 transition hover:border-gold/40 hover:bg-gold/5 hover:text-white disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>

          {meta && (
            <div
              className="mt-8 flex justify-center gap-8 animate-fade-up"
              style={{ animationDelay: "240ms" }}
            >
              <Stat value={meta.destination_count} label="Destinations" accent="text-gradient-gold" />
              <Stat value={meta.country_count} label="Countries" />
              <Stat value={meta.continent_count} label="Continents" />
            </div>
          )}
        </div>
      </section>

      {/* ---------------- Instant search results ---------------- */}
      {isSearching ? (
        <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="mb-4 flex items-center justify-between">
            <SectionHead
              title={`Matches for “${q}”`}
              hint={
                searching
                  ? "Searching…"
                  : `${instant.length} place${instant.length === 1 ? "" : "s"} · semantic + geo search`
              }
              inline
            />
            <button
              onClick={() => onSubmit(q)}
              disabled={loading}
              className="flex flex-none items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg transition hover:from-sky-400 hover:to-indigo-400 disabled:opacity-40"
            >
              <Sparkles size={13} /> Plan a full trip
            </button>
          </div>

          {searching && instant.length === 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-3xl bg-white/5" />
              ))}
            </div>
          ) : instant.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {instant.map((d, i) => (
                <ExploreCard
                  key={d.id}
                  d={d}
                  index={i}
                  onOpen={onOpenDestination}
                  reasons={d.reasons}
                  wide
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
              <p className="text-slate-300">No direct matches for “{q}”.</p>
              <button
                onClick={() => onSubmit(q)}
                className="mt-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white"
              >
                Let the AI plan it instead
              </button>
            </div>
          )}
        </div>
      ) : (
      <div className="mx-auto max-w-6xl space-y-12 px-4 pb-20 sm:px-6">
        {/* ---------------- Recently viewed (personal) ---------------- */}
        {recentItems.length > 0 && (
          <Rail
            title="Pick up where you left off"
            hint="Places you recently explored"
            items={recentItems}
            onOpen={onOpenDestination}
          />
        )}

        {/* ---------------- Category tiles ---------------- */}
        <section>
          <SectionHead title="Browse by mood" hint="Tap a theme to plan a trip around it" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CATEGORIES.map((c, i) => (
              <motion.button
                key={c.label}
                onClick={() => onSubmit(c.query)}
                disabled={loading}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: Math.min(i * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
                className={
                  "group relative flex h-24 flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-3.5 text-left transition hover:border-white/20 disabled:opacity-50 " +
                  c.tint
                }
              >
                <c.icon size={20} className="text-white/90 transition group-hover:scale-110" />
                <span className="font-display text-sm font-bold text-white">{c.label}</span>
                <span className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/5 blur-xl transition group-hover:bg-white/10" />
              </motion.button>
            ))}
          </div>
        </section>

        {/* ---------------- Hidden-gems POI discovery ---------------- */}
        <NearbyGems />

        {/* ---------------- Featured rail ---------------- */}
        {featured.length > 0 && (
          <Rail
            title={domestic ? "Featured across India" : "Trending worldwide"}
            hint="Handpicked from the catalog"
            items={featured}
            onOpen={onOpenDestination}
          />
        )}

        {/* ---------------- Interactive map ---------------- */}
        {pool.length > 0 && (
          <section>
            <SectionHead
              title="Explore the map"
              hint="Hover a pin for a peek · tap to open"
              icon={MapIcon}
            />
            <div className="glass ring-hairline overflow-hidden rounded-3xl">
              <Suspense
                fallback={
                  <div className="grid h-[380px] w-full place-items-center bg-white/5 sm:h-[460px]">
                    <span className="flex items-center gap-2 text-sm text-slate-400">
                      <span className="h-2 w-2 animate-pulse-soft rounded-full bg-gold-400" />
                      Loading map…
                    </span>
                  </div>
                }
              >
                <ExploreMap
                  destinations={pool}
                  onOpen={onOpenDestination}
                  className="h-[380px] w-full sm:h-[460px]"
                />
              </Suspense>
            </div>
          </section>
        )}

        {/* ---------------- Hidden gems rail ---------------- */}
        {hiddenGems.length > 0 && (
          <Rail
            title="Hidden gems & offbeat"
            hint="Budget-friendly, road-less-travelled"
            items={hiddenGems}
            onOpen={onOpenDestination}
          />
        )}

        {/* ---------------- Themed rails ---------------- */}
        {byTag("beach").length > 0 && (
          <Rail title="Beaches & coast" items={byTag("beach")} onOpen={onOpenDestination} />
        )}
        {byTag("mountains").length > 0 && (
          <Rail title="Mountains & valleys" items={byTag("mountains")} onOpen={onOpenDestination} />
        )}
      </div>
      )}
    </div>
  );
}

// Horizontal scrollable rail with desktop scroll buttons.
function Rail({ title, hint, items, onOpen }) {
  const scroller = useRef(null);
  const scrollBy = (dir) =>
    scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <SectionHead title={title} hint={hint} inline />
        <div className="hidden gap-1.5 sm:flex">
          <RailBtn onClick={() => scrollBy(-1)} label="Scroll left">
            <ChevronLeft size={16} />
          </RailBtn>
          <RailBtn onClick={() => scrollBy(1)} label="Scroll right">
            <ChevronRight size={16} />
          </RailBtn>
        </div>
      </div>
      <div
        ref={scroller}
        className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-1 px-1 pb-2"
      >
        {items.map((d, i) => (
          <ExploreCard key={d.id} d={d} index={i} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function RailBtn({ onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-gold/40 hover:text-white"
    >
      {children}
    </button>
  );
}

function SectionHead({ title, hint, icon: Icon, inline }) {
  return (
    <div className={inline ? "" : "mb-3"}>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white sm:text-xl">
        {Icon && <Icon size={18} className="text-gold-400" />}
        {title}
      </h2>
      {hint && <p className="mt-0.5 text-[12.5px] text-slate-500">{hint}</p>}
    </div>
  );
}

// Count-up stat (mirrors the previous hero stat, reduced-motion friendly).
function Stat({ value, label, accent }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value == null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(value);
      return;
    }
    let raf;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min((t - t0) / 1100, 1);
      setN(Math.round((1 - Math.pow(1 - p, 3)) * value));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div>
      <div className={"font-serif text-2xl font-semibold tabular-nums text-white sm:text-3xl " + (accent || "")}>
        {n}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
    </div>
  );
}
