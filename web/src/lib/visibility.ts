import type { Ephemeris, Site } from "../data/load";
import { ephemAt, dsnAt } from "../data/load";
import { altaz, discFraction, DSN_MIN_ELEVATION_DEG, horizonAt, localFrame, R_MOON_KM, type AltAz } from "./astro";

const OBSERVER_KM = 0.002;

export interface SiteState {
  sun: AltAz;
  earth: AltAz;
  sunFraction: number;
  sunHorizon: number;
  earthHorizon: number;
  earthUp: boolean;
  dsn: number[];
  dsnUp: boolean;
  link: boolean;
}

export function siteRadiusKm(site: Site) {
  return R_MOON_KM + site.height_m / 1000 + OBSERVER_KM;
}

export function siteStateAt(e: Ephemeris, site: Site, hour: number): SiteState {
  const frame = localFrame(site.lat, site.lon);
  const r = siteRadiusKm(site);
  const { sun: s, earth: m } = ephemAt(e, hour);
  const sun = altaz(s, frame, r);
  const earth = altaz(m, frame, r);
  const sunHorizon = horizonAt(site.horizon, sun.az);
  const earthHorizon = horizonAt(site.horizon, earth.az);
  const earthUp = earth.el > earthHorizon;
  const dsn = dsnAt(e, hour);
  const dsnUp = dsn.some((v) => v >= DSN_MIN_ELEVATION_DEG);
  return {
    sun,
    earth,
    sunFraction: discFraction(sun.el - sunHorizon),
    sunHorizon,
    earthHorizon,
    earthUp,
    dsn,
    dsnUp,
    link: earthUp && dsnUp,
  };
}

export interface SiteSeries {
  sun: Uint8Array;
  earth: Uint8Array;
  link: Uint8Array;
}

// Runs in the compute worker (src/workers); the UI reads cached results through state/seriesCache.ts.
export function siteSeries(e: Ephemeris, site: Site): SiteSeries {
  const frame = localFrame(site.lat, site.lon);
  const r = siteRadiusKm(site);
  const n = e.count;
  const ns = e.stations.length;
  const sun = new Uint8Array(n);
  const earth = new Uint8Array(n);
  const link = new Uint8Array(n);
  const d = e.data;
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    const s = altaz([d[o], d[o + 1], d[o + 2]], frame, r);
    const m = altaz([d[o + 3], d[o + 4], d[o + 5]], frame, r);
    sun[i] = Math.round(255 * discFraction(s.el - horizonAt(site.horizon, s.az)));
    const up = m.el > horizonAt(site.horizon, m.az);
    earth[i] = up ? 1 : 0;
    let dsnUp = false;
    for (let k = 0; k < ns; k++) if (e.dsn[i * ns + k] >= DSN_MIN_ELEVATION_DEG) dsnUp = true;
    link[i] = up && dsnUp ? 1 : 0;
  }
  return { sun, earth, link };
}

export function hoursUntilChange(values: Uint8Array, hour: number, isOn: (v: number) => boolean, maxHours = 24 * 400): number | null {
  const start = Math.max(0, Math.floor(hour));
  if (start >= values.length) return null;
  const now = isOn(values[start]);
  for (let i = start + 1; i < Math.min(values.length, start + maxHours); i++) {
    if (isOn(values[i]) !== now) return i - hour;
  }
  return null;
}

export function percentOn(values: Uint8Array, from: number, to: number, isOn: (v: number) => boolean): number {
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(values.length, Math.ceil(to));
  if (b <= a) return 0;
  let on = 0;
  for (let i = a; i < b; i++) if (isOn(values[i])) on++;
  return (100 * on) / (b - a);
}

export function longestRun(values: Uint8Array, from: number, to: number, isOn: (v: number) => boolean): number {
  let best = 0;
  let run = 0;
  for (let i = Math.max(0, Math.floor(from)); i < Math.min(values.length, Math.ceil(to)); i++) {
    run = isOn(values[i]) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}
