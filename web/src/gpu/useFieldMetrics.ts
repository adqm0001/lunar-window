import { useMemo, useSyncExternalStore } from "react";
import { GpuEngine, type FieldMetrics } from "./engine";
import { layerDef, THERMAL_LAYERS } from "./layers";
import { ICE_HOURS, iceCovered } from "./thermal";
import { useApp } from "../state/store";
import type { FieldData } from "../data/field";

let engine: GpuEngine | null = null;
let engineFor: FieldData | null = null;
let engineError: string | null = null;
let cached: { field: FieldData; key: string; metrics: FieldMetrics | null } | null = null;

export function getEngine(): GpuEngine | null {
  const { field, data } = useApp.getState();
  if (!field || !data) return null;
  if (engineFor !== field) {
    engine?.dispose();
    engineFor = field;
    thermal.clear();
    try {
      engine = new GpuEngine(field, data.ephem);
      engineError = null;
    } catch (e) {
      engine = null;
      engineError = (e as Error).message;
    }
  }
  return engine;
}

// The thermal model takes tens of milliseconds on the GPU (more with its warm-up), so it runs asynchronously
// (GpuEngine.computeThermal) instead of inside a render. Finished windows are kept here; while a new one is being
// computed the hook keeps showing the last finished window of the same length, then switches when it arrives.
const thermal = {
  results: new Map<string, FieldMetrics | null>(),
  pending: new Map<string, { want: boolean }>(),
  last: new Map<number, FieldMetrics | null>(),
  version: 0,
  subs: new Set<() => void>(),
  clear() {
    this.results.clear();
    for (const p of this.pending.values()) p.want = false;
    this.pending.clear();
    this.last.clear();
  },
};
const subscribe = (cb: () => void) => {
  thermal.subs.add(cb);
  return () => thermal.subs.delete(cb);
};
const thermalVersion = () => thermal.version;

function thermalMetrics(start: number, hours: number): FieldMetrics | null {
  const key = `${start}:${hours}`;
  // A cached window can also replace a pending one.
  for (const [k, p] of thermal.pending) p.want = k === key;
  if (thermal.results.has(key)) {
    const m = thermal.results.get(key) ?? null;
    thermal.last.set(hours, m);
    return m;
  }
  // only the newest request is still wanted; older ones stop at their next band
  const e = getEngine();
  if (e && !thermal.pending.has(key)) {
    const p = { want: true };
    thermal.pending.set(key, p);
    e.computeThermal(start, hours, () => p.want).then(
      (m) => {
        if (thermal.pending.get(key) !== p) return;
        thermal.pending.delete(key);
        if (!m || !p.want) return;
        if (thermal.results.size > 8) thermal.results.clear();
        thermal.results.set(key, m);
        thermal.version++;
        thermal.subs.forEach((cb) => cb());
      },
      () => {
        if (thermal.pending.get(key) === p) thermal.pending.delete(key);
      },
    );
  }
  return thermal.last.get(hours) ?? null;
}

export function useFieldMetrics(): { metrics: FieldMetrics | null; error: string | null; start: number; hours: number } {
  const field = useApp((s) => s.field);
  const layer = useApp((s) => s.layer);
  const rangeDays = useApp((s) => s.rangeDays);
  const hour = useApp((s) => s.hour);
  const count = useApp((s) => s.data?.ephem.count ?? 0);
  const version = useSyncExternalStore(subscribe, thermalVersion);
  const def = layerDef(layer);
  const isThermal = THERMAL_LAYERS.includes(layer);
  const start = def.ranged || isThermal ? Math.floor(hour / 24) * 24 : Math.floor(hour);
  const hours = layer === "ice" ? ICE_HOURS : def.ranged ? rangeDays * 24 : 1;
  // Near the end of the data the ice map has less than the year it needs, so it shows nothing rather than a guess.
  const active = (def.ranged || isThermal || layer === "now") && !(layer === "ice" && !iceCovered(count, start));

  const metrics = useMemo(() => {
    if (!field || !active) return null;
    if (isThermal) {
      getEngine();
      return thermalMetrics(start, hours);
    }
    const key = `L:${start}:${hours}`;
    if (cached && cached.field === field && cached.key === key) return cached.metrics;
    const e = getEngine();
    const m = e ? e.compute(start, hours) : null;
    cached = { field, key, metrics: m };
    return m;
  }, [field, active, start, hours, isThermal, version]);
  if (import.meta.env.DEV) (window as unknown as { __lw: unknown }).__lw = { metrics, start, hours };

  return { metrics, error: engineError, start, hours };
}
