import { useMemo } from "react";
import { useApp } from "../state/store";
import { percentOn, siteSeries } from "../lib/visibility";
import { useSites } from "../state/selectors";
import { ARTEMIS_REGIONS, ARTEMIS_SOURCE } from "../data/artemis";

const WINDOW_HOURS = 24 * 30;

export default function SiteList() {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const sites = useSites();
  const dayBucket = Math.floor(hour / 24);

  const sunlit = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of sites) out[s.id] = percentOn(siteSeries(data.ephem, s).sun, dayBucket * 24, dayBucket * 24 + WINDOW_HOURS, (v) => v >= 128);
    return out;
  }, [data, sites, dayBucket]);

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
          <div className="section-label">{group}</div>
          {sites.map((s) => (
            <button key={s.id} className={`site-row ${s.id === selectedId ? "active" : ""}`} onClick={() => select(s.id)}>
              <span className="name">{s.name}</span>
              <span className="bar">
                <b style={{ width: `${sunlit[s.id]}%` }} />
              </span>
              <span className="meta" style={{ width: 32, textAlign: "right" }}>
                {Math.round(sunlit[s.id])}%
              </span>
            </button>
          ))}
        </div>
      ))}
      <div className="section-label" title={ARTEMIS_SOURCE}>
        Artemis III candidate regions
      </div>
      {ARTEMIS_REGIONS.map((r) => (
        <button key={r.name} className="site-row" onClick={() => useApp.getState().flyTo(r.lat, r.lon, Math.max(25, r.diameterKm * 1.3))} title={`Named feature: ${r.feature} (IAU)`}>
          <span className="name">{r.name}</span>
          <span className="meta">fly ↗</span>
        </button>
      ))}
      <div className="f-hint" style={{ margin: "6px 8px" }}>
        Shown at each region's named feature (IAU). NASA hasn't published exact outlines. Click the terrain inside to analyze any spot.
      </div>
    </aside>
  );
}
