import { useRef, useEffect } from "react";

export default function Composer({ value, onChange, onSend, disabled }) {
  const ref = useRef(null);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [value]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };

  return (
    <div className="glass flex items-end gap-2 rounded-2xl p-2">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Tell me your budget, travel month and what you love…"
        className="max-h-36 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Send"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 12L20 4L13 20L11 13L4 12Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
