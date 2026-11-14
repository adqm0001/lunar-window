import type { Ephemeris } from "../data/load";
import type { WorkerRequest, WorkerResponse } from "./compute.worker";

interface Pending {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./compute.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error));
  };
  worker.onerror = (e) => {
    const error = new Error(`Compute worker failed: ${e.message}`);
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };
  return worker;
}

export function call<T>(type: string, payload?: unknown, transfer: Transferable[] = []): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (result: unknown) => void, reject });
    const req: WorkerRequest = { id, type, payload };
    getWorker().postMessage(req, transfer);
  });
}

/** Sends the worker its own copy of the ephemeris; the copies are transferred, so the main thread keeps its arrays. */
export function initWorker(ephem: Ephemeris): Promise<number> {
  const data = ephem.data.slice();
  const dsn = ephem.dsn.slice();
  const copy: Ephemeris = { ...ephem, data, dsn };
  return call<number>("init", copy, [data.buffer, dsn.buffer]);
}
