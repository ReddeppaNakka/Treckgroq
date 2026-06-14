// Renders the agent's multi-step reasoning trace as an animated checklist.
// Icons are matched by step name so they stay correct even when optional steps
// (like live pricing) are absent.
function iconFor(step = "") {
  const s = step.toLowerCase();
  if (s.includes("understand")) return "🧭";
  if (s.includes("filter")) return "🗺️";
  if (s.includes("cost")) return "💸";
  if (s.includes("price")) return "💱";
  if (s.includes("rank")) return "🏆";
  if (s.includes("writing") || s.includes("recommend")) return "✍️";
  return "•";
}

export default function AgentSteps({ trace, live = false }) {
  const lastIndex = trace.length - 1;
  return (
    <div className="glass ring-hairline rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-300">
        <span className="relative flex h-2 w-2">
          {live && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
          )}
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
        </span>
        Agent workflow
      </div>

      <ol className="space-y-2.5">
        {trace.map((s, i) => {
          const active = live && i === lastIndex;
          return (
            <li
              key={i}
              className="flex gap-3 animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div
                className={
                  "flex h-7 w-7 flex-none items-center justify-center rounded-lg text-sm " +
                  (active ? "bg-sky-500/20 ring-1 ring-sky-400/40" : "bg-white/5")
                }
              >
                {iconFor(s.step)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  {s.step}
                  {active && (
                    <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-sky-400" />
                  )}
                </div>
                <div className="text-[13px] leading-snug text-slate-400">{s.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
