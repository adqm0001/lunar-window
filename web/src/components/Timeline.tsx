import { useEffect, useRef, useState } from "react";
import { formatUtc, hourToDate, SPEEDS, useApp } from "../state/store";
import { useSeries } from "../state/selectors";

const WINDOWS = [7, 30, 90, 365];
const OVERVIEW_H = 16;
const LABEL_W = 54;
const ROWS = [
  { key: "sun", label: "SUN", color: [255, 181, 71] },
  { key: "earth", label: "EARTH", color: [78, 168, 255] },
  { key: "link", label: "DSN", color: [61, 220, 151] },
] as const;

export default function Timeline() {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const playing = useApp((s) => s.playing);
  const speedIndex = useApp((s) => s.speedIndex);
  const { setHour, togglePlaying, setSpeedIndex } = useApp.getState();
  const series = useSeries();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [windowDays, setWindowDays] = useState(30);
  const scrubbing = useRef<"main" | "overview" | null>(null);

  const total = data.ephem.count;
  const span = windowDays * 24;
  const start = Math.max(0, Math.min(total - span, hour - span / 3));

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    const W = size.w - LABEL_W - 12;
    const x0 = LABEL_W;

    g.fillStyle = "#0b0f17";
    g.fillRect(x0, 8, W, OVERVIEW_H - 6);
    const ov = series.sun;
    const bucket = Math.max(1, Math.floor(total / W));
    for (let px = 0; px < W; px++) {
      const a = Math.floor((px / W) * total);
      let s = 0;
      for (let i = a; i < Math.min(total, a + bucket); i++) s += ov[i];
      const v = s / bucket / 255;
      g.fillStyle = `rgba(255,181,71,${0.15 + v * 0.75})`;
      g.fillRect(x0 + px, 8, 1, OVERVIEW_H - 6);
    }
    g.strokeStyle = "#8b9cff";
    g.lineWidth = 1;
    g.strokeRect(x0 + (start / total) * W, 7, Math.max(2, (span / total) * W), OVERVIEW_H - 4);
    g.fillStyle = "#7d889b";
    g.font = "10px JetBrains Mono, monospace";
    for (let y = 2026; y <= 2028; y++) {
      const h = (Date.UTC(y, 0, 1) - data.ephem.startMs) / 3600e3;
      g.fillText(String(y), x0 + (h / total) * W + 3, 6 + 0);
    }

    const top = OVERVIEW_H + 18;
    const rowH = Math.max(10, (size.h - top - 18) / 3 - 4);
    ROWS.forEach((row, r) => {
      const y = top + r * (rowH + 4);
      g.fillStyle = "#7d889b";
      g.font = "10px JetBrains Mono, monospace";
      g.fillText(row.label, 8, y + rowH / 2 + 3);
      g.fillStyle = "#0b0f17";
      g.fillRect(x0, y, W, rowH);
      const arr = series[row.key];
      const [cr, cg, cb] = row.color;
      for (let px = 0; px < W; px++) {
        const a = Math.floor(start + (px / W) * span);
        const b = Math.max(a + 1, Math.floor(start + ((px + 1) / W) * span));
        let s = 0;
        for (let i = a; i < b && i < total; i++) s += row.key === "sun" ? arr[i] / 255 : arr[i];
        const v = s / (b - a);
        if (v > 0.02) {
          g.fillStyle = `rgba(${cr},${cg},${cb},${0.2 + 0.8 * v})`;
          g.fillRect(x0 + px, y, 1, rowH);
        }
      }
    });

    const dayStep = windowDays <= 7 ? 1 : windowDays <= 30 ? 5 : windowDays <= 90 ? 15 : 60;
    const firstDay = Math.ceil(start / 24);
    g.fillStyle = "#4b5568";
    for (let d = firstDay; d * 24 < start + span; d++) {
      const x = x0 + ((d * 24 - start) / span) * W;
      g.fillRect(x, top - 4, 1, 3);
      if (d % dayStep === 0) {
        const date = hourToDate(data, d * 24);
        g.fillText(`${date.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${date.getUTCDate()}`, x + 2, size.h - 4);
      }
    }

    const cx = x0 + ((hour - start) / span) * W;
    g.fillStyle = "#ffffff";
    g.fillRect(cx - 0.75, top - 6, 1.5, size.h - top);
  }, [data, series, size, hour, start, span, total, windowDays]);

  const hourFromEvent = (e: React.PointerEvent, mode: "main" | "overview") => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const W = size.w - LABEL_W - 12;
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left - LABEL_W) / W));
    return mode === "overview" ? f * total : start + f * span;
  };

  return (
    <footer className="bottom">
      <div className="transport">
        <div className="row">
          <button className="btn primary" onClick={togglePlaying}>
            {playing ? "Pause" : "Play"}
          </button>
          <button className="btn" onClick={() => setHour(Math.floor(hour) - 24)}>
            −1d
          </button>
          <button className="btn" onClick={() => setHour(Math.floor(hour) + 24)}>
            +1d
          </button>
        </div>
        <div className="row">
          {SPEEDS.map((s, i) => (
            <button key={s.label} className={`btn small ${i === speedIndex ? "sel" : ""}`} onClick={() => setSpeedIndex(i)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="row">
          {WINDOWS.map((d) => (
            <button key={d} className={`btn small ${d === windowDays ? "sel" : ""}`} onClick={() => setWindowDays(d)}>
              {d}d
            </button>
          ))}
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{formatUtc(hourToDate(data, hour))} UTC</div>
      </div>
      <div
        className="timeline"
        ref={wrapRef}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          const rect = canvasRef.current!.getBoundingClientRect();
          scrubbing.current = e.clientY - rect.top < OVERVIEW_H + 8 ? "overview" : "main";
          setHour(hourFromEvent(e, scrubbing.current));
        }}
        onPointerMove={(e) => {
          if (scrubbing.current) setHour(hourFromEvent(e, scrubbing.current));
        }}
        onPointerUp={() => (scrubbing.current = null)}
      >
        <canvas ref={canvasRef} />
      </div>
    </footer>
  );
}
