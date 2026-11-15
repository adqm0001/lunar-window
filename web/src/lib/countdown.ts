import type { Ephemeris, Site } from "../data/load";
import { siteStateAt, type SiteSeries, type SiteState } from "./visibility";

export interface NextChanges {
  sun: number | null;
  earth: number | null;
  link: number | null;
}

const MAX_HOURS = 24 * 400;
const TOLERANCE_H = 1 / 3600; // one second

// Hours from `hour` until `stateOn(t)` leaves the value the card shows at `hour` (`shown`).
// The hourly series find the first sample after `hour` on the other side; the flip itself is then bisected with
// the same interpolated state the cards use, so the countdown is positive, never in the past, and consistent
// with the shown state at fractional hours.
function hoursUntilFlip(
  values: Uint8Array,
  hour: number,
  shown: boolean,
  seriesOn: (v: number) => boolean,
  stateOn: (t: number) => boolean,
): number | null {
  const first = Math.max(0, Math.floor(hour)) + 1;
  for (let i = first; i < Math.min(values.length, first + MAX_HOURS); i++) {
    if (seriesOn(values[i]) === shown) continue;
    let lo = hour;
    let hi = i;
    while (hi - lo > TOLERANCE_H) {
      const mid = (lo + hi) / 2;
      if (stateOn(mid) === shown) lo = mid;
      else hi = mid;
    }
    return hi - hour;
  }
  return null;
}

// Countdown to the next change of the Sun, Earth and DSN-link cards, given the interpolated state `st` the cards
// show at the fractional `hour` (siteStateAt(e, site, hour)).
export function nextChanges(e: Ephemeris, site: Site, series: SiteSeries, hour: number, st: SiteState): NextChanges {
  const at = (t: number) => siteStateAt(e, site, t);
  return {
    sun: hoursUntilFlip(series.sun, hour, st.sunFraction >= 0.5, (v) => v >= 128, (t) => at(t).sunFraction >= 0.5),
    earth: hoursUntilFlip(series.earth, hour, st.earthUp, (v) => v === 1, (t) => at(t).earthUp),
    link: hoursUntilFlip(series.link, hour, st.link, (v) => v === 1, (t) => at(t).link),
  };
}
