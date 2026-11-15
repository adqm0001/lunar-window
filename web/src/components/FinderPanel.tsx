import { useState } from "react";
import { DEFAULT_WEIGHTS, findBestSpots, type FinderParams } from "../gpu/finder";
import { formatDuration, formatUtc, hourToDate, useApp } from "../state/store";

const MISSIONS = [3, 7, 14, 30, 90];
const NIGHTS: [string, number][] = [
  ["No night", 0],
  ["≤ 24 h", 24],
  ["≤ 50 h", 50],
  ["≤ 100 h", 100],
  ["Any", 1e9],
];
const FLATS = [0, 25, 50, 75];
const PRIORITIES: [string, FinderParams["weights"]][] = [
  ["Balanced", DEFAULT_WEIGHTS],
  ["Max power", { sun: 0.8, link: 0.05, earth: 0.05, flat: 0.1 }],
  ["Max comms", { sun: 0.2, link: 0.6, earth: 0.1, flat: 0.1 }],
  ["Safest ground", { sun: 0.3, link: 0.15, earth: 0.05, flat: 0.5 }],
];

export default function FinderPanel() {
  const data = useApp((s) => s.data)!;
  const field = useApp((s) => s.field);
  const hour = useApp((s) => s.hour);
  const result = useApp((s) => s.finder);
  const selectedId = useApp((s) => s.selectedId);
  const { setFinder, setFinderOpen, select } = useApp.getState();
  const [missionDays, setMissionDays] = useState(14);
  const [maxNight, setMaxNight] = useState(50);
  const [minFlat, setMinFlat] = useState(50);
  const [priority, setPriority] = useState(0);
  const [busy, setBusy] = useState(false);
  const spots = field ? field.meta.horizon.size ** 2 : 0;
  const km = field ? Math.round((2 * field.meta.extentMeters) / 1000) : 0;
  const areaLabel = field?.meta.label ? `the ${km} × ${km} km ${field.meta.label} area` : `the ${km} × ${km} km polar area`;

  const start = Math.floor(hour);
  // A mission must fit inside the ephemeris, as in Landing dates: past the last hour there is nothing to score.
  const hoursLeft = data.ephem.count - start;
  const fits = missionDays * 24 <= hoursLeft;
  const run = () => {
    if (!field || !fits) return;
    setBusy(true);
    setTimeout(() => {
      try {
        setFinder(
          findBestSpots(field, {
            startHour: start,
            missionDays,
            maxNightHours: maxNight,
            minSafePct: minFlat,
            weights: PRIORITIES[priority][1],
          }),
        );
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  return (
    <aside className="left finder">
      <div className="finder-head">
        <div>
          <div className="finder-title">Find a landing spot</div>
          <div className="finder-sub">Scores every 250 m cell in {areaLabel}</div>
        </div>
        <button className="icon-btn" onClick={() => setFinderOpen(false)} aria-label="Close">
          ✕
        </button>
      </div>

      <label className="f-label">Landing time</label>
      <div className="f-value">{formatUtc(hourToDate(data, start))} UTC</div>
      <div className="f-hint">Set it with the timeline below</div>

      <label className="f-label">Mission length</label>
      <div className="chips">
        {MISSIONS.map((d) => (
          <button key={d} className={`chip ${d === missionDays ? "sel" : ""}`} onClick={() => setMissionDays(d)}>
            {d} d
          </button>
        ))}
      </div>

      <label className="f-label">Longest night the battery can survive</label>
      <div className="chips">
        {NIGHTS.map(([label, h]) => (
          <button key={label} className={`chip ${h === maxNight ? "sel" : ""}`} onClick={() => setMaxNight(h)}>
            {label}
          </button>
        ))}
      </div>

      <label className="f-label">Flat ground (slope under 10°) at least</label>
      <div className="chips">
        {FLATS.map((f) => (
          <button key={f} className={`chip ${f === minFlat ? "sel" : ""}`} onClick={() => setMinFlat(f)}>
            {f}%
          </button>
        ))}
      </div>

      <label className="f-label">Priority</label>
      <div className="chips">
        {PRIORITIES.map(([label], i) => (
          <button key={label} className={`chip ${i === priority ? "sel" : ""}`} onClick={() => setPriority(i)}>
            {label}
          </button>
        ))}
      </div>

      <button className="btn primary search-btn" onClick={run} disabled={!field || busy || !fits}>
        {!field ? "Loading terrain…" : busy ? "Searching…" : `Search ${spots.toLocaleString()} spots`}
      </button>
      {!fits && (
        <div className="f-hint" role="status">
          A {missionDays}-day mission from here runs past the end of the data ({formatUtc(hourToDate(data, data.ephem.count - 1))} UTC). Choose an
          earlier landing time or a shorter mission.
        </div>
      )}

      {result && (
        <>
          <div className="f-stats">
            {result.evaluated.toLocaleString()} spots ×{" "}
            {Math.max(0, Math.min(result.params.missionDays * 24, data.ephem.count - result.params.startHour))} h scored on the GPU in{" "}
            {result.millis.toFixed(0)} ms ·{" "}
            {result.rejected.toLocaleString()} ruled out
          </div>
          {result.candidates.length === 0 && <div className="f-hint">No spot meets all constraints. Loosen the night or flat-ground limits.</div>}
          <div className="results">
            {result.candidates.map((c) => (
              <button key={c.site.id} className={`result ${c.site.id === selectedId ? "active" : ""}`} onClick={() => select(c.site.id)}>
                <span className="r-rank">#{c.rank}</span>
                <span className="r-main">
                  <span className="r-score">{Math.round(c.score * 100)}</span>
                  <span className="r-metrics">
                    <i style={{ color: "var(--sun)" }}>☀ {Math.round(c.sun * 100)}%</i>
                    <i style={{ color: "var(--link)" }}>⇅ {Math.round(c.link * 100)}%</i>
                    <i>☾ {formatDuration(c.nightHours)}</i>
                    <i>▱ {c.safePct}%</i>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="f-hint">☀ sunlit · ⇅ Sun + Earth + DSN at once · ☾ longest night · ▱ flat ground</div>
        </>
      )}
    </aside>
  );
}
