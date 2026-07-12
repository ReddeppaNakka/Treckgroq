import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useDestinationImage } from "../lib/images";
import SearchBar from "./SearchBar";
import Globe from "./Globe";

// Illustrative labels floating over the globe. Facts are drawn from the dataset
// (Bali's ~$45/day, best months) — decorative, not live data.
const GEO_CHIPS = {
  domestic: [
    { t: "Goa · December", dot: "#e7c66b", pos: "left-0 top-[14%]", delay: "-1s" },
    { t: "Manali · mountains", dot: "#2dd4bf", pos: "right-[-4%] top-[42%]", delay: "-2.4s" },
    { t: "Kerala · backwaters", dot: "#7dd3fc", pos: "left-[6%] bottom-[12%]", delay: "-0.5s" },
  ],
  international: [
    { t: "Kyoto · April", dot: "#e7c66b", pos: "left-0 top-[14%]", delay: "-1s" },
    { t: "Bali · $45/day", dot: "#2dd4bf", pos: "right-[-4%] top-[42%]", delay: "-2.4s" },
    { t: "Santorini · summer", dot: "#7dd3fc", pos: "left-[6%] bottom-[12%]", delay: "-0.5s" },
  ],
};

export default function Hero({
  mode,
  setMode,
  query,
  setQuery,
  origin,
  setOrigin,
  onSubmit,
  loading,
  livePricing,
  suggestions,
  meta,
}) {
  const bg = useDestinationImage(
    mode === "domestic" ? "kerala backwaters india aerial" : "santorini greece sunset",
    1600,
    1000
  );
  const domestic = mode === "domestic";
  const chips = GEO_CHIPS[mode] || GEO_CHIPS.international;

  return (
    <section className="relative flex min-h-full items-center overflow-hidden px-4 py-14 sm:py-20">
      {/* Cinematic background: faint photo + aurora */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {bg && (
          <img
            src={bg}
            alt=""
            className="h-full w-full animate-ken-burns object-cover opacity-[0.18]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/85 to-ink" />
        <div className="absolute -left-40 top-6 h-[30rem] w-[30rem] animate-float rounded-full bg-sky-500/15 blur-[130px]" />
        <div
          className="absolute right-[-8rem] top-1/4 h-[28rem] w-[28rem] animate-float rounded-full bg-gold/10 blur-[130px]"
          style={{ animationDelay: "-3s" }}
        />
        <div
          className="absolute bottom-[-6rem] left-1/3 h-[26rem] w-[26rem] animate-float rounded-full bg-indigo-500/12 blur-[130px]"
          style={{ animationDelay: "-1.5s" }}
        />
      </div>

      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Left — copy + search */}
        <div className="text-center lg:text-left">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[12px] font-medium text-slate-300 backdrop-blur animate-fade-up">
            <Sparkles size={13} className="text-gold-400" />
            AI Travel Concierge
            {meta && <span className="text-slate-500">· agentic planning</span>}
          </div>

          <h1 className="font-serif text-4xl font-semibold leading-[1.03] text-white animate-fade-up sm:text-6xl">
            {domestic ? (
              <>
                Discover <span className="text-gradient-gold italic">incredible</span> India
              </>
            ) : (
              <>
                Find your next <span className="text-gradient-gold italic">escape</span>
              </>
            )}
          </h1>

          <p
            className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-300 animate-fade-up sm:text-base lg:mx-0"
            style={{ animationDelay: "60ms" }}
          >
            {domestic
              ? "Tell us your budget in rupees, when, and what you love. We'll craft trips with real must-visit spots, day-by-day plans and honest costs."
              : "Tell us your budget, season and vibe. Our agent reasons over a curated world of destinations and plans the whole trip for you."}
          </p>

          <div
            className="mx-auto mt-8 max-w-2xl animate-fade-up lg:mx-0"
            style={{ animationDelay: "120ms" }}
          >
            <SearchBar
              mode={mode}
              setMode={setMode}
              value={query}
              onChange={setQuery}
              origin={origin}
              setOrigin={setOrigin}
              onSubmit={onSubmit}
              loading={loading}
              livePricing={livePricing}
            />
          </div>

          {/* Suggestion chips */}
          <div
            className="mt-6 flex flex-wrap justify-center gap-2 animate-fade-up lg:justify-start"
            style={{ animationDelay: "180ms" }}
          >
            {suggestions.map((s) => (
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

          {/* Live dataset stats */}
          {meta && (
            <div
              className="mt-9 flex justify-center gap-8 animate-fade-up lg:justify-start"
              style={{ animationDelay: "240ms" }}
            >
              <Stat value={meta.destination_count} label="Destinations" accent="text-gradient-gold" />
              <Stat value={meta.country_count} label="Countries" />
              <Stat value={meta.continent_count} label="Continents" />
            </div>
          )}
        </div>

        {/* Right — ambient globe */}
        <div className="relative mx-auto hidden aspect-square w-full max-w-[440px] sm:block">
          <div
            className="absolute inset-[8%] rounded-full blur-2xl"
            style={{
              background:
                "radial-gradient(circle at 40% 32%, rgba(125,211,252,0.22), transparent 62%)",
            }}
          />
          <Globe />
          {chips.map((c) => (
            <div
              key={c.t}
              className={
                "glass ring-hairline absolute flex animate-float items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold text-slate-100 shadow-card " +
                c.pos
              }
              style={{ animationDelay: c.delay }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: c.dot, boxShadow: `0 0 0 4px ${c.dot}22` }}
              />
              {c.t}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Count-up figure for the hero stats. Animates once on mount; jumps straight to
// the value under reduced-motion.
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
    const dur = 1100;
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1);
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
