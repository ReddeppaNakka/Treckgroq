import { useEffect, useState } from "react";
import { Volume2, Square } from "lucide-react";
import { getVoiceLang, speechSupported } from "../lib/voice";

// Reads text aloud with the browser's speech synthesis, in the user's chosen
// voice language. Free, no key. Renders nothing where speech isn't supported.
function stripMd(md) {
  return String(md)
    .replace(/\*\*/g, "")
    .replace(/[#*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function SpeakButton({ text, label = "Listen" }) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }, []);

  if (!speechSupported() || !text) return null;

  const toggle = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(stripMd(text));
    u.lang = getVoiceLang();
    u.rate = 1.03;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };

  return (
    <button
      onClick={toggle}
      title={speaking ? "Stop reading" : "Read this aloud"}
      className={
        "flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition " +
        (speaking
          ? "border-rose-400/40 bg-rose-500/15 text-rose-300"
          : "border-white/10 bg-white/5 text-slate-300 hover:border-gold/40 hover:text-white")
      }
    >
      {speaking ? <Square size={11} /> : <Volume2 size={12} />}
      {speaking ? "Stop" : label}
    </button>
  );
}
