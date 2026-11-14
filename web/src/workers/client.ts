import type { Ephemeris } from "../data/load";
import type { WorkerRequest, WorkerResponse } from "./compute.worker";

interface Pending {
  worker: Worker;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
// The last ephemeris given to initWorker, re-sent to any worker started after a failure.
let ephemSource: Ephemeris | null = null;

function startWorker(): Worker {
  const w = new Worker(new URL("./compute.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error));
  };
  // Fires when the script fails to load or throws (including on a request it could not read, see
  // compute.worker.ts). The worker is dropped so the next call starts a fresh one instead of posting to a
  // worker that will never answer.
  w.onerror = (e) => fail(w, (e as ErrorEvent).message || "could not load the worker script");
  // A reply that could not be read can't be matched to its request, so every call on this worker would wait forever.
  w.onmessageerror = () => fail(w, "could not read a reply");
  return w;
}

/** The worker itself failed (script didn't load, crashed, or a message couldn't be read), not just one request. */
export class WorkerFailedError extends Error {
  constructor(reason: string) {
    super(`Compute worker failed: ${reason}`);
    this.name = "WorkerFailedError";
  }
}

function fail(w: Worker, reason: string) {
  if (worker === w) worker = null;
  w.terminate();
  const error = new WorkerFailedError(reason);
  for (const [id, p] of pending) {
    if (p.worker !== w) continue;
    pending.delete(id);
    p.reject(error);
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = startWorker();
  // A replacement worker needs the ephemeris again; requests posted after this are handled after it.
  // If it fails, the request that triggered the restart reports the error.
  if (ephemSource) sendInit(worker, ephemSource).catch(() => {});
  return worker;
}

function post<T>(w: Worker, type: string, payload: unknown, transfer: Transferable[]): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { worker: w, resolve: resolve as (result: unknown) => void, reject });
    const req: WorkerRequest = { id, type, payload };
    try {
      w.postMessage(req, transfer);
    } catch (err) {
      // e.g. a payload that can't be cloned: nothing was sent, so nothing will answer.
      pending.delete(id);
      throw err;
    }
  });
}

function sendInit(w: Worker, ephem: Ephemeris): Promise<number> {
  const data = ephem.data.slice();
  const dsn = ephem.dsn.slice();
  const copy: Ephemeris = { ...ephem, data, dsn };
  return post<number>(w, "init", copy, [data.buffer, dsn.buffer]);
}

export function call<T>(type: string, payload?: unknown, transfer: Transferable[] = []): Promise<T> {
  return post<T>(getWorker(), type, payload, transfer);
}

/** Sends the worker its own copy of the ephemeris; the copies are transferred, so the main thread keeps its arrays. */
export function initWorker(ephem: Ephemeris): Promise<number> {
  const w = getWorker();
  ephemSource = ephem;
  return sendInit(w, ephem);
}
