import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, Sparkles, AlertCircle } from "lucide-react";
import { getMeta, recommendStream, getDestinationCard } from "./api";
import { renderReply } from "./lib/format";
import { loadRecent, pushRecent } from "./lib/history";
import Explore from "./components/Explore";
import SearchBar from "./components/SearchBar";
import AgentSteps from "./components/AgentSteps";
import DestinationCard from "./components/DestinationCard";
import TripDetail from "./components/TripDetail";
import SpeakButton from "./components/SpeakButton";

export default function App() {
  const [mode, setMode] = useState("domestic");
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveTrace, setLiveTrace] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [meta, setMeta] = useState(null);
  const [recent, setRecent] = useState(() => loadRecent());

  const started = loading || !!result || !!error;

  useEffect(() => {
    getMeta().then(setMeta).catch(() => {});
  }, []);

  const search = async (text, modeOverride) => {
    const message = (text ?? query).trim();
    if (!message || loading) return;
    const useMode = modeOverride || mode;
    setQuery(message);
    setLoading(true);
    setLiveTrace([]);
    setResult(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      await recommendStream(message, [], origin.trim() || undefined, useMode, {
        onStep: (ev) =>
          setLiveTrace((prev) => [...prev, { step: ev.step, detail: ev.detail }]),
        onResult: (data) =>
          setResult({
            reply: data.reply,
            recommendations: data.recommendations,
            trace: data.trace,
            query: message,
          }),
        onError: (e) => {
          throw e;
        },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLiveTrace([]);
    }
  };

  const goHome = () => {
    setResult(null);
    setError(null);
    setLiveTrace([]);
    setQuery("");
  };

  // Tapping a place in Explore opens its full story instantly (no LLM) via the
  // catalog card endpoint; the day-by-day plan inside TripDetail loads on demand.
  const openDestination = async (dest) => {
    setRecent(pushRecent(dest.name));
    try {
      const card = await getDestinationCard(dest.name);
      setSelected(card);
    } catch {
      // Fall back to running the planner on the place name.
      search(`Plan a trip to ${dest.name}`, dest.is_domestic ? "domestic" : "international");
    }
  };

  return (
    <div className="relative min-h-full">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <button onClick={goHome} className="flex flex-none items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 text-lg shadow-lg">
              🧭
            </span>
            <span className="text-left">
              <span className="block font-serif text-lg font-semibold leading-none text-white">
                Atlas
              </span>
              <span className="block text-[10px] tracking-wide text-slate-400">
                AI TRAVEL CONCIERGE
              </span>
            </span>
          </button>

          {/* Compact search appears once a search has started */}
          {started && (
            <div className="min-w-0 flex-1">
              <SearchBar
                mode={mode}
                setMode={setMode}
                value={query}
                onChange={setQuery}
                origin={origin}
                setOrigin={setOrigin}
                onSubmit={search}
                loading={loading}
                livePricing={meta?.live_pricing}
                compact
              />
            </div>
          )}

          <div className="ml-auto hidden items-center gap-3 text-[11px] text-slate-400 lg:flex">
            {meta?.live_pricing && (
              <span className="flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 font-semibold text-sky-300">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-sky-400" />
                Live prices
              </span>
            )}
            {meta && (
              <span className="flex items-center gap-1">
                <Globe size={13} /> {meta.country_count} countries
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      {!started ? (
        <div className="min-h-[calc(100vh-3.5rem)]">
          <Explore
            mode={mode}
            setMode={setMode}
            query={query}
            setQuery={setQuery}
            origin={origin}
            setOrigin={setOrigin}
            onSubmit={search}
            loading={loading}
            meta={meta}
            recent={recent}
            onOpenDestination={openDestination}
          />
        </div>
      ) : (
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          {/* Thinking / trace */}
          {(loading || result) && (
            <div className="mb-6 max-w-2xl">
              <AgentSteps
                trace={loading ? liveTrace : result.trace}
                live={loading}
                model={meta?.model}
              />
            </div>
          )}

          {/* Reply intro */}
          {result?.reply && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 flex max-w-3xl gap-3"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-sm">
                <Sparkles size={16} className="text-white" />
              </span>
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">Atlas suggests</span>
                  <SpeakButton text={result.reply} />
                </div>
                <div
                  className="reply glass ring-hairline rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-slate-200"
                  dangerouslySetInnerHTML={{ __html: renderReply(result.reply) }}
                />
              </div>
            </motion.div>
          )}

          {/* Error */}
          {error && (
            <div className="flex max-w-2xl items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              <AlertCircle size={18} className="mt-0.5 flex-none" />
              <div>
                {error}
                <button
                  onClick={() => search(query)}
                  className="ml-2 underline hover:text-white"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Results grid */}
          {result?.recommendations?.length > 0 && (
            <>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-display text-lg font-bold text-white">
                  Top picks for you
                </h2>
                <span className="text-xs text-slate-500">
                  Tap a trip for the full plan
                </span>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {result.recommendations.map((d, i) => (
                  <DestinationCard
                    key={d.id}
                    d={d}
                    index={i}
                    onOpen={(card) => {
                      setRecent(pushRecent(card.name));
                      setSelected(card);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </main>
      )}

      {/* Trip detail overlay */}
      <AnimatePresence>
        {selected && <TripDetail d={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
