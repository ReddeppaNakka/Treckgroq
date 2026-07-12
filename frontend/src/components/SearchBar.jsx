import { useEffect, useRef, useState } from "react";
import { Search, MapPin, Plane, Globe, ArrowRight, Mic, Check, ChevronDown } from "lucide-react";
import { useVoiceSearch, VOICE_LANGS, voiceSupported } from "../lib/voice";

const MODES = [
  { id: "domestic", label: "India", icon: MapPin },
  { id: "international", label: "International", icon: Globe },
];

const LANG_KEY = "atlas.voiceLang";

// One search control, used large on the hero and compact in the results header.
export default function SearchBar({
  mode,
  setMode,
  value,
  onChange,
  origin,
  setOrigin,
  onSubmit,
  loading,
  livePricing,
  compact = false,
}) {
  const [showOrigin, setShowOrigin] = useState(false);
  const [lang, setLang] = useState(
    () => localStorage.getItem(LANG_KEY) || "en-IN"
  );
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);
  const canVoice = voiceSupported();

  useEffect(() => localStorage.setItem(LANG_KEY, lang), [lang]);

  // Close the language menu on outside click.
  useEffect(() => {
    if (!langOpen) return;
    const onDown = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [langOpen]);

  // Voice dictation writes into the input; a final result auto-submits.
  const { listening, error: voiceError, start, stop } = useVoiceSearch({
    lang,
    onResult: (t) => onChange(t),
    onFinal: (t) => t && onSubmit(t),
  });

  const activeLang = VOICE_LANGS.find((l) => l.code === lang) || VOICE_LANGS[0];

  const submit = (e) => {
    e?.preventDefault?.();
    if (!value.trim() || loading) return;
    onSubmit(value.trim());
  };

  return (
    <form onSubmit={submit} className="w-full">
      <div
        className={
          "glass-strong ring-hairline rounded-2xl shadow-card " +
          (compact ? "p-2" : "p-2.5")
        }
      >
        {/* Mode tabs */}
        <div className="mb-2 flex items-center gap-1 px-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                  (active
                    ? "bg-gradient-to-r from-gold-400/90 to-gold-500/90 text-ink shadow"
                    : "text-slate-400 hover:text-white")
                }
              >
                <Icon size={13} />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Input row */}
        <div className="flex items-center gap-2">
          <Search size={compact ? 18 : 20} className="ml-2 flex-none text-slate-400" />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              mode === "domestic"
                ? "A weekend in the hills under ₹15,000…"
                : "Beach escape in December, mid budget…"
            }
            className={
              "min-w-0 flex-1 bg-transparent text-white placeholder:text-slate-500 focus:outline-none " +
              (compact ? "py-2 text-sm" : "py-3 text-base")
            }
          />

          {/* Voice search: mic + language picker (only if the browser supports it) */}
          {canVoice && (
            <div className="relative flex flex-none items-center" ref={langRef}>
              <button
                type="button"
                onClick={() => (listening ? stop() : start())}
                title={listening ? "Listening… tap to stop" : `Search by voice (${activeLang.label})`}
                aria-label="Voice search"
                className={
                  "flex h-9 w-9 items-center justify-center rounded-xl border transition " +
                  (listening
                    ? "border-rose-400/50 bg-rose-500/20 text-rose-300"
                    : "border-white/10 bg-white/5 text-slate-300 hover:border-gold/40 hover:text-white")
                }
              >
                <span className="relative flex items-center justify-center">
                  {listening && (
                    <span className="absolute h-7 w-7 animate-ping rounded-full bg-rose-400/30" />
                  )}
                  <Mic size={16} />
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLangOpen((o) => !o)}
                title="Voice language"
                className="ml-0.5 hidden items-center gap-0.5 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-white sm:flex"
              >
                {activeLang.short}
                <ChevronDown size={12} />
              </button>

              {langOpen && (
                <div className="absolute right-0 top-11 z-40 w-44 overflow-hidden rounded-xl border border-white/10 bg-surface-2/95 p-1 shadow-card backdrop-blur-xl">
                  <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                    Voice language
                  </div>
                  {VOICE_LANGS.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => {
                        setLang(l.code);
                        setLangOpen(false);
                      }}
                      className={
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] transition " +
                        (l.code === lang
                          ? "bg-white/10 text-white"
                          : "text-slate-300 hover:bg-white/5")
                      }
                    >
                      <span>
                        {l.label} <span className="text-slate-500">· {l.native}</span>
                      </span>
                      {l.code === lang && <Check size={13} className="text-gold-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {livePricing && (
            <button
              type="button"
              onClick={() => setShowOrigin((s) => !s)}
              title="Set your departure city for live flight prices"
              className={
                "hidden flex-none items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition sm:flex " +
                (origin
                  ? "border-sky-400/40 bg-sky-400/10 text-sky-200"
                  : "border-white/10 bg-white/5 text-slate-400 hover:text-white")
              }
            >
              <Plane size={13} />
              {origin ? origin : "From?"}
            </button>
          )}

          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="flex flex-none items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-sky-400 hover:to-indigo-400 disabled:opacity-40"
          >
            {loading ? "Planning…" : "Plan"}
            {!loading && <ArrowRight size={15} />}
          </button>
        </div>

        {/* Origin input (revealed) */}
        {livePricing && showOrigin && (
          <div className="mt-2 flex items-center gap-2 px-2">
            <Plane size={14} className="text-slate-400" />
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="Flying from… e.g. Mumbai or DEL"
              className="flex-1 bg-transparent py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
            <span className="text-[11px] text-slate-500">for live flight prices</span>
          </div>
        )}

        {/* Voice status line */}
        {(listening || voiceError) && (
          <div className="mt-1.5 flex items-center gap-2 px-2.5 text-[11px]">
            {listening ? (
              <span className="flex items-center gap-1.5 text-rose-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                Listening in {activeLang.label}… speak now
              </span>
            ) : (
              <span className="text-amber-300/90">{voiceError}</span>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
