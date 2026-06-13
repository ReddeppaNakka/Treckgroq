import { useEffect, useRef, useState } from "react";
import { getMeta, recommendStream } from "./api";
import {
  UserMessage,
  AssistantMessage,
  ThinkingMessage,
  ErrorMessage,
} from "./components/Message";
import ItineraryMessage from "./components/Itinerary";
import Composer from "./components/Composer";

const SUGGESTIONS = {
  domestic: [
    "Goa beach trip in December under ₹20,000",
    "Hill station for 5 days, budget ₹25,000",
    "Spiritual trip, low budget, in winter",
    "Adventure & mountains in August under ₹30,000",
  ],
  international: [
    "Beach trip in December under $1,500",
    "10 days of culture & food in Europe in spring",
    "Adventure & mountains, mid budget, August",
    "Romantic honeymoon, luxury, somewhere warm",
  ],
};

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [origin, setOrigin] = useState("");
  const [mode, setMode] = useState("domestic");
  const [loading, setLoading] = useState(false);
  const [liveTrace, setLiveTrace] = useState([]);
  const [meta, setMeta] = useState(null);
  const scrollRef = useRef(null);
  const suggestions = SUGGESTIONS[mode];

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
    setLiveTrace([]);
    try {
      await recommendStream(message, history, origin.trim() || undefined, mode, {
        onStep: (ev) =>
          setLiveTrace((prev) => [...prev, { step: ev.step, detail: ev.detail }]),
        onResult: (data) =>
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              reply: data.reply,
              trace: data.trace,
              recommendations: data.recommendations,
            },
          ]),
        onError: (e) => {
          throw e;
        },
      });
    } catch (e) {
      setMessages((prev) => [...prev, { role: "error", content: e.message }]);
    } finally {
      setLoading(false);
      setLiveTrace([]);
    }
  };

  // Open a destination's day-by-day plan inline, like another turn in the chat.
  const viewItinerary = (d) => {
    if (loading) return;
    const days = d.estimate?.days || d.ideal_days_min || 5;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: `📋 ${days}-day plan for ${d.name}` },
      { role: "itinerary", d, days },
    ]);
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
        <div className="flex items-center gap-4">
          <ModeTabs mode={mode} onChange={setMode} />
          {meta && (
            <div className="hidden items-center gap-4 text-[11px] text-slate-400 lg:flex">
              <Stat n={meta.destination_count} label="destinations" />
              <Stat n={meta.country_count} label="countries" />
            </div>
          )}
        </div>
      </header>

      {/* Conversation */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {!started && <Welcome meta={meta} mode={mode} suggestions={suggestions} onPick={send} />}

          {messages.map((m, i) => {
            if (m.role === "user")
              return <UserMessage key={i} content={m.content} />;
            if (m.role === "error")
              return <ErrorMessage key={i} content={m.content} />;
            if (m.role === "itinerary")
              return <ItineraryMessage key={i} d={m.d} days={m.days} />;
            return (
              <AssistantMessage
                key={i}
                reply={m.reply}
                trace={m.trace}
                recommendations={m.recommendations}
                onViewItinerary={viewItinerary}
              />
            );
          })}

          {loading && <ThinkingMessage trace={liveTrace} />}
        </div>
      </main>

      {/* Composer */}
      <footer className="border-t border-white/5 px-4 py-4 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-2">
          {started && (
            <div className="flex flex-wrap gap-2">
              {suggestions.slice(0, 3).map((s) => (
                <Chip
                  key={s}
                  text={s}
                  onClick={() => send(s)}
                  disabled={loading}
                />
              ))}
            </div>
          )}
          {meta?.live_pricing && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">✈️ Flying from</span>
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="e.g. Mumbai or DEL"
                className="w-44 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-400/50 focus:outline-none"
              />
              <span className="text-[11px] text-slate-500">
                — for live flight prices
              </span>
            </div>
          )}
          <Composer
            value={input}
            onChange={setInput}
            onSend={() => send()}
            disabled={loading}
          />
          <p className="text-center text-[11px] text-slate-500">
            {meta?.live_pricing
              ? "Atlas pulls live flight & hotel prices for top picks — cards marked ● Live are real fares; others are planning estimates."
              : "Atlas reasons over real destination data — figures are planning estimates, not live prices."}
          </p>
        </div>
      </footer>
    </div>
  );
}

function ModeTabs({ mode, onChange }) {
  const tabs = [
    { id: "domestic", label: "Domestic", flag: "🇮🇳" },
    { id: "international", label: "International", flag: "🌍" },
  ];
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition " +
            (mode === t.id
              ? "bg-gradient-to-r from-sky-400 to-indigo-500 text-white shadow"
              : "text-slate-400 hover:text-white")
          }
        >
          <span>{t.flag}</span>
          {t.label}
        </button>
      ))}
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

function Welcome({ meta, mode, suggestions, onPick }) {
  const domestic = mode === "domestic";
  return (
    <div className="flex flex-col items-center pt-8 text-center animate-fade-up sm:pt-16">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 text-3xl shadow-2xl">
        {domestic ? "🇮🇳" : "🧭"}
      </div>
      <h1 className="font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
        {domestic ? "Explore incredible India" : "Where should you go next?"}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
        {domestic ? (
          <>
            Tell me your budget in rupees, when you want to travel, and what you
            love. Atlas plans low-budget trips across India — beaches, hills,
            heritage and more — with real must-visit spots and day-by-day plans.
          </>
        ) : (
          <>
            Tell me your budget, when you want to travel, and what you love. My
            agent filters{" "}
            <span className="text-slate-200">
              {meta ? meta.destination_count : "100+"} destinations
            </span>{" "}
            across {meta ? meta.continent_count : "6"} continents, estimates your
            costs, and ranks the best matches.
          </>
        )}
      </p>

      <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {suggestions.map((s) => (
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
