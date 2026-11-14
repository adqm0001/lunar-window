import type { Ephemeris, Site } from "../data/load";
import { siteSeries, type SiteSeries } from "../lib/visibility";
import { siteThermal } from "../lib/siteThermal";

export interface WorkerRequest {
  id: number;
  type: string;
  payload: unknown;
}

export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

// The project's lib is DOM, which types `self` as Window; this is the dedicated worker scope we actually get.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
};

// A request that can't be read has no id to answer, so its caller would wait forever. Throwing turns it into
// an error event on the main thread, where the client fails this worker's calls and starts a fresh one.
scope.onmessageerror = () => {
  throw new Error("could not read a request");
};

let ephem: Ephemeris | null = null;

// Kept so siteThermal can reuse a site's series; the main thread gets transferred copies. Sites arrive under
// a per-object key (state/seriesCache.ts), so an id here always means the same site.
const seriesById = new Map<string, SiteSeries>();
const MAX_SERIES = 64;

function needEphem(): Ephemeris {
  if (!ephem) throw new Error("Compute worker used before initWorker");
  return ephem;
}

function seriesFor(site: Site): SiteSeries {
  let s = seriesById.get(site.id);
  if (!s) {
    s = siteSeries(needEphem(), site);
    if (seriesById.size >= MAX_SERIES) seriesById.delete(seriesById.keys().next().value!);
    seriesById.set(site.id, s);
  }
  return s;
}

// A handler returns its result plus any buffers to transfer back instead of copying.
const handlers: Record<string, (payload: unknown) => { result: unknown; transfer?: Transferable[] }> = {
  init: (payload) => {
    ephem = payload as Ephemeris;
    return { result: ephem.count };
  },
  ping: (payload) => ({ result: payload }),
  siteSeries: (payload) => {
    const s = seriesFor(payload as Site);
    const copy = { sun: s.sun.slice(), earth: s.earth.slice(), link: s.link.slice() };
    return { result: copy, transfer: [copy.sun.buffer, copy.earth.buffer, copy.link.buffer] };
  },
  // Not transferred: siteThermal keeps its results in its own cache, so the reply is a copy.
  siteThermal: (payload) => {
    const { site, startHour, hours } = payload as { site: Site; startHour: number; hours: number };
    return { result: siteThermal(needEphem(), site, startHour, hours, seriesFor(site)) };
  },
};

scope.onmessage = (e) => {
  const { id, type, payload } = e.data;
  const handler = handlers[type];
  try {
    if (!handler) throw new Error(`Unknown worker request "${type}"`);
    const { result, transfer = [] } = handler(payload);
    scope.postMessage({ id, ok: true, result }, transfer);
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
