import { addPointAt } from "../lib/points";
import Icon from "./Icon";
import { useMemo, useState } from "react";
import { useApp } from "../state/store";
import { percentOn } from "../lib/visibility";
import { useSites } from "../state/selectors";
import { getSeries, useSeriesVersion } from "../state/seriesCache";
import { ARTEMIS_REGIONS, ARTEMIS_SOURCE } from "../data/artemis";
import { analyzeArea } from "../gpu/regions";
import { REPLAYS } from "../data/load";

const WINDOW_HOURS = 24 * 30;

export default function SiteList() {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const selectedId = useApp((s) => s.selectedId);
  const globe = useApp((s) => s.globe);
  const select = useApp((s) => s.select);
  const sites = useSites();
  const dayBucket = Math.floor(hour / 24);
  const seriesVersion = useSeriesVersion();
  // Your points are renamed in place (double-click, or F2 on the focused row); Enter or leaving the box saves, Esc cancels.
  const [section, setSection] = useState("sites");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const saveName = (id: string, value: string) => {
    if (value.trim()) useApp.getState().renameCustomSite(id, value.trim().slice(0, 40));
    setEditing(null);
  };
  // After the box closes from the keyboard, put focus back on the row instead of losing it to the page.
  const refocusRow = (id: string) =>
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`button[data-site="${CSS.escape(id)}"]`)?.focus());

  // Sites whose series is still being computed are left out and show an empty bar.
  const sunlit = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of sites) {
      const series = getSeries(data.ephem, s);
      if (series) out[s.id] = percentOn(series.sun, dayBucket * 24, dayBucket * 24 + WINDOW_HOURS, (v) => v >= 128);
    }
    return out;
  }, [data, sites, dayBucket, seriesVersion]);

  const groups = useMemo(() => {
    const g = new Map<string, typeof sites>();
    for (const s of sites) g.set(s.group, [...(g.get(s.group) ?? []), s]);
    return [...g.entries()];
  }, [sites]);

  return (
    <aside className="left sites-panel" aria-label="Landing sites">
      <div className="sites-heading">
        <h2>{section === "sites" ? "Landing sites" : section === "regions" ? "Candidate regions" : "Mission replays"}</h2>
        <span>{section === "sites" ? "Sunlight · next 30 days" : section === "regions" ? "Artemis III exploration" : "Explore a past mission"}</span>
      </div>
      <div className="site-sections" role="group" aria-label="Site browser section">
        {(["sites", "regions", "replays"] as const).map((value) => (
          <button key={value} aria-pressed={section === value} onClick={() => setSection(value)}>
            {value === "sites" ? "Sites" : value === "regions" ? "Regions" : "Replays"}
          </button>
        ))}
      </div>
      <section aria-label="Landing site list" hidden={section !== "sites"}>
        <details className="coordinate-entry">
          <summary>Add coordinates</summary>
          <form onSubmit={(event) => {
            event.preventDefault();
            const lat = Number(latitude);
            const lon = Number(longitude);
            if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)
              || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
              setCoordinateError("Use latitude −90 to 90 and longitude −180 to 180.");
              return;
            }
            setCoordinateError(null);
            try {
              const site = addPointAt(lat, lon);
              if (!site) {
                setCoordinateError("Wait for the terrain to finish loading, then try again.");
                return;
              }
              useApp.getState().flyTo(lat, lon, 20);
              event.currentTarget.closest("details")!.open = false;
            } catch {
              setCoordinateError("The location could not be loaded. Try again after the terrain finishes loading.");
            }
          }}>
            <label>Latitude
              <input aria-label="Lunar latitude" type="number" min="-90" max="90" step="any" required
                placeholder="−89.44" value={latitude} onChange={(event) => setLatitude(event.target.value)} />
            </label>
            <label>Longitude
              <input aria-label="Lunar longitude" type="number" min="-180" max="180" step="any" required
                placeholder="−137.37" value={longitude} onChange={(event) => setLongitude(event.target.value)} />
            </label>
            <p className="f-hint">Degrees · South and west are negative</p>
            <button className="btn primary" type="submit" disabled={!globe}>Use coordinates</button>
            {coordinateError && <p className="f-hint error" role="alert">{coordinateError}</p>}
          </form>
        </details>
        {groups.map(([group, sites]) => (
          <div key={group}>
            <div className="section-label">{group === "Custom" ? "Your points · click the terrain to add" : group}</div>
            {sites.map((s) => {
              const custom = s.group === "Custom";
              if (custom && editing === s.id)
                return (
                  <input
                    key={s.id}
                    className="row-edit"
                    aria-label={`New name for ${s.name}`}
                    defaultValue={s.name}
                    maxLength={40}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => saveName(s.id, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        saveName(s.id, e.currentTarget.value);
                        refocusRow(s.id);
                      } else if (e.key === "Escape") {
                        setEditing(null);
                        refocusRow(s.id);
                      }
                    }}
                  />
                );
              const row = (
                <button
                  key={s.id}
                  data-site={s.id}
                  className={`site-row ${s.id === selectedId ? "active" : ""}`}
                  onClick={() => select(s.id)}
                  onDoubleClick={() => custom && setEditing(s.id)}
                  onKeyDown={(e) => custom && e.key === "F2" && setEditing(s.id)}
                  title={custom ? "Double-click (or F2) to rename" : undefined}
                >
                  <span className="name">{s.name}</span>
                  <span className="site-sunlight">
                    <span className="meta">{s.id in sunlit ? `${Math.round(sunlit[s.id])}%` : "…"}</span>
                    <span className="bar" aria-hidden="true">
                      <b style={{ width: `${sunlit[s.id] ?? 0}%` }} />
                    </span>
                  </span>
                </button>
              );
              if (!custom) return row;
              return (
                <div key={s.id} className="site-row-box">
                  {row}
                  <button className="row-x" aria-label={`Remove ${s.name}`} title={`Remove ${s.name}`} onClick={() => useApp.getState().removeCustomSite(s.id)}>
                    <Icon name="close" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </section>
      <section aria-label="Mission replay list" hidden={section !== "replays"}>
        {/* A replay reloads the page with its own ephemeris (see REPLAYS in data/load.ts); exiting reloads without it. */}
        <div className="section-label">{data.replay ? `Replaying ${data.replay.name}` : "Mission replays"}</div>
        {data.replay ? (
          <button className="site-row" onClick={() => location.assign(location.pathname)} title="Reload with the regular Sun and Earth positions">
            <span className="name">Exit the {data.replay.name} replay</span>
            <span className="meta"><Icon name="left" /></span>
          </button>
        ) : (
          <button
            className="site-row"
            onClick={() => location.assign(`${location.pathname}?replay=${REPLAYS.im2.id}`)}
            title="Reloads with the Sun and Earth positions of February–March 2025, jumps to Athena's landing on 6 March 2025, shows the lander and plays"
          >
            <span className="name">Replay {REPLAYS.im2.name} (Athena, 6 Mar 2025)</span>
            <span className="meta"><Icon name="play" /></span>
          </button>
        )}
      </section>
      <section aria-label="Candidate region list" hidden={section !== "regions"}>
        <div className="section-label" title={ARTEMIS_SOURCE}>
          Artemis III candidate regions
        </div>
        {ARTEMIS_REGIONS.map((r) => (
          <button key={r.name} className="site-row" onClick={() => {
              useApp.getState().flyTo(r.lat, r.lon, Math.max(25, r.diameterKm * 1.3));
              analyzeArea(r.name, r.lat, r.lon);
            }} title={`Named feature: ${r.feature} (IAU)`}>
            <span className="name">{r.name}</span>
            <span className="analyze-action">Analyze <Icon name="external" /></span>
          </button>
        ))}
        <div className="f-hint" style={{ margin: "6px 8px" }}>
          Select Analyze to load detailed terrain around a region. Sites mark named features; NASA has not published region boundaries.
        </div>
      </section>
    </aside>
  );
}
