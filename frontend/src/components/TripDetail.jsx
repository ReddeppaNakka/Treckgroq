import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Star,
  Clock,
  MapPin,
  Plane,
  Wallet,
  Utensils,
  Lightbulb,
  Users,
  Compass,
  Sun,
  Sunset,
  Moon,
} from "lucide-react";
import { formatUSD, formatINR } from "../lib/format";
import { useDestinationImage } from "../lib/images";
import { getItinerary } from "../api";

export default function TripDetail({ d, onClose }) {
  const img = useDestinationImage(d.image_query, 1600, 900);
  const days = d.estimate?.days || d.ideal_days_min || 5;
  const [itin, setItin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/30" />

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
                    </div>
                  ))}
                </div>
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
              {itin && (
                <ol className="grid gap-3 sm:grid-cols-2">
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
              <div className="glass-strong ring-hairline rounded-2xl p-5 shadow-card">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Estimated trip cost
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-serif text-3xl font-semibold text-white">
                    {formatINR(d.estimate.total_inr)}
                  </span>
                  <span className="text-sm text-slate-400">{formatUSD(d.estimate.total_usd)}</span>
                </div>
                <div className="mt-1 text-[12px] text-slate-500">
                  for {d.estimate.days} days · per person
                </div>

                <div className="mt-4 space-y-2 border-t border-white/5 pt-4 text-[13px]">
                  <Row icon={Plane} label="Travel (flights)" value={formatINR(d.estimate.flight_inr)} />
                  <Row icon={Wallet} label={`On ground · ${d.estimate.days} days`} value={formatINR(d.estimate.ground_inr)} />
                  <Row icon={Clock} label="Per day" value={`${formatINR(d.estimate.per_day_inr)}/day`} />
                </div>

                <div className="mt-4">
                  {d.within_budget === true && (
                    <span className="block rounded-lg bg-emerald-500/15 px-3 py-2 text-center text-sm font-semibold text-emerald-300">
                      ✓ Within your budget
                    </span>
                  )}
                  {d.within_budget === false && (
                    <span className="block rounded-lg bg-amber-500/15 px-3 py-2 text-center text-sm font-semibold text-amber-300">
                      A stretch on your budget
                    </span>
                  )}
                  {(d.estimate.source === "live" || d.estimate.source === "partly live") && (
                    <p className="mt-2 text-center text-[11px] text-sky-300/80">
                      ● Includes live prices
                    </p>
                  )}
                </div>
                <p className="mt-3 text-center text-[11px] text-slate-500">
                  Planning estimate, not a live booking quote.
                </p>
              </div>
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

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between text-slate-300">
      <span className="flex items-center gap-2 text-slate-400">
        <Icon size={13} /> {label}
      </span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}
