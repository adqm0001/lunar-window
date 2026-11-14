import { useMemo } from "react";
import { useApp } from "../state/store";
import { percentOn, siteSeries } from "../lib/visibility";

const WINDOW_HOURS = 24 * 30;

export default function SiteList() {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const dayBucket = Math.floor(hour / 24);

  const sunlit = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of data.sites) out[s.id] = percentOn(siteSeries(data.ephem, s).sun, dayBucket * 24, dayBucket * 24 + WINDOW_HOURS, (v) => v >= 128);
    return out;
  }, [data, dayBucket]);

  const groups = useMemo(() => {
    const g = new Map<string, typeof data.sites>();
    for (const s of data.sites) g.set(s.group, [...(g.get(s.group) ?? []), s]);
    return [...g.entries()];
  }, [data]);

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
    </aside>
  );
}
