import { useMemo, useState } from "react";
import { fieldCell } from "../data/field";
import { getEngine } from "../gpu/useFieldMetrics";
import { isRoute, type RoverFailure } from "../lib/rover";
import { planRouteInWorker } from "../workers/client";
import { formatDuration, formatUtc, hourToDate, SPEEDS, useApp } from "../state/store";
import { useSelectedSite, useSites } from "../state/selectors";

const SPEED_KMH = [0.2, 0.4, 0.8];
const SLOPES = [15, 20, 25];
const WINDOW_DAYS = 14;

export default function RoverPanel() {
  const data = useApp((s) => s.data)!;
  const field = useApp((s) => s.field);
  const hour = useApp((s) => s.hour);
  const result = useApp((s) => s.rover);
  const { setRover, setRoverOpen, setHour, select } = useApp.getState();
  const from = useSelectedSite();
  const sites = useSites();
  const [toId, setToId] = useState<string>("");
  const [speed, setSpeed] = useState(0.4);
  const [maxSlope, setMaxSlope] = useState(20);
  const [needLink, setNeedLink] = useState(false);
  const [busy, setBusy] = useState(false);

  const inArea = useMemo(() => (field ? sites.filter((s) => fieldCell(field, s.lat, s.lon)) : []), [field, sites]);
  const fromCell = field ? fieldCell(field, from.lat, from.lon) : null;
  const targets = inArea.filter((s) => s.id !== from.id);
  const to = targets.find((s) => s.id === toId) ?? targets[0];

  const run = () => {
    if (!field || !fromCell || !to) return;
    const goal = fieldCell(field, to.lat, to.lon);
    const e = getEngine();
    if (!goal || !e) return;
    setBusy(true);
    setTimeout(async () => {
      try {
        // visibilityBits needs WebGL, so it stays here; the search itself runs in the compute worker.
        const bits = e.visibilityBits(Math.floor(hour), WINDOW_DAYS * 24);
        const gpuMillis = bits.millis;
        const r = await planRouteInWorker(field, bits, { start: fromCell, goal, speedKmh: speed, maxSlopeDeg: maxSlope, needLink }).catch(
          (err: Error): RoverFailure => ({ reason: `The route search failed: ${err.message}`, expanded: 0, millis: 0 }),
        );
        // Drop the result if the panel was closed or the area changed while the worker was searching.
        const now = useApp.getState();
        if (!now.roverOpen || now.field !== field) return;
        if (isRoute(r)) r.gpuMillis = gpuMillis;
        setRover(r);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const replay = () => {
    if (!isRoute(result)) return;
    setHour(result.startHour);
    const st = useApp.getState();
    st.setSpeedIndex(Math.max(0, SPEEDS.findIndex((s) => s.hoursPerSecond === 6)));
    if (!st.playing) st.togglePlaying();
  };

  const route = isRoute(result) ? result : null;
  const done = route ? hour >= route.arriveHour : false;

  return (
    <aside className="left finder rover">
      <div className="finder-head">
        <div>
          <div className="finder-title">Rover route planner</div>
          <div className="finder-sub">Drive only in sunlight, on gentle slopes, as the shadows move hour by hour</div>
        </div>
        <button className="icon-btn" onClick={() => setRoverOpen(false)} aria-label="Close">
          ✕
        </button>
      </div>

      <label className="f-label">From</label>
      <div className="f-value">{from.name}</div>
      {!fromCell && <div className="f-hint error">Pick a starting point inside the detailed terrain area (the selected site is outside it).</div>}
      <div className="f-hint">The selected site. Change it in the list or by clicking the terrain.</div>

      <label className="f-label">To</label>
      <select className="f-select" value={to?.id ?? ""} onChange={(e) => setToId(e.target.value)}>
        {targets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <label className="f-label">Leave at</label>
      <div className="f-value">{formatUtc(hourToDate(data, Math.floor(hour)))} UTC</div>

      <label className="f-label">Driving speed</label>
      <div className="chips">
        {SPEED_KMH.map((v) => (
          <button key={v} className={`chip ${v === speed ? "sel" : ""}`} onClick={() => setSpeed(v)}>
            {v * 1000} m/h
          </button>
        ))}
      </div>
      <div className="f-hint">NASA's VIPER rover tops out near 800 m/h.</div>

      <label className="f-label">Steepest slope it can climb</label>
      <div className="chips">
        {SLOPES.map((v) => (
          <button key={v} className={`chip ${v === maxSlope ? "sel" : ""}`} onClick={() => setMaxSlope(v)}>
            {v}°
          </button>
        ))}
      </div>

      <label className="f-check">
        <input type="checkbox" checked={needLink} onChange={(e) => setNeedLink(e.target.checked)} /> Only drive while Earth and a DSN dish are in view
      </label>

      <button className="btn primary search-btn" onClick={run} disabled={!field || !fromCell || !to || busy}>
        {busy ? "Planning…" : "Plan route"}
      </button>

      {result && !route && "reason" in result && <div className="f-hint error">{result.reason}</div>}

      {route && (
        <>
          <dl className="kv rover-kv">
            <dt>Arrives</dt>
            <dd>{formatUtc(hourToDate(data, route.arriveHour))}</dd>
            <dt>Trip time</dt>
            <dd>{formatDuration(route.arriveHour - route.startHour)}</dd>
            <dt>Distance</dt>
            <dd>{route.distanceKm.toFixed(1)} km</dd>
            <dt>Driving / waiting for light</dt>
            <dd>
              {formatDuration(route.driveHours)} / {formatDuration(route.waitHours)}
            </dd>
            <dt>Time in sunlight</dt>
            <dd style={{ color: "var(--sun)" }}>{route.litPct.toFixed(0)}%</dd>
            <dt>Time in contact with Earth</dt>
            <dd style={{ color: "var(--link)" }}>{route.linkPct.toFixed(0)}%</dd>
          </dl>
          <div className="f-stats">
            {WINDOW_DAYS * 24} hours of light and Earth visibility for {(field!.meta.horizon.size ** 2).toLocaleString()} cells on the GPU in{" "}
            {route.gpuMillis.toFixed(0)} ms · route search over {route.expanded.toLocaleString()} cells in {route.millis.toFixed(0)} ms
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={replay}>
              ▶ Replay the drive
            </button>
            <button className="btn" onClick={() => to && select(to.id)}>
              Go to destination
            </button>
            <button className="btn" onClick={() => setRover(null)}>
              Clear
            </button>
          </div>
          {done && <div className="f-hint">Arrived. Rewind the timeline to watch it again.</div>}
        </>
      )}
    </aside>
  );
}
