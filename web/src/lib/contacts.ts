import type { Ephemeris } from "../data/load";
import type { SiteSeries } from "./visibility";
import { DSN_MIN_ELEVATION_DEG } from "./astro";

// Contact windows: hours when Earth is above this site's real horizon AND a given Deep Space
// Network station sees the Moon at least 10° above its own horizon.

export interface ContactWindow {
  station: string;
  start: number;
  end: number;
}

export function contactWindows(e: Ephemeris, series: SiteSeries, from: number, hours: number): { windows: ContactWindow[]; totalHours: number } {
  const ns = e.stations.length;
  const to = Math.min(e.count, from + hours);
  const windows: ContactWindow[] = [];
  const open: (number | null)[] = new Array(ns).fill(null);
  let total = 0;
  for (let i = from; i <= to; i++) {
    const earthUp = i < to && series.earth[i] === 1;
    let any = false;
    for (let k = 0; k < ns; k++) {
      const up = earthUp && e.dsn[i * ns + k] >= DSN_MIN_ELEVATION_DEG;
      if (up) any = true;
      if (up && open[k] === null) open[k] = i;
      if (!up && open[k] !== null) {
        windows.push({ station: e.stations[k].name, start: open[k]!, end: i });
        open[k] = null;
      }
    }
    if (any && i < to) total++;
  }
  windows.sort((a, b) => a.start - b.start);
  return { windows, totalHours: total };
}

export interface LinkBudgetOptions {
  frequencyHz?: number;
  transmitPowerW?: number;
  landerDiameterM?: number;
  landerEfficiency?: number;
  dsnDiameterM?: number;
  dsnEfficiency?: number;
  systemTemperatureK?: number;
  requiredEbN0Db?: number;
  marginDb?: number;
  otherLossesDb?: number;
  radioMaxBps?: number;
}

/**
 * Power-limited downlink rate in bits/s for a visible, far-field, free-space link
 * with aligned circular dishes. Distance is km; other units are in option names.
 * Callers take distance from the norm of the Earth vector in ephem.data at the
 * chosen hour; visibility and DSN availability are handled by contactWindows.
 * Assumed defaults: 8.4 GHz, 20 W, 0.5 m lander dish at 55% efficiency,
 * 34 m DSN dish at 60%, 30 K system noise, 2 dB required Eb/N0, 3 dB margin,
 * 2 dB combined other losses, and a 2 Mbps radio throughput limit.
 * G = efficiency * (pi*D/lambda)^2; Pr = Pt*Gt*Gr / ((4*pi*d/lambda)^2 * losses).
 * Rate = Pr / (k*T*requiredEbN0*margin), capped by radioMaxBps (Infinity uncaps).
 * Aperture gain and Friis: NASA RF ISL Budget Equations, Exhibit A-1:
 * https://ntrs.nasa.gov/api/citations/19930010800/downloads/19930010800.pdf
 * Eb/N0 and bitrate: NASA GO-LoW report, section 5.4.1, equation 3:
 * https://ntrs.nasa.gov/api/citations/20240003762/downloads/NIAC_2023_PhI_Knapp_GO_LoW.pdf
 * The power limit assumes the required receiver bandwidth is available.
 */
export function estimateRateBps(earthDistanceKm: number, opts: LinkBudgetOptions = {}): number {
  const {
    frequencyHz = 8.4e9,
    transmitPowerW = 20,
    landerDiameterM = 0.5,
    landerEfficiency = 0.55,
    dsnDiameterM = 34,
    dsnEfficiency = 0.6,
    systemTemperatureK = 30,
    requiredEbN0Db = 2,
    marginDb = 3,
    otherLossesDb = 2,
    radioMaxBps = 2e6,
  } = opts;

  for (const [name, value] of Object.entries({ earthDistanceKm, frequencyHz, landerDiameterM, dsnDiameterM, systemTemperatureK })) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
  }
  for (const [name, value] of Object.entries({ landerEfficiency, dsnEfficiency })) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${name} must be between 0 and 1`);
  }
  for (const [name, value] of Object.entries({ requiredEbN0Db, marginDb, otherLossesDb })) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  }
  if (!Number.isFinite(transmitPowerW) || transmitPowerW < 0) throw new RangeError("transmitPowerW must be finite and nonnegative");
  if (!(radioMaxBps >= 0) || (radioMaxBps !== Infinity && !Number.isFinite(radioMaxBps))) {
    throw new RangeError("radioMaxBps must be nonnegative or Infinity");
  }

  const wavelengthM = 299792458 / frequencyHz;
  const transmitGain = landerEfficiency * (Math.PI * landerDiameterM / wavelengthM) ** 2;
  const receiveGain = dsnEfficiency * (Math.PI * dsnDiameterM / wavelengthM) ** 2;
  const pathLoss = (4 * Math.PI * earthDistanceKm * 1000 / wavelengthM) ** 2;
  const receivedPowerW = transmitPowerW * transmitGain * receiveGain / pathLoss / 10 ** (otherLossesDb / 10);
  const powerLimitedBps = receivedPowerW / (1.380649e-23 * systemTemperatureK * 10 ** ((requiredEbN0Db + marginDb) / 10));
  return Math.min(powerLimitedBps, radioMaxBps);
}
