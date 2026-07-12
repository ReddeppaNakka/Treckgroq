import { motion } from "framer-motion";
import { MapPin, Wallet, BookOpen, ArrowUpRight } from "lucide-react";
import { continentGradient, formatINR } from "../lib/format";
import { useDestinationImage } from "../lib/images";

// A lightweight browse card driven by the plain catalog (no recommendation
// scores/estimates) — used across the Explore rails and grid. Clicking it hands
// the destination up so the app can open its full plan.
export default function ExploreCard({ d, onOpen, index = 0, wide = false, reasons }) {
  const img = useDestinationImage(d.image_query, 600, 440);
  const gradient = continentGradient(d.continent);

  return (
    <motion.button
      type="button"
      onClick={() => onOpen?.(d)}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.05, 0.4), ease: [0.16, 1, 0.3, 1] }}
      className={
        "group glass ring-hairline relative block flex-none snap-start overflow-hidden rounded-3xl text-left shadow-card transition-shadow hover:shadow-card-hover " +
        (wide ? "w-full" : "w-64 sm:w-72")
      }
    >
      <div className={`relative ${wide ? "h-44" : "h-40"} w-full bg-gradient-to-br ${gradient}`}>
        {img && (
          <img
            src={img}
            alt={d.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-all duration-700 group-hover:scale-110"
            onLoad={(e) => (e.currentTarget.style.opacity = 1)}
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

        <div className="absolute left-3 right-3 top-3 flex items-start justify-between">
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-[10.5px] font-semibold text-white backdrop-blur">
            {d.is_domestic ? "🇮🇳 India" : d.continent}
          </span>
          {d.story && (
            <span
              title="Full story available"
              className="flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-semibold text-gold-400 backdrop-blur"
            >
              <BookOpen size={10} /> Story
            </span>
          )}
        </div>

        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="font-serif text-xl font-semibold leading-tight text-white drop-shadow">
            {d.name}
          </h3>
          <p className="flex items-center gap-1 text-[11px] font-medium text-white/80">
            <MapPin size={10} /> {d.country}
          </p>
        </div>

        <span className="absolute bottom-3 right-3 flex h-8 w-8 translate-y-1 items-center justify-center rounded-full bg-white/10 text-white opacity-0 backdrop-blur transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-hover:bg-gradient-to-r group-hover:from-sky-500 group-hover:to-indigo-500">
          <ArrowUpRight size={15} />
        </span>
      </div>

      <div className="space-y-2 p-3.5">
        {d.tagline && (
          <p className="line-clamp-1 font-serif text-[12.5px] italic text-slate-300">{d.tagline}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {(d.tags || []).slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-full bg-white/5 px-2 py-0.5 text-[10.5px] capitalize text-slate-400"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 pt-0.5 text-[11px] text-slate-400">
          <Wallet size={11} className="text-gold-400" />
          <span className="font-semibold text-slate-200">{formatINR(d.daily_cost_inr)}</span>
          /day on the ground
        </div>

        {/* Why this matched — transparent search reasons */}
        {reasons?.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t border-white/5 pt-2">
            {reasons.map((r) => (
              <span
                key={r}
                className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300/90"
              >
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.button>
  );
}
