import { useSyncExternalStore } from "react";
import type { Ephemeris, Site } from "../data/load";
import { siteSeries, type SiteSeries } from "../lib/visibility";
import { siteThermal, thermalWindow, type SiteThermal } from "../lib/siteThermal";
import { call, initWorker, WorkerFailedError } from "../workers/client";

// Site time series and site temperatures are computed in the compute worker so selecting a site never
// stalls the main thread. Results are kept here; components call getSeries / getThermal and re-render
// through useSeriesVersion.

const series = new Map<string, SiteSeries>();
const thermal = new Map<string, SiteThermal>();
const requested = new Set<string>();
const attempts = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
let worker: { ephem: Ephemeris; ready: Promise<number> } | null = null;
// A failed request is retried after this long (components re-render and ask again), so a worker script that is
// briefly unavailable recovers on its own without starting a new worker on every frame during playback.
const RETRY_MS = 2000;
// After this many failed attempts the value is computed on the main thread instead, as it was before the worker.
// If the worker itself is what failed (e.g. a tab left open across a deploy that removed its file), every later
// request goes straight to the main thread too.
const MAX_ATTEMPTS = 3;
let mainThreadOnly = false;
// More than the app ever shows at once (named sites, 10 finder results, 20 custom points; a few temperature
// windows), so evicting the oldest never removes one that is on screen.
const MAX_SERIES = 64;
const MAX_THERMAL = 40;

// Results are keyed per site object, not per id: some sites are replaced under the same id (finder results
// are always best:1…best:10, "Analyze this area" upgrades a custom point's horizon), and those need new results.
// The worker gets the site under this key too, so its own caches never return an old site's results.
const keys = new WeakMap<Site, string>();
let nextKey = 1;

function keyOf(site: Site): string {
  let k = keys.get(site);
  if (!k) {
    k = `${site.id}#${nextKey++}`;
    keys.set(site, k);
  }
  return k;
}

function notify() {
  version++;
  for (const l of listeners) l();
}

function store<T>(map: Map<string, T>, max: number, type: string, key: string, value: T) {
  if (map.size >= max) {
    const oldest = map.keys().next().value!;
    map.delete(oldest);
    requested.delete(`${type}:${oldest}`);
  }
  map.set(key, value);
  attempts.delete(`${type}:${key}`);
  notify();
}

/**
 * Returns the cached value, or null after starting one request for `key`: in the worker, or with `local` on the
 * main thread once the worker has failed MAX_ATTEMPTS times.
 */
function cached<T>(e: Ephemeris, map: Map<string, T>, max: number, key: string, type: string, payload: unknown, local: () => T): T | null {
  const hit = map.get(key);
  if (hit) return hit;
  const id = `${type}:${key}`;
  if (requested.has(id)) return null;
  requested.add(id);
  // Outside render, one value per task, so a burst of fallbacks doesn't become one long stall.
  const computeHere = () =>
    setTimeout(() => {
      try {
        store(map, max, type, key, local());
      } catch (err) {
        console.error(err);
      }
    }, 0);
  if (mainThreadOnly) {
    computeHere();
    return null;
  }
  // If init fails, the client re-sends the ephemeris to the next worker it starts, so requests still go ahead.
  if (worker?.ephem !== e) worker = { ephem: e, ready: initWorker(e).catch(() => 0) };
  worker.ready
    .then(() => call<T>(type, payload))
    .then((value) => store(map, max, type, key, value))
    .catch((err) => {
      const n = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, n);
      if (n < MAX_ATTEMPTS && !mainThreadOnly) {
        console.error(err);
        setTimeout(() => {
          requested.delete(id);
          notify();
        }, RETRY_MS);
        return;
      }
      if (err instanceof WorkerFailedError && !mainThreadOnly) {
        mainThreadOnly = true;
        console.warn(`Compute worker unavailable after ${n} attempts; computing on the main thread instead.`, err);
      }
      computeHere();
    });
  return null;
}

/** The cached series, or null while it is computed (the request starts on the first call). */
export function getSeries(e: Ephemeris, site: Site): SiteSeries | null {
  const key = keyOf(site);
  const keyed = { ...site, id: key };
  return cached(e, series, MAX_SERIES, key, "siteSeries", keyed, () => siteSeries(e, keyed));
}

/** Like siteThermal(e, site, startHour, hours), but computed off the main thread when possible: null until ready. */
export function getThermal(e: Ephemeris, site: Site, startHour: number, hours: number): SiteThermal | null {
  const key = keyOf(site);
  const keyed = { ...site, id: key };
  const { start, len } = thermalWindow(e, startHour, hours);
  return cached(e, thermal, MAX_THERMAL, `${key}:${start}:${len}`, "siteThermal", { site: keyed, startHour, hours }, () =>
    siteThermal(e, keyed, startHour, hours, series.get(key)),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Changes when a result arrives or a failed one is due for a retry; use it as a dependency next to getSeries / getThermal. */
export function useSeriesVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
