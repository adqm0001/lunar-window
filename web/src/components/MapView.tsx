import { useEffect, useMemo, useRef, useState } from "react";
import { formatLatLon, toLatLon, toMap } from "../lib/astro";
import { fieldCell, fieldHeight, fieldHorizon } from "../data/field";
import type { Site } from "../data/load";
import { formatLayerValue, gradientCss, layerDef, layerValue, LAYERS, paint } from "../gpu/layers";
import { useFieldMetrics } from "../gpu/useFieldMetrics";
import { formatUtc, hourToDate, useApp } from "../state/store";
import { useSelectedSite, useSiteState, useSites } from "../state/selectors";

interface View {
  cx: number;
  cy: number;
  mpp: number;
}

const D2R = Math.PI / 180;
const RANGES = [7, 30, 90, 365];

export default function MapView() {
  const data = useApp((s) => s.data)!;
  const field = useApp((s) => s.field);
  const fieldProgress = useApp((s) => s.fieldProgress);
  const fieldError = useApp((s) => s.fieldError);
  const layer = useApp((s) => s.layer);
  const rangeDays = useApp((s) => s.rangeDays);
  const { select, setLayer, setRangeDays, setCustomSite } = useApp.getState();
  const sites = useSites();
  const site = useSelectedSite();
  const st = useSiteState();
  const { metrics, error: gpuError, start, hours } = useFieldMetrics();
  const def = layerDef(layer);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ cx: 0, cy: 0, mpp: 110 });
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

  const overlay = useMemo(() => {
    if (!field || layer === "terrain") return null;
    if (layer !== "slope" && !metrics) return null;
    const n = field.meta.horizon.size;
    const c = document.createElement("canvas");
    c.width = n;
    c.height = n;
    const g = c.getContext("2d")!;
    const img = g.createImageData(n, n);
    paint(layer, metrics, field, img);
    g.putImageData(img, 0, 0);
    return c;
  }, [field, layer, metrics]);

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

    if (overlay && field) {
      const FE = field.meta.extentMeters;
      const [ol, ot] = toScreen(-FE, FE);
      g.imageSmoothingEnabled = view.mpp > 60;
      g.drawImage(overlay, ol, ot, (2 * FE) / view.mpp, (2 * FE) / view.mpp);
      g.imageSmoothingEnabled = true;
      g.strokeStyle = "rgba(139,156,255,0.35)";
      g.setLineDash([4, 4]);
      g.strokeRect(ol, ot, (2 * FE) / view.mpp, (2 * FE) / view.mpp);
      g.setLineDash([]);
    }

    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 1;
    const [px, py] = toScreen(0, 0);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.font = "10px JetBrains Mono, monospace";
    for (const lat of [-89, -88, -87, -86, -85]) {
      const r = Math.hypot(...toMap(lat, 0)) / view.mpp;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.stroke();
      g.fillText(`${-lat}°S`, px + 4, py - r - 3);
    }
    g.beginPath();
    g.arc(px, py, 3, 0, Math.PI * 2);
    g.fill();

    const [ssx, ssy] = toScreen(...toMap(site.lat, site.lon));
    const lon = site.lon * D2R;
    const northMap = [Math.sin(lon), Math.cos(lon)];
    const eastMap = [Math.cos(lon), -Math.sin(lon)];
    const ray = (az: number, color: string, up: boolean) => {
      const a = az * D2R;
      const dx = Math.cos(a) * northMap[0] + Math.sin(a) * eastMap[0];
      const dy = Math.cos(a) * northMap[1] + Math.sin(a) * eastMap[1];
      const len = Math.max(size.w, size.h) * 1.5;
      g.save();
      g.strokeStyle = color;
      g.globalAlpha = up ? 0.9 : 0.4;
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

    for (const s of sites) {
      if (!s.terrain) continue;
      const [x, y] = toScreen(...toMap(s.lat, s.lon));
      const active = s.id === site.id;
      g.beginPath();
      if (s.group === "Custom") {
        g.moveTo(x, y - 7);
        g.lineTo(x + 7, y);
        g.lineTo(x, y + 7);
        g.lineTo(x - 7, y);
        g.closePath();
      } else g.arc(x, y, active ? 7 : 4.5, 0, Math.PI * 2);
      g.fillStyle = active ? "#8b9cff" : "rgba(220,227,238,0.9)";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#04060a";
      g.stroke();
      g.font = active ? "600 12px Inter, sans-serif" : "11px Inter, sans-serif";
      g.lineWidth = 3;
      g.strokeText(s.name, x + 10, y + 4);
      g.fillStyle = active ? "#fff" : "rgba(220,227,238,0.85)";
      g.fillText(s.name, x + 10, y + 4);
    }

    const barKm = [1, 2, 5, 10, 20, 50, 100].find((k) => (k * 1000) / view.mpp > 70) ?? 100;
    const barPx = (barKm * 1000) / view.mpp;
    g.fillStyle = "rgba(220,227,238,0.8)";
    g.fillRect(size.w - barPx - 20, size.h - 22, barPx, 2);
    g.font = "10px JetBrains Mono, monospace";
    g.fillText(`${barKm} km`, size.w - barPx - 20, size.h - 28);
  }, [data, view, size, site, st, sites, overlay, field]);

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
    for (const s of sites) {
      if (!s.terrain) continue;
      const [x, y] = toScreen(...toMap(s.lat, s.lon));
      const dd = Math.hypot(x - sx, y - sy);
      if (dd < bestD) {
        bestD = dd;
        best = s.id;
      }
    }
    if (best) {
      select(best);
      return;
    }
    if (!field) return;
    const [wx, wy] = toWorld(sx, sy);
    const [lat, lon] = toLatLon(wx, wy);
    const cell = fieldCell(field, lat, lon);
    if (!cell) return;
    const custom: Site = {
      id: `custom:${lat.toFixed(4)},${lon.toFixed(4)}`,
      name: "Custom point",
      lat,
      lon,
      group: "Custom",
      terrain: true,
      height_m: fieldHeight(field, wx, wy) ?? 0,
      horizon: fieldHorizon(field, cell.col, cell.row),
    };
    setCustomSite(custom);
  };

  const hoverInfo = useMemo(() => {
    if (!hover) return null;
    const [lat, lon] = toLatLon(hover[0], hover[1]);
    let value = "";
    let height = "";
    if (field) {
      const cell = fieldCell(field, lat, lon);
      if (cell) {
        const i = cell.row * field.meta.horizon.size + cell.col;
        value = formatLayerValue(layer, layerValue(layer, metrics, field, i));
        const h = fieldHeight(field, hover[0], hover[1]);
        if (h !== null) height = `${Math.round(h)} m`;
      }
    }
    return { pos: formatLatLon(lat, lon), value, height };
  }, [hover, field, layer, metrics]);

  const fieldPct = Math.round(fieldProgress * 100);

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

      <div className="layer-bar">
        {LAYERS.map((l) => (
          <button key={l.id} className={`chip ${l.id === layer ? "sel" : ""}`} onClick={() => setLayer(l.id)} title={l.describe}>
            {l.short}
          </button>
        ))}
        {def.ranged && (
          <>
            <span className="chip-sep" />
            {RANGES.map((d) => (
              <button key={d} className={`chip ${d === rangeDays ? "sel" : ""}`} onClick={() => setRangeDays(d)}>
                {d === 365 ? "1y" : `${d}d`}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="map-legend">
        <div className="legend-title">{def.label}</div>
        {def.stops.length > 0 && (
          <>
            <div className="legend-bar" style={{ background: gradientCss(def.stops) }} />
            <div className="legend-ends">
              <span>{def.legend[0]}</span>
              <span>{def.legend[1]}</span>
            </div>
          </>
        )}
        {layer === "now" && (
          <div className="legend-ends">
            <span>■ shadow</span>
            <span style={{ color: "var(--sun)" }}>■ lit</span>
          </div>
        )}
        <div className="legend-desc">{def.describe}</div>
        {def.ranged && (
          <div className="legend-desc">
            {formatUtc(hourToDate(data, start)).slice(0, 10)} → {formatUtc(hourToDate(data, start + hours)).slice(0, 10)}
          </div>
        )}
        {metrics && (def.ranged || layer === "now") && (
          <div className="legend-gpu">
            GPU · {(metrics.size * metrics.size).toLocaleString()} points × {Math.round(metrics.hours / metrics.stride).toLocaleString()} time steps in{" "}
            {metrics.millis.toFixed(0)} ms
          </div>
        )}
        {!field && !fieldError && <div className="legend-gpu">Loading terrain field {fieldPct}%</div>}
        {(fieldError || gpuError) && <div className="legend-gpu error">{fieldError ?? gpuError}</div>}
      </div>

      {hoverInfo && (
        <div className="map-hud">
          {hoverInfo.pos}
          {hoverInfo.height && ` · ${hoverInfo.height}`}
          {hoverInfo.value && <b> · {hoverInfo.value}</b>}
          {field && <span className="hint"> · click to analyze</span>}
        </div>
      )}
    </>
  );
}
