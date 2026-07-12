// Renders the agent's multi-step reasoning as a live "theatre": a progress
// ring, real counters, and a canonical pipeline that lights up as each step
// streams in. Every figure shown is parsed from the backend's own step details
// (destinations scanned/matched, top-match score) — nothing is fabricated.
//
// Steps arrive over NDJSON as { step, detail }. We reconcile them against the
// canonical pipeline below so upcoming steps show ghosted, the current one
// pulses, and an optional step that never arrives (live pricing off) is marked
// skipped rather than left hanging.
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Compass, Map, Coins, Radio, Trophy, PenLine, Check, Clock } from "lucide-react";

const PIPELINE = [
  { token: "understand", label: "Understanding your request", Icon: Compass },
  { token: "filter", label: "Filtering destinations", Icon: Map },
  { token: "cost", label: "Estimating trip costs", Icon: Coins },
  { token: "price", label: "Fetching live prices", Icon: Radio, optional: true },
  { token: "rank", label: "Ranking matches", Icon: Trophy },
  { token: "writing", label: "Writing your recommendation", Icon: PenLine },
];

function matches(step = "", token) {
  const s = step.toLowerCase();
  if (token === "writing") return s.includes("writing") || s.includes("recommend");
  return s.includes(token);
}

function firstNum(str, re) {
  const m = str && str.match(re);
  return m ? Number(m[1]) : null;
}

function shortModel(model = "") {
  const m = model.toLowerCase();
  if (m.includes("70b")) return "70B";
  if (m.includes("8b")) return "8B";
  return model ? model.split("-").slice(-1)[0].toUpperCase() : "LLM";
}

function Tile({ label, value, accent }) {
  return (
    <div className="rounded-lg bg-white/5 px-2.5 py-2">
      <div className="text-[9px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={"mt-0.5 text-sm font-semibold tabular-nums " + (accent || "text-slate-100")}>
        {value}
      </div>
    </div>
  );
}

export default function AgentSteps({ trace = [], live = false, model }) {
  const [elapsed, setElapsed] = useState(0);

  // Live stopwatch. Resets whenever a new streaming run begins; on completion
  // the interval is cleared and the last value stays frozen on screen.
  useEffect(() => {
    if (!live) return;
    const t0 = performance.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [live]);

  // Reconcile the received trace against the canonical pipeline.
  const received = PIPELINE.map((p) => trace.findIndex((t) => matches(t.step, p.token)));
  let lastReached = -1;
  received.forEach((r, i) => {
    if (r >= 0) lastReached = i;
  });

  const statuses = PIPELINE.map((p, i) => {
    if (received[i] >= 0) return live && i === lastReached ? "active" : "done";
    return i < lastReached ? "skipped" : "pending";
  });

  const doneCount = statuses.filter((s) => s === "done").length;
  const hasActive = statuses.includes("active");
  const skippedOptional = statuses.some((s, i) => s === "skipped" && PIPELINE[i].optional);
  const expectedTotal = PIPELINE.length - (skippedOptional ? 1 : 0);
  const progress = live
    ? Math.min(1, (doneCount + (hasActive ? 0.5 : 0)) / expectedTotal)
    : 1;
  const pct = Math.round(progress * 100);

  // Real figures pulled straight out of the step details.
  const filterDetail = received[1] >= 0 ? trace[received[1]].detail : "";
  const rankDetail = received[4] >= 0 ? trace[received[4]].detail : "";
  const scanned = firstNum(filterDetail, /narrowed\s+(\d+)/i);
  const matched = firstNum(filterDetail, /down to\s+(\d+)/i);
  const topMatch = firstNum(rankDetail, /\((\d+)%\)/);

  const R = 30;
  const C = 2 * Math.PI * R;

  return (
    <div className="glass ring-hairline rounded-2xl p-4 sm:p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-300">
          <span className="relative flex h-2 w-2">
            {live && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
          </span>
          {live ? "Reasoning…" : "Agent reasoning"}
        </div>
        <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[10px] text-slate-400">
          LLaMA 3 · {shortModel(model)}
        </span>
      </div>

      {/* Status strip: progress ring + real counters */}
      <div className="mb-4 flex items-center gap-4">
        <div className="relative h-[72px] w-[72px] flex-none">
          <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
            <defs>
              <linearGradient id="agentRing" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#7dd3fc" />
                <stop offset="1" stopColor="#818cf8" />
              </linearGradient>
            </defs>
            <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="6" />
            <motion.circle
              cx="36"
              cy="36"
              r={R}
              fill="none"
              stroke="url(#agentRing)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              initial={false}
              animate={{ strokeDashoffset: C * (1 - progress) }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.5 }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-serif text-lg font-semibold tabular-nums text-white">
              {pct}%
            </span>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-3 gap-2">
          <Tile
            label="Elapsed"
            value={
              <span className="inline-flex items-center gap-1">
                <Clock size={11} className="text-slate-500" />
                {live || elapsed > 0 ? `${elapsed.toFixed(1)}s` : "—"}
              </span>
            }
          />
          <Tile
            label="Searched"
            value={scanned && matched ? `${scanned}→${matched}` : "—"}
          />
          <Tile
            label="Top match"
            value={topMatch != null ? `${topMatch}%` : "—"}
            accent="text-gradient-gold"
          />
        </div>
      </div>

      {/* Canonical pipeline */}
      <ol className="space-y-2">
        {PIPELINE.map((p, i) => {
          const status = statuses[i];
          const detail = received[i] >= 0 ? trace[received[i]].detail : "";
          const { Icon } = p;
          const active = status === "active";
          const done = status === "done";
          const skipped = status === "skipped";

          return (
            <motion.li
              key={p.token}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: skipped ? 0.5 : 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex gap-3"
            >
              {/* connector to the step above */}
              {i > 0 && (
                <span
                  className={
                    "absolute left-[13.5px] top-[-9px] h-[9px] w-px " +
                    (done || active ? "bg-sky-400/40" : "bg-white/10")
                  }
                />
              )}

              <div
                className={
                  "flex h-7 w-7 flex-none items-center justify-center rounded-lg transition-all duration-300 " +
                  (done
                    ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-emerald-950 shadow-[0_6px_16px_-8px_rgba(52,211,153,0.7)]"
                    : active
                    ? "bg-gradient-to-br from-sky-400 to-indigo-500 text-white ring-2 ring-sky-400/30"
                    : "bg-white/5 text-slate-600")
                }
              >
                {done ? (
                  <Check size={15} strokeWidth={3} />
                ) : (
                  <Icon size={14} className={skipped ? "opacity-50" : ""} />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "text-sm font-semibold " +
                      (active
                        ? "text-white"
                        : done
                        ? "text-slate-200"
                        : skipped
                        ? "text-slate-600 line-through"
                        : "text-slate-500")
                    }
                  >
                    {p.label}
                  </span>
                  {active && (
                    <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-sky-400" />
                  )}
                </div>
                {(done || active) && detail && (
                  <div className="mt-0.5 text-[13px] leading-snug text-slate-400">{detail}</div>
                )}
                {skipped && (
                  <div className="mt-0.5 text-[12px] text-slate-600">
                    Skipped — live pricing not configured
                  </div>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
