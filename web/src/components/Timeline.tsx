import ControlMenu from "./ControlMenu";
import Icon from "./Icon";
import { useEffect, useRef, useState } from "react";
import { formatUtc, hourToDate, SPEEDS, useApp } from "../state/store";
import { useSeries } from "../state/selectors";
import { getSeries, useSeriesVersion } from "../state/seriesCache";
import { canRecord, startRecording, stopRecording } from "../lib/recorder";
import { ephemYears } from "../lib/years";

const WINDOWS = [7, 30, 90, 365];
const OVERVIEW_H = 16;
const LABEL_W = 72;
const SUN = [247, 213, 119] as const;
const EARTH = [167, 199, 250] as const;
const LINK = [167, 217, 200] as const;
const timelineDate = new Intl.DateTimeFormat("en", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const ROWS = [
  { key: "sun", label: "Sun", color: SUN },
  { key: "earth", label: "Earth", color: EARTH },
  { key: "link", label: "DSN", color: LINK },
] as const;

export default function Timeline() {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const playing = useApp((s) => s.playing);
  const speedIndex = useApp((s) => s.speedIndex);
  const { setHour, togglePlaying, setSpeedIndex } = useApp.getState();
  const series = useSeries();
  const seriesVersion = useSeriesVersion();
  const pinned = useApp((s) => s.pinned);
  const compareOpen = useApp((s) => s.compareOpen);
  const compare = compareOpen && pinned.length >= 2;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const chartHeight = compare ? Math.max(size.h, OVERVIEW_H + 34 + pinned.length * 84) : size.h;
  const [windowDays, setWindowDays] = useState(30);
  const scrubbing = useRef<"main" | "overview" | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const view = useApp((s) => s.view);
  const [recStart, setRecStart] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (recStart === null) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [recStart]);
  const toggleRec = async () => {
    if (recStart !== null) {
      setRecStart(null);
      await stopRecording(`lunar-window-${formatUtc(hourToDate(data, hour)).replace(/[: ]/g, "-")}`);
      return;
    }
    if (startRecording()) {
      setRecStart(Date.now());
      if (!useApp.getState().playing) togglePlaying();
    }
  };

  const total = data.ephem.count;
  const span = Math.min(windowDays * 24, total);
  const start = Math.max(0, Math.min(total - span, hour - span / 3));

  useEffect(() => {
    const el = wrapRef.current!;
    let active = true;
    const measure = () => {
      if (active) setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || size.w <= LABEL_W + 12 || size.h <= OVERVIEW_H + 34) return;
    const dpr = window.devicePixelRatio || 1;
    // Assigning width/height reallocates and clears the bitmap even when unchanged: only do it when the size differs
    // (playback redraws this every hour).
    const cw = Math.round(size.w * dpr);
    const ch = Math.round(chartHeight * dpr);
    if (c.width !== cw) c.width = cw;
    if (c.height !== ch) c.height = ch;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, chartHeight);
    const W = size.w - LABEL_W - 12;
    const x0 = LABEL_W;

    g.fillStyle = "rgba(207,205,202,0.15)";
    g.fillRect(x0, 13, W, 4);
    const ov = series?.sun;
    const bucket = Math.max(1, Math.floor(total / W));
    for (let px = 0; ov && px < W; px++) {
      const a = Math.floor((px / W) * total);
      let s = 0;
      for (let i = a; i < Math.min(total, a + bucket); i++) s += ov[i];
      const v = s / bucket / 255;
      if (v > 0) {
        g.fillStyle = `rgba(${SUN.join(",")},${0.2 + v * 0.65})`;
        g.fillRect(x0 + px, 13, 1, 4);
      }
    }
    g.strokeStyle = "#e7ecf4";
    g.lineWidth = 1;
    g.strokeRect(x0 + (start / total) * W, 12, Math.max(2, (span / total) * W), 6);
    g.fillStyle = "#bdc3cd";
    g.font = "11px Geist, system-ui, sans-serif";
    // One label per year, or every 2nd / 5th year when the overview is too narrow for them all.
    const years = ephemYears(data.ephem);
    const yearPx = ((365.25 * 24) / total) * W;
    const every = yearPx >= 34 ? 1 : yearPx * 2 >= 34 ? 2 : 5;
    for (let y = years.first; y <= years.last; y++) {
      const h = (Date.UTC(y, 0, 1) - data.ephem.startMs) / 3600e3;
      if (h < 0 || h >= total || y % every !== 0) continue;
      g.fillText(String(y), x0 + (h / total) * W, 10);
    }

    const top = OVERVIEW_H + 18;
    // Each compared site keeps the same three channels as the single-site view.
    type Spec = { label: string; arr: Uint8Array | null; color: readonly number[]; kind: "sun" | "flag"; siteName?: string };
    const specs: Spec[] = compare
      ? pinned.flatMap((site) => {
          const source = getSeries(data.ephem, site);
          return ROWS.map((row, index) => ({
            label: row.label,
            siteName: index === 0 ? site.name : undefined,
            arr: source?.[row.key] ?? null,
            color: row.color,
            kind: row.key === "sun" ? "sun" as const : "flag" as const,
          }));
        })
      : ROWS.map((row) => ({ label: row.label, arr: series?.[row.key] ?? null, color: row.color, kind: row.key === "sun" ? "sun" : "flag" }));
    const rowH = compare ? 20 : Math.max(3, (chartHeight - top - 16) / specs.length - 2);
    const plotBottom = chartHeight - 17;
    g.strokeStyle = "rgba(224,234,248,0.13)";
    g.lineWidth = 1;
    g.beginPath();
    for (let tick = 0; tick <= 6; tick++) {
      const gx = Math.round(x0 + W * tick / 6) + 0.5;
      g.moveTo(gx, top - 3);
      g.lineTo(gx, plotBottom);
    }
    g.stroke();
    let nextY = top;
    specs.forEach((row, index) => {
      if (row.siteName) {
        g.fillStyle = "rgba(4,8,14,0.54)";
        g.fillRect(0, nextY - 2, size.w, 18);
        g.fillStyle = "#f2f4f7";
        g.font = "600 12px Geist, system-ui, sans-serif";
        let siteName = row.siteName;
        while (siteName.length > 1 && g.measureText(siteName).width > size.w - 28) siteName = siteName.slice(0, -1);
        if (siteName !== row.siteName) siteName = siteName.slice(0, -1) + "…";
        g.fillText(siteName, 12, nextY + 11);
        nextY += 18;
      }
      const y = nextY;
      nextY += rowH + 2;
      const baseline = Math.round(y + rowH - 2) + 0.5;
      const amplitude = Math.max(2, Math.min(13, rowH - 5));
      g.fillStyle = index % 2 === 0 ? "rgba(224,234,248,0.035)" : "rgba(0,0,0,0.06)";
      g.fillRect(0, y - 1, size.w, rowH + 2);
      g.strokeStyle = "rgba(224,234,248,0.14)";
      g.lineWidth = 1;
      g.strokeRect(0.5, Math.round(y - 1) + 0.5, size.w - 1, Math.round(rowH + 2));
      g.beginPath();
      g.moveTo(x0 - 9.5, y);
      g.lineTo(x0 - 9.5, y + rowH + 1);
      g.stroke();
      g.fillStyle = `rgb(${row.color.join(",")})`;
      g.font = "500 13px Geist, system-ui, sans-serif";
      g.fillText(row.label, 12, y + rowH / 2 + 4);
      g.fillStyle = "rgba(207,205,202,0.16)";
      g.fillRect(x0, baseline - 0.5, W, 1);
      const arr = row.arr;
      if (!arr) {
        g.fillStyle = "#bdc3cd";
        g.font = "11px Geist, system-ui, sans-serif";
        g.fillText("Calculating…", x0 + 8, y + rowH / 2 + 4);
        return;
      }
      g.strokeStyle = `rgb(${row.color.join(",")})`;
      g.lineWidth = 1.4;
      g.beginPath();
      let previousLevel = baseline;
      for (let px = 0; px < W; px++) {
        const a = Math.floor(start + (px / W) * span);
        const b = Math.max(a + 1, Math.floor(start + ((px + 1) / W) * span));
        let value = 0;
        for (let i = a; i < b && i < total; i++) value += row.kind === "sun" ? arr[i] / 255 : arr[i];
        const signal = baseline - value / (b - a) * amplitude;
        const x = x0 + px + 0.5;
        if (px === 0) g.moveTo(x, signal);
        else {
          g.lineTo(x, previousLevel);
          g.lineTo(x, signal);
        }
        previousLevel = signal;
      }
      g.lineTo(x0 + W, previousLevel);
      g.stroke();
    });

    const dayStep = [1, 2, 5, 10, 15, 30, 60, 90, 180, 365].find((step) => W / windowDays * step >= 60) ?? 365;
    const firstDay = Math.ceil(start / 24);
    g.fillStyle = "#bdc3cd";
    g.font = "12px Geist, system-ui, sans-serif";
    for (let d = firstDay; d * 24 < start + span; d++) {
      const x = x0 + ((d * 24 - start) / span) * W;
      g.fillRect(x, top - 4, 1, 3);
      if (d % dayStep === 0 && x + 44 < size.w) {
        const date = hourToDate(data, d * 24);
        g.fillText(`${date.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${date.getUTCDate()}`, x + 2, chartHeight - 4);
      }
    }

    const cx = x0 + ((hour - start) / span) * W;
    g.fillStyle = "#f0eeea";
    g.fillRect(cx - 0.5, top - 8, 1, chartHeight - top - 7);
    g.beginPath();
    g.moveTo(cx - 3, top - 9);
    g.lineTo(cx + 3, top - 9);
    g.lineTo(cx, top - 5);
    g.fill();
  }, [data, series, seriesVersion, size, hour, start, span, total, windowDays, compare, pinned, chartHeight]);

  const hourFromEvent = (e: React.PointerEvent, mode: "main" | "overview") => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const W = size.w - LABEL_W - 12;
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left - LABEL_W) / W));
    return mode === "overview" ? f * total : start + f * span;
  };

  const date = hourToDate(data, hour);
  return (
    <footer className={compare ? "bottom comparison-timeline" : "bottom"} aria-label="Site timeline">
      <div className="transport">
        <div className="row" role="group" aria-label="Time playback">
          <button className="control-action play-toggle" aria-label={playing ? "Pause" : "Play"} onClick={togglePlaying}>
            <Icon name={playing ? "pause" : "play"} />
          </button>
          <button className="control-action" aria-label="Back one day" onClick={() => setHour(Math.floor(hour) - 24)}>
            <Icon name="left" />
          </button>
          <button className="control-action" aria-label="Forward one day" onClick={() => setHour(Math.floor(hour) + 24)}>
            <Icon name="right" />
          </button>
          {view === "3d" && canRecord() && (
            <button className={`control-action rec ${recStart !== null ? "on" : ""}`} onClick={toggleRec}
              aria-label={recStart === null ? "Record 3D view" : "Stop recording"}
              title={recStart === null ? "Record 3D view" : "Stop recording"}>
              <span className="record-symbol" aria-hidden="true" />
              {recStart !== null && <span>{Math.floor((Date.now() - recStart) / 1000)}s</span>}
            </button>
          )}
        </div>
        <time className="timeline-time" dateTime={date.toISOString()}>
          <span>{timelineDate.format(date)}</span>
          <strong>{formatUtc(date).slice(-5)}</strong>
          <span className="time-zone">UTC</span>
        </time>
        <div className="row timeline-options">
          <ControlMenu label="Speed" value={SPEEDS[speedIndex].label} placement="above">
            {(close) => SPEEDS.map((speed, index) => (
              <button key={speed.label} className="control-action" aria-pressed={index === speedIndex}
                onClick={() => { setSpeedIndex(index); close(); }}>
                {speed.label}
              </button>
            ))}
          </ControlMenu>
          <ControlMenu label="Window" value={windowDays === 365 ? "1 year" : windowDays + " days"} placement="above" align="end">
            {(close) => WINDOWS.map((days) => (
              <button key={days} className="control-action" aria-pressed={days === windowDays}
                onClick={() => { setWindowDays(days); close(); }}>
                {days === 365 ? "1 year" : days + " days"}
              </button>
            ))}
          </ControlMenu>
        </div>
      </div>
      <div
        className="timeline"
        ref={wrapRef}
        tabIndex={0}
        aria-label={compare ? "Sun, Earth, and DSN for each compared site. Scroll for more sites, or drag horizontally to change time." : "Sun, Earth, and DSN timeline. Drag or use the arrow keys to change the time."}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          const rect = canvasRef.current!.getBoundingClientRect();
          scrubbing.current = e.clientY - rect.top < OVERVIEW_H + 8 ? "overview" : "main";
          if (e.pointerType === "touch") touchStart.current = { x: e.clientX, y: e.clientY };
          else setHour(hourFromEvent(e, scrubbing.current));
        }}
        onPointerMove={(event) => {
          if (!scrubbing.current) return;
          if (touchStart.current) {
            const dx = Math.abs(event.clientX - touchStart.current.x);
            const dy = Math.abs(event.clientY - touchStart.current.y);
            if (dx < 6 && dy < 6) return;
            touchStart.current = null;
            if (dy > dx) {
              scrubbing.current = null;
              return;
            }
          }
          setHour(hourFromEvent(event, scrubbing.current));
        }}
        onPointerUp={(event) => {
          if (touchStart.current && scrubbing.current) setHour(hourFromEvent(event, scrubbing.current));
          touchStart.current = null;
          scrubbing.current = null;
        }}
        onPointerCancel={() => { touchStart.current = null; scrubbing.current = null; }}
      >
        <canvas ref={canvasRef} style={{ height: chartHeight }} />
      </div>
    </footer>
  );
}
