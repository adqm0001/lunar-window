import type { FieldData } from "../data/field";
import { inField } from "../data/field";
import { toMap } from "../lib/astro";
import { useApp } from "../state/store";
import { buildRegionField } from "./regionField";

export const REGION_HALF_M = 28000;
export const MAX_REGION_LAT = -75;

const cache = new Map<string, FieldData>();
let running = false;

export async function analyzeArea(label: string, lat: number, lon: number) {
  const st = useApp.getState();
  const g = st.globe;
  if (!g || running) return;
  if (lat > MAX_REGION_LAT) {
    st.setRegionStatus({ label, progress: 1, error: "Detailed analysis covers the south polar region (below 75°S)." });
    return;
  }
  const [x, y] = toMap(lat, lon);
  if (st.poleField && inField(st.poleField, x, y)) {
    st.setActiveField(st.poleField);
    return;
  }
  const key = `${Math.round(x / 2000)},${Math.round(y / 2000)}`;
  const hit = cache.get(key);
  if (hit) {
    st.setActiveField(hit);
    return;
  }
  running = true;
  st.setRegionStatus({ label, progress: 0 });
  try {
    const f = await buildRegionField(g, { label, centerX: x, centerY: y, extentMeters: REGION_HALF_M }, (p) => useApp.getState().setRegionStatus({ label, progress: p }));
    cache.set(key, f);
    useApp.getState().setActiveField(f);
    useApp.getState().setRegionStatus(null);
  } catch (e) {
    useApp.getState().setRegionStatus({ label, progress: 1, error: (e as Error).message });
  } finally {
    running = false;
  }
}
