import { useState } from "react";
import { continentGradient, photoUrl, formatUSD, formatINR } from "../lib/format";

export default function DestinationCard({ d, index, onView }) {
  const [imgOk, setImgOk] = useState(true);
  const gradient = continentGradient(d.continent);
  const score = Math.round(d.scores.overall * 100);
  const duration =
    d.ideal_days_min && d.ideal_days_max
      ? `${d.ideal_days_min}–${d.ideal_days_max} days`
      : `${d.estimate.days} days`;
  const mustVisit = (d.must_visit || []).slice(0, 4);

  return (
    <div
      className="group glass overflow-hidden rounded-2xl animate-fade-up"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      {/* Image / gradient header */}
      <div className={`relative h-44 w-full bg-gradient-to-br ${gradient}`}>
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

        {/* Top badges */}
        <div className="absolute left-3 right-3 top-3 flex items-start justify-between">
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            {d.is_domestic ? "🇮🇳 India" : "🌍 " + d.continent}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            <span className="text-amber-300">★</span> {score}%
          </span>
        </div>

        {/* Title block */}
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="font-display text-xl font-bold leading-tight text-white drop-shadow">
            {d.name}
          </h3>
          <p className="text-xs font-medium text-white/80">
            {d.country} · {d.continent}
          </p>
          {d.tagline && (
            <p className="mt-1 line-clamp-1 text-[12px] italic text-white/75">
              {d.tagline}
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3 p-4">
        {/* Meta row: duration + best months */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-md bg-sky-500/15 px-2 py-1 font-semibold text-sky-300">
            🗓 {duration}
          </span>
          <span className="rounded-md bg-white/5 px-2 py-1 text-slate-400">
            Best: {d.best_months.slice(0, 3).join(", ")}
          </span>
          {(d.best_for || []).slice(0, 2).map((b) => (
            <span key={b} className="rounded-md bg-white/5 px-2 py-1 capitalize text-slate-400">
              {b}
            </span>
          ))}
        </div>

        {/* Highlights */}
        {(d.highlights || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {d.highlights.slice(0, 4).map((h) => (
              <span
                key={h}
                className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-300"
              >
                {h}
              </span>
            ))}
          </div>
        )}

        {/* Must-visit places */}
        {mustVisit.length > 0 && (
          <div className="rounded-xl bg-white/5 p-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Must visit
            </div>
            <ul className="space-y-1">
              {mustVisit.map((m) => (
                <li key={m.name} className="flex gap-2 text-[12px] text-slate-300">
                  <span className="mt-0.5 text-sky-400">📍</span>
                  <span>
                    <span className="font-medium text-white">{m.name}</span>
                    {m.desc ? <span className="text-slate-400"> — {m.desc}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

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
              {d.estimate.source === "live" && (
                <span className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-300 ring-1 ring-sky-400/40">
                  ● Live
                </span>
              )}
              {d.estimate.source === "partly live" && (
                <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-300/80">
                  ◐ Part-live
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400">
              {d.estimate.days} days · {formatINR(d.estimate.per_day_inr)}/day + travel
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

        {/* CTA */}
        <button
          onClick={() => onView?.(d)}
          className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-3 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-sky-400 hover:to-indigo-400"
        >
          View day-by-day plan →
        </button>
      </div>
    </div>
  );
}
