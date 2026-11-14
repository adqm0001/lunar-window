import { useMemo } from "react";
import { GpuEngine, type FieldMetrics } from "./engine";
import { layerDef } from "./layers";
import { useApp } from "../state/store";
import type { FieldData } from "../data/field";

let engine: GpuEngine | null = null;
let engineFor: FieldData | null = null;
let engineError: string | null = null;

export function getEngine(): GpuEngine | null {
  const { field, data } = useApp.getState();
  if (!field || !data) return null;
  if (engineFor !== field) {
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
  const def = layerDef(layer);
  const start = def.ranged ? Math.floor(hour / 24) * 24 : Math.floor(hour);
  const hours = def.ranged ? rangeDays * 24 : 1;
  const active = def.ranged || layer === "now";

  const metrics = useMemo(() => {
    if (!field || !active) return null;
    const e = getEngine();
    const m = e ? e.compute(start, hours) : null;
    if (import.meta.env.DEV) (window as unknown as { __lw: unknown }).__lw = { metrics: m, start, hours };
    return m;
  }, [field, active, start, hours]);

  return { metrics, error: engineError, start, hours };
}
