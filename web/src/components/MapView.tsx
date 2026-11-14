import { useEffect, useRef, useState } from "react";
import { formatLatLon, toLatLon, toMap } from "../lib/astro";
import { useApp } from "../state/store";
import { useSelectedSite, useSiteState } from "../state/selectors";

interface View {
  cx: number;
  cy: number;
  mpp: number;
}

const D2R = Math.PI / 180;

export default function MapView() {
  const data = useApp((s) => s.data)!;
  const select = useApp((s) => s.select);
  const site = useSelectedSite();
  const st = useSiteState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ cx: 0, cy: 0, mpp: 120 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = canvasRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toScreen = (x: number, y: number): [number, number] => [size.w / 2 + (x - view.cx) / view.mpp, size.h / 2 - (y - view.cy) / view.mpp];
  const toWorld = (sx: number, sy: number): [number, number] => [view.cx + (sx - size.w / 2) * view.mpp, view.cy - (sy - size.h / 2) * view.mpp];

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#000";
    g.fillRect(0, 0, size.w, size.h);

    const E = data.basemap.extentMeters;
    const [l, t] = toScreen(-E, E);
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.85;
    g.drawImage(data.basemap.image, l, t, (2 * E) / view.mpp, (2 * E) / view.mpp);
    g.globalAlpha = 1;

    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 1;
    const [px, py] = toScreen(0, 0);
    for (const lat of [-89, -88, -87, -86, -85]) {
      const r = Math.hypot(...toMap(lat, 0)) / view.mpp;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.font = "10px JetBrains Mono, monospace";
    for (const lat of [-89, -88, -87, -86, -85]) {
      const [, yy] = toScreen(0, Math.hypot(...toMap(lat, 0)));
      g.fillText(`${-lat}°S`, px + 4, yy - 3);
    }
    g.beginPath();
    g.arc(px, py, 3, 0, Math.PI * 2);
    g.fill();

    const [sx, sy] = toMap(site.lat, site.lon);
    const [ssx, ssy] = toScreen(sx, sy);
    const lon = site.lon * D2R;
    const northMap = [Math.sin(lon), Math.cos(lon)];
    const eastMap = [Math.cos(lon), -Math.sin(lon)];
    const ray = (az: number, color: string, up: boolean) => {
      const a = az * D2R;
      const dx = Math.cos(a) * northMap[0] + Math.sin(a) * eastMap[0];
      const dy = Math.cos(a) * northMap[1] + Math.sin(a) * eastMap[1];
      const len = Math.max(size.w, size.h);
      g.save();
      g.strokeStyle = color;
      g.globalAlpha = up ? 0.9 : 0.35;
      g.setLineDash(up ? [] : [5, 6]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(ssx, ssy);
      g.lineTo(ssx + dx * len, ssy - dy * len);
      g.stroke();
      g.restore();
    };
    ray(st.sun.az, "#ffb547", st.sunFraction >= 0.5);
    ray(st.earth.az, "#4ea8ff", st.earthUp);

    for (const s of data.sites) {
      if (!s.terrain) continue;
      const [x, y] = toScreen(...toMap(s.lat, s.lon));
      const active = s.id === site.id;
      g.beginPath();
      g.arc(x, y, active ? 7 : 4.5, 0, Math.PI * 2);
      g.fillStyle = active ? "#8b9cff" : "rgba(220,227,238,0.9)";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#04060a";
      g.stroke();
      g.font = active ? "600 12px Inter, sans-serif" : "11px Inter, sans-serif";
      g.fillStyle = active ? "#fff" : "rgba(220,227,238,0.8)";
      g.fillText(s.name, x + 10, y + 4);
    }

    const barKm = [1, 2, 5, 10, 20, 50, 100].find((k) => (k * 1000) / view.mpp > 70) ?? 100;
    const barPx = (barKm * 1000) / view.mpp;
    g.fillStyle = "rgba(220,227,238,0.8)";
    g.fillRect(size.w - barPx - 20, size.h - 22, barPx, 2);
    g.font = "10px JetBrains Mono, monospace";
    g.fillText(`${barKm} km`, size.w - barPx - 20, size.h - 28);
  }, [data, view, size, site, st]);

  const onWheel = (e: React.WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wy] = toWorld(sx, sy);
    const mpp = Math.max(8, Math.min(400, view.mpp * Math.exp(e.deltaY * 0.0015)));
    setView({ mpp, cx: wx - (sx - size.w / 2) * mpp, cy: wy + (sy - size.h / 2) * mpp });
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    setHover(toWorld(e.clientX - rect.left, e.clientY - rect.top));
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setView((v) => ({ ...v, cx: d.cx - dx * v.mpp, cy: d.cy + dy * v.mpp }));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || d.moved) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    let best: string | null = null;
    let bestD = 14;
    for (const s of data.sites) {
      if (!s.terrain) continue;
      const [x, y] = toScreen(...toMap(s.lat, s.lon));
      const dd = Math.hypot(x - sx, y - sy);
      if (dd < bestD) {
        bestD = dd;
        best = s.id;
      }
    }
    if (best) select(best);
  };

  const hoverLabel = hover ? formatLatLon(...toLatLon(hover[0], hover[1])) : "";

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`map-canvas ${dragging ? "dragging" : ""}`}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHover(null)}
      />
      <div className="map-legend">
        <span style={{ color: "var(--sun)" }}>━ Sun</span>&nbsp;&nbsp;
        <span style={{ color: "var(--earth)" }}>━ Earth</span>&nbsp;&nbsp;dashed = blocked by terrain
      </div>
      {hover && <div className="map-hud">{hoverLabel}</div>}
    </>
  );
}
