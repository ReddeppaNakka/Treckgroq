// Per-continent accent gradients for destination cards.
const GRADIENTS = {
  Asia: "from-rose-500/80 to-orange-400/80",
  Europe: "from-indigo-500/80 to-sky-400/80",
  Africa: "from-amber-500/80 to-yellow-400/80",
  "North America": "from-cyan-500/80 to-blue-500/80",
  "South America": "from-emerald-500/80 to-lime-400/80",
  Oceania: "from-fuchsia-500/80 to-purple-400/80",
};

export function continentGradient(continent) {
  return GRADIENTS[continent] || "from-slate-500/80 to-slate-400/80";
}

// Free, key-less photo for a destination keyword (falls back to gradient on error).
export function photoUrl(query, w = 640, h = 420) {
  const q = encodeURIComponent(query.trim().replace(/\s+/g, ","));
  return `https://loremflickr.com/${w}/${h}/${q}`;
}

export function formatUSD(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

// Indian rupee with lakh/crore digit grouping, e.g. ₹1,18,000.
export function formatINR(n) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

// Minimal, safe markdown -> HTML for the assistant reply (**bold** + paragraphs).
export function renderReply(text) {
  const escape = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((para) => {
      const html = escape(para)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br/>");
      return `<p>${html}</p>`;
    })
    .join("");
}
