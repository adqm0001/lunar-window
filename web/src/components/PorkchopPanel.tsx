import Icon from "./Icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { sunTrack, survivedFraction } from "../lib/lander";
import { formatDuration, formatUtc, hourToDate, useApp } from "../state/store";
import { useSites } from "../state/selectors";

const STEP_H = 12;
const RANGES = [3, 6, 12];
const MISSIONS = [7, 14, 30];
const NO_DATA_COLOR = "rgba(125,136,155,0.35)";
const SURVIVAL_COLORS = ["#a7d9c8", "#8fb9f0", "#e8c479", "#dc8580"];

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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => setSelectedDate(null), [lander, missionDays]);
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
  const requestedCols = Math.floor((months * 30 * 24) / STEP_H);
  const cols = Math.max(0, Math.min(requestedCols, Math.floor((data.ephem.count - start - missionDays * 24) / STEP_H) + 1));

  const grid = useMemo(() => {
    const t0 = performance.now();
    const out = sites.map((s) => {
      const row = new Float32Array(cols);
      if (!cols) return row;
      const tr = sunTrack(data.ephem, s);
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
    g.font = "11px Geist, sans-serif";
    grid.rows.forEach((row, r) => {
      const y = r * ROW_H;
      g.fillStyle = "#aab3c3";
      g.fillText(sites[r].name.slice(0, 22), 4, y + 13);
      for (let k = 0; k < cols; k++) {
        const v = row[k];
        g.fillStyle = !Number.isFinite(v) ? NO_DATA_COLOR : SURVIVAL_COLORS[v >= 0.999 ? 0 : v >= 0.75 ? 1 : v >= 0.4 ? 2 : 3];
        g.fillRect(LABEL_W + k * cw, y + 2, cw + 0.5, ROW_H - 4);
      }
    });
    g.fillStyle = "#bdc3cd";
    g.font = "10px Geist, sans-serif";
    const monthStep = Math.round((30 * 24) / STEP_H);
    const labelStep = monthStep * Math.max(1, Math.ceil(42 / (cw * monthStep)));
    for (let k = 0; k < cols; k += labelStep) {
      const d = hourToDate(data, start + k * STEP_H);
      g.fillText(d.toLocaleString("en", { month: "short", timeZone: "UTC" }), LABEL_W + k * cw + 2, h - 6);
    }
    if (hover && hover.row < sites.length && hover.col < cols) {
      g.strokeStyle = "#fff";
      g.lineWidth = 1.5;
      g.strokeRect(LABEL_W + hover.col * cw, hover.row * ROW_H + 1, Math.max(2, cw), ROW_H - 2);
    }
  }, [grid, sites, cols, data, start, hover, boxW]);

  const cellAt = (e: React.MouseEvent) => {
    if (!cols) return null;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - LABEL_W;
    const row = Math.floor((e.clientY - rect.top) / ROW_H);
    const col = Math.floor((x / (rect.width - LABEL_W)) * cols);
    if (x < 0 || row < 0 || row >= sites.length || col < 0 || col >= cols) return null;
    return { row, col };
  };

  const hv = hover && hover.row < grid.rows.length && hover.col < cols ? grid.rows[hover.row][hover.col] : null;
  const best = useMemo(() => grid.rows.map((row) => row.reduce((a, v) => a + (v >= 0.999 ? 1 : 0), 0) / Math.max(1, cols)), [grid, cols]);
  const pick = (cell: { row: number; col: number } | null) => {
    if (!cell || !Number.isFinite(grid.rows[cell.row]?.[cell.col])) return;
    const landingHour = start + cell.col * STEP_H;
    const site = sites[cell.row];
    const fraction = grid.rows[cell.row][cell.col];
    const outcome = fraction >= 0.999 ? `covers the full ${missionDays}-day mission`
      : `reaches battery reserve after about ${formatDuration(fraction * missionDays * 24)} of ${missionDays} days`;
    setSelectedDate(`${site.name} · ${formatUtc(hourToDate(data, landingHour))} UTC · ${outcome}`);
    setHour(landingHour);
    select(site.id);
  };

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
          <Icon name="close" />
        </button>
      </div>
      <p className="date-chart-explainer">Battery endurance · green covers all {missionDays} days. Other colors show the share before reaching {lander.minSocPct}% battery reserve. Each row is a site. Tap a date to select it.</p>
      <div className="date-chart-legend" aria-label="Share of the mission before the battery reaches its reserve">
        {["Full mission", "75–99%", "40–74%", "Under 40%"].map((label, index) => (
          <span key={label}><i style={{ background: SURVIVAL_COLORS[index] }} />{label}</span>
        ))}
      </div>
      {cols > 0 ? <canvas
        ref={canvasRef}
        className="porkchop-canvas"
        tabIndex={0}
        role="img"
        aria-label="Landing dates. Tap a colored cell, or use arrow keys to choose a site and time and Enter to select."
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          const cell = hover ?? { row: 0, col: 0 };
          if (event.key === "Enter" || event.key === " ") pick(cell);
          else setHover({
            row: Math.max(0, Math.min(sites.length - 1, cell.row + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0))),
            col: Math.max(0, Math.min(cols - 1, cell.col + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0))),
          });
        }}
        onMouseMove={(e) => setHover(cellAt(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const c = cellAt(e);
          pick(c);
        }}
      /> : <div className="f-hint" role="status">No complete {missionDays}-day mission fits in the remaining data. Choose an earlier landing date or a shorter mission.</div>}
      {selectedDate && <div className="f-hint" role="status">Selected {selectedDate}</div>}
      {cols > 0 && <div className="porkchop-foot">
        {hover && hv !== null ? (
          <span>
            {sites[hover.row].name} · land {formatUtc(hourToDate(data, start + hover.col * STEP_H))} UTC →{" "}
            {Number.isFinite(hv) ? <><b style={{ color: hv >= 0.999 ? "var(--link)" : "var(--sun)" }}>{hv >= 0.999 ? "covers the full mission" : `battery reserve reached after ${formatDuration(hv * missionDays * 24)}`}</b> · select this date</> : "unavailable: not enough data for the full mission"}
          </span>
        ) : (
          <span>
            {pinned.length >= 2 ? "your pinned sites" : "polar sites (pin 2+ to choose your own)"} ·{" "}
            {Math.max(...best) > 0
              ? `most forgiving: ${sites[best.indexOf(Math.max(...best))]?.name} (${Math.round(Math.max(...best) * 100)}% of dates work)`
              : "no date survives the full mission with this lander. Try Sun-tracking panels or a bigger battery in Lander sim"}
          </span>
        )}
      </div>}
      {cols > 0 && cols < requestedCols && <div className="f-hint">Only complete mission windows are shown, through {formatUtc(hourToDate(data, start + (cols - 1) * STEP_H))} UTC.</div>}
    </div>
  );
}
