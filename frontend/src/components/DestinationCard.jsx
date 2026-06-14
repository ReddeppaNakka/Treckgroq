import { motion } from "framer-motion";
import { Star, Clock, MapPin, Plane, ArrowRight } from "lucide-react";
import { continentGradient, formatUSD, formatINR } from "../lib/format";
import { useDestinationImage } from "../lib/images";

export default function DestinationCard({ d, index, onOpen }) {
  const gradient = continentGradient(d.continent);
  const img = useDestinationImage(d.image_query, 800, 600);
  const score = Math.round(d.scores.overall * 100);
  const duration =
    d.ideal_days_min && d.ideal_days_max
      ? `${d.ideal_days_min}–${d.ideal_days_max} days`
      : `${d.estimate.days} days`;
  const live = d.estimate.source === "live";
  const partly = d.estimate.source === "partly live";

  return (
    <motion.button
      type="button"
      onClick={() => onOpen?.(d)}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -6 }}
      className="group glass ring-hairline overflow-hidden rounded-3xl text-left shadow-card transition-shadow hover:shadow-card-hover"
    >
      {/* Image */}
      <div className={`relative h-52 w-full bg-gradient-to-br ${gradient}`}>
        {img && (
          <img
            src={img}
            alt={d.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-all duration-700 group-hover:scale-105"
            onLoad={(e) => (e.currentTarget.style.opacity = 1)}
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

        <div className="absolute left-3 right-3 top-3 flex items-start justify-between">
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            {d.is_domestic ? "🇮🇳 India" : d.continent}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-gold-400/90 px-2.5 py-1 text-[11px] font-bold text-ink backdrop-blur">
            <Star size={11} className="fill-ink" /> {score}%
          </span>
        </div>

        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="font-serif text-2xl font-semibold leading-tight text-white drop-shadow">
            {d.name}
          </h3>
          <p className="flex items-center gap-1 text-xs font-medium text-white/80">
            <MapPin size={11} /> {d.country}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3 p-4">
        {d.tagline && (
          <p className="line-clamp-1 text-[13px] italic text-slate-300">{d.tagline}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-1 font-semibold text-sky-300">
            <Clock size={11} /> {duration}
          </span>
          <span className="rounded-md bg-white/5 px-2 py-1 text-slate-400">
            Best: {d.best_months.slice(0, 3).join(", ")}
          </span>
        </div>

        {/* Must-visit preview */}
        {(d.must_visit || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {d.must_visit.slice(0, 3).map((m) => (
              <span
                key={m.name}
                className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-300"
              >
                📍 {m.name}
              </span>
            ))}
            {d.must_visit.length > 3 && (
              <span className="rounded-full px-1 py-0.5 text-[11px] text-slate-500">
                +{d.must_visit.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Price */}
        <div className="flex items-center justify-between border-t border-white/5 pt-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-white">
                {formatINR(d.estimate.total_inr)}
              </span>
              <span className="text-xs text-slate-400">{formatUSD(d.estimate.total_usd)}</span>
              {live && (
                <span className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-300 ring-1 ring-sky-400/40">
                  ● Live
                </span>
              )}
              {partly && (
                <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-300/80">
                  ◐
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <Plane size={10} /> {d.estimate.days} days · total est.
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
