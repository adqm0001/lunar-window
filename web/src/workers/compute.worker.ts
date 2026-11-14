import type { Ephemeris } from "../data/load";

export interface WorkerRequest {
  id: number;
  type: string;
  payload: unknown;
}

export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

// The project's lib is DOM, which types `self` as Window; this is the dedicated worker scope we actually get.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse): void;
};

let ephem: Ephemeris | null = null;

const handlers: Record<string, (payload: unknown) => unknown> = {
  init: (payload) => {
    ephem = payload as Ephemeris;
    return ephem.count;
  },
  ping: (payload) => payload,
};

scope.onmessage = (e) => {
  const { id, type, payload } = e.data;
  const handler = handlers[type];
  try {
    if (!handler) throw new Error(`Unknown worker request "${type}"`);
    scope.postMessage({ id, ok: true, result: handler(payload) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
