import type { Ephemeris, Site } from "../data/load";
import { altaz, localFrame } from "./astro";
import { siteRadiusKm, siteSeries } from "./visibility";
import { ICE_K, NZ } from "../gpu/thermal";

// Same regolith heat-flow model as the GPU layer (see gpu/thermal.ts), for one site, hourly,
// on level ground. Cheap enough to run on every site selection (~10 ms for a year).

const S0 = 1361;
const EMIS = 0.95;
const SIGMA = 5.670374e-8;
const QGEO = 0.018;

const cpOf = (T: number) => -3.6125 + T * (2.7431 + T * (2.3616e-3 + T * (-1.234e-5 + T * 8.9093e-9)));

export interface SiteThermal {
  start: number;
  hours: number;
  surface: Float32Array;
  max: number;
  min: number;
  mean: number;
  iceDepth: number;
  dailyMax: Float32Array;
  dailyMin: Float32Array;
}

const cache = new Map<string, SiteThermal>();

export function siteThermal(e: Ephemeris, site: Site, startHour: number, hours = 24 * 365): SiteThermal {
  const start = Math.max(0, Math.min(e.count - 1, Math.floor(startHour / 24) * 24));
  const len = Math.min(hours, e.count - start);
  const key = `${site.id}:${start}:${len}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const series = siteSeries(e, site);
  const frame = localFrame(site.lat, site.lon);
  const r = siteRadiusKm(site);
  const absorbedAt = (i: number) => {
    const o = i * 6;
    const s = altaz([e.data[o], e.data[o + 1], e.data[o + 2]], frame, r);
    const mu = Math.max(0, Math.sin((s.el * Math.PI) / 180));
    const inc = (Math.acos(Math.min(1, mu)) * 180) / Math.PI;
    const albedo = 0.12 + 0.06 * (inc / 45) ** 3 + 0.25 * (inc / 90) ** 8;
    return (1 - albedo) * S0 * (series.sun[i] / 255) * mu;
  };
  const absorbed = new Float32Array(len);
  let fluxSum = 0;
  for (let k = 0; k < len; k++) {
    absorbed[k] = absorbedAt(start + k);
    fluxSum += absorbed[k];
  }

  const dz: number[] = [];
  const z: number[] = [];
  const rho: number[] = [];
  const kc: number[] = [];
  let depth = 0;
  for (let i = 0; i < NZ; i++) {
    dz.push(0.012 * 1.25 ** i);
    z.push(depth);
    depth += dz[i];
    const f = Math.exp(-z[i] / 0.07);
    rho.push(1800 - 700 * f);
    kc.push(3.4e-3 - (3.4e-3 - 7.4e-4) * f);
  }
  const T0 = Math.max(30, ((fluxSum / len + QGEO) / (EMIS * SIGMA)) ** 0.25 * 0.9);
  const T = new Float64Array(NZ).fill(T0);
  const Tn = new Float64Array(NZ);
  const kk = new Float64Array(NZ);
  const Tmx = new Float64Array(NZ);
  const surface = new Float32Array(len);
  const h = 3600;

  const stepOnce = (abs: number) => {
    for (let i = 0; i < NZ; i++) {
      const q = T[i] / 350;
      kk[i] = kc[i] * (1 + 2.7 * q * q * q);
    }
    for (let i = 1; i < NZ - 1; i++) {
      const flux = (0.5 * (kk[i] + kk[i + 1]) * (T[i + 1] - T[i])) / dz[i] - (0.5 * (kk[i - 1] + kk[i]) * (T[i] - T[i - 1])) / dz[i - 1];
      Tn[i] = T[i] + (h * flux) / (rho[i] * Math.max(cpOf(T[i]), 60) * 0.5 * (dz[i - 1] + dz[i]));
    }
    Tn[NZ - 1] = Tn[NZ - 2] + (QGEO * dz[NZ - 2]) / kk[NZ - 2];
    let Ts = Math.max((abs / (EMIS * SIGMA) + 1) ** 0.25, Tn[1]) + 0.5;
    for (let it = 0; it < 6; it++) {
      const f = EMIS * SIGMA * Ts ** 4 - abs - (kk[0] * (Tn[1] - Ts)) / dz[0];
      const fp = 4 * EMIS * SIGMA * Ts ** 3 + kk[0] / dz[0];
      Ts = Math.max(15, Ts - f / fp);
    }
    Tn[0] = Ts;
    T.set(Tn);
  };

  // spin up over the first lunar day so the deeper layers settle before recording
  const spin = Math.min(len, 709);
  for (let k = 0; k < spin; k++) stepOnce(absorbed[k]);
  let max = 0;
  let min = Infinity;
  let sum = 0;
  const days = Math.ceil(len / 24);
  const dailyMax = new Float32Array(days);
  const dailyMin = new Float32Array(days).fill(Infinity);
  for (let k = 0; k < len; k++) {
    stepOnce(absorbed[k]);
    const t = T[0];
    surface[k] = t;
    max = Math.max(max, t);
    min = Math.min(min, t);
    sum += t;
    const d = Math.floor(k / 24);
    dailyMax[d] = Math.max(dailyMax[d], t);
    dailyMin[d] = Math.min(dailyMin[d], t);
    for (let i = 0; i < NZ; i++) Tmx[i] = Math.max(Tmx[i], T[i]);
  }
  let iceDepth = -1;
  for (let i = NZ - 1; i >= 0; i--) {
    if (Tmx[i] < ICE_K) iceDepth = z[i];
    else break;
  }
  const out = { start, hours: len, surface, max, min, mean: sum / len, iceDepth, dailyMax, dailyMin };
  if (cache.size > 40) cache.clear();
  cache.set(key, out);
  return out;
}
