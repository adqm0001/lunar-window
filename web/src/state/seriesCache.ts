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

/** Returns the cached value, or null after starting one worker request for `key`. */
function cached<T>(e: Ephemeris, store: Map<string, T>, key: string, type: string, payload: unknown): T | null {
  const hit = store.get(key);
  if (hit) return hit;
  const id = `${type}:${key}`;
  if (requested.has(id)) return null;
  requested.add(id);
  if (worker?.ephem !== e) worker = { ephem: e, ready: initWorker(e) };
  worker.ready
    .then(() => call<T>(type, payload))
    .then((value) => {
      if (store === thermal && thermal.size > 40) {
        // Forget the requests too, so cleared windows are fetched again when shown.
        for (const k of thermal.keys()) requested.delete(`siteThermal:${k}`);
        thermal.clear();
      }
      store.set(key, value);
      version++;
      for (const l of listeners) l();
    })
    .catch((err) => {
      requested.delete(id);
      console.error(err);
    });
  return null;
}

/** The cached series, or null while the worker computes it (the request starts on the first call). */
export function getSeries(e: Ephemeris, site: Site): SiteSeries | null {
  return cached(e, series, site.id, "siteSeries", site);
}

/** Like siteThermal(e, site, startHour, hours), but from the worker: null until it is ready. */
export function getThermal(e: Ephemeris, site: Site, startHour: number, hours: number): SiteThermal | null {
  const { start, len } = thermalWindow(e, startHour, hours);
  return cached(e, thermal, `${site.id}:${start}:${len}`, "siteThermal", { site, startHour, hours });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Changes whenever a new result arrives; use it as a dependency next to getSeries / getThermal. */
export function useSeriesVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
