import { useMemo } from "react";
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
  const select = useApp((s) => s.select);
  const sites = useSites();
  const dayBucket = Math.floor(hour / 24);
  const seriesVersion = useSeriesVersion();

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
    <aside className="left">
      <div className="section-label" style={{ marginTop: 0 }}>Sites · sunlight next 30 days</div>
      {groups.map(([group, sites]) => (
        <div key={group}>
          <div className="section-label">{group === "Custom" ? "Your points · click the terrain to add" : group}</div>
          {sites.map((s) => (
            <button
              key={s.id}
              className={`site-row ${s.id === selectedId ? "active" : ""}`}
              onClick={() => select(s.id)}
              onDoubleClick={() => {
                if (s.group !== "Custom") return;
                const name = window.prompt("Name this point", s.name);
                if (name && name.trim()) useApp.getState().renameCustomSite(s.id, name.trim().slice(0, 40));
              }}
              title={s.group === "Custom" ? "Double-click to rename" : undefined}
            >
              <span className="name">{s.name}</span>
              <span className="bar">
                <b style={{ width: `${sunlit[s.id] ?? 0}%` }} />
              </span>
              <span className="meta" style={{ width: 32, textAlign: "right" }}>
                {s.id in sunlit ? `${Math.round(sunlit[s.id])}%` : "…"}
              </span>
              {s.group === "Custom" && (
                <span
                  className="row-x"
                  role="button"
                  aria-label={`Remove ${s.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    useApp.getState().removeCustomSite(s.id);
                  }}
                >
                  ✕
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
      {/* A replay reloads the page with its own ephemeris (see REPLAYS in data/load.ts); exiting reloads without it. */}
      <div className="section-label">{data.replay ? `Replaying ${data.replay.name}` : "Mission replays"}</div>
      {data.replay ? (
        <button className="site-row" onClick={() => location.assign(location.pathname)} title="Reload with the 2026–2028 Sun and Earth positions">
          <span className="name">Exit the {data.replay.name} replay</span>
          <span className="meta">↩</span>
        </button>
      ) : (
        <button
          className="site-row"
          onClick={() => location.assign(`${location.pathname}?replay=${REPLAYS.im2.id}`)}
          title="Reloads with the Sun and Earth positions of February–March 2025, jumps to Athena's landing on 6 March 2025, shows the lander and plays"
        >
          <span className="name">Replay {REPLAYS.im2.name} (Athena, 6 Mar 2025)</span>
          <span className="meta">▶</span>
        </button>
      )}
      <div className="section-label" title={ARTEMIS_SOURCE}>
        Artemis III candidate regions
      </div>
      {ARTEMIS_REGIONS.map((r) => (
        <button key={r.name} className="site-row" onClick={() => {
            useApp.getState().flyTo(r.lat, r.lon, Math.max(25, r.diameterKm * 1.3));
            analyzeArea(r.name, r.lat, r.lon);
          }} title={`Named feature: ${r.feature} (IAU)`}>
          <span className="name">{r.name}</span>
          <span className="meta">analyze ↗</span>
        </button>
      ))}
      <div className="f-hint" style={{ margin: "6px 8px" }}>
        Shown at each region's named feature (IAU); NASA hasn't published outlines. Clicking one computes a 56 × 56 km horizon field there on your GPU, so every tool works in it.
      </div>
    </aside>
  );
}
