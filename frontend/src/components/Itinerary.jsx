import { useEffect, useState } from "react";
import { continentGradient, photoUrl, formatINR, formatUSD } from "../lib/format";
import { getItinerary } from "../api";

// Renders a tailored day-by-day plan inline in the conversation, like another
// assistant turn — full width and naturally scrollable (no cramped modal).
export default function ItineraryMessage({ d, days }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getItinerary(d.name, days, d.matched_interests)
      .then((res) => alive && setData(res))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [d.name, days, d.matched_interests]);

  return (
    <div className="flex gap-3 animate-fade-up">
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-bold text-white">
        🗺
      </div>

      <div className="min-w-0 flex-1">
        <div className="glass overflow-hidden rounded-2xl rounded-tl-sm">
          {/* Header banner */}
          <div className={`relative h-32 bg-gradient-to-br ${continentGradient(d.continent)}`}>
            <img
              src={photoUrl(d.image_query, 1000, 320)}
              alt={d.name}
              className="absolute inset-0 h-full w-full object-cover opacity-70"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                {days}-day itinerary
              </div>
              <h3 className="font-display text-2xl font-bold text-white drop-shadow">
                {d.name}
              </h3>
              <p className="text-xs text-white/80">
                {d.country} · {d.continent}
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-5">
            {loading && (
              <div className="space-y-3">
                <p className="text-sm text-slate-400">Crafting your tailored {days}-day plan…</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[...Array(days)].map((_, i) => (
                    <div key={i} className="h-28 animate-pulse rounded-xl bg-white/5" />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-rose-300">
                Couldn’t build the itinerary: {error}
              </p>
            )}

            {data && (
              <>
                {data.summary && (
                  <p className="mb-3 max-w-3xl text-sm leading-relaxed text-slate-300">
                    {data.summary}
                  </p>
                )}

                {data.total_inr > 0 && (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-300">
                      Est. total {formatINR(data.total_inr)}
                      <span className="ml-1 text-xs font-normal text-emerald-300/70">
                        ({formatUSD(data.total_usd)})
                      </span>
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {data.days} days · stay, food, local travel &amp; activities — excludes flights
                    </span>
                  </div>
                )}

                <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.plan.map((day) => (
                    <li key={day.day} className="rounded-xl bg-white/5 p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-xs font-bold text-white">
                            {day.day}
                          </span>
                          <span className="font-display text-sm font-bold leading-tight text-white">
                            {day.title}
                          </span>
                        </div>
                        {day.cost_inr > 0 && (
                          <span
                            className="flex-none rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300"
                            title={`Approx ${formatUSD(day.cost_usd)} this day`}
                          >
                            {formatINR(day.cost_inr)}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5 text-[13px] leading-snug text-slate-300">
                        {day.morning && (
                          <p>
                            <span className="font-medium text-amber-300">☀ Morning</span> —{" "}
                            {day.morning}
                          </p>
                        )}
                        {day.afternoon && (
                          <p>
                            <span className="font-medium text-orange-300">🌤 Afternoon</span> —{" "}
                            {day.afternoon}
                          </p>
                        )}
                        {day.evening && (
                          <p>
                            <span className="font-medium text-indigo-300">🌙 Evening</span> —{" "}
                            {day.evening}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>

                {/* Food + tips */}
                {((d.food || []).length > 0 || (d.tips || []).length > 0) && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {(d.food || []).length > 0 && (
                      <div className="rounded-xl bg-white/5 p-3">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          🍽 Must-eat
                        </div>
                        <p className="text-[12px] text-slate-300">{d.food.join(" · ")}</p>
                      </div>
                    )}
                    {(d.tips || []).length > 0 && (
                      <div className="rounded-xl bg-white/5 p-3">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          💡 Good to know
                        </div>
                        <ul className="space-y-1 text-[12px] text-slate-300">
                          {d.tips.map((t) => (
                            <li key={t}>• {t}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
