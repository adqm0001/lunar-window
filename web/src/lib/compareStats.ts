import type { SiteSeries } from "./visibility";

// "Sun lit" is half the solar disc above the local horizon, the same threshold the site panel and the
// finder's Power + comms layer use (SitePanel `v >= 128`; the GPU passes use `frac >= 0.5`).
export const SUN_LIT = (v: number) => v >= 128;
const LINK_UP = (v: number) => v === 1;

export interface CompareWindow {
  start: number;
  end: number;
  hours: number;
  truncated: boolean;
}

// The part of the nominal window [start, start + span) that the ephemeris actually covers.
export function compareWindow(start: number, span: number, count: number): CompareWindow {
  const end = Math.min(start + span, count);
  const hours = Math.max(0, end - start);
  return { start, end, hours, truncated: hours < span };
}

export interface CompareStats {
  sunlit: number;
  powerComms: number;
  longestNight: number;
}

// "Power + comms" = Sun lit AND Earth up AND a DSN dish seeing the Moon, at the same hour.
// series.link is Earth + DSN only, so it must be combined with series.sun.
export function compareStats(series: SiteSeries, from: number, to: number): CompareStats {
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(series.sun.length, Math.ceil(to));
  if (b <= a) return { sunlit: 0, powerComms: 0, longestNight: 0 };
  let sunlit = 0;
  let both = 0;
  let run = 0;
  let night = 0;
  for (let i = a; i < b; i++) {
    const s = SUN_LIT(series.sun[i]);
    if (s) {
      sunlit++;
      if (LINK_UP(series.link[i])) both++;
      run = 0;
    } else {
      run++;
      if (run > night) night = run;
    }
  }
  const n = b - a;
  return { sunlit: (100 * sunlit) / n, powerComms: (100 * both) / n, longestNight: night };
}
