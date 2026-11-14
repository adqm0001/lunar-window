import type { FieldData } from "../data/field";
import type { FieldMetrics } from "./engine";

export type LayerId = "terrain" | "now" | "sun" | "earth" | "link" | "night" | "slope";

type Stop = [number, number, number, number];

export interface LayerDef {
  id: LayerId;
  label: string;
  short: string;
  ranged: boolean;
  stops: Stop[];
  legend: [string, string];
  describe: string;
}

const SUN: Stop[] = [[0, 8, 8, 20], [0.25, 90, 30, 70], [0.55, 220, 90, 40], [0.8, 255, 181, 71], [1, 255, 250, 225]];
const EARTH: Stop[] = [[0, 6, 10, 25], [0.5, 30, 90, 190], [1, 170, 220, 255]];
const LINK: Stop[] = [[0, 6, 14, 14], [0.5, 25, 140, 100], [1, 180, 255, 210]];
const NIGHT: Stop[] = [[0, 61, 220, 151], [0.35, 255, 200, 70], [0.7, 255, 93, 108], [1, 90, 20, 40]];
const SLOPE: Stop[] = [[0, 255, 93, 108], [0.6, 255, 200, 70], [1, 61, 220, 151]];

export const LAYERS: LayerDef[] = [
  { id: "terrain", label: "Terrain", short: "Terrain", ranged: false, stops: [], legend: ["", ""], describe: "LOLA shaded relief" },
  { id: "now", label: "Sunlight now", short: "Now", ranged: false, stops: [], legend: ["shadow", "lit"], describe: "Lit and shadowed ground at the current time" },
  { id: "sun", label: "Sunlight %", short: "Sun %", ranged: true, stops: SUN, legend: ["0%", "100%"], describe: "Share of time the Sun is visible" },
  { id: "earth", label: "Earth in view %", short: "Earth %", ranged: true, stops: EARTH, legend: ["0%", "100%"], describe: "Share of time Earth is above the terrain" },
  { id: "link", label: "Power + comms %", short: "Sun+DSN", ranged: true, stops: LINK, legend: ["0%", "100%"], describe: "Sun up, Earth up and a DSN dish seeing the Moon, all at once" },
  { id: "night", label: "Longest night", short: "Night", ranged: true, stops: NIGHT, legend: ["0 d", "≥ 30 d"], describe: "Longest continuous stretch without sunlight" },
  { id: "slope", label: "Safe to land", short: "Slope", ranged: false, stops: SLOPE, legend: ["steep", "flat"], describe: "Share of each 250 m cell with slope under 10°" },
];

export const layerDef = (id: LayerId) => LAYERS.find((l) => l.id === id)!;

function sample(stops: Stop[], t: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ...ca] = stops[i - 1];
      const [b, ...cb] = stops[i];
      const w = (v - a) / (b - a || 1);
      return [ca[0] + (cb[0] - ca[0]) * w, ca[1] + (cb[1] - ca[1]) * w, ca[2] + (cb[2] - ca[2]) * w];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

export function gradientCss(stops: Stop[]) {
  return `linear-gradient(90deg, ${stops.map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${t * 100}%`).join(", ")})`;
}

export const NIGHT_SCALE_HOURS = 24 * 30;

export function layerValue(id: LayerId, m: FieldMetrics | null, field: FieldData, i: number): number | null {
  if (id === "slope") return field.slope[field.meta.slope.size ** 2 + i] / 100;
  if (!m) return null;
  const d = m.data;
  if (id === "now" || id === "sun") return d[i * 4];
  if (id === "earth") return d[i * 4 + 1];
  if (id === "link") return d[i * 4 + 2];
  if (id === "night") return d[i * 4 + 3];
  return null;
}

export function formatLayerValue(id: LayerId, v: number | null): string {
  if (v === null) return "";
  if (id === "night") return v < 48 ? `${Math.round(v)} h` : `${(v / 24).toFixed(1)} d`;
  if (id === "now") return v >= 0.5 ? "lit" : "shadow";
  if (id === "terrain") return "";
  return `${(v * 100).toFixed(1)}%`;
}

export function paint(id: LayerId, m: FieldMetrics | null, field: FieldData, img: ImageData) {
  const n = field.meta.horizon.size;
  const px = img.data;
  const def = layerDef(id);
  for (let i = 0; i < n * n; i++) {
    const v = layerValue(id, m, field, i);
    const o = i * 4;
    if (v === null) {
      px[o + 3] = 0;
      continue;
    }
    if (id === "now") {
      if (v >= 0.5) {
        px[o] = 255;
        px[o + 1] = 190;
        px[o + 2] = 90;
        px[o + 3] = 40;
      } else {
        px[o] = 4;
        px[o + 1] = 8;
        px[o + 2] = 22;
        px[o + 3] = 205;
      }
      continue;
    }
    const t = id === "night" ? Math.sqrt(v / NIGHT_SCALE_HOURS) : v;
    const [r, g, b] = sample(def.stops, t);
    px[o] = r;
    px[o + 1] = g;
    px[o + 2] = b;
    px[o + 3] = 215;
  }
}
