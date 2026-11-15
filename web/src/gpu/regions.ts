import type { FieldData } from "../data/field";
import { customSiteAt, inField } from "../data/field";
import { toMap } from "../lib/astro";
import { useApp } from "../state/store";
import { buildRegionField } from "./regionField";

export const REGION_HALF_M = 28000;
export const MAX_REGION_LAT = -75;

type Request = { id: number; label: string; lat: number; lon: number };

const cache = new Map<string, FieldData>();
// The latest request wins: `latest` is the id of the newest call, only one GPU build (`current`) runs at a time,
// and a call that needs a build while one runs waits in `pending` (a newer call replaces it). A call for the
// region that is already building takes over that build instead of waiting for it.
let latest = 0;
let current: { id: number; label: string; key: string; progress: number } | null = null;
let pending: Request | null = null;

export async function analyzeArea(label: string, lat: number, lon: number) {
  if (!useApp.getState().globe) return;
  pending = null;
  await analyze({ id: ++latest, label, lat, lon });
}

// Make `f` the active field and refine the selected custom point with it.
function apply(f: FieldData) {
  const now = useApp.getState();
  now.setActiveField(f);
  now.setRegionStatus(null);
  const custom = now.customSites.find((c) => c.id === now.selectedId);
  if (custom) {
    const [cx, cy] = toMap(custom.lat, custom.lon);
    const better = inField(f, cx, cy) ? customSiteAt(f, cx, cy) : null;
    if (better) now.setCustomSite({ ...better, id: custom.id, name: custom.name });
  }
}

async function analyze(req: Request) {
  const { label, lat, lon } = req;
  const st = useApp.getState();
  const g = st.globe;
  if (!g) return;
  if (lat > MAX_REGION_LAT) {
    st.setRegionStatus({ label, progress: 1, error: "Detailed analysis covers the south polar region (below 75°S)." });
    return;
  }
  const [x, y] = toMap(lat, lon);
  if (st.poleField && inField(st.poleField, x, y)) {
    st.setActiveField(st.poleField);
    st.setRegionStatus(null);
    return;
  }
  const key = `${Math.round(x / 2000)},${Math.round(y / 2000)}`;
  const hit = cache.get(key);
  if (hit) {
    apply(hit);
    return;
  }
  if (current?.key === key) {
    current.id = req.id;
    current.label = label;
    st.setRegionStatus({ label, progress: current.progress });
    return;
  }
  st.setRegionStatus({ label, progress: 0 });
  if (current) {
    pending = req;
    return;
  }
  const run = { id: req.id, label, key, progress: 0 };
  current = run;
  try {
    const f = await buildRegionField(g, { label, centerX: x, centerY: y, extentMeters: REGION_HALF_M }, (p) => {
      run.progress = p;
      if (run.id === latest) useApp.getState().setRegionStatus({ label: run.label, progress: p });
    });
    cache.set(key, f);
    if (run.id === latest) apply(f);
  } catch (e) {
    if (run.id === latest) useApp.getState().setRegionStatus({ label: run.label, progress: 1, error: (e as Error).message });
  } finally {
    current = null;
  }
  const next = pending;
  pending = null;
  if (next) await analyze(next);
}
