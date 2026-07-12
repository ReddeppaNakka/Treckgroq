import { lazy, Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Star,
  Clock,
  MapPin,
  Utensils,
  Lightbulb,
  Users,
  Compass,
  Sun,
  Sunset,
  Moon,
  Stamp,
  ShieldCheck,
  Plane,
  Wifi,
  Languages,
  BedDouble,
  Sparkles,
  CalendarDays,
  Wallet,
  Wind,
  Sunrise,
  CloudRain,
} from "lucide-react";
import { formatUSD, formatINR } from "../lib/format";
import { useDestinationImage } from "../lib/images";
import { getItinerary, getConditions, getAround } from "../api";

const ExploreMap = lazy(() => import("./ExploreMap"));

export default function TripDetail({ d, onClose }) {
  const img = useDestinationImage(d.image_query, 1600, 900);
  const days = d.estimate?.days || d.ideal_days_min || 5;
  const [itin, setItin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cond, setCond] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getItinerary(d.name, days, d.matched_interests)
      .then((res) => alive && setItin(res))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [d.name, days, d.matched_interests]);

  // Live on-the-ground conditions (air quality, sun times, rain chance) — free
  // Open-Meteo, best-effort; the strip simply doesn't show if nothing resolves.
  useEffect(() => {
    let alive = true;
    setCond(null);
    getConditions(d.name)
      .then((c) => alive && c && Object.keys(c).length && setCond(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [d.name]);

  // "What's around" — real nearby POIs from OpenStreetMap for the detail map.
  const [around, setAround] = useState(null);
  useEffect(() => {
    let alive = true;
    setAround(null);
    getAround(d.name)
      .then((a) => alive && a?.pois?.length && setAround(a))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [d.name]);

  const score = Math.round(d.scores.overall * 100);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-y-auto bg-ink"
    >
      {/* Hero */}
      <div className="relative h-[42vh] min-h-[320px] w-full">
        {img && (
          <img src={img} alt={d.name} className="h-full w-full animate-ken-burns object-cover" />
        )}
        {/* Top scrim keeps the back button legible */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink/60 to-transparent" />
        {/* Bottom scrim: fully solid ink for the lower band, then fades up — this
            dissolves the photo into the body so there's no hard seam. */}
        <div
          className="absolute inset-x-0 bottom-0 h-3/4"
          style={{
            background:
              "linear-gradient(to top, #070b18 0%, #070b18 20%, rgba(7,11,24,0.55) 55%, rgba(7,11,24,0) 100%)",
          }}
        />

        <div className="absolute left-0 right-0 top-0 p-4 sm:p-6">
          <button
            onClick={onClose}
            className="flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-black/60"
          >
            <ArrowLeft size={16} /> Back to results
          </button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-5xl px-4 pb-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gold-400/90 px-2.5 py-1 text-[11px] font-bold text-ink">
              <Star size={11} className="mr-1 inline fill-ink" />
              {score}% match
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
              {d.is_domestic ? "🇮🇳 India" : d.continent}
            </span>
          </div>
          <h1 className="mt-2 font-serif text-4xl font-semibold text-white drop-shadow sm:text-5xl">
            {d.name}
          </h1>
          <p className="flex items-center gap-1.5 text-sm text-white/85">
            <MapPin size={13} /> {d.country} · {d.continent}
          </p>
          {d.tagline && (
            <p className="mt-1 max-w-2xl text-[15px] italic text-white/80">{d.tagline}</p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column */}
          <div className="space-y-6 lg:col-span-2">
            {/* Quick facts */}
            <div className="flex flex-wrap gap-2">
              <Fact icon={Clock} label={`${d.ideal_days_min || days}–${d.ideal_days_max || days} days ideal`} />
              <Fact icon={Sun} label={`Best: ${d.best_months.slice(0, 4).join(", ")}`} />
              {(d.best_for || []).slice(0, 3).map((b) => (
                <Fact key={b} icon={Users} label={b} cap />
              ))}
            </div>

            {/* Live conditions strip */}
            {cond && <LiveNow cond={cond} />}

            {/* Overview */}
            <Section title="Overview">
              <p className="text-sm leading-relaxed text-slate-300">{d.blurb}</p>
              {(d.highlights || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.highlights.map((h) => (
                    <span
                      key={h}
                      className="rounded-full bg-white/5 px-2.5 py-1 text-[12px] text-slate-300"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              )}
              {d.getting_around && (
                <p className="mt-3 flex items-start gap-2 text-[13px] text-slate-400">
                  <Compass size={15} className="mt-0.5 flex-none text-sky-400" />
                  {d.getting_around}
                </p>
              )}
            </Section>

            {/* Must visit */}
            {(d.must_visit || []).length > 0 && (
              <Section title="Must-visit places">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {d.must_visit.map((m) => (
                    <div key={m.name} className="rounded-xl bg-white/5 p-3">
                      <div className="flex items-center gap-1.5 font-semibold text-white">
                        <MapPin size={13} className="text-gold-400" /> {m.name}
                      </div>
                      {m.desc && <p className="mt-0.5 text-[12px] text-slate-400">{m.desc}</p>}
                      {m.why && (
                        <p className="mt-1 flex items-start gap-1 text-[11.5px] italic text-sky-300/80">
                          <Sparkles size={11} className="mt-0.5 flex-none" /> {m.why}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {(d.hidden_gems || []).length > 0 && (
                  <div className="mt-3 rounded-xl border border-gold-400/20 bg-gold-400/5 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-gold-300">
                      <Sparkles size={13} /> Hidden gems
                    </div>
                    <ul className="space-y-1 text-[12.5px] text-slate-300">
                      {d.hidden_gems.map((g) => (
                        <li key={g} className="flex items-start gap-1.5">
                          <span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-gold-400" />
                          {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>
            )}

            {/* Where to stay */}
            {(d.stay_areas || []).length > 0 && (
              <Section title="Where to stay">
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {d.stay_areas.map((s) => (
                    <div key={s.name} className="rounded-xl bg-white/5 p-3">
                      <div className="flex items-center gap-1.5 font-semibold text-white">
                        <BedDouble size={13} className="text-emerald-300" /> {s.name}
                      </div>
                      {s.vibe && <p className="mt-0.5 text-[12px] text-slate-400">{s.vibe}</p>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Before you go — practical info for an Indian traveller */}
            {(d.visa || d.safety || d.getting_there || d.sim_connectivity || d.language) && (
              <Section title="Before you go">
                <div className="grid gap-3 sm:grid-cols-2">
                  {d.visa && <InfoRow icon={Stamp} color="text-violet-300" label="Visa (Indian passport)" value={d.visa} />}
                  {d.safety && <InfoRow icon={ShieldCheck} color="text-emerald-300" label="Safety" value={d.safety} />}
                  {d.getting_there && <InfoRow icon={Plane} color="text-sky-300" label="Getting there from India" value={d.getting_there} />}
                  {d.getting_around && <InfoRow icon={Compass} color="text-sky-300" label="Getting around" value={d.getting_around} />}
                  {d.sim_connectivity && <InfoRow icon={Wifi} color="text-cyan-300" label="SIM & connectivity" value={d.sim_connectivity} />}
                  {d.language && <InfoRow icon={Languages} color="text-amber-300" label="Language" value={d.language} />}
                </div>
              </Section>
            )}

            {/* Events & festivals */}
            {(d.events || []).length > 0 && (
              <Section title="Events worth timing" compact>
                <ul className="space-y-1.5 text-[13px] text-slate-300">
                  {d.events.map((e) => (
                    <li key={e.name} className="flex items-start gap-2">
                      <CalendarDays size={13} className="mt-0.5 flex-none text-rose-300" />
                      <span>
                        <span className="font-semibold text-white">{e.name}</span>
                        {e.when && <span className="text-slate-400"> · {e.when}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Itinerary */}
            <Section
              title={`${itin?.days || days}-day itinerary`}
              subtitle={itin?.summary}
            >
              {loading && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[...Array(days)].map((_, i) => (
                    <div key={i} className="h-32 animate-pulse rounded-xl bg-white/5" />
                  ))}
                </div>
              )}
              {error && <p className="text-sm text-rose-300">Couldn’t build the plan: {error}</p>}
              {itin && itin.plan?.length > 0 && (
                <DailySpend
                  plan={itin.plan}
                  totalInr={itin.total_inr}
                  totalUsd={itin.total_usd}
                  note={itin.note}
                  inrOnly={d.is_domestic}
                />
              )}
              {itin && (
                <ol className="mt-3 grid gap-3 sm:grid-cols-2">
                  {itin.plan.map((day) => (
                    <li key={day.day} className="rounded-2xl bg-white/5 p-4 ring-hairline">
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
                          <p className="flex gap-1.5">
                            <Sun size={13} className="mt-0.5 flex-none text-amber-300" />
                            {day.morning}
                          </p>
                        )}
                        {day.afternoon && (
                          <p className="flex gap-1.5">
                            <Sunset size={13} className="mt-0.5 flex-none text-orange-300" />
                            {day.afternoon}
                          </p>
                        )}
                        {day.evening && (
                          <p className="flex gap-1.5">
                            <Moon size={13} className="mt-0.5 flex-none text-indigo-300" />
                            {day.evening}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            {/* What's around — real nearby POIs on a map */}
            {around && (
              <Section
                title="What's around"
                subtitle="Real nearby highlights, mapped by OpenStreetMap"
              >
                <div className="overflow-hidden rounded-2xl ring-hairline">
                  <Suspense
                    fallback={<div className="h-[300px] w-full animate-pulse bg-white/5" />}
                  >
                    <ExploreMap
                      destinations={around.pois.map((p) => ({
                        ...p,
                        subtitle: `${p.category_label} · ${p.distance_km} km away`,
                      }))}
                      center={[around.lng, around.lat]}
                      zoom={9}
                      onOpen={(p) => p.gmaps_url && window.open(p.gmaps_url, "_blank", "noopener")}
                      className="h-[300px] w-full"
                    />
                  </Suspense>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {around.pois.slice(0, 8).map((p) => (
                    <a
                      key={p.id}
                      href={p.gmaps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11.5px] text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      <span>{p.emoji}</span> {p.name}
                      <span className="text-slate-500">· {p.distance_km}km</span>
                    </a>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] text-slate-600">
                  © OpenStreetMap contributors · verify access & timings before visiting
                </p>
              </Section>
            )}

            {/* Food + tips */}
            {((d.food || []).length > 0 || (d.tips || []).length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {(d.food || []).length > 0 && (
                  <Section title="Must-eat" compact>
                    <ul className="space-y-1.5 text-[13px] text-slate-300">
                      {d.food.map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <Utensils size={13} className="text-gold-400" /> {f}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
                {(d.tips || []).length > 0 && (
                  <Section title="Good to know" compact>
                    <ul className="space-y-1.5 text-[13px] text-slate-300">
                      {d.tips.map((t) => (
                        <li key={t} className="flex items-start gap-2">
                          <Lightbulb size={13} className="mt-0.5 flex-none text-amber-300" /> {t}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </div>
            )}
          </div>

          {/* Right column — sticky cost card */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">
              <CostExplorer
                estimate={d.estimate}
                withinBudget={d.within_budget}
                inrOnly={d.is_domestic}
              />
              {d.budget_split && <BudgetSplit split={d.budget_split} />}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Section({ title, subtitle, children, compact }) {
  return (
    <div className={"glass ring-hairline rounded-2xl " + (compact ? "p-4" : "p-5")}>
      <h2 className="font-display text-base font-bold text-white">{title}</h2>
      {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{subtitle}</p>}
      <div className={subtitle || !compact ? "mt-3" : "mt-2"}>{children}</div>
    </div>
  );
}

function Fact({ icon: Icon, label, cap }) {
  return (
    <span
      className={
        "flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-slate-300 " +
        (cap ? "capitalize" : "")
      }
    >
      <Icon size={13} className="text-sky-400" /> {label}
    </span>
  );
}

// Live "right now" conditions: air quality, sunrise/sunset and rain chance.
// Data is live Open-Meteo; colour keys read at a glance.
function LiveNow({ cond }) {
  const aqiColor =
    cond.aqi == null
      ? "text-slate-300"
      : cond.aqi <= 50
      ? "text-emerald-300"
      : cond.aqi <= 100
      ? "text-amber-300"
      : cond.aqi <= 150
      ? "text-orange-300"
      : "text-rose-300";
  return (
    <div className="glass ring-hairline flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-4 py-3">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-400" /> Live now
      </span>
      {cond.aqi != null && (
        <LivePill icon={Wind} color={aqiColor}>
          AQI {cond.aqi}
          <span className="ml-1 text-slate-400">{cond.aqi_label}</span>
        </LivePill>
      )}
      {cond.sunrise && (
        <LivePill icon={Sunrise} color="text-amber-300">
          {cond.sunrise}
        </LivePill>
      )}
      {cond.sunset && (
        <LivePill icon={Sunset} color="text-orange-300">
          {cond.sunset}
        </LivePill>
      )}
      {cond.rain_prob != null && (
        <LivePill icon={CloudRain} color="text-sky-300">
          {cond.rain_prob}% rain today
        </LivePill>
      )}
    </div>
  );
}

function LivePill({ icon: Icon, color, children }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-slate-200">
      <Icon size={15} className={color} />
      {children}
    </span>
  );
}

// One labelled fact in the "Before you go" grid: icon + heading + a sentence.
function InfoRow({ icon: Icon, color, label, value }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-white/5 p-3">
      <Icon size={16} className={"mt-0.5 flex-none " + color} />
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-white">{label}</div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-slate-400">{value}</p>
      </div>
    </div>
  );
}

// How a typical day's on-ground spend splits (stay/food/transport/activities),
// shown as a single stacked bar + legend. Percentages come from the enriched
// data as strings like "40%"; we parse them defensively.
function BudgetSplit({ split }) {
  const parts = [
    { key: "stay", label: "Stay", color: "#818cf8" },
    { key: "food", label: "Food", color: "#2dd4bf" },
    { key: "transport", label: "Transport", color: "#fbbf24" },
    { key: "activities", label: "Activities", color: "#f472b6" },
  ]
    .map((p) => ({ ...p, pct: parseFloat(String(split[p.key] || "").replace("%", "")) || 0 }))
    .filter((p) => p.pct > 0);
  if (!parts.length) return null;
  const sum = parts.reduce((a, p) => a + p.pct, 0) || 1;

  return (
    <div className="glass ring-hairline rounded-2xl p-5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Wallet size={13} /> Where the money goes
      </div>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full">
        {parts.map((p) => (
          <div key={p.key} style={{ width: `${(p.pct / sum) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[12px]">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: p.color }} />
            <span className="flex-1 text-slate-400">{p.label}</span>
            <span className="font-semibold tabular-nums text-white">{Math.round((p.pct / sum) * 100)}%</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Typical split of a mid-range day on the ground.</p>
    </div>
  );
}

// Interactive cost breakdown: an allocation donut (flights vs on-ground) with a
// trip-length slider. Recomputing on the slider uses the exact formula the
// backend's estimate_costs applies — flights fixed, ground = per-day × days —
// so the "what-if" numbers stay truthful, never invented.
function CostExplorer({ estimate, withinBudget, inrOnly }) {
  const startDays = Math.max(3, Math.min(14, estimate.days || 5));
  const [days, setDays] = useState(startDays);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 60);
    return () => clearTimeout(t);
  }, []);

  const isBus = estimate.transport_mode === "bus/train";
  const transportLabel = isBus ? "Bus / train (round-trip)" : "Flights (round-trip)";

  const groundInr = estimate.per_day_inr * days;
  const groundUsd = estimate.per_day_usd * days;
  const totalInr = estimate.flight_inr + groundInr;
  const totalUsd = estimate.flight_usd + groundUsd;

  const C = 2 * Math.PI * 52;
  const flightFrac = totalInr ? estimate.flight_inr / totalInr : 0;
  const gap = 5; // px breathing room between the two arcs
  const flightLen = drawn ? Math.max(0, flightFrac * C - gap) : 0;
  const groundLen = drawn ? Math.max(0, (1 - flightFrac) * C - gap) : 0;
  const trans = { transition: "stroke-dasharray .5s cubic-bezier(0.16,1,0.3,1)" };

  const atStart = days === startDays;
  const live = estimate.source === "live" || estimate.source === "partly live";

  return (
    <div className="glass-strong ring-hairline rounded-2xl p-5 shadow-card">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Cost breakdown
      </div>

      {/* Allocation donut */}
      <div className="relative mx-auto mt-4 h-[160px] w-[160px]">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
          <circle
            cx="60" cy="60" r="52" fill="none" stroke="#818cf8" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${flightLen} ${C}`} strokeDashoffset="0" style={trans}
          />
          <circle
            cx="60" cy="60" r="52" fill="none" stroke="#2dd4bf" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${groundLen} ${C}`} strokeDashoffset={-(flightFrac * C)} style={trans}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="font-serif text-2xl font-semibold tabular-nums text-white">
              {formatINR(totalInr)}
            </div>
            {!inrOnly && <div className="text-[11px] text-slate-400">{formatUSD(totalUsd)}</div>}
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">
              {days} days · total
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 space-y-2 text-[13px]">
        <LegendRow color="#818cf8" label={transportLabel} inr={estimate.flight_inr} pct={Math.round(flightFrac * 100)} />
        <LegendRow color="#2dd4bf" label={`On ground · ${days} days`} inr={groundInr} pct={Math.round((1 - flightFrac) * 100)} />
      </div>

      {/* Trip-length slider */}
      <div className="mt-4 border-t border-white/5 pt-4">
        <div className="mb-2 flex items-center justify-between text-[12px]">
          <label htmlFor="tripDays" className="text-slate-400">Trip length</label>
          <span className="font-mono tabular-nums text-slate-200">{days} days</span>
        </div>
        <input
          id="tripDays"
          type="range"
          min="3"
          max="14"
          value={days}
          onChange={(e) => setDays(+e.target.value)}
          className="w-full cursor-pointer accent-gold-400"
        />
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          Travel stays fixed; ground = {formatINR(estimate.per_day_inr)}/day × {days}. The same
          maths the agent uses.
        </p>
      </div>

      {/* Budget verdict — only asserted at the original trip length */}
      <div className="mt-4">
        {atStart && withinBudget === true && (
          <span className="block rounded-lg bg-emerald-500/15 px-3 py-2 text-center text-sm font-semibold text-emerald-300">
            ✓ Within your budget
          </span>
        )}
        {atStart && withinBudget === false && (
          <span className="block rounded-lg bg-amber-500/15 px-3 py-2 text-center text-sm font-semibold text-amber-300">
            A stretch on your budget
          </span>
        )}
        {!atStart && (
          <span className="block rounded-lg bg-white/5 px-3 py-2 text-center text-[12px] text-slate-400">
            What-if estimate · {days} days (original {startDays})
          </span>
        )}
        {live && (
          <p className="mt-2 text-center text-[11px] text-sky-300/80">● Includes live prices</p>
        )}
      </div>
      <p className="mt-3 text-center text-[11px] text-slate-500">
        Planning estimate, not a live booking quote.
      </p>
    </div>
  );
}

function LegendRow({ color, label, inr, pct }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: color }} />
      <span className="flex-1 text-slate-400">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-slate-500">{pct}%</span>
      <span className="w-20 text-right font-semibold tabular-nums text-white">{formatINR(inr)}</span>
    </div>
  );
}

// Per-day spend across the generated itinerary — real cost_inr values from the
// /api/itinerary response (which excludes flights, hence the label).
function DailySpend({ plan, totalInr, totalUsd, note, inrOnly }) {
  const max = Math.max(...plan.map((p) => p.cost_inr || 0), 1);
  return (
    <div className="mb-4 rounded-xl bg-white/5 p-3.5 ring-hairline">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-slate-300">Daily spend</span>
        <span className="text-[11px] tabular-nums text-slate-500">
          {formatINR(totalInr)}
          <span className="text-slate-600">
            {inrOnly ? "" : ` · ${formatUSD(totalUsd)}`} · excl. travel
          </span>
        </span>
      </div>
      <div className="flex h-16 items-end gap-1">
        {plan.map((p, i) => (
          <motion.div
            key={p.day}
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            style={{
              height: `${Math.max(6, ((p.cost_inr || 0) / max) * 100)}%`,
              transformOrigin: "bottom",
            }}
            className="flex-1 rounded-t bg-gradient-to-t from-sky-500/70 to-indigo-400"
            title={`Day ${p.day}: ${formatINR(p.cost_inr)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>Day 1</span>
        <span>Day {plan.length}</span>
      </div>
      {note && <p className="mt-2 text-[10.5px] leading-snug text-slate-600">{note}</p>}
    </div>
  );
}
