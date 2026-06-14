/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Sora", "Inter", "sans-serif"],
        serif: ["Fraunces", "Georgia", "serif"],
      },
      colors: {
        ink: "#070b18",
        surface: "#0f1530",
        "surface-2": "#141b3d",
        gold: {
          DEFAULT: "#e7c66b",
          400: "#e7c66b",
          500: "#d4af37",
          600: "#b8932e",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(231,198,107,0.18), 0 20px 60px -20px rgba(231,198,107,0.35)",
        card: "0 24px 60px -24px rgba(0,0,0,0.7)",
        "card-hover": "0 36px 80px -28px rgba(0,0,0,0.8)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "ken-burns": {
          "0%": { transform: "scale(1) translate(0,0)" },
          "100%": { transform: "scale(1.12) translate(-1%, -2%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.55s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.8s linear infinite",
        "pulse-soft": "pulse-soft 1.4s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "ken-burns": "ken-burns 18s ease-out forwards",
      },
    },
  },
  plugins: [],
};
