import { useEffect, useRef } from "react";

// Ambient canvas globe for the hero: a rotating lat/long point sphere with
// pulsing "destination" markers and one animated flight arc. Pure canvas (no
// three.js) to stay light. Honours prefers-reduced-motion by drawing a single
// static frame instead of animating.
const SKY = "#7dd3fc";
const GOLD = "#e7c66b";

// A scatter of real-ish destination coordinates [latitude, longitude].
const DESTS = [
  [35.0, 135.8], // Kyoto
  [-8.4, 115.2], // Bali
  [36.4, 25.4], // Santorini
  [64.1, -21.9], // Reykjavik
  [-50.9, -73.4], // Patagonia
  [27.2, 78.0], // Agra
  [48.85, 2.35], // Paris
  [-33.9, 151.2], // Sydney
  [31.6, -7.98], // Marrakech
];

export default function Globe() {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0, H = 0, R = 0, CX = 0, CY = 0, raf = 0;

    function size() {
      const rect = cv.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      cv.width = W * DPR;
      cv.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      R = Math.min(W, H) * 0.4;
      CX = W / 2;
      CY = H / 2;
    }

    // lat/long grid of points
    const pts = [];
    for (let lat = -80; lat <= 80; lat += 12) {
      for (let lon = -180; lon < 180; lon += 12) {
        pts.push([(lat * Math.PI) / 180, (lon * Math.PI) / 180]);
      }
    }
    const dests = DESTS.map((d) => [(d[0] * Math.PI) / 180, (d[1] * Math.PI) / 180]);

    function project(lat, lon, rot) {
      const x = Math.cos(lat) * Math.sin(lon + rot);
      const y = Math.sin(lat);
      const z = Math.cos(lat) * Math.cos(lon + rot);
      return { x: CX + x * R, y: CY - y * R, z };
    }

    let rot = 0, phase = 0;

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // atmospheric haze
      const grd = ctx.createRadialGradient(CX - R * 0.3, CY - R * 0.3, R * 0.2, CX, CY, R * 1.15);
      grd.addColorStop(0, "rgba(56,130,246,0.16)");
      grd.addColorStop(1, "rgba(56,130,246,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(CX, CY, R * 1.12, 0, Math.PI * 2);
      ctx.fill();

      // grid points (front hemisphere only)
      for (let i = 0; i < pts.length; i++) {
        const p = project(pts[i][0], pts[i][1], rot);
        if (p.z < 0) continue;
        ctx.globalAlpha = 0.12 + p.z * 0.5;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1 + p.z * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // pulsing destination markers
      for (let d = 0; d < dests.length; d++) {
        const dp = project(dests[d][0], dests[d][1], rot);
        if (dp.z < 0.05) continue;
        const pulse = (Math.sin(phase * 2 + d) + 1) / 2;
        ctx.globalAlpha = 0.35 + dp.z * 0.5;
        ctx.fillStyle = GOLD;
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 2.2 + dp.z, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = (0.4 - pulse * 0.4) * dp.z;
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, (2 + pulse * 12) * Math.max(dp.z, 0.3), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // one animated flight arc between two front-facing destinations
      const A = project(dests[0][0], dests[0][1], rot);
      const B = project(dests[3][0], dests[3][1], rot);
      if (A.z > 0 && B.z > 0) {
        const mx = (A.x + B.x) / 2;
        const my = (A.y + B.y) / 2 - R * 0.5;
        ctx.strokeStyle = SKY;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.quadraticCurveTo(mx, my, B.x, B.y);
        ctx.stroke();

        const t = phase % 1;
        const qx = (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * mx + t * t * B.x;
        const qy = (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * my + t * t * B.y;
        ctx.globalAlpha = 1;
        ctx.fillStyle = SKY;
        ctx.beginPath();
        ctx.arc(qx, qy, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(qx, qy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function loop() {
      rot += 0.0016;
      phase += 0.006;
      draw();
      raf = requestAnimationFrame(loop);
    }

    size();
    const onResize = () => {
      size();
      if (reduce) draw();
    };
    window.addEventListener("resize", onResize);

    if (reduce) draw();
    else loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="h-full w-full" aria-hidden="true" />;
}
