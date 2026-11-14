import { useMemo } from "react";
import { fieldSafePct } from "../data/field";
import { formatLatLon } from "../lib/astro";
import { hoursUntilChange, longestRun, percentOn, siteStateAt } from "../lib/visibility";
import { getSeries, useSeriesVersion } from "../state/seriesCache";
import { formatDuration, useApp } from "../state/store";

const lit = (v: number) => v >= 128;
const on = (v: number) => v === 1;
const dark = (v: number) => v < 128;

interface Row {
  label: string;
  values: (number | null)[];
  format: (v: number) => string;
  better: "high" | "low" | null;
}

export default function ComparePanel() {
  const data = useApp((s) => s.data)!;
  const field = useApp((s) => s.field);
  const pinned = useApp((s) => s.pinned);
  const hour = useApp((s) => s.hour);
  const selectedId = useApp((s) => s.selectedId);
  const { select, togglePin, setCompareOpen } = useApp.getState();
  const h = Math.floor(hour);
  const day = Math.floor(hour / 24) * 24;
  const seriesVersion = useSeriesVersion();

  const rows = useMemo<Row[]>(() => {
    const st = pinned.map((s) => siteStateAt(data.ephem, s, h));
    const se = pinned.map((s) => getSeries(data.ephem, s));
    const pct = (v: number) => `${v.toFixed(1)}%`;
    return [
      { label: "Sun now", values: st.map((x) => x.sunFraction * 100), format: (v) => (v >= 50 ? `UP ${Math.round(v)}%` : "DOWN"), better: "high" },
      { label: "Earth now", values: st.map((x) => (x.earthUp ? 1 : 0)), format: (v) => (v ? "IN VIEW" : "HIDDEN"), better: "high" },
      { label: "DSN link now", values: st.map((x) => (x.link ? 1 : 0)), format: (v) => (v ? "OPEN" : "DOWN"), better: "high" },
      {
        label: "Sun changes in",
        values: se.map((x) => x && hoursUntilChange(x.sun, h, lit)),
        format: (v) => formatDuration(v),
        better: null,
      },
      { label: "Sunlit, next 30 d", values: se.map((x) => x && percentOn(x.sun, day, day + 720, lit)), format: pct, better: "high" },
      { label: "Power + comms, next 30 d", values: se.map((x) => x && percentOn(x.link, day, day + 720, on)), format: pct, better: "high" },
      { label: "Sunlit, next 12 mo", values: se.map((x) => x && percentOn(x.sun, day, day + 8760, lit)), format: pct, better: "high" },
      { label: "Longest night, 12 mo", values: se.map((x) => x && longestRun(x.sun, day, day + 8760, dark)), format: (v) => formatDuration(v), better: "low" },
      {
        label: "Flat ground (< 10°)",
        values: pinned.map((s) => (field ? fieldSafePct(field, s.lat, s.lon) : null)),
        format: (v) => `${v}%`,
        better: "high",
      },
    ];
  }, [data, field, pinned, h, day, seriesVersion]);

  if (pinned.length === 0) return null;

  return (
    <div className="glass compare">
      <div className="compare-head">
        <span className="finder-title">Compare</span>
        <span className="f-hint">Pin sites with “+ Compare” · times follow the timeline</span>
        <span className="spacer" />
        <button className="icon-btn" onClick={() => setCompareOpen(false)} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th />
              {pinned.map((s) => (
                <th key={s.id} className={s.id === selectedId ? "active" : ""}>
                  <button className="c-site" onClick={() => select(s.id)}>
                    {s.name}
                  </button>
                  <div className="c-pos">{formatLatLon(s.lat, s.lon)}</div>
                  <button className="c-x" onClick={() => togglePin(s)} aria-label={`Unpin ${s.name}`}>
                    ✕
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const nums = r.values.filter((v): v is number => v !== null);
              const best = r.better === "high" ? Math.max(...nums) : r.better === "low" ? Math.min(...nums) : null;
              const distinct = new Set(nums).size > 1;
              return (
                <tr key={r.label}>
                  <td className="c-label">{r.label}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className={best !== null && distinct && v === best ? "best" : ""}>
                      {v === null ? "—" : r.format(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
