import { useState } from "react";
import { continentGradient, photoUrl, formatUSD, formatINR } from "../lib/format";

export default function DestinationCard({ d, index }) {
  const [imgOk, setImgOk] = useState(true);
  const gradient = continentGradient(d.continent);
  const score = Math.round(d.scores.overall * 100);

  return (
    <div
      className="group glass overflow-hidden rounded-2xl animate-fade-up"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      {/* Image / gradient header */}
      <div className={`relative h-36 w-full bg-gradient-to-br ${gradient}`}>
        {imgOk && (
          <img
            src={photoUrl(d.image_query)}
            alt={d.name}
            loading="lazy"
            onError={() => setImgOk(false)}
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700"
            onLoad={(e) => (e.currentTarget.style.opacity = 1)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
          <span className="text-amber-300">★</span> {score}% match
        </div>

        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="font-display text-lg font-bold leading-tight text-white drop-shadow">
            {d.name}
          </h3>
          <p className="text-xs font-medium text-white/80">
            {d.country} · {d.continent}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3 p-4">
        <p className="text-sm leading-relaxed text-slate-300">{d.blurb}</p>

        {/* Cost line */}
        <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold text-white">
                {formatUSD(d.estimate.total_usd)}
              </span>
              <span className="text-sm font-medium text-emerald-300/90">
                {formatINR(d.estimate.total_inr)}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              {d.estimate.days} days · {formatUSD(d.estimate.per_day_usd)} (
              {formatINR(d.estimate.per_day_inr)})/day + flights
            </div>
          </div>
          {d.within_budget === true && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-300">
              In budget
            </span>
          )}
          {d.within_budget === false && (
            <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-300">
              A stretch
            </span>
          )}
        </div>

        {/* Best months */}
        <div className="text-[11px] text-slate-400">
          <span className="text-slate-500">Best:</span>{" "}
          {d.best_months.slice(0, 5).join(", ")}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {d.tags.slice(0, 5).map((t) => {
            const matched = d.matched_interests.includes(t);
            return (
              <span
                key={t}
                className={
                  "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                  (matched
                    ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/40"
                    : "bg-white/5 text-slate-400")
                }
              >
                {t}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
