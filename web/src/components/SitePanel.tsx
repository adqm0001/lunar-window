import { useMemo } from "react";
import { formatLatLon, toMap } from "../lib/astro";
import { inField } from "../data/field";
import { analyzeArea } from "../gpu/regions";
import { hoursUntilChange, longestRun, percentOn } from "../lib/visibility";
import { formatDuration, useApp } from "../state/store";
import { useSelectedSite, useSeries, useSiteState } from "../state/selectors";

const YEAR = 24 * 365;

export default function SitePanel() {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const site = useSelectedSite();
  const st = useSiteState();
  const pinned = useApp((s) => s.pinned.some((p) => p.id === site.id));
  const togglePin = useApp((s) => s.togglePin);
  const field = useApp((s) => s.field);
  const outside = useMemo(() => {
    if (!field) return false;
    const [x, y] = toMap(site.lat, site.lon);
    return !inField(field, x, y);
  }, [field, site]);
  const series = useSeries();
  const lit = (v: number) => v >= 128;
  const on = (v: number) => v === 1;

  const hourBucket = Math.floor(hour);
  const next = useMemo(
    () => ({
      sun: hoursUntilChange(series.sun, hourBucket, lit),
      earth: hoursUntilChange(series.earth, hourBucket, on),
      link: hoursUntilChange(series.link, hourBucket, on),
    }),
    [series, hourBucket],
  );

  const yearStats = useMemo(() => {
    const from = Math.floor(hourBucket / 24) * 24;
    return {
      sun: percentOn(series.sun, from, from + YEAR, lit),
      earth: percentOn(series.earth, from, from + YEAR, on),
      link: percentOn(series.link, from, from + YEAR, on),
      night: longestRun(series.sun, from, from + YEAR, (v) => v < 128),
    };
  }, [series, Math.floor(hourBucket / 24)]);

  const sunUp = st.sunFraction >= 0.5;
  const bestStation = st.dsn.reduce((b, v, i) => (v > st.dsn[b] ? i : b), 0);

  return (
    <aside className="right">
      <div className="title-row">
        <h2 className="panel-title">{site.name}</h2>
        <button className={`pin-btn ${pinned ? "on" : ""}`} onClick={() => togglePin(site)} title="Pin to compare">
          {pinned ? "Pinned" : "+ Compare"}
        </button>
      </div>
      <div className="panel-sub">
        {formatLatLon(site.lat, site.lon)} · {site.terrain ? `${Math.round(site.height_m)} m` : "flat horizon (outside terrain map)"}
      </div>

      <div className="cards">
        <div className={`card ${sunUp ? "sun" : "bad"}`}>
          <div className="k">Sun</div>
          <div className="v">{sunUp ? "UP" : "DOWN"}</div>
          <div className="s">
            {sunUp ? "sets in" : "rises in"} {formatDuration(next.sun)}
          </div>
        </div>
        <div className={`card ${st.earthUp ? "earth" : "bad"}`}>
          <div className="k">Earth</div>
          <div className="v">{st.earthUp ? "IN VIEW" : "HIDDEN"}</div>
          <div className="s">
            {st.earthUp ? "sets in" : "rises in"} {formatDuration(next.earth)}
          </div>
        </div>
        <div className={`card ${st.link ? "link" : "bad"}`} style={{ gridColumn: "span 2" }}>
          <div className="k">Direct-to-Earth link via DSN</div>
          <div className="v">{st.link ? `OPEN · ${data.ephem.stations[bestStation].name}` : "DOWN"}</div>
          <div className="s">
            {st.link ? "closes in" : "opens in"} {formatDuration(next.link)}
          </div>
        </div>
      </div>

      <div className="section-label" style={{ margin: "0 0 6px" }}>Right now</div>
      <dl className="kv">
        <dt>Sun azimuth / elevation</dt>
        <dd>
          {st.sun.az.toFixed(1)}° / {st.sun.el.toFixed(2)}°
        </dd>
        <dt>Terrain in Sun's direction</dt>
        <dd>{st.sunHorizon.toFixed(2)}°</dd>
        <dt>Sun disc visible</dt>
        <dd>{Math.round(st.sunFraction * 100)}%</dd>
        <dt>Earth azimuth / elevation</dt>
        <dd>
          {st.earth.az.toFixed(1)}° / {st.earth.el.toFixed(2)}°
        </dd>
        <dt>Terrain in Earth's direction</dt>
        <dd>{st.earthHorizon.toFixed(2)}°</dd>
        {data.ephem.stations.map((s, i) => (
          <FragmentRow key={s.name} label={`Moon from ${s.name}`} value={`${st.dsn[i]}°`} />
        ))}
      </dl>

      <div className="section-label" style={{ margin: "16px 0 6px" }}>Next 12 months</div>
      <dl className="kv">
        <dt>Sunlit</dt>
        <dd style={{ color: "var(--sun)" }}>{yearStats.sun.toFixed(1)}%</dd>
        <dt>Earth in view</dt>
        <dd style={{ color: "var(--earth)" }}>{yearStats.earth.toFixed(1)}%</dd>
        <dt>DSN link available</dt>
        <dd style={{ color: "var(--link)" }}>{yearStats.link.toFixed(1)}%</dd>
        <dt>Longest night</dt>
        <dd>{formatDuration(yearStats.night)}</dd>
      </dl>

      {outside && site.lat < -75 && (
        <button className="btn analyze-btn" onClick={() => analyzeArea(site.name, site.lat, site.lon)}>
          ⚡ Analyze this area in detail
        </button>
      )}

      {site.computedMs !== undefined && (
        <div className="note">Horizon computed live on your GPU from NASA LOLA global elevation: 720 directions in {site.computedMs.toFixed(1)} ms.</div>
      )}

      {site.published && (
        <div className="note">
          Validated: {site.published.source} reports {site.published.sunlit_pct}% sunlight for this peak. Coordinates moved{" "}
          {formatLatLon(site.published.lat, site.published.lon)} → LOLA summit.
        </div>
      )}
    </aside>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
