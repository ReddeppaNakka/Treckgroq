import AgentSteps from "./AgentSteps";
import DestinationCard from "./DestinationCard";
import { renderReply } from "../lib/format";

function Avatar({ children, className }) {
  return (
    <div
      className={
        "flex h-9 w-9 flex-none items-center justify-center rounded-xl text-sm font-bold " +
        className
      }
    >
      {children}
    </div>
  );
}

export function UserMessage({ content }) {
  return (
    <div className="flex justify-end gap-3 animate-fade-up">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
        {content}
      </div>
      <Avatar className="bg-white/10 text-slate-200">You</Avatar>
    </div>
  );
}

export function AssistantMessage({ reply, trace, recommendations }) {
  return (
    <div className="flex gap-3 animate-fade-up">
      <Avatar className="bg-gradient-to-br from-sky-400 to-indigo-500 text-white">
        ✈
      </Avatar>
      <div className="min-w-0 flex-1 space-y-4">
        {trace?.length > 0 && <AgentSteps trace={trace} />}

        {reply && (
          <div
            className="reply max-w-[90%] rounded-2xl rounded-tl-sm glass px-4 py-3 text-sm leading-relaxed text-slate-200"
            dangerouslySetInnerHTML={{ __html: renderReply(reply) }}
          />
        )}

        {recommendations?.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((d, i) => (
              <DestinationCard key={d.id} d={d} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ThinkingMessage() {
  const steps = ["Reading your request", "Filtering 110 destinations", "Costing & ranking"];
  return (
    <div className="flex gap-3 animate-fade-up">
      <Avatar className="bg-gradient-to-br from-sky-400 to-indigo-500 text-white">
        ✈
      </Avatar>
      <div className="glass flex items-center gap-3 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-sky-400 animate-pulse-soft"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
        <span className="text-sm text-slate-400">Atlas is planning…</span>
      </div>
    </div>
  );
}

export function ErrorMessage({ content }) {
  return (
    <div className="flex gap-3 animate-fade-up">
      <Avatar className="bg-rose-500/20 text-rose-300">!</Avatar>
      <div className="rounded-2xl rounded-tl-sm border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        {content}
      </div>
    </div>
  );
}
