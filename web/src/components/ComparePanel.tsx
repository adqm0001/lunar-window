import ControlMenu from "./ControlMenu";
import { useSelectedSite, useSites } from "../state/selectors";
import Icon from "./Icon";
import { useMemo } from "react";
import { fieldSafePct } from "../data/field";
import { formatLatLon } from "../lib/astro";
import { compareStats, compareWindow, SUN_LIT } from "../lib/compareStats";
import { pinIdentity } from "../lib/pins";
import { hoursUntilChange, percentOn, siteStateAt } from "../lib/visibility";
import { getSeries, useSeriesVersion } from "../state/seriesCache";
import { formatDuration, useApp } from "../state/store";

const on = (v: number) => v === 1;
const MONTH = 720;
const YEAR = 8760;

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
  const selectedPinId = pinIdentity(useSelectedSite());
  const split = useApp((s) => s.split);
  const { select, togglePin, setCompareOpen, setSplit } = useApp.getState();
  const h = Math.floor(hour);
  const day = Math.floor(hour / 24) * 24;
  const seriesVersion = useSeriesVersion();

  const rows = useMemo<Row[]>(() => {
    const st = pinned.map((s) => siteStateAt(data.ephem, s, h));
    const se = pinned.map((s) => getSeries(data.ephem, s));
    const pct = (v: number) => `${v.toFixed(1)}%`;
    const month = compareWindow(day, MONTH, data.ephem.count);
    const year = compareWindow(day, YEAR, data.ephem.count);
    const monthLabel = month.truncated ? `available ${formatDuration(month.hours)}` : "next 30 d";
    const yearLabel = year.truncated ? `available ${formatDuration(year.hours)}` : "next 12 mo";
    const monthStats = se.map((x) => x && compareStats(x, month.start, month.end));
    const yearStats = se.map((x) => x && compareStats(x, year.start, year.end));
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
      { label: `Sunlit, ${monthLabel}`, values: monthStats.map((x) => x && x.sunlit), format: pct, better: "high" },
      { label: `DSN contact, ${monthLabel}`, values: se.map((x) => x && percentOn(x.link, month.start, month.end, on)), format: pct, better: "high" },
      { label: `Power + comms, ${monthLabel}`, values: monthStats.map((x) => x && x.powerComms), format: pct, better: "high" },
      { label: `Sunlit, ${yearLabel}`, values: yearStats.map((x) => x && x.sunlit), format: pct, better: "high" },
      { label: `Longest night, ${yearLabel}`, values: yearStats.map((x) => x && x.longestNight), format: (v) => formatDuration(v), better: "low" },
      {
        label: "Flat ground (< 10°)",
        values: pinned.map((s) => (field ? fieldSafePct(field, s.lat, s.lon) : null)),
        format: (v) => `${v}%`,
        better: "high",
      },
    ];
  }, [data, field, pinned, h, day, seriesVersion]);

  return (
    <div className={`glass compare${split ? " compact" : ""}`}>
      <div className="compare-head">
        <span className="finder-title">Compare sites</span>

        <span className="spacer" />
        <ControlMenu label="Add site" placement="above" align="end">
          {(close) => sites.filter((site) => !pinned.some((chosen) => chosen.id === pinIdentity(site))).map((site) => (
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
                <th key={s.id} className={s.id === selectedPinId ? "active" : ""}>
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
