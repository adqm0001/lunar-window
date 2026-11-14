import { lazy, useMemo, useState } from "react";
import { formatLatLon, toMap } from "../lib/astro";
import { inField } from "../data/field";
import { analyzeArea } from "../gpu/regions";
import { hoursUntilChange, longestRun, percentOn } from "../lib/visibility";
import { siteThermal, type SiteThermal } from "../lib/siteThermal";
import { contactWindows } from "../lib/contacts";
import { formatUtc, hourToDate } from "../state/store";
import { formatDuration, useApp } from "../state/store";
import { useSelectedSite, useSeries, useSiteState } from "../state/selectors";
import LazyPanel from "./LazyPanel";

const SkylinePanel = lazy(() => import("./SkylinePanel"));

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
  const [skyline, setSkyline] = useState(false);
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

  const thermStart = Math.floor(hourBucket / 720) * 720;
  const therm = useMemo(() => siteThermal(data.ephem, site, thermStart, 24 * 395), [data, site, thermStart]);
  const tNow = therm.surface[Math.max(0, Math.min(therm.hours - 1, hourBucket - therm.start))];

  const contacts = useMemo(() => contactWindows(data.ephem, series, hourBucket, 24 * 7), [data, series, hourBucket]);

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
      <button className="btn skyline-btn" onClick={() => setSkyline(true)} title="The terrain skyline from this spot with the Sun's and Earth's paths">
        🔭 Skyline and Sun path
      </button>
      {skyline && (
        <LazyPanel name="the skyline view" onClose={() => setSkyline(false)}>
          <SkylinePanel site={site} onClose={() => setSkyline(false)} />
        </LazyPanel>
      )}

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

      <div className="section-label" style={{ margin: "16px 0 6px" }}>Contact with Earth, next 7 days</div>
      <div className="contacts">
        <div className="contacts-sum">
          {Math.round(contacts.totalHours)} h of contact · {contacts.windows.length} passes
        </div>
        {contacts.windows.length === 0 && <div className="f-hint">Earth stays below this site's horizon all week: a relay satellite would be needed.</div>}
        {contacts.windows.slice(0, 7).map((w) => (
          <div key={`${w.station}-${w.start}`} className="contact-row">
            <span className="c-station">{w.station}</span>
            <span className="c-time">{formatUtc(hourToDate(data, w.start)).slice(5)}</span>
            <span className="c-dur">{formatDuration(w.end - w.start)}</span>
          </div>
        ))}
        {contacts.windows.length > 7 && <div className="f-hint">+{contacts.windows.length - 7} more</div>}
      </div>

      <div className="section-label" style={{ margin: "16px 0 6px" }}>Ground temperature</div>
      <dl className="kv">
        <dt>Right now</dt>
        <dd style={{ color: tNow < 110 ? "var(--earth)" : tNow > 250 ? "var(--sun)" : undefined }}>
          {Math.round(tNow)} K ({Math.round(tNow - 273.15)} °C)
        </dd>
        <dt>Coldest / hottest (13 months)</dt>
        <dd>
          {Math.round(therm.min)} K / {Math.round(therm.max)} K
        </dd>
        <dt>Water ice</dt>
        <dd style={{ color: therm.iceDepth >= 0 ? "var(--earth)" : undefined }}>
          {therm.iceDepth < 0 ? "too warm, even 80 cm down" : therm.iceDepth === 0 ? "stable at the surface" : `stable below ${Math.round(therm.iceDepth * 100)} cm`}
        </dd>
      </dl>
      <TempChart t={therm} nowDay={Math.floor((hourBucket - therm.start) / 24)} />

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

function TempChart({ t, nowDay }: { t: SiteThermal; nowDay: number }) {
  const W = 260;
  const H = 54;
  const lo = 20;
  const hi = Math.max(160, Math.ceil(t.max / 50) * 50);
  const n = t.dailyMax.length;
  const x = (d: number) => (d / Math.max(1, n - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  let band = "";
  for (let d = 0; d < n; d++) band += `${d ? "L" : "M"}${x(d).toFixed(1)},${y(t.dailyMax[d]).toFixed(1)}`;
  for (let d = n - 1; d >= 0; d--) band += `L${x(d).toFixed(1)},${y(t.dailyMin[d]).toFixed(1)}`;
  return (
    <svg className="temp-chart" viewBox={`0 0 ${W} ${H + 12}`} width="100%" role="img" aria-label="Daily temperature range over the next 13 months">
      <path d={band + "Z"} fill="rgba(255,160,90,0.35)" stroke="rgba(255,170,100,0.8)" strokeWidth="0.6" />
      {110 > lo && 110 < hi && (
        <>
          <line x1={0} x2={W} y1={y(110)} y2={y(110)} stroke="rgba(120,190,255,0.7)" strokeDasharray="3 3" strokeWidth="0.8" />
          <text x={W - 2} y={y(110) - 2} textAnchor="end" className="tc-label">110 K ice limit</text>
        </>
      )}
      {nowDay >= 0 && nowDay < n && <line x1={x(nowDay)} x2={x(nowDay)} y1={0} y2={H} stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" />}
      <text x={0} y={H + 10} className="tc-label">{lo} K</text>
      <text x={W} y={10} textAnchor="end" className="tc-label">{hi} K</text>
    </svg>
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
