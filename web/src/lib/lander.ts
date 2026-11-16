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

/**
 * The one rule for a dead battery, shared by simulate, survivedFraction and (in GLSL) the survival map shader in
 * gpu/engine.ts: dead once the charge `wh` is at or below the dead-below level. A battery with no capacity stores
 * nothing, so it is dead as soon as an hour draws more than the panels supply.
 */
export function batteryDead(wh: number, capacityWh: number, minSocPct: number): boolean {
  return capacityWh > 0 ? wh <= (minSocPct / 100) * capacityWh : wh < 0;
}

/** State of charge in percent. A battery with no capacity is never short of charge while the panels cover the load. */
export function chargePct(wh: number, capacityWh: number): number {
  return capacityWh > 0 ? (100 * wh) / capacityWh : 100;
}

/**
 * True when a survivedFraction (or survival map channel 0) value means the battery never died. Those values are
 * exactly 1 only for a battery that never dies, and below 1 for one that dies in any hour, even the last.
 */
export function survivedMission(lived: number): boolean {
  return lived >= 1;
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

/** True when every hour of the mission [startHour, startHour + hours) has ephemeris data. */
export function missionFits(startHour: number, hours: number, count: number): boolean {
  return Number.isInteger(startHour) && Number.isInteger(hours) && startHour >= 0 && hours > 0 && startHour + hours <= count;
}

/** Null when the ephemeris doesn't cover the whole mission: a shortened run must not be reported as survival. */
export function simulate(e: Ephemeris, site: Site, lander: Lander, startHour: number, hours: number): SimResult | null {
  if (!missionFits(startHour, hours, e.count)) return null;
  const frame = localFrame(site.lat, site.lon);
  const r = siteRadiusKm(site);
  const n = hours;
  const soc = new Float32Array(n + 1);
  const power = new Float32Array(n);
  let panelAz = lander.panelAz;
  if (lander.panel === "vertical" && panelAz < 0) {
    const o0 = startHour * 6;
    panelAz = altaz([e.data[o0], e.data[o0 + 1], e.data[o0 + 2]], frame, r).az;
  }
  let wh = lander.batteryWh;
  let died: number | null = null;
  let minSoc = 100;
  let energy = 0;
  soc[0] = 100;
  const d = e.data;
  for (let k = 0; k < n; k++) {
    const i = startHour + k;
    const o = i * 6;
    const s = altaz([d[o], d[o + 1], d[o + 2]], frame, r);
    const frac = discFraction(s.el - horizonAt(site.horizon, s.az));
    const p = lander.panelW * frac * panelFactor(lander.panel, s.az, s.el, panelAz);
    const load = frac >= 0.5 ? lander.dayLoadW : lander.nightLoadW;
    power[k] = p;
    energy += p;
    if (died === null) {
      wh = Math.min(lander.batteryWh, wh + p - load);
      if (batteryDead(wh, lander.batteryWh, lander.minSocPct)) {
        died = k + 1;
        wh = 0;
      }
    }
    const pct = died === null ? chargePct(wh, lander.batteryWh) : 0;
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

// Everything a track depends on: the ephemeris, the site's position and height, and the whole horizon. The id is
// not part of it, so finder results reusing an id such as "best:1" cannot collide. Each track is about 1 MB, so
// the cache keeps only the most recently used ones (Map iteration order is insertion order).
const TRACK_CACHE_SIZE = 32;
const trackCaches = new WeakMap<Ephemeris, Map<string, SunTrack>>();

export function sunTrack(e: Ephemeris, site: Site): SunTrack {
  let trackCache = trackCaches.get(e);
  if (!trackCache) trackCaches.set(e, (trackCache = new Map()));
  const key = `${site.lat},${site.lon},${site.height_m},${site.horizon.join(",")}`;
  const hit = trackCache.get(key);
  if (hit) {
    trackCache.delete(key);
    trackCache.set(key, hit);
    return hit;
  }
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
  if (trackCache.size > TRACK_CACHE_SIZE) trackCache.delete(trackCache.keys().next().value as string);
  return t;
}

/** The settings a survival map was simulated with. The map models every non-flat panel as Sun-tracking. */
export interface SurvivalInputs {
  start: number;
  hours: number;
  panelW: number;
  batteryWh: number;
  dayLoadW: number;
  nightLoadW: number;
  minSocPct: number;
  horizontal: boolean;
}

export function survivalInputs(lander: Lander, start: number, hours: number): SurvivalInputs {
  const { panelW, batteryWh, dayLoadW, nightLoadW, minSocPct } = lander;
  return { start, hours, panelW, batteryWh, dayLoadW, nightLoadW, minSocPct, horizontal: lander.panel === "horizontal" };
}

const INPUT_NAMES: [keyof SurvivalInputs, string][] = [
  ["start", "start time"],
  ["hours", "mission length"],
  ["horizontal", "panel mounting"],
  ["panelW", "panel power"],
  ["batteryWh", "battery"],
  ["dayLoadW", "sunlit load"],
  ["nightLoadW", "dark load"],
  ["minSocPct", "dead-below level"],
];

/** Names of the settings that differ between a computed map and the current form, in form order. */
export function changedSurvivalInputs(was: SurvivalInputs, now: SurvivalInputs): string[] {
  return INPUT_NAMES.filter(([k]) => was[k] !== now[k]).map(([, name]) => name);
}

/**
 * Share of the mission the battery lasted: the whole hours completed before the hour it dies in, so it is 1 only
 * when it never dies (see survivedMission). NaN means the requested hourly mission is not fully covered by the track.
 */
export function survivedFraction(t: SunTrack, lander: Lander, start: number, hours: number): number {
  if (!missionFits(start, hours, Math.min(t.frac.length, t.az.length, t.el.length))) return NaN;
  const panelAz = lander.panel === "vertical" && lander.panelAz < 0 ? t.az[start] : lander.panelAz;
  let wh = lander.batteryWh;
  for (let k = 0; k < hours; k++) {
    const i = start + k;
    const f = t.frac[i];
    const p = lander.panelW * f * panelFactor(lander.panel, t.az[i], t.el[i], panelAz);
    wh = Math.min(lander.batteryWh, wh + p - (f >= 0.5 ? lander.dayLoadW : lander.nightLoadW));
    if (batteryDead(wh, lander.batteryWh, lander.minSocPct)) return k / hours;
  }
  return 1;
}

/**
 * CPU reference for one cell of the survival map shader (SURVIVE_MAIN in gpu/engine.ts), which the tests can run.
 * `frac` and `el` are the Sun's visible disc fraction and elevation (deg) per hour; like the shader, every panel that
 * is not flat is modelled as Sun-tracking. Returns the shader's channels: [lived, lowest charge (0..1), mean sunlit
 * fraction, hour the battery died in or -1]. Keep it in step with the shader.
 */
export function survivalMapCell(frac: ArrayLike<number>, el: ArrayLike<number>, s: SurvivalInputs, stride = 1): [number, number, number, number] {
  const steps = Math.max(1, Math.floor(s.hours / stride));
  let wh = s.batteryWh;
  let alive = true;
  let diedAt = -1;
  let minSoc = 1;
  let sunSum = 0;
  for (let k = 0; k < steps; k++) {
    const i = s.start + k * stride;
    const f = frac[i];
    const e = (el[i] * Math.PI) / 180;
    const p = s.panelW * f * (s.horizontal ? Math.max(0, Math.sin(e)) : Math.max(0, Math.cos(e)));
    const load = f >= 0.5 ? s.dayLoadW : s.nightLoadW;
    if (alive) {
      wh = Math.min(s.batteryWh, wh + (p - load) * stride);
      if (batteryDead(wh, s.batteryWh, s.minSocPct)) {
        alive = false;
        diedAt = (k + 1) * stride;
        wh = 0;
      }
    }
    minSoc = Math.min(minSoc, alive ? chargePct(wh, s.batteryWh) / 100 : 0);
    sunSum += f;
  }
  const total = steps * stride;
  return [diedAt < 0 ? 1 : (diedAt - stride) / total, minSoc, sunSum / steps, diedAt];
}
