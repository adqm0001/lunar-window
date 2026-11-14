import { useSyncExternalStore } from "react";
import type { Ephemeris, Site } from "../data/load";
import type { SiteSeries } from "../lib/visibility";
import { call, initWorker } from "../workers/client";

// Site time series are computed in the compute worker so selecting a site never stalls the main thread.
// Results are kept here by site id; components call getSeries and re-render through useSeriesVersion.

const cache = new Map<string, SiteSeries>();
const requested = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let worker: { ephem: Ephemeris; ready: Promise<number> } | null = null;
// After a failed request, wait this long before a render may ask again, so a missing worker script
// doesn't start a new worker on every frame during playback.
const RETRY_MS = 2000;

function request(e: Ephemeris, site: Site) {
  requested.add(site.id);
  // If init fails, the client re-sends the ephemeris to the next worker it starts, so requests still go ahead.
  if (worker?.ephem !== e) worker = { ephem: e, ready: initWorker(e).catch(() => 0) };
  worker.ready
    .then(() => call<SiteSeries>("siteSeries", site))
    .then((series) => {
      cache.set(site.id, series);
      version++;
      for (const l of listeners) l();
    })
    .catch((err) => {
      setTimeout(() => requested.delete(site.id), RETRY_MS);
      console.error(err);
    });
}

/** The cached series, or null while the worker computes it (the request starts on the first call). */
export function getSeries(e: Ephemeris, site: Site): SiteSeries | null {
  const hit = cache.get(site.id);
  if (hit) return hit;
  if (!requested.has(site.id)) request(e, site);
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Changes whenever a new series arrives; use it as a dependency next to getSeries. */
export function useSeriesVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
