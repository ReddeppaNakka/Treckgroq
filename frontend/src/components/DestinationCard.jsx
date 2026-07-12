import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  useReducedMotion,
} from "framer-motion";
import { Star, Clock, MapPin, Plane, Bus, ArrowRight, Wallet } from "lucide-react";
import { continentGradient, formatUSD, formatINR } from "../lib/format";
import { useDestinationImage } from "../lib/images";

// The three "fit" meters are a direct read of the scores the ranker computed
// (season_fit / interest_fit / budget_fit) — i.e. exactly *why* the agent
// ranked this destination for the traveller. Nothing here is fabricated.
const METERS = [
  { key: "season_fit", label: "Season fit", bar: "from-emerald-400 to-emerald-500" },
  { key: "interest_fit", label: "Taste match", bar: "from-sky-400 to-indigo-500" },
  { key: "budget_fit", label: "Budget fit", bar: "from-gold-400 to-gold-500" },
];

export default function DestinationCard({ d, index, onOpen }) {
  const gradient = continentGradient(d.continent);
  const img = useDestinationImage(d.image_query, 800, 600);
  const reduced = useReducedMotion();

  const score = Math.round(d.scores.overall * 100);
  const duration =
    d.ideal_days_min && d.ideal_days_max
      ? `${d.ideal_days_min}–${d.ideal_days_max} days`
      : `${d.estimate.days} days`;
  const live = d.estimate.source === "live";
  const partly = d.estimate.source === "partly live";
  // Domestic (India) trips are quoted in rupees only, and often reached by
  // overnight bus/train rather than a flight.
  const inrOnly = d.is_domestic;
  const isBus = d.estimate.transport_mode === "bus/train";
  const TransportIcon = isBus ? Bus : Plane;

  // Interest chips: matched interests first (highlighted), then remaining tags.
  const matched = d.matched_interests || [];
  const rest = (d.tags || []).filter((t) => !matched.includes(t));
  const chips = [...matched, ...rest].slice(0, 6);
  const matchedSet = new Set(matched);

  // ----- Pointer-driven 3D tilt (disabled under reduced-motion) -----
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 150, damping: 18, mass: 0.4 };
  const rotateX = useSpring(useTransform(py, [0, 1], [6.5, -6.5]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-8.5, 8.5]), spring);
  const sheenX = useTransform(px, [0, 1], ["0%", "100%"]);
  const sheenY = useTransform(py, [0, 1], ["0%", "100%"]);
  const sheen = useMotionTemplate`radial-gradient(circle at ${sheenX} ${sheenY}, rgba(255,255,255,0.18), transparent 42%)`;

  const handleMove = (e) => {
    if (reduced || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const handleLeave = () => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <motion.button
      type="button"
      onClick={() => onOpen?.(d)}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
      style={reduced ? undefined : { rotateX, rotateY, transformPerspective: 1000 }}
      className="group glass ring-hairline block overflow-hidden rounded-3xl text-left shadow-card [transform-style:preserve-3d] transition-shadow hover:shadow-card-hover"
    >
      {/* Image */}
      <div className={`relative h-52 w-full bg-gradient-to-br ${gradient}`}>
        {img && (
          <img
            src={img}
            alt={d.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-all duration-700 group-hover:scale-110"
            onLoad={(e) => (e.currentTarget.style.opacity = 1)}
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        {/* pointer sheen */}
        {!reduced && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: sheen }}
          />
        )}

        <div className="absolute left-3 right-3 top-3 flex items-start justify-between">
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            {d.is_domestic ? "🇮🇳 India" : d.continent}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-gold-400 to-gold-500 px-2.5 py-1 text-[11px] font-bold text-ink shadow-[0_6px_18px_-6px_rgba(231,198,107,0.6)]">
            <Star size={11} className="fill-ink" /> {score}% match
          </span>
        </div>

        <div className="absolute bottom-3 left-4 right-4" style={{ transform: "translateZ(30px)" }}>
          <h3 className="font-serif text-2xl font-semibold leading-tight text-white drop-shadow">
            {d.name}
          </h3>
          <p className="flex items-center gap-1 text-xs font-medium text-white/80">
            <MapPin size={11} /> {d.country}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3.5 p-4">
        {d.tagline && (
          <p className="line-clamp-1 font-serif text-[13px] italic text-slate-300">{d.tagline}</p>
        )}

        {/* Why it's a match — real ranker scores */}
        <div className="grid grid-cols-3 gap-3">
          {METERS.map((m) => (
            <Meter key={m.key} label={m.label} value={d.scores?.[m.key]} bar={m.bar} />
          ))}
        </div>

        {/* Interest chips: matched (gold) first, then tags */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((t) => {
              const on = matchedSet.has(t);
              return (
                <span
                  key={t}
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] capitalize " +
                    (on
                      ? "bg-gold-400/15 font-semibold text-gold-400 ring-1 ring-gold-400/40"
                      : "bg-white/5 text-slate-400")
                  }
                >
                  {t}
                </span>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-1 font-semibold text-sky-300">
            <Clock size={11} /> {duration}
          </span>
          <span className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-slate-400">
            <Wallet size={11} /> {formatINR(d.estimate.per_day_inr)}/day
          </span>
          <span className="rounded-md bg-white/5 px-2 py-1 text-slate-400">
            Best: {d.best_months.slice(0, 3).join(", ")}
          </span>
          {d.climate && (
            <span
              title={
                d.climate.better_months
                  ? `${d.climate.verdict} that month — try ${d.climate.better_months.join(", ")} instead`
                  : d.climate.verdict
              }
              className={
                "flex items-center gap-1 rounded-md px-2 py-1 font-medium " +
                (d.climate.pleasant
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-amber-500/15 text-amber-300")
              }
            >
              {climateEmoji(d.climate)} {d.climate.high_c}° · {d.climate.verdict}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif text-xl font-semibold tabular-nums text-white">
                {formatINR(d.estimate.total_inr)}
              </span>
              {!inrOnly && (
                <span className="text-xs text-slate-400">{formatUSD(d.estimate.total_usd)}</span>
              )}
              {live && (
                <span className="flex items-center gap-1 rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-300 ring-1 ring-sky-400/40">
                  <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-sky-400" /> Live
                </span>
              )}
              {partly && (
                <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-300/80">
                  ◐ part-live
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
              <TransportIcon size={10} /> {d.estimate.days} days
              {isBus ? " · bus/train" : ""} · total est.
              {d.within_budget === true && (
                <span className="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-300">
                  in budget
                </span>
              )}
              {d.within_budget === false && (
                <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300">
                  a stretch
                </span>
              )}
            </div>
          </div>
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/5 text-slate-300 transition group-hover:bg-gradient-to-r group-hover:from-sky-500 group-hover:to-indigo-500 group-hover:text-white">
            <ArrowRight size={16} />
          </span>
        </div>
      </div>
    </motion.button>
  );
}

// Pick a weather glyph from the climate verdict + temperature so the chip reads
// at a glance. Purely presentational — the numbers come from Open-Meteo.
function climateEmoji(c) {
  const v = (c.verdict || "").toLowerCase();
  if (v.includes("wet") || v.includes("rain")) return "🌧️";
  if (v.includes("freezing") || c.high_c <= 6) return "❄️";
  if (v.includes("cool") || v.includes("crisp")) return "🌤️";
  if (v.includes("hot") || c.high_c >= 34) return "🔥";
  return "☀️";
}

// Meter with a per-instance gradient. The full class strings live in the METERS
// array above so Tailwind's content scan keeps these colours in the build.
function Meter({ label, value, bar }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10.5px] font-medium leading-none text-slate-400">{label}</span>
        <span className="font-mono text-[10.5px] tabular-nums text-slate-300">{pct}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.i
          className={`block h-full rounded-full bg-gradient-to-r ${bar}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        />
      </div>
    </div>
  );
}
