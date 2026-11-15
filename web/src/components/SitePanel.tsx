import Icon from "./Icon";
import { lazy, useMemo } from "react";
import { formatLatLon, toMap } from "../lib/astro";
import { inField } from "../data/field";
import { analyzeArea } from "../gpu/regions";
import { hoursUntilChange, longestRun, percentOn } from "../lib/visibility";
import { PANEL_THERMAL_HOURS, thermalSpanLabel, type SiteThermal } from "../lib/siteThermal";
import { iceVerdictPossible } from "../gpu/thermal";
import { getThermal, useSeriesVersion } from "../state/seriesCache";
import { contactWindows, estimateRateBps, type ContactWindow } from "../lib/contacts";
import { ephemAt, type Ephemeris } from "../data/load";
import { formatUtc, hourToDate } from "../state/store";
import { formatDuration, useApp } from "../state/store";
import { useSelectedSite, useSeries, useSiteState } from "../state/selectors";
import LazyPanel from "./LazyPanel";

const SkylinePanel = lazy(() => import("./SkylinePanel"));

const YEAR = 24 * 365;

function earthDistanceKm(e: Ephemeris, hour: number) {
  const [x, y, z] = ephemAt(e, hour).earth;
  return Math.hypot(x, y, z);
}

function formatMbps(bps: number) {
  const m = bps / 1e6;
  return `${m >= 100 ? Math.round(m) : m.toPrecision(2)} Mbps`;
}

// Downlink estimates for the week's passes (estimateRateBps with its defaults, at the Earth distance of the hour).
// The week's volume counts every hour with at least one station in view once, even when passes overlap.
function contactRates(e: Ephemeris, windows: ContactWindow[], fromHour: number) {
  const passBps = windows.map((w) => estimateRateBps(earthDistanceKm(e, (w.start + w.end) / 2)));
  const hours = new Set<number>();
  for (const w of windows) for (let h = w.start; h < w.end; h++) hours.add(h);
  let bits = 0;
  for (const h of hours) bits += estimateRateBps(earthDistanceKm(e, h + 0.5)) * 3600;
  const mid = windows.length ? (windows[0].start + windows[0].end) / 2 : fromHour;
  const d = earthDistanceKm(e, mid);
  const linkBps = estimateRateBps(d, { radioMaxBps: Infinity });
  const usedBps = estimateRateBps(d);
  const title =
    "Estimated X-band downlink to the Deep Space Network: 8.4 GHz, 20 W transmitter, 0.5 m lander dish (55% efficient) " +
    "to a 34 m DSN dish (60%), 30 K system noise, 2 dB required Eb/N0 plus a 3 dB margin, 2 dB other losses, free space " +
    `at the Earth's distance (≈${Math.round(d / 1000).toLocaleString("en")} 000 km). ` +
    (usedBps < linkBps
      ? `The link itself could carry ≈${(linkBps / 1e9).toPrecision(2)} Gbps, so the lander radio's ${formatMbps(usedBps)} limit sets the rate.`
      : "The link budget, not the radio, sets the rate.") +
    " The total for this interval counts each hour with any station in view once.";
  return { passBps, gb: bits / 8e9, title };
}

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
  const skyline = useApp((s) => s.skylineOpen);
  const setSkyline = useApp((s) => s.setSkylineOpen);
  const lit = (v: number) => v >= 128;
  const on = (v: number) => v === 1;

  const hourBucket = Math.floor(hour);
  const next = useMemo(
    () => ({
      sun: series && hoursUntilChange(series.sun, hourBucket, lit),
      earth: series && hoursUntilChange(series.earth, hourBucket, on),
      link: series && hoursUntilChange(series.link, hourBucket, on),
    }),
    [series, hourBucket],
  );

  const statsStart = Math.floor(hourBucket / 24) * 24;
  const statsEnd = Math.min(statsStart + YEAR, data.ephem.count);
  const statsHours = statsEnd - statsStart;
  const yearStats = useMemo(() => {
    if (!series) return null;
    return {
      sun: percentOn(series.sun, statsStart, statsEnd, lit),
      earth: percentOn(series.earth, statsStart, statsEnd, on),
      link: percentOn(series.link, statsStart, statsEnd, on),
      night: longestRun(series.sun, statsStart, statsEnd, (v) => v < 128),
    };
  }, [series, statsStart, statsEnd]);

  const thermStart = Math.floor(hourBucket / 720) * 720;
  const seriesVersion = useSeriesVersion();
  const therm = useMemo(() => getThermal(data.ephem, site, thermStart, PANEL_THERMAL_HOURS), [data, site, thermStart, seriesVersion]);
  const tNow = therm ? therm.surface[Math.max(0, Math.min(therm.hours - 1, hourBucket - therm.start))] : 0;

  const contactHours = Math.min(24 * 7, data.ephem.count - hourBucket);
  const contacts = useMemo(() => (series ? contactWindows(data.ephem, series, hourBucket, 24 * 7) : null), [data, series, hourBucket]);
  const rates = useMemo(() => (contacts ? contactRates(data.ephem, contacts.windows, hourBucket) : null), [data, contacts, hourBucket]);

  const sunUp = st.sunFraction >= 0.5;
  const bestStation = st.dsn.reduce((b, v, i) => (v > st.dsn[b] ? i : b), 0);

  return (
    <aside className="right site-inspector" aria-label="Selected site">
      <div className="title-row">
        <h2 className="panel-title">{site.name}</h2>
        <button className={`pin-btn ${pinned ? "on" : ""}`} onClick={() => togglePin(site)} title={pinned ? "Remove from comparison" : "Add this site to comparison"}>
          {pinned ? "Added" : "+ Compare"}
        </button>
      </div>
      <div className="panel-sub">
        {formatLatLon(site.lat, site.lon)} · {site.terrain ? `${Math.round(site.height_m)} m` : "flat horizon (outside terrain map)"}
      </div>
      <button className="control-action skyline-btn" onClick={() => setSkyline(true)} title="The terrain skyline from this spot with the Sun's and Earth's paths">
        <Icon name="sun" /> Sun &amp; Earth horizon
      </button>
      {skyline && (
        <LazyPanel name="the skyline view" onClose={() => setSkyline(false)}>
          <SkylinePanel site={site} onClose={() => setSkyline(false)} />
        </LazyPanel>
      )}

      <div className="cards">
        <div className={`card sun ${sunUp ? "" : "bad"}`}>
          <div className="k">Sun</div>
          <div className="v">{sunUp ? "Up" : "Down"}</div>
          <div className="card-angle">Elevation {st.sun.el.toFixed(2)}°</div>
          <div className="s">
            {sunUp ? "sets in" : "rises in"} {formatDuration(next.sun)}
          </div>
        </div>
        <div className={`card earth ${st.earthUp ? "" : "bad"}`}>
          <div className="k">Earth</div>
          <div className="v">{st.earthUp ? "In view" : "Hidden"}</div>
          <div className="card-angle">Elevation {st.earth.el.toFixed(2)}°</div>
          <div className="s">
            {st.earthUp ? "sets in" : "rises in"} {formatDuration(next.earth)}
          </div>
        </div>
        <div className={`card link ${st.link ? "" : "bad"}`}>
          <div className="k" title="Direct-to-Earth link via Deep Space Network">DSN</div>
          <div className="v">{st.link ? `Open · ${data.ephem.stations[bestStation].name}` : "Down"}</div>
          <div className="s">
            {st.link ? "closes in" : "opens in"} {formatDuration(next.link)}
          </div>
        </div>
      </div>

      <details className="site-reading">
        <summary>Position and visibility</summary>
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

        <div className="section-label" style={{ margin: "16px 0 6px" }}>
          {statsHours === YEAR ? "Next 12 months" : `Available data · ${formatDuration(statsHours)}`}
        </div>
        {yearStats ? (
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
        ) : (
          <div className="f-hint">computing…</div>
        )}
      </details>

      <details className="site-reading">
        <summary>Earth contact · {contactHours === 24 * 7 ? "next 7 days" : `available ${contactHours} h`}</summary>
        {contactHours < 24 * 7 && (
          <div className="f-hint">Contact data ends at {formatUtc(hourToDate(data, data.ephem.count - 1))} UTC.</div>
        )}
        {contacts && rates ? (
          <div className="contacts" title={rates.title}>
            <div className="contacts-sum">
              {Math.round(contacts.totalHours)} h of contact · {contacts.windows.length} passes
              {contacts.windows.length > 0 && ` · ≈ ${rates.gb >= 10 ? Math.round(rates.gb) : rates.gb.toFixed(1)} GB`}
            </div>
            {contacts.windows.length === 0 && <div className="f-hint">No Earth/DSN contact in this interval.</div>}
            {contacts.windows.slice(0, 7).map((w, i) => (
              <div key={`${w.station}-${w.start}`} className="contact-row">
                <span className="c-station">{w.station}</span>
                <span className="c-time">{formatUtc(hourToDate(data, w.start)).slice(5)}</span>
                <span className="c-dur">
                  {formatDuration(w.end - w.start)} · ≈ {formatMbps(rates.passBps[i])}
                </span>
              </div>
            ))}
            {contacts.windows.length > 7 && <div className="f-hint">+{contacts.windows.length - 7} more</div>}
          </div>
        ) : (
          <div className="f-hint">computing…</div>
        )}
      </details>

      <details className="site-reading">
        <summary>Ground temperature</summary>
        {therm ? (
          <>
            <dl className="kv">
              <dt>Right now</dt>
              <dd style={{ color: tNow < 110 ? "var(--earth)" : tNow > 250 ? "var(--sun)" : undefined }}>
                {Math.round(tNow)} K ({Math.round(tNow - 273.15)} °C)
              </dd>
              <dt>Coldest / hottest ({thermalSpanLabel(therm.hours)})</dt>
              <dd>
                {Math.round(therm.min)} K / {Math.round(therm.max)} K
              </dd>
              <dt>Water ice</dt>
              {iceVerdictPossible(therm.hours) ? (
                <dd style={{ color: therm.iceDepth >= 0 ? "var(--earth)" : undefined }}>
                  {therm.iceDepth < 0 ? "too warm, even 80 cm down" : therm.iceDepth === 0 ? "stable at the surface" : `stable below ${Math.round(therm.iceDepth * 100)} cm`}
                </dd>
              ) : (
                <dd style={{ color: "var(--dim)" }}>needs a full year of data ({thermalSpanLabel(therm.hours)} modelled)</dd>
              )}
              </dl>
            <TempChart t={therm} nowDay={Math.floor((hourBucket - therm.start) / 24)} />
          </>
        ) : (
          <div className="f-hint">computing…</div>
        )}
      </details>

      {outside && site.lat < -75 && (
        <button className="btn analyze-btn" onClick={() => analyzeArea(site.name, site.lat, site.lon)}>
          <Icon name="external" /> Analyze area
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
    <svg className="temp-chart" viewBox={`0 0 ${W} ${H + 12}`} width="100%" role="img" aria-label={`Daily temperature range over ${thermalSpanLabel(t.hours)}`}>
      <path d={band + "Z"} fill="rgba(184,203,227,0.20)" stroke="rgba(184,203,227,0.8)" strokeWidth="0.6" />
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
