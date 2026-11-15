import { useMemo } from "react";
import { GpuEngine, type FieldMetrics } from "./engine";
import { layerDef, THERMAL_LAYERS } from "./layers";
import { ICE_HOURS, iceVerdictPossible } from "./thermal";
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

export function useFieldMetrics(): { metrics: FieldMetrics | null; error: string | null; start: number; hours: number } {
  const field = useApp((s) => s.field);
  const layer = useApp((s) => s.layer);
  const rangeDays = useApp((s) => s.rangeDays);
  const hour = useApp((s) => s.hour);
  const count = useApp((s) => s.data?.ephem.count ?? 0);
  const def = layerDef(layer);
  const thermal = THERMAL_LAYERS.includes(layer);
  const start = def.ranged || thermal ? Math.floor(hour / 24) * 24 : Math.floor(hour);
  const hours = layer === "ice" ? ICE_HOURS : def.ranged ? rangeDays * 24 : 1;
  // Near the end of the data the ice map has less than the year it needs, so it shows nothing rather than a guess.
  const active = (def.ranged || thermal || layer === "now") && !(layer === "ice" && !iceVerdictPossible(count - start));

  const metrics = useMemo(() => {
    if (!field || !active) return null;
    const key = `${thermal ? "T" : "L"}:${start}:${hours}`;
    if (cached && cached.field === field && cached.key === key) return cached.metrics;
    const e = getEngine();
    const m = e ? (thermal ? e.computeThermal(start, hours) : e.compute(start, hours)) : null;
    cached = { field, key, metrics: m };
    if (import.meta.env.DEV) (window as unknown as { __lw: unknown }).__lw = { metrics: m, start, hours };
    return m;
  }, [field, active, start, hours, thermal]);

  return { metrics, error: engineError, start, hours };
}
