import type { Ephemeris, Site } from "../data/load";
import { siteSeries } from "../lib/visibility";

export interface WorkerRequest {
  id: number;
  type: string;
  payload: unknown;
}

export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

// The project's lib is DOM, which types `self` as Window; this is the dedicated worker scope we actually get.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
};

let ephem: Ephemeris | null = null;

function needEphem(): Ephemeris {
  if (!ephem) throw new Error("Compute worker used before initWorker");
  return ephem;
}

// A handler returns its result plus any buffers to transfer back instead of copying.
const handlers: Record<string, (payload: unknown) => { result: unknown; transfer?: Transferable[] }> = {
  init: (payload) => {
    ephem = payload as Ephemeris;
    return { result: ephem.count };
  },
  ping: (payload) => ({ result: payload }),
  siteSeries: (payload) => {
    const s = siteSeries(needEphem(), payload as Site);
    return { result: s, transfer: [s.sun.buffer, s.earth.buffer, s.link.buffer] };
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
