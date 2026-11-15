import { GlobalLayers, POLAR_EXTENT_M, type GlobalMetrics, type GridData } from "./globalLayers";
import { R_MOON_M } from "../lib/astro";

export interface GlobalOverlay {
  eq: HTMLCanvasElement;
  south: HTMLCanvasElement;
  north: HTMLCanvasElement;
}
import { paintGlobal, THERMAL_LAYERS, type LayerId, type Palette } from "./layers";
import { useApp } from "../state/store";

// Runs the whole-Moon engine on request and turns the result into an overlay image.
// Results are cached per (kind, start, hours) so switching layers back and forth is instant.

let engine: GlobalLayers | null = null;
let engineError: string | null = null;
const cache = new Map<string, GlobalMetrics>();
export interface GlobalPaintSource {
  layer: LayerId;
  m: GlobalMetrics;
}

let lastMetrics: GlobalPaintSource | null = null;

export function globalRequest(layer: LayerId, hour: number, rangeDays: number) {
  const kind: "light" | "thermal" = THERMAL_LAYERS.includes(layer) ? "thermal" : "light";
  const start = Math.floor(hour / 24) * 24;
  const hours = layer === "ice" ? 365 * 24 : rangeDays * 24;
  return { kind, start, hours, key: `${kind}:${start}:${hours}` };
}

// Raw whole-Moon results for a kind of model and a time window (cached).
export async function getGlobalMetrics(kind: "light" | "thermal", start: number, hours: number): Promise<GlobalMetrics | null> {
  const st = useApp.getState();
  if (!st.globe || !st.data) return null;
  const key = `${kind}:${start}:${hours}`;
  let m = cache.get(key);
  if (!m) {
    if (!engine && !engineError) {
      st.setGlobalStatus("Building horizons for the whole Moon on your GPU (one time)…");
      await new Promise((r) => setTimeout(r, 30));
      try {
        engine = new GlobalLayers(st.globe, st.data.ephem);
      } catch (e) {
        engineError = (e as Error).message;
      }
    }
    if (!engine) {
      st.setGlobalStatus(engineError);
      return null;
    }
    st.setGlobalStatus(kind === "thermal" ? "Running the soil heat model for the whole Moon…" : "Computing the whole Moon…");
    await new Promise((r) => setTimeout(r, 30));
    m = engine.compute(kind, start, hours);
    if (cache.size > 6) cache.clear();
    cache.set(key, m);
    st.setGlobalStatus(null);
  }
  return m;
}

export async function computeGlobal(layer: LayerId, hour: number, rangeDays: number): Promise<GlobalPaintSource | null> {
  const req = globalRequest(layer, hour, rangeDays);
  const m = await getGlobalMetrics(req.kind, req.start, req.hours);
  return m ? { layer, m } : null;
}

export function paintGlobalOverlay(source: GlobalPaintSource, palette: Palette): GlobalOverlay {
  const { layer, m } = source;
  lastMetrics = source;
  const paint = (grid: GridData) => {
    const c = document.createElement("canvas");
    c.width = grid.w;
    c.height = grid.h;
    const g = c.getContext("2d")!;
    const img = g.createImageData(grid.w, grid.h);
    paintGlobal(layer, grid.data, grid.w, grid.h, img, palette);
    g.putImageData(img, 0, 0);
    return c;
  };
  const byId = (id: string) => m!.grids.find((g) => g.id === id)!;
  useApp.getState().setGlobalInfo({ points: m.points, steps: Math.round(m.hours / m.stride), millis: m.millis, horizonMillis: engine?.horizonMillis ?? 0 });
  return { eq: paint(byId("eq")), south: paint(byId("south")), north: paint(byId("north")) };
}

// Value of the current whole-Moon layer at a latitude/longitude (for hover readouts).
export function globalValueAt(lat: number, lon: number): { layer: LayerId; value: number } | null {
  if (!lastMetrics) return null;
  const { m, layer } = lastMetrics;
  const ch = layer === "sun" || layer === "temp" ? 0 : layer === "earth" ? 1 : layer === "link" ? 2 : 3;
  if (Math.abs(lat) > 75) {
    const grid = m.grids.find((g) => g.id === (lat < 0 ? "south" : "north"))!;
    const colat = ((90 - Math.abs(lat)) * Math.PI) / 180;
    const k = 2 * R_MOON_M * Math.tan(colat / 2);
    const x = k * Math.sin((lon * Math.PI) / 180);
    const y = k * Math.cos((lon * Math.PI) / 180);
    const cell = (2 * POLAR_EXTENT_M) / grid.w;
    const c = Math.floor((x + POLAR_EXTENT_M) / cell);
    const r = Math.floor((POLAR_EXTENT_M - y) / cell);
    if (c >= 0 && r >= 0 && c < grid.w && r < grid.h) return { layer, value: grid.data[(r * grid.w + c) * 4 + ch] };
  }
  const g = m.grids.find((x) => x.id === "eq")!;
  const r = Math.min(g.h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * g.h)));
  const c = Math.min(g.w - 1, Math.max(0, Math.floor(((lon + 180) / 360) * g.w)));
  return { layer, value: g.data[(r * g.w + c) * 4 + ch] };
}
