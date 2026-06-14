import { useState } from "react";
import { Search, MapPin, Plane, Globe, ArrowRight } from "lucide-react";

const MODES = [
  { id: "domestic", label: "India", icon: MapPin },
  { id: "international", label: "International", icon: Globe },
];

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
      </div>
    </form>
  );
}
