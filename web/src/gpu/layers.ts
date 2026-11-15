import type { FieldData } from "../data/field";
import type { FieldMetrics } from "./engine";

export type LayerId = "terrain" | "now" | "sun" | "earth" | "link" | "night" | "slope" | "temp" | "ice" | "score" | "survive";
export type Palette = "default" | "viridis";

export const PALETTE_LAYERS: LayerId[] = ["sun", "earth", "link", "night", "temp"];

export const THERMAL_LAYERS: LayerId[] = ["temp", "ice"];

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
export const SCORE: Stop[] = [[0, 20, 10, 40], [0.4, 110, 40, 150], [0.7, 240, 110, 90], [0.88, 255, 200, 80], [1, 255, 255, 230]];
// Green only at exactly 1: a battery that never dies (one dying in the last step still scores below 1).
export const SURVIVE: Stop[] = [[0, 120, 20, 30], [0.5, 230, 80, 60], [0.85, 255, 190, 70], [1 - 1e-6, 255, 230, 120], [1, 61, 220, 151]];
const SLOPE: Stop[] = [[0, 255, 93, 108], [0.6, 255, 200, 70], [1, 61, 220, 151]];
const TEMP: Stop[] = [[0, 30, 20, 90], [0.14, 40, 90, 220], [0.28, 60, 200, 230], [0.48, 240, 220, 90], [0.72, 250, 110, 50], [0.9, 220, 40, 60], [1, 255, 200, 220]];
const ICE: Stop[] = [[0, 20, 40, 120], [0.5, 60, 140, 255], [1, 190, 250, 255]];
// Viridis samples from https://github.com/BIDS/colormap/blob/master/colormaps.py (CC0).
const VIRIDIS: Stop[] = [
  [0, 68, 1, 84], [32 / 255, 71, 45, 123], [64 / 255, 59, 82, 139],
  [96 / 255, 44, 114, 142], [128 / 255, 33, 145, 140], [160 / 255, 40, 174, 128],
  [192 / 255, 94, 201, 98], [224 / 255, 173, 220, 48], [1, 253, 231, 37],
];
export const TEMP_MIN = 20;
export const TEMP_MAX = 400;
export const ICE_MAX_DEPTH = 0.8;

export const LAYERS: LayerDef[] = [
  { id: "terrain", label: "Terrain", short: "Terrain", ranged: false, stops: [], legend: ["", ""], describe: "LOLA shaded relief" },
  { id: "now", label: "Sunlight now", short: "Now", ranged: false, stops: [], legend: ["shadow", "lit"], describe: "Lit and shadowed ground at the current time" },
  { id: "sun", label: "Sunlight %", short: "Sun %", ranged: true, stops: SUN, legend: ["0%", "100%"], describe: "Share of time the Sun is visible" },
  { id: "earth", label: "Earth in view %", short: "Earth %", ranged: true, stops: EARTH, legend: ["0%", "100%"], describe: "Share of time Earth is above the terrain" },
  { id: "link", label: "Power + comms %", short: "Sun+DSN", ranged: true, stops: LINK, legend: ["0%", "100%"], describe: "Sun up, Earth up and a DSN dish seeing the Moon, all at once" },
  { id: "night", label: "Longest night", short: "Night", ranged: true, stops: NIGHT, legend: ["0 d", "≥ 30 d"], describe: "Longest continuous stretch without sunlight" },
  { id: "score", label: "Landing score", short: "★ Score", ranged: false, stops: SCORE, legend: ["worse", "best"], describe: "Combined score from the landing finder; dark = rejected (night too long or too steep)" },
  { id: "survive", label: "Lander survival", short: "♥ Survival", ranged: false, stops: SURVIVE, legend: ["dies day 1", "survives"], describe: "Share of the mission the chosen lander stays powered, simulated hour by hour at every point (green = survives the whole mission)" },
  { id: "temp", label: "Max surface temperature", short: "Temp", ranged: true, stops: TEMP, legend: ["20 K", "400 K"], describe: "Hottest the ground gets in the period, from a heat-flow model of the soil run for every point on your GPU (sunlight on the real slope and horizon, heat soaking into the ground, glowing back to space)" },
  { id: "ice", label: "Water ice stability", short: "❄ Ice", ranged: false, stops: ICE, legend: ["≤ 80 cm down", "at surface"], describe: "Where water ice can survive: it stays put wherever the warmest temperature all year is below 110 K. Bright = stable right at the surface, darker blue = stable once you dig down. Uses a full year of sunlight." },
  { id: "slope", label: "Safe to land", short: "Slope", ranged: false, stops: SLOPE, legend: ["steep", "flat"], describe: "Share of each 250 m cell with slope under 10°" },
];

export const layerDef = (id: LayerId, palette: Palette = "default"): LayerDef => {
  const def = LAYERS.find((l) => l.id === id)!;
  return palette === "viridis" && PALETTE_LAYERS.includes(id) ? { ...def, stops: VIRIDIS } : def;
};

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
  if (id === "temp") return d[i * 4];
  if (id === "ice") return d[i * 4 + 3];
  return null;
}

export function formatLayerValue(id: LayerId, v: number | null): string {
  if (v === null) return "";
  if (id === "night") return v < 48 ? `${Math.round(v)} h` : `${(v / 24).toFixed(1)} d`;
  if (id === "now") return v >= 0.5 ? "lit" : "shadow";
  if (id === "terrain") return "";
  if (id === "temp") return `${Math.round(v)} K (${Math.round(v - 273.15)} °C)`;
  if (id === "ice") return v < 0 ? "too warm for ice" : v === 0 ? "ice stable at the surface" : `ice stable below ${Math.round(v * 100)} cm`;
  return `${(v * 100).toFixed(1)}%`;
}

export function paintScores(scores: Float32Array, img: ImageData) {
  let max = 0;
  let min = Infinity;
  for (const v of scores) if (v >= 0) {
    max = Math.max(max, v);
    min = Math.min(min, v);
  }
  const px = img.data;
  for (let i = 0; i < scores.length; i++) {
    const o = i * 4;
    const v = scores[i];
    if (v < 0) {
      px[o] = 6;
      px[o + 1] = 6;
      px[o + 2] = 12;
      px[o + 3] = 170;
      continue;
    }
    const [r, g, b] = sample(SCORE, (v - min) / (max - min || 1));
    px[o] = r;
    px[o + 1] = g;
    px[o + 2] = b;
    px[o + 3] = 225;
  }
}

export function paintSurvival(m: FieldMetrics, img: ImageData) {
  const px = img.data;
  for (let i = 0; i < m.size * m.size; i++) {
    const [r, g, b] = sample(SURVIVE, m.data[i * 4]);
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 215;
  }
}

export function paint(id: LayerId, m: FieldMetrics | null, field: FieldData, img: ImageData, palette: Palette = "default") {
  const n = field.meta.horizon.size;
  const px = img.data;
  const def = layerDef(id, palette);
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
    if (id === "ice") {
      if (v < 0) {
        px[o] = 10;
        px[o + 1] = 8;
        px[o + 2] = 6;
        px[o + 3] = 90;
        continue;
      }
      const [r, g, b] = sample(def.stops, 1 - Math.min(1, v / ICE_MAX_DEPTH));
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 235;
      continue;
    }
    const t = id === "night" ? Math.sqrt(v / NIGHT_SCALE_HOURS) : id === "temp" ? (v - TEMP_MIN) / (TEMP_MAX - TEMP_MIN) : v;
    const [r, g, b] = sample(def.stops, t);
    px[o] = r;
    px[o + 1] = g;
    px[o + 2] = b;
    px[o + 3] = 215;
  }
}

export const GLOBAL_LAYERS: LayerId[] = ["sun", "earth", "link", "night", "temp", "ice"];

// Colors a whole-Moon grid (row 0 = north, column 0 = 180°W) with the same palettes.
export function paintGlobal(id: LayerId, data: Float32Array, w: number, h: number, img: ImageData, palette: Palette = "default") {
  const def = layerDef(id, palette);
  const px = img.data;
  const ch = id === "sun" || id === "temp" ? 0 : id === "earth" ? 1 : id === "link" ? 2 : 3;
  for (let i = 0; i < w * h; i++) {
    const v = data[i * 4 + ch];
    const o = i * 4;
    if (id === "ice") {
      if (v < 0) {
        px[o + 3] = 0;
        continue;
      }
      const [r, g, b] = sample(def.stops, 1 - Math.min(1, v / ICE_MAX_DEPTH));
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 240;
      continue;
    }
    const t = id === "night" ? Math.sqrt(v / NIGHT_SCALE_HOURS) : id === "temp" ? (v - TEMP_MIN) / (TEMP_MAX - TEMP_MIN) : v;
    const [r, g, b] = sample(def.stops, t);
    px[o] = r;
    px[o + 1] = g;
    px[o + 2] = b;
    px[o + 3] = 215;
  }
}
