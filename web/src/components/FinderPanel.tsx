import Icon from "./Icon";
import { useState } from "react";
import { DEFAULT_WEIGHTS, findBestSpots, fitsFinderMission, type FinderParams } from "../gpu/finder";
import { changedFinderParams, sameWeights } from "../lib/finderSettings";
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
  // Reopening the panel shows the settings of the search whose results are still listed.
  const [kept] = useState(() => useApp.getState().finder?.params ?? null);
  const [missionDays, setMissionDays] = useState(kept && MISSIONS.includes(kept.missionDays) ? kept.missionDays : 14);
  const [maxNight, setMaxNight] = useState(kept && NIGHTS.some(([, h]) => h === kept.maxNightHours) ? kept.maxNightHours : 50);
  const [minFlat, setMinFlat] = useState(kept && FLATS.includes(kept.minSafePct) ? kept.minSafePct : 50);
  const [priority, setPriority] = useState(() => {
    const i = kept ? PRIORITIES.findIndex(([, w]) => sameWeights(w, kept.weights)) : -1;
    return i >= 0 ? i : 0;
  });
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const km = field ? Math.round((2 * field.meta.extentMeters) / 1000) : 0;
  const areaLabel = field?.meta.label ? `the ${km} × ${km} km ${field.meta.label} area` : `the ${km} × ${km} km polar area`;

  const start = Math.floor(hour);
  const fits = fitsFinderMission(start, missionDays, data.ephem.count);
  const params: FinderParams = { startHour: start, missionDays, maxNightHours: maxNight, minSafePct: minFlat, weights: PRIORITIES[priority][1] };
  // The listed spots belong to the settings they were searched with; say which ones have changed since.
  const stale = result ? changedFinderParams(result.params, params) : [];
  const run = () => {
    if (!field || !fits) return;
    setSearchError(null);
    setBusy(true);
    setTimeout(() => {
      try {
        const ranked = findBestSpots(field, {
          startHour: start,
          missionDays,
          maxNightHours: maxNight,
          minSafePct: minFlat,
          weights: PRIORITIES[priority][1],
        });
        if (!ranked) {
          setSearchError("The terrain model is still loading. Try again in a moment.");
          return;
        }
        setFinder(ranked);
      } catch {
        setSearchError("The site search could not finish. Try a shorter mission or reload the terrain.");
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  return (
    <aside className="left finder">
      <div className="finder-head">
        <div>
          <div className="finder-title">Find best site</div>
          <div className="finder-sub">Rank sites in {areaLabel} for this mission.</div>
        </div>
        <button className="icon-btn" onClick={() => setFinderOpen(false)} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>

      <label className="f-label" htmlFor="finder-landing-time">Landing time · UTC</label>
      <input id="finder-landing-time" className="landing-time-input" type="datetime-local" step="3600"
        min={formatUtc(hourToDate(data, 0)).replace(" ", "T")}
        max={formatUtc(hourToDate(data, data.ephem.count - 1)).replace(" ", "T")}
        value={formatUtc(hourToDate(data, start)).replace(" ", "T")}
        onChange={(event) => {
          const time = Date.parse(event.target.value + "Z");
          if (Number.isFinite(time)) useApp.getState().setHour((time - data.ephem.startMs) / 3600000);
        }} />
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
        {!field ? "Loading terrain…" : busy ? "Ranking…" : `Rank landing sites`}
      </button>
      {searchError && <div className="f-hint error" role="alert">{searchError}</div>}
      {!fits && (
        <div className="f-hint" role="status">
          A {missionDays}-day mission from here runs past the end of the data ({formatUtc(hourToDate(data, data.ephem.count - 1))} UTC). Choose an
          earlier landing time or a shorter mission.
        </div>
      )}

      {result && (
        <>
          <div className="f-stats">
            {(result.evaluated - result.rejected).toLocaleString()} eligible sites · {result.params.missionDays}-day mission
          </div>
          {stale.length > 0 && (
            <div className="f-hint warn" role="status">
              Out of date: the {joinNames(stale)} changed since this search, so the spots below are for the earlier settings. Search again to
              update them.
            </div>
          )}
          {result.candidates.length === 0 && <div className="f-hint">No spot meets all constraints. Loosen the night or flat-ground limits.</div>}
          <div className={stale.length ? "results stale" : "results"}>
            {result.candidates.map((c) => (
              <button key={c.site.id} className={`result ${c.site.id === selectedId ? "active" : ""}`} onClick={() => select(c.site.id)}>
                <span className="r-rank">#{c.rank}</span>
                <span className="r-main">
                  <span className="r-score">{Math.round(c.score * 100)}</span>
                  <span className="r-metrics">
                    <i style={{ color: "var(--sun)" }}><Icon name="sun" /> {Math.round(c.sun * 100)}%</i>
                    <i style={{ color: "var(--link)" }}><Icon name="link" /> {Math.round(c.link * 100)}%</i>
                    <i><Icon name="moon" /> {formatDuration(c.nightHours)}</i>
                    <i><Icon name="slope" /> {c.safePct}%</i>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="f-hint">Sunlight · Power and comms · Longest night · Safe terrain</div>
        </>
      )}
    </aside>
  );
}

function joinNames(names: string[]) {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
