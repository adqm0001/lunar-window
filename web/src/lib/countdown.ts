import type { Ephemeris, Site } from "../data/load";
import { siteStateAt, type SiteSeries, type SiteState } from "./visibility";

export interface NextChanges {
  sun: number | null;
  earth: number | null;
  link: number | null;
}

const MAX_HOURS = 24 * 400;
const TOLERANCE_H = 1 / 3600; // one second

// Absolute hour at which `stateOn(t)` leaves the value the card shows at `hour` (`shown`).
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
    return hi;
  }
  return null;
}

// Countdown to the next change of the Sun, Earth and DSN-link cards, given the interpolated state `st` the cards
// show at the fractional `hour` (siteStateAt(e, site, hour)).
export function nextChangeHours(e: Ephemeris, site: Site, series: SiteSeries, hour: number, st: SiteState): NextChanges {
  const at = (t: number) => siteStateAt(e, site, t);
  return {
    sun: hoursUntilFlip(series.sun, hour, st.sunFraction >= 0.5, (v) => v >= 128, (t) => at(t).sunFraction >= 0.5),
    earth: hoursUntilFlip(series.earth, hour, st.earthUp, (v) => v === 1, (t) => at(t).earthUp),
    link: hoursUntilFlip(series.link, hour, st.link, (v) => v === 1, (t) => at(t).link),
  };
}

const remaining = (t: number | null, hour: number) => (t === null ? null : Math.max(0, t - hour));

export function nextChanges(e: Ephemeris, site: Site, series: SiteSeries, hour: number, st: SiteState): NextChanges {
  const t = nextChangeHours(e, site, series, hour, st);
  return { sun: remaining(t.sun, hour), earth: remaining(t.earth, hour), link: remaining(t.link, hour) };
}

// Per-frame cache for playback: the absolute event hours are recomputed only when floor(hour), the shown
// Sun/Earth/link state, the site, the series or the ephemeris change; otherwise they are reused and only the
// subtraction of the current hour is redone. Results agree with nextChanges() to within the bisection tolerance (1 s).
export function createCountdownCache() {
  let key: unknown[] | null = null;
  let times: NextChanges | null = null;
  return (e: Ephemeris, site: Site, series: SiteSeries, hour: number, st: SiteState): NextChanges => {
    const k = [e, site, series, Math.floor(hour), st.sunFraction >= 0.5, st.earthUp, st.link];
    if (!key || !times || k.some((v, i) => v !== key![i])) {
      key = k;
      times = nextChangeHours(e, site, series, hour, st);
    }
    return { sun: remaining(times.sun, hour), earth: remaining(times.earth, hour), link: remaining(times.link, hour) };
  };
}
