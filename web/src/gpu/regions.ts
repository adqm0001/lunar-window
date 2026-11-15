import type { FieldData } from "../data/field";
import { customSiteAt, inField } from "../data/field";
import { toMap } from "../lib/astro";
import { useApp } from "../state/store";
import { buildRegionField } from "./regionField";

export const REGION_HALF_M = 28000;
export const MAX_REGION_LAT = -75;

type Request = { id: number; label: string; lat: number; lon: number };

const cache = new Map<string, FieldData>();
// The latest request wins: `latest` is the id of the newest call, only one GPU build runs at a time,
// and a call that needs a build while one runs waits in `pending` (a newer call replaces it).
let latest = 0;
let running = false;
let pending: Request | null = null;

export async function analyzeArea(label: string, lat: number, lon: number) {
  if (!useApp.getState().globe) return;
  pending = null;
  await analyze({ id: ++latest, label, lat, lon });
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
    st.setActiveField(hit);
    st.setRegionStatus(null);
    return;
  }
  st.setRegionStatus({ label, progress: 0 });
  if (running) {
    pending = req;
    return;
  }
  running = true;
  try {
    const f = await buildRegionField(g, { label, centerX: x, centerY: y, extentMeters: REGION_HALF_M }, (p) => {
      if (req.id === latest) useApp.getState().setRegionStatus({ label, progress: p });
    });
    cache.set(key, f);
    if (req.id === latest) {
      const now = useApp.getState();
      now.setActiveField(f);
      now.setRegionStatus(null);
      const custom = now.customSites.find((c) => c.id === now.selectedId);
      if (custom && now.selectedId === custom.id) {
        const [cx, cy] = toMap(custom.lat, custom.lon);
        const better = inField(f, cx, cy) ? customSiteAt(f, cx, cy) : null;
        if (better) now.setCustomSite({ ...better, id: custom.id, name: custom.name });
      }
    }
  } catch (e) {
    if (req.id === latest) useApp.getState().setRegionStatus({ label, progress: 1, error: (e as Error).message });
  } finally {
    running = false;
  }
  const next = pending;
  pending = null;
  if (next) await analyze(next);
}
