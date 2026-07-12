// Multilingual voice search + read-back using the browser's built-in Web Speech
// API — free, no key, no server. Works best on Chrome/Edge. Falls back gracefully
// (isSupported=false) on browsers without SpeechRecognition (e.g. Firefox).
//
// Speech-to-text: SpeechRecognition. Text-to-speech: speechSynthesis.

import { useCallback, useEffect, useRef, useState } from "react";

// Indian languages we support, with BCP-47 tags the recognizer understands.
export const VOICE_LANGS = [
  { code: "en-IN", label: "English", short: "EN", native: "English" },
  { code: "hi-IN", label: "Hindi", short: "हि", native: "हिन्दी" },
  { code: "te-IN", label: "Telugu", short: "తె", native: "తెలుగు" },
  { code: "ta-IN", label: "Tamil", short: "த", native: "தமிழ்" },
  { code: "kn-IN", label: "Kannada", short: "ಕ", native: "ಕನ್ನಡ" },
  { code: "ml-IN", label: "Malayalam", short: "മ", native: "മലയാളം" },
  { code: "mr-IN", label: "Marathi", short: "म", native: "मराठी" },
];

const SpeechRecognition =
  typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

// The voice language the user last chose in the search bar (BCP-47), default en-IN.
export function getVoiceLang() {
  try {
    return localStorage.getItem("atlas.voiceLang") || "en-IN";
  } catch {
    return "en-IN";
  }
}

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function voiceSupported() {
  return Boolean(SpeechRecognition);
}

// Hook: dictate speech in the chosen language into a text callback.
//   const { listening, interim, start, stop, supported } = useVoiceSearch({
//     lang: "hi-IN", onResult: (finalText) => setQuery(finalText),
//   });
export function useVoiceSearch({ lang = "en-IN", onResult, onFinal } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  // Keep the latest callbacks/lang without re-creating the recognizer.
  const cbRef = useRef({ onResult, onFinal, lang });
  cbRef.current = { onResult, onFinal, lang };

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognition) {
      setError("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    setError(null);
    setInterim("");
    // Fresh instance each time — some browsers won't restart a stopped one.
    const rec = new SpeechRecognition();
    rec.lang = cbRef.current.lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let final = "";
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += chunk;
        else partial += chunk;
      }
      if (partial) {
        setInterim(partial);
        cbRef.current.onResult?.(partial);
      }
      if (final) {
        setInterim("");
        cbRef.current.onResult?.(final);
        cbRef.current.onFinal?.(final.trim());
      }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech") setError("Didn't catch that — try again.");
      else if (e.error === "not-allowed")
        setError("Microphone blocked. Allow mic access and retry.");
      else setError("Voice error — please try again.");
      setListening(false);
    };
    rec.onend = () => setListening(false);

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { listening, interim, error, start, stop, supported: Boolean(SpeechRecognition) };
}

// Speak a short line back to the user in the given language (optional delight).
export function speak(text, lang = "en-IN") {
  try {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1.02;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
