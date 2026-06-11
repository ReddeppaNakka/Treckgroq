// Renders the agent's multi-step reasoning trace as an animated checklist.
const ICONS = ["🧭", "🗺️", "💸", "🏆"];

export default function AgentSteps({ trace, live = false }) {
  return (
    <div className="glass rounded-2xl p-4">
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
        {trace.map((s, i) => (
          <li
            key={i}
            className="flex gap-3 animate-fade-up"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-white/5 text-sm">
              {ICONS[i] || "•"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100">
                {s.step}
              </div>
              <div className="text-[13px] leading-snug text-slate-400">
                {s.detail}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
