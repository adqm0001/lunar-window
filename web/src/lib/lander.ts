import type { Ephemeris, Site } from "../data/load";
import { altaz, discFraction, horizonAt, localFrame } from "./astro";
import { siteRadiusKm } from "./visibility";

export type PanelMode = "track" | "vertical" | "horizontal";

export interface Lander {
  name: string;
  panelW: number;
  panel: PanelMode;
  panelAz: number;
  batteryWh: number;
  dayLoadW: number;
  nightLoadW: number;
  minSocPct: number;
}

export const LANDER_PRESETS: Lander[] = [
  { name: "Small CLPS lander", panelW: 600, panel: "vertical", panelAz: -1, batteryWh: 2500, dayLoadW: 220, nightLoadW: 90, minSocPct: 10 },
  { name: "Rover-class", panelW: 450, panel: "track", panelAz: 0, batteryWh: 2700, dayLoadW: 180, nightLoadW: 60, minSocPct: 15 },
  { name: "Crew habitat", panelW: 12000, panel: "track", panelAz: 0, batteryWh: 60000, dayLoadW: 3500, nightLoadW: 1500, minSocPct: 20 },
];

export const PANEL_LABEL: Record<PanelMode, string> = {
  track: "Vertical, tracks the Sun",
  vertical: "Vertical, fixed",
  horizontal: "Flat on deck",
};

export function panelFactor(mode: PanelMode, sunAz: number, sunEl: number, panelAz: number) {
  const el = (sunEl * Math.PI) / 180;
  if (mode === "horizontal") return Math.max(0, Math.sin(el));
  if (mode === "track") return Math.max(0, Math.cos(el));
  return Math.max(0, Math.cos(el) * Math.cos(((sunAz - panelAz) * Math.PI) / 180));
}

export interface SimResult {
  soc: Float32Array;
  power: Float32Array;
  diedAtHour: number | null;
  minSocPct: number;
  energyInKWh: number;
  hours: number;
  panelAz: number;
}

export function simulate(e: Ephemeris, site: Site, lander: Lander, startHour: number, hours: number): SimResult {
  const frame = localFrame(site.lat, site.lon);
  const r = siteRadiusKm(site);
  const n = Math.max(1, Math.min(hours, e.count - Math.floor(startHour)));
  const soc = new Float32Array(n + 1);
  const power = new Float32Array(n);
  let panelAz = lander.panelAz;
  if (lander.panel === "vertical" && panelAz < 0) {
    const o0 = Math.floor(startHour) * 6;
    panelAz = altaz([e.data[o0], e.data[o0 + 1], e.data[o0 + 2]], frame, r).az;
  }
  let wh = lander.batteryWh;
  let died: number | null = null;
  let minSoc = 100;
  let energy = 0;
  soc[0] = 100;
  const d = e.data;
  for (let k = 0; k < n; k++) {
    const i = Math.floor(startHour) + k;
    const o = i * 6;
    const s = altaz([d[o], d[o + 1], d[o + 2]], frame, r);
    const frac = discFraction(s.el - horizonAt(site.horizon, s.az));
    const p = lander.panelW * frac * panelFactor(lander.panel, s.az, s.el, panelAz);
    const load = frac >= 0.5 ? lander.dayLoadW : lander.nightLoadW;
    power[k] = p;
    energy += p;
    if (died === null) {
      wh = Math.min(lander.batteryWh, wh + p - load);
      if ((100 * wh) / lander.batteryWh <= lander.minSocPct) {
        died = k + 1;
        wh = 0;
      }
    }
    const pct = died === null ? (100 * wh) / lander.batteryWh : 0;
    soc[k + 1] = pct;
    minSoc = Math.min(minSoc, pct);
  }
  return { soc, power, diedAtHour: died, minSocPct: minSoc, energyInKWh: energy / 1000, hours: n, panelAz };
}

export interface SunTrack {
  frac: Float32Array;
  az: Float32Array;
  el: Float32Array;
}

const trackCache = new Map<string, SunTrack>();

export function sunTrack(e: Ephemeris, site: Site): SunTrack {
  const key = `${site.id}:${site.horizon.length}:${site.horizon[0]}`;
  const hit = trackCache.get(key);
  if (hit) return hit;
  const frame = localFrame(site.lat, site.lon);
  const r = siteRadiusKm(site);
  const n = e.count;
  const frac = new Float32Array(n);
  const az = new Float32Array(n);
  const el = new Float32Array(n);
  const d = e.data;
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    const s = altaz([d[o], d[o + 1], d[o + 2]], frame, r);
    az[i] = s.az;
    el[i] = s.el;
    frac[i] = discFraction(s.el - horizonAt(site.horizon, s.az));
  }
  const t = { frac, az, el };
  trackCache.set(key, t);
  return t;
}

/** NaN means the requested hourly mission is not fully covered by the track. */
export function survivedFraction(t: SunTrack, lander: Lander, start: number, hours: number): number {
  const available = Math.min(t.frac.length, t.az.length, t.el.length);
  if (!Number.isInteger(start) || !Number.isInteger(hours) || start < 0 || hours <= 0 || start + hours > available) return NaN;
  const panelAz = lander.panel === "vertical" && lander.panelAz < 0 ? t.az[start] : lander.panelAz;
  let wh = lander.batteryWh;
  const floor = (lander.minSocPct / 100) * lander.batteryWh;
  for (let k = 0; k < hours; k++) {
    const i = start + k;
    const f = t.frac[i];
    const p = lander.panelW * f * panelFactor(lander.panel, t.az[i], t.el[i], panelAz);
    wh = Math.min(lander.batteryWh, wh + p - (f >= 0.5 ? lander.dayLoadW : lander.nightLoadW));
    if (wh <= floor) return (k + 1) / hours;
  }
  return 1;
}
