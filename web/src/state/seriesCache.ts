import { useSyncExternalStore } from "react";
import type { Ephemeris, Site } from "../data/load";
import { siteSeries, type SiteSeries } from "../lib/visibility";
import { call, initWorker, WorkerFailedError } from "../workers/client";

// Site time series are computed in the compute worker so selecting a site never stalls the main thread.
// Results are kept here; components call getSeries and re-render through useSeriesVersion.

const cache = new Map<string, SiteSeries>();
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

function store(key: string, series: SiteSeries) {
  if (cache.size >= MAX_SERIES) {
    const oldest = cache.keys().next().value!;
    cache.delete(oldest);
    requested.delete(oldest);
  }
  cache.set(key, series);
  attempts.delete(key);
  notify();
}

// Outside render, one site per task, so a burst of fallbacks doesn't become one long stall.
function computeHere(e: Ephemeris, site: Site, key: string) {
  requested.add(key);
  setTimeout(() => {
    try {
      store(key, siteSeries(e, site));
    } catch (err) {
      console.error(err);
    }
  }, 0);
}

function request(e: Ephemeris, site: Site, key: string) {
  requested.add(key);
  // If init fails, the client re-sends the ephemeris to the next worker it starts, so requests still go ahead.
  if (worker?.ephem !== e) worker = { ephem: e, ready: initWorker(e).catch(() => 0) };
  worker.ready
    .then(() => call<SiteSeries>("siteSeries", site))
    .then((series) => store(key, series))
    .catch((err) => {
      const n = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, n);
      if (n < MAX_ATTEMPTS && !mainThreadOnly) {
        console.error(err);
        setTimeout(() => {
          requested.delete(key);
          notify();
        }, RETRY_MS);
        return;
      }
      if (err instanceof WorkerFailedError && !mainThreadOnly) {
        mainThreadOnly = true;
        console.warn(`Compute worker unavailable after ${n} attempts; computing on the main thread instead.`, err);
      }
      computeHere(e, site, key);
    });
}

/** The cached series, or null while it is computed (the request starts on the first call). */
export function getSeries(e: Ephemeris, site: Site): SiteSeries | null {
  const key = keyOf(site);
  const hit = cache.get(key);
  if (hit) return hit;
  if (requested.has(key)) return null;
  if (mainThreadOnly) computeHere(e, site, key);
  else request(e, site, key);
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
