import { useEffect, useRef, useState } from "react";
import { getMeta, recommend } from "./api";
import {
  UserMessage,
  AssistantMessage,
  ThinkingMessage,
  ErrorMessage,
} from "./components/Message";
import Composer from "./components/Composer";

const SUGGESTIONS = [
  "Beach trip in December under $1,500",
  "10 days of culture & food in Europe in spring",
  "Adventure & mountains, mid budget, August",
  "Romantic honeymoon, luxury, somewhere warm",
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    getMeta().then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput("");

    // Build a compact history of prior user/assistant turns for context.
    const history = messages
      .filter((m) => m.role === "user" || (m.role === "assistant" && m.reply))
      .map((m) => ({
        role: m.role,
        content: m.role === "user" ? m.content : m.reply,
      }));

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);
    try {
      const data = await recommend(message, history);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          reply: data.reply,
          trace: data.trace,
          recommendations: data.recommendations,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "error", content: e.message }]);
    } finally {
      setLoading(false);
    }
  };

  const started = messages.length > 0;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-sky-500/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-3.5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-lg shadow-lg">
            🌍
          </div>
          <div>
            <div className="font-display text-base font-bold leading-none text-white">
              Atlas
            </div>
            <div className="text-[11px] text-slate-400">
              AI Travel Recommender
            </div>
          </div>
        </div>
        {meta && (
          <div className="hidden items-center gap-4 text-[11px] text-slate-400 sm:flex">
            <Stat n={meta.destination_count} label="destinations" />
            <Stat n={meta.country_count} label="countries" />
            <span className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-[10px] text-sky-300">
              {meta.model}
            </span>
          </div>
        )}
      </header>

      {/* Conversation */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          {!started && <Welcome meta={meta} onPick={send} />}

          {messages.map((m, i) => {
            if (m.role === "user")
              return <UserMessage key={i} content={m.content} />;
            if (m.role === "error")
              return <ErrorMessage key={i} content={m.content} />;
            return (
              <AssistantMessage
                key={i}
                reply={m.reply}
                trace={m.trace}
                recommendations={m.recommendations}
              />
            );
          })}

          {loading && <ThinkingMessage />}
        </div>
      </main>

      {/* Composer */}
      <footer className="border-t border-white/5 px-4 py-4 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-2">
          {started && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.slice(0, 3).map((s) => (
                <Chip
                  key={s}
                  text={s}
                  onClick={() => send(s)}
                  disabled={loading}
                />
              ))}
            </div>
          )}
          <Composer
            value={input}
            onChange={setInput}
            onSend={() => send()}
            disabled={loading}
          />
          <p className="text-center text-[11px] text-slate-500">
            Atlas reasons over real destination data — figures are planning
            estimates, not live prices.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div className="text-right">
      <span className="font-display font-bold text-white">{n}</span>{" "}
      <span>{label}</span>
    </div>
  );
}

function Chip({ text, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-sky-400/50 hover:bg-sky-400/10 hover:text-white disabled:opacity-40"
    >
      {text}
    </button>
  );
}

function Welcome({ meta, onPick }) {
  return (
    <div className="flex flex-col items-center pt-8 text-center animate-fade-up sm:pt-16">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 text-3xl shadow-2xl">
        🧭
      </div>
      <h1 className="font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
        Where should you go next?
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
        Tell me your budget, when you want to travel, and what you love. My
        agent filters{" "}
        <span className="text-slate-200">
          {meta ? meta.destination_count : "100+"} destinations
        </span>{" "}
        across {meta ? meta.continent_count : "6"} continents, estimates your
        costs, and ranks the best matches for your season.
      </p>

      <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="group glass rounded-xl px-4 py-3 text-left text-sm text-slate-300 transition hover:border-sky-400/40 hover:bg-sky-400/5"
          >
            <span className="mr-2 text-sky-400 transition group-hover:translate-x-0.5">
              →
            </span>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
