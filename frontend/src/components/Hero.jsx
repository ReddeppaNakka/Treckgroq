import { Sparkles } from "lucide-react";
import { useDestinationImage } from "../lib/images";
import SearchBar from "./SearchBar";

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

  return (
    <section className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-4 py-16 sm:py-24">
      {/* Cinematic background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {bg && (
          <img
            src={bg}
            alt=""
            className="h-full w-full animate-ken-burns object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/85 to-ink" />
        <div className="absolute -left-40 top-10 h-[28rem] w-[28rem] rounded-full bg-sky-500/15 blur-[130px]" />
        <div className="absolute -right-32 top-1/3 h-[26rem] w-[26rem] rounded-full bg-gold/10 blur-[130px]" />
      </div>

      <div className="w-full max-w-3xl text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[12px] font-medium text-slate-300 backdrop-blur animate-fade-up">
          <Sparkles size={13} className="text-gold-400" />
          AI Travel Concierge
          {meta && (
            <span className="text-slate-500">
              · {meta.destination_count} destinations
            </span>
          )}
        </div>

        <h1 className="font-serif text-4xl font-semibold leading-[1.05] text-white animate-fade-up sm:text-6xl">
          {domestic ? (
            <>
              Discover{" "}
              <span className="text-gradient-gold italic">incredible</span> India
            </>
          ) : (
            <>
              Find your next{" "}
              <span className="text-gradient-gold italic">escape</span>
            </>
          )}
        </h1>

        <p
          className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-300 animate-fade-up sm:text-base"
          style={{ animationDelay: "60ms" }}
        >
          {domestic
            ? "Tell us your budget in rupees, when, and what you love. We'll craft trips with real must-visit spots, day-by-day plans and honest costs."
            : "Tell us your budget, season and vibe. Our agent reasons over a curated world of destinations and plans the whole trip for you."}
        </p>

        <div
          className="mx-auto mt-8 max-w-2xl animate-fade-up"
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
          className="mt-6 flex flex-wrap justify-center gap-2 animate-fade-up"
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
      </div>
    </section>
  );
}
