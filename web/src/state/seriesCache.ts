import { useSyncExternalStore } from "react";
import type { Ephemeris, Site } from "../data/load";
import type { SiteSeries } from "../lib/visibility";
import { thermalWindow, type SiteThermal } from "../lib/siteThermal";
import { call, initWorker } from "../workers/client";

// Site time series and site temperatures are computed in the compute worker so selecting a site never
// stalls the main thread. Results are kept here; components call getSeries / getThermal and re-render
// through useSeriesVersion.

const series = new Map<string, SiteSeries>();
const thermal = new Map<string, SiteThermal>();
const requested = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let worker: { ephem: Ephemeris; ready: Promise<number> } | null = null;
// A failed request is retried after this long (components re-render and ask again), so a missing worker
// script recovers on its own without starting a new worker on every frame during playback.
const RETRY_MS = 2000;
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

/** Returns the cached value, or null after starting one worker request for `key`. */
function cached<T>(e: Ephemeris, store: Map<string, T>, max: number, key: string, type: string, payload: unknown): T | null {
  const hit = store.get(key);
  if (hit) return hit;
  const id = `${type}:${key}`;
  if (requested.has(id)) return null;
  requested.add(id);
  // If init fails, the client re-sends the ephemeris to the next worker it starts, so requests still go ahead.
  if (worker?.ephem !== e) worker = { ephem: e, ready: initWorker(e).catch(() => 0) };
  worker.ready
    .then(() => call<T>(type, payload))
    .then((value) => {
      if (store.size >= max) {
        const oldest = store.keys().next().value!;
        store.delete(oldest);
        requested.delete(`${type}:${oldest}`);
      }
      store.set(key, value);
      notify();
    })
    .catch((err) => {
      console.error(err);
      setTimeout(() => {
        requested.delete(id);
        notify();
      }, RETRY_MS);
    });
  return null;
}

/** The cached series, or null while the worker computes it (the request starts on the first call). */
export function getSeries(e: Ephemeris, site: Site): SiteSeries | null {
  const key = keyOf(site);
  return cached(e, series, MAX_SERIES, key, "siteSeries", { ...site, id: key });
}

/** Like siteThermal(e, site, startHour, hours), but from the worker: null until it is ready. */
export function getThermal(e: Ephemeris, site: Site, startHour: number, hours: number): SiteThermal | null {
  const key = keyOf(site);
  const { start, len } = thermalWindow(e, startHour, hours);
  return cached(e, thermal, MAX_THERMAL, `${key}:${start}:${len}`, "siteThermal", { site: { ...site, id: key }, startHour, hours });
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
