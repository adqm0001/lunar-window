import { useMemo } from "react";
import Modal from "./Modal";
import type { Site } from "../data/load";
import { altaz, horizonAt, localFrame } from "../lib/astro";
import { siteRadiusKm } from "../lib/visibility";
import { formatUtc, hourToDate, useApp } from "../state/store";

const DAYS = 30;
const W = 680;
const H = 230;

// What you'd see standing at the site: the terrain skyline all the way around, with the paths
// the Sun and Earth take across the sky over the next month. Wherever a path dips below the
// skyline, that body is hidden by mountains.
export default function SkylinePanel({ site, onClose }: { site: Site; onClose: () => void }) {
  const data = useApp((s) => s.data)!;
  const hour = useApp((s) => s.hour);
  const start = Math.floor(hour);

  const paths = useMemo(() => {
    const frame = localFrame(site.lat, site.lon);
    const r = siteRadiusKm(site);
    const sun: { az: number; el: number; up: boolean }[] = [];
    const earth: { az: number; el: number; up: boolean }[] = [];
    for (let k = 0; k < DAYS * 24; k += 2) {
      const i = Math.min(data.ephem.count - 1, start + k);
      const o = i * 6;
      const s = altaz([data.ephem.data[o], data.ephem.data[o + 1], data.ephem.data[o + 2]], frame, r);
      const e = altaz([data.ephem.data[o + 3], data.ephem.data[o + 4], data.ephem.data[o + 5]], frame, r);
      sun.push({ ...s, up: s.el > horizonAt(site.horizon, s.az) });
      earth.push({ ...e, up: e.el > horizonAt(site.horizon, e.az) });
    }
    const o = start * 6;
    const now = altaz([data.ephem.data[o], data.ephem.data[o + 1], data.ephem.data[o + 2]], frame, r);
    return { sun, earth, now };
  }, [data, site, start]);

  // sub-solar latitude over the whole ephemeris: how far north/south the Sun ever gets
  const season = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < data.ephem.count; i += 24) {
      const o = i * 6;
      const x = data.ephem.data[o];
      const y = data.ephem.data[o + 1];
      const z = data.ephem.data[o + 2];
      out.push((Math.asin(z / Math.hypot(x, y, z)) * 180) / Math.PI);
    }
    return out;
  }, [data]);

  const hz = site.horizon;
  let maxEl = 4;
  for (const v of hz) maxEl = Math.max(maxEl, v);
  for (const p of [...paths.sun, ...paths.earth]) if (p.el > -6) maxEl = Math.max(maxEl, p.el);
  const top = Math.min(90, Math.ceil(maxEl + 1));
  const bottom = -Math.max(3, Math.ceil(top * 0.25));
  const x = (az: number) => (az / 360) * W;
  const y = (el: number) => H - ((el - bottom) / (top - bottom)) * H;

  let ground = `M0,${H}`;
  for (let a = 0; a <= 720; a++) ground += `L${x(a / 2).toFixed(1)},${y(hz[a % hz.length]).toFixed(1)}`;
  ground += `L${W},${H}Z`;

  const sunUpPct = Math.round((100 * paths.sun.filter((p) => p.up).length) / paths.sun.length);
  const earthUpPct = Math.round((100 * paths.earth.filter((p) => p.up).length) / paths.earth.length);
  const sMax = Math.max(...season);
  const sMin = Math.min(...season);
  const SW = 300;
  const SH = 60;
  let seasonPath = "";
  season.forEach((v, i) => {
    seasonPath += `${i ? "L" : "M"}${((i / (season.length - 1)) * SW).toFixed(1)},${(SH / 2 - (v / 2) * (SH / 2)).toFixed(1)}`;
  });
  const nowIdx = Math.floor(start / 24);

  return (
    <Modal className="skyline" title={<>Skyline from {site.name}</>}
      subtitle={<>The terrain all around you, with the paths of the Sun and Earth over the next {DAYS} days from {formatUtc(hourToDate(data, start)).slice(0, 10)}</>}
      onClose={onClose}>
        <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label="Horizon skyline with Sun and Earth paths">
          <rect x={0} y={0} width={W} height={H} fill="#05070d" />
          <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 4" />
          {paths.earth.map((p, i) => (
            <circle key={`e${i}`} cx={x(p.az)} cy={y(p.el)} r={1.6} fill={p.up ? "#4ea8ff" : "rgba(78,168,255,0.22)"} />
          ))}
          {paths.sun.map((p, i) => (
            <circle key={`s${i}`} cx={x(p.az)} cy={y(p.el)} r={1.8} fill={p.up ? "#ffb547" : "rgba(255,181,71,0.22)"} />
          ))}
          <path d={ground} fill="#2a2724" stroke="#9a9186" strokeWidth={1} />
          <circle cx={x(paths.now.az)} cy={y(paths.now.el)} r={5} fill="none" stroke="#fff" strokeWidth={1.4} />
          {[0, 90, 180, 270].map((a, i) => (
            <text key={a} x={x(a) + 3} y={H + 13} className="tc-label">
              {["N", "E", "S", "W"][i]}
            </text>
          ))}
          <text x={W - 4} y={12} textAnchor="end" className="tc-label">
            {top}°
          </text>
          <text x={W - 4} y={y(0) - 3} textAnchor="end" className="tc-label">
            0° (flat horizon)
          </text>
        </svg>
        <div className="sky-legend">
          <span>
            <i style={{ background: "#ffb547" }} /> Sun, visible {sunUpPct}% of the month (faded dots = behind terrain)
          </span>
          <span>
            <i style={{ background: "#4ea8ff" }} /> Earth, visible {earthUpPct}%
          </span>
          <span>
            <i style={{ border: "1.4px solid #fff", background: "none" }} /> Sun now
          </span>
        </div>

        <section className="why">
          <h3>Why is the Sun so low here?</h3>
          <div className="why-row">
            <p>
              The Moon's spin axis is tilted only <b>1.5°</b> from the Sun's path, compared with 23.4° for Earth. So the Sun drifts no more than about 1.6° north or
              south over a year, and at the pole it just circles the horizon. A hill a few hundred metres high, kilometres away, is enough to block it, and crater
              floors that sit below the skyline in every direction never see sunlight at all. Earth wobbles above and below the horizon too (libration), so radio
              contact comes and goes.
            </p>
            <svg viewBox={`0 0 ${SW} ${SH + 14}`} width={SW} role="img" aria-label="Latitude where the Sun is overhead, 2026 to 2028">
              <line x1={0} x2={SW} y1={SH / 2} y2={SH / 2} stroke="rgba(255,255,255,0.15)" />
              <path d={seasonPath} fill="none" stroke="#ffb547" strokeWidth={1.4} />
              <line x1={(nowIdx / (season.length - 1)) * SW} x2={(nowIdx / (season.length - 1)) * SW} y1={0} y2={SH} stroke="#fff" strokeWidth={0.8} />
              <text x={2} y={9} className="tc-label">
                +2°
              </text>
              <text x={2} y={SH - 2} className="tc-label">
                −2°
              </text>
              <text x={SW / 2} y={SH + 12} textAnchor="middle" className="tc-label">
                Latitude where the Sun is overhead, 2026–2028 ({sMin.toFixed(2)}° to +{sMax.toFixed(2)}°)
              </text>
            </svg>
          </div>
        </section>
    </Modal>
  );
}
