import { useSyncExternalStore } from "react";
import type { Ephemeris, Site } from "../data/load";
import type { SiteSeries } from "../lib/visibility";
import { call, initWorker } from "../workers/client";

// Site time series are computed in the compute worker so selecting a site never stalls the main thread.
// Results are kept here; components call getSeries and re-render through useSeriesVersion.

const cache = new Map<string, SiteSeries>();
const requested = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let worker: { ephem: Ephemeris; ready: Promise<number> } | null = null;
// A failed request is retried after this long (components re-render and ask again), so a missing worker
// script recovers on its own without starting a new worker on every frame during playback.
const RETRY_MS = 2000;
// More than the app ever shows at once (named sites, 10 finder results, 20 custom points), so evicting the
// oldest never removes one that is on screen.
const MAX_SERIES = 64;

// Results are keyed per site object, not per id: some sites are replaced under the same id (finder results
// are always best:1…best:10, "Analyze this area" upgrades a custom point's horizon), and those need new results.
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

function request(e: Ephemeris, site: Site, key: string) {
  requested.add(key);
  // If init fails, the client re-sends the ephemeris to the next worker it starts, so requests still go ahead.
  if (worker?.ephem !== e) worker = { ephem: e, ready: initWorker(e).catch(() => 0) };
  worker.ready
    .then(() => call<SiteSeries>("siteSeries", site))
    .then((series) => {
      if (cache.size >= MAX_SERIES) {
        const oldest = cache.keys().next().value!;
        cache.delete(oldest);
        requested.delete(oldest);
      }
      cache.set(key, series);
      notify();
    })
    .catch((err) => {
      console.error(err);
      setTimeout(() => {
        requested.delete(key);
        notify();
      }, RETRY_MS);
    });
}

/** The cached series, or null while the worker computes it (the request starts on the first call). */
export function getSeries(e: Ephemeris, site: Site): SiteSeries | null {
  const key = keyOf(site);
  const hit = cache.get(key);
  if (hit) return hit;
  if (!requested.has(key)) request(e, site, key);
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Changes when a series arrives or a failed one is due for a retry; use it as a dependency next to getSeries. */
export function useSeriesVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
