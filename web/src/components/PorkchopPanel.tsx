import { useEffect, useMemo, useRef, useState } from "react";
import { sunTrack, survivedFraction } from "../lib/lander";
import { formatUtc, hourToDate, useApp } from "../state/store";
import { useSites } from "../state/selectors";

const STEP_H = 12;
const RANGES = [3, 6, 12];
const MISSIONS = [7, 14, 30];

export default function PorkchopPanel() {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const lander = useApp((s) => s.lander);
  const pinned = useApp((s) => s.pinned);
  const allSites = useSites();
  const { setHour, select, setPorkchopOpen } = useApp.getState();
  const [months, setMonths] = useState(6);
  const [missionDays, setMissionDays] = useState(14);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Redraw when the canvas changes width, including when it first becomes visible (on phones it is hidden while a
  // sheet is open, and a hidden canvas measures 0 px).
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setBoxW(c.clientWidth));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  const sites = useMemo(() => {
    const base = pinned.length >= 2 ? pinned : allSites.filter((s) => s.terrain && s.lat < -80);
    return base.slice(0, 12);
  }, [pinned, allSites]);

  const start = Math.floor(hour / 24) * 24;
  const cols = Math.floor((months * 30 * 24) / STEP_H);

  const grid = useMemo(() => {
    const t0 = performance.now();
    const out = sites.map((s) => {
      const tr = sunTrack(data.ephem, s);
      const row = new Float32Array(cols);
      for (let c = 0; c < cols; c++) row[c] = survivedFraction(tr, lander, start + c * STEP_H, missionDays * 24);
      return row;
    });
    return { rows: out, millis: performance.now() - t0 };
  }, [sites, data, lander, start, cols, missionDays]);

  const LABEL_W = 150;
  const ROW_H = 18;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    if (w === 0) return;
    const h = sites.length * ROW_H + 22;
    c.style.height = `${h}px`;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const cw = (w - LABEL_W) / cols;
    g.font = "11px Inter, sans-serif";
    grid.rows.forEach((row, r) => {
      const y = r * ROW_H;
      g.fillStyle = "#aab3c3";
      g.fillText(sites[r].name.slice(0, 22), 4, y + 13);
      for (let k = 0; k < cols; k++) {
        const v = row[k];
        g.fillStyle = v >= 0.999 ? "rgba(61,220,151,0.9)" : v >= 0.75 ? "rgba(255,200,70,0.85)" : v >= 0.4 ? "rgba(255,130,70,0.85)" : "rgba(200,40,60,0.85)";
        g.fillRect(LABEL_W + k * cw, y + 2, Math.max(1, cw - 0.3), ROW_H - 4);
      }
    });
    g.fillStyle = "#7d889b";
    g.font = "10px JetBrains Mono, monospace";
    for (let k = 0; k < cols; k += Math.round((30 * 24) / STEP_H)) {
      const d = hourToDate(data, start + k * STEP_H);
      g.fillText(d.toLocaleString("en", { month: "short", timeZone: "UTC" }), LABEL_W + k * cw + 2, h - 6);
    }
    if (hover) {
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      g.strokeRect(LABEL_W + hover.col * cw, hover.row * ROW_H + 1, Math.max(2, cw), ROW_H - 2);
    }
  }, [grid, sites, cols, data, start, hover, boxW]);

  const cellAt = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - LABEL_W;
    const row = Math.floor((e.clientY - rect.top) / ROW_H);
    const col = Math.floor((x / (rect.width - LABEL_W)) * cols);
    if (x < 0 || row < 0 || row >= sites.length || col < 0 || col >= cols) return null;
    return { row, col };
  };

  const hv = hover ? grid.rows[hover.row][hover.col] : null;
  const best = useMemo(() => grid.rows.map((row) => row.reduce((a, v) => a + (v >= 0.999 ? 1 : 0), 0) / cols), [grid, cols]);

  return (
    <div className="glass porkchop">
      <div className="compare-head">
        <span className="finder-title">Landing dates</span>
        <span className="f-hint">
          {lander.name} · {missionDays}-day mission · every {STEP_H} h · {(sites.length * cols).toLocaleString()} missions simulated in {grid.millis.toFixed(0)} ms
        </span>
        <span className="spacer" />
        <div className="chips">
          {MISSIONS.map((d) => (
            <button key={d} className={`chip ${d === missionDays ? "sel" : ""}`} onClick={() => setMissionDays(d)}>
              {d} d
            </button>
          ))}
          <span className="chip-sep" />
          {RANGES.map((m) => (
            <button key={m} className={`chip ${m === months ? "sel" : ""}`} onClick={() => setMonths(m)}>
              {m} mo
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={() => setPorkchopOpen(false)} aria-label="Close">
          ✕
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="porkchop-canvas"
        onMouseMove={(e) => setHover(cellAt(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const c = cellAt(e);
          if (!c) return;
          setHour(start + c.col * STEP_H);
          select(sites[c.row].id);
        }}
      />
      <div className="porkchop-foot">
        {hover && hv !== null ? (
          <span>
            {sites[hover.row].name} · land {formatUtc(hourToDate(data, start + hover.col * STEP_H))} UTC →{" "}
            <b style={{ color: hv >= 0.999 ? "var(--link)" : "var(--danger)" }}>{hv >= 0.999 ? "survives" : `dies on day ${Math.max(1, Math.round(hv * missionDays))}`}</b> · click to jump there
          </span>
        ) : (
          <span>
            <i className="sw g" /> survives <i className="sw y" /> lasts 75%+ <i className="sw o" /> 40%+ <i className="sw r" /> dies early ·{" "}
            {pinned.length >= 2 ? "your pinned sites" : "polar sites (pin 2+ to choose your own)"} ·{" "}
            {Math.max(...best) > 0
              ? `most forgiving: ${sites[best.indexOf(Math.max(...best))]?.name} (${Math.round(Math.max(...best) * 100)}% of dates work)`
              : "no date survives the full mission with this lander. Try Sun-tracking panels or a bigger battery in Lander sim"}
          </span>
        )}
      </div>
    </div>
  );
}
