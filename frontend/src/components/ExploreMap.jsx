import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// A premium dark basemap built from CARTO's free raster tiles (no API key). The
// deep-ink background layer makes ocean read as the same navy as the app so the
// map dissolves into the page rather than sitting in a hard rectangle.
const DARK_STYLE = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#070b18" } },
    { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 0.9 } },
  ],
};

// Marker accent: an explicit point colour (POIs) wins; otherwise gold for India
// (our home market), sky for everywhere else.
const dotColor = (d) => d.color || (d.is_domestic ? "#e7c66b" : "#7dd3fc");

export default function ExploreMap({
  destinations,
  onOpen,
  activeName,
  center,   // optional [lng, lat] to focus on (e.g. a POI search area)
  zoom,     // optional zoom to pair with center
  className = "",
}) {
  const holder = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // Create the map once.
  useEffect(() => {
    if (mapRef.current || !holder.current) return;
    const map = new maplibregl.Map({
      container: holder.current,
      style: DARK_STYLE,
      center: center || [78.9, 20.6], // India-centred to start (our primary market)
      zoom: zoom || 3.1,
      attributionControl: { compact: true },
      dragRotate: false,
      maxZoom: 12,
      minZoom: 1.4,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.scrollZoom.disable(); // avoid hijacking page scroll; zoom via +/- or pinch
    map.touchZoomRotate.enable();
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // (Re)build markers when the destination list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const pts = (destinations || []).filter((d) => d.lat != null && d.lng != null);
    pts.forEach((d) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "atlas-pin";
      el.setAttribute("aria-label", d.name);
      el.innerHTML = `<span class="atlas-pin-dot" style="--c:${dotColor(d)}"></span>`;

      // Works for both catalog destinations and POIs (which carry subtitle /
      // distance_km instead of country / cost).
      const sub = d.subtitle
        ? escapeHtml(d.subtitle)
        : `${escapeHtml(d.country || "")}${d.continent ? " · " + escapeHtml(d.continent) : ""}`;
      const meta =
        d.daily_cost_inr != null
          ? `<div class="atlas-pop-cost">₹${d.daily_cost_inr.toLocaleString("en-IN")}<span>/day</span></div>`
          : d.distance_km != null
          ? `<div class="atlas-pop-cost">${d.distance_km} km<span> away</span></div>`
          : "";
      const popup = new maplibregl.Popup({
        offset: 14,
        closeButton: false,
        closeOnClick: true,
        className: "atlas-popup",
      }).setHTML(
        `<div class="atlas-pop">
           <div class="atlas-pop-name">${d.emoji ? d.emoji + " " : ""}${escapeHtml(d.name)}</div>
           <div class="atlas-pop-sub">${sub}</div>
           ${d.tagline ? `<div class="atlas-pop-tag">${escapeHtml(d.tagline)}</div>` : ""}
           ${meta}
         </div>`
      );

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([d.lng, d.lat])
        .setPopup(popup)
        .addTo(map);

      el.addEventListener("mouseenter", () => marker.togglePopup());
      el.addEventListener("mouseleave", () => popup.isOpen() && marker.togglePopup());
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onOpenRef.current?.(d);
      });

      marker._dest = d;
      markersRef.current.push(marker);
    });
  }, [destinations]);

  // Focus the map when the caller moves the center (e.g. a new POI search area).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    map.flyTo({ center, zoom: zoom || 9, speed: 1.1, curve: 1.4 });
  }, [center && center[0], center && center[1], zoom]);

  // Fly to the active destination and emphasise its pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => {
      const on = m._dest?.name === activeName;
      m.getElement().classList.toggle("is-active", on);
      if (on) map.flyTo({ center: m.getLngLat(), zoom: 5.5, speed: 0.8, curve: 1.4 });
    });
  }, [activeName]);

  return (
    <div className={"relative overflow-hidden " + className}>
      <div ref={holder} className="h-full w-full" />
      {/* Feather the edges so the map melts into the page */}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_60px_20px_rgba(7,11,24,0.9)]" />
    </div>
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
