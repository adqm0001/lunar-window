import ControlMenu from "./ControlMenu";
import { useSites } from "../state/selectors";
import Icon from "./Icon";
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
  const sites = useSites();
  const data = useApp((s) => s.data)!;
  const field = useApp((s) => s.field);
  const pinned = useApp((s) => s.pinned);
  const hour = useApp((s) => s.hour);
  const selectedId = useApp((s) => s.selectedId);
  const split = useApp((s) => s.split);
  const { select, togglePin, setCompareOpen, setSplit } = useApp.getState();
  const h = Math.floor(hour);
  const day = Math.floor(hour / 24) * 24;
  const monthHours = Math.min(720, data.ephem.count - day);
  const yearHours = Math.min(8760, data.ephem.count - day);
  const monthLabel = monthHours === 720 ? "next 30 d" : `available ${formatDuration(monthHours)}`;
  const yearLabel = yearHours === 8760 ? "next 12 mo" : `available ${formatDuration(yearHours)}`;
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
      { label: `Sunlit, ${monthLabel}`, values: se.map((x) => x && percentOn(x.sun, day, day + monthHours, lit)), format: pct, better: "high" },
      { label: `DSN contact, ${monthLabel}`, values: se.map((x) => x && percentOn(x.link, day, day + monthHours, on)), format: pct, better: "high" },
      { label: `Sunlit, ${yearLabel}`, values: se.map((x) => x && percentOn(x.sun, day, day + yearHours, lit)), format: pct, better: "high" },
      { label: `Longest night, ${yearLabel}`, values: se.map((x) => x && longestRun(x.sun, day, day + yearHours, dark)), format: (v) => formatDuration(v), better: "low" },
      {
        label: "Flat ground (< 10°)",
        values: pinned.map((s) => (field ? fieldSafePct(field, s.lat, s.lon) : null)),
        format: (v) => `${v}%`,
        better: "high",
      },
    ];
  }, [data, field, pinned, h, day, seriesVersion, monthHours, yearHours, monthLabel, yearLabel]);

  return (
    <div className={`glass compare${split ? " compact" : ""}`}>
      <div className="compare-head">
        <span className="finder-title">Compare sites</span>

        <span className="spacer" />
        <ControlMenu label="Add site" placement="above" align="end">
          {(close) => sites.filter((site) => !pinned.some((chosen) => chosen.id === site.id)).map((site) => (
            <button key={site.id} className="control-action" onClick={() => { togglePin(site); close(); }}>
              {site.name}
            </button>
          ))}
        </ControlMenu>
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
          <Icon name="close" />
        </button>
      </div>
      <p className="compare-intro">
        {pinned.length < 2 ? "Choose another site with Add site to compare sunlight, Earth visibility, and communications."
          : "Both sites use the same date and time. Choose Side by side for two 3D views."}
      </p>
      {pinned.length > 0 && !split && (
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
                    <Icon name="close" />
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
