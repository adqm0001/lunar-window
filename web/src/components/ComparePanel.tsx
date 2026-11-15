import { useMemo } from "react";
import { fieldSafePct } from "../data/field";
import { formatLatLon } from "../lib/astro";
import { compareStats, compareWindow, SUN_LIT } from "../lib/compareStats";
import { hoursUntilChange, siteStateAt } from "../lib/visibility";
import { getSeries, useSeriesVersion } from "../state/seriesCache";
import { formatDuration, useApp } from "../state/store";

const MONTH = 720;
const YEAR = 8760;

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
  const split = useApp((s) => s.split);
  const { select, togglePin, setCompareOpen, setSplit } = useApp.getState();
  const h = Math.floor(hour);
  const day = Math.floor(hour / 24) * 24;
  const seriesVersion = useSeriesVersion();

  const rows = useMemo<Row[]>(() => {
    const st = pinned.map((s) => siteStateAt(data.ephem, s, h));
    const se = pinned.map((s) => getSeries(data.ephem, s));
    const pct = (v: number) => `${v.toFixed(1)}%`;
    // The data ends in 2036: label a clipped window with its real length, as the site panel does.
    const span = (w: ReturnType<typeof compareWindow>, nominal: string) => (w.truncated ? `available data · ${formatDuration(w.hours)}` : nominal);
    const wm = compareWindow(day, MONTH, data.ephem.count);
    const wy = compareWindow(day, YEAR, data.ephem.count);
    const sm = se.map((x) => x && compareStats(x, wm.start, wm.end));
    const sy = se.map((x) => x && compareStats(x, wy.start, wy.end));
    return [
      { label: "Sun now", values: st.map((x) => x.sunFraction * 100), format: (v) => (v >= 50 ? `UP ${Math.round(v)}%` : "DOWN"), better: "high" },
      { label: "Earth now", values: st.map((x) => (x.earthUp ? 1 : 0)), format: (v) => (v ? "IN VIEW" : "HIDDEN"), better: "high" },
      { label: "DSN link now", values: st.map((x) => (x.link ? 1 : 0)), format: (v) => (v ? "OPEN" : "DOWN"), better: "high" },
      {
        label: "Sun changes in",
        values: se.map((x) => x && hoursUntilChange(x.sun, h, SUN_LIT)),
        format: (v) => formatDuration(v),
        better: null,
      },
      { label: `Sunlit, ${span(wm, "next 30 d")}`, values: sm.map((x) => x && x.sunlit), format: pct, better: "high" },
      { label: `Power + comms, ${span(wm, "next 30 d")}`, values: sm.map((x) => x && x.powerComms), format: pct, better: "high" },
      { label: `Sunlit, ${span(wy, "next 12 mo")}`, values: sy.map((x) => x && x.sunlit), format: pct, better: "high" },
      { label: `Longest night, ${span(wy, "12 mo")}`, values: sy.map((x) => x && x.longestNight), format: (v) => formatDuration(v), better: "low" },
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
    <div className={`glass compare${split ? " compact" : ""}`}>
      <div className="compare-head">
        <span className="finder-title">Compare</span>
        <span className="f-hint">Pin sites with “+ Compare” · times follow the timeline</span>
        <span className="spacer" />
        {pinned.length >= 2 && (
          <button
            className={`chip${split ? " sel" : ""}`}
            onClick={() => setSplit(!split)}
            aria-pressed={split}
            title={`3D views of ${pinned[0].name} and ${pinned[1].name} side by side`}
          >
            Side by side
          </button>
        )}
        <button className="icon-btn" onClick={() => setCompareOpen(false)} aria-label="Close">
          ✕
        </button>
      </div>
      {!split && (
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
      )}
    </div>
  );
}
