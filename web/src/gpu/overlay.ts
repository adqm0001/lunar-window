import type { FieldData } from "../data/field";
import type { FieldMetrics } from "./engine";
import { paint, paintScores, paintSurvival, type LayerId } from "./layers";
import type { FinderResult } from "./finder";

let lastKey: [LayerId, FieldMetrics | null, FieldData] | null = null;
let lastCanvas: HTMLCanvasElement | null = null;

let lastScores: Float32Array | null = null;
let lastScoreCanvas: HTMLCanvasElement | null = null;

let lastSurv: FieldMetrics | null = null;
let lastSurvCanvas: HTMLCanvasElement | null = null;

export function overlayCanvas(
  layer: LayerId,
  metrics: FieldMetrics | null,
  field: FieldData | null,
  finder?: FinderResult | null,
  survival?: FieldMetrics | null,
): HTMLCanvasElement | null {
  if (!field || layer === "terrain") return null;
  if (layer === "survive") {
    if (!survival) return null;
    if (lastSurv === survival) return lastSurvCanvas;
    const c = document.createElement("canvas");
    c.width = survival.size;
    c.height = survival.size;
    const g = c.getContext("2d")!;
    const img = g.createImageData(survival.size, survival.size);
    paintSurvival(survival, img);
    g.putImageData(img, 0, 0);
    lastSurv = survival;
    lastSurvCanvas = c;
    return c;
  }
  if (layer === "score") {
    if (!finder) return null;
    if (lastScores === finder.scores) return lastScoreCanvas;
    const n = field.meta.horizon.size;
    const c = document.createElement("canvas");
    c.width = n;
    c.height = n;
    const g = c.getContext("2d")!;
    const img = g.createImageData(n, n);
    paintScores(finder.scores, img);
    g.putImageData(img, 0, 0);
    lastScores = finder.scores;
    lastScoreCanvas = c;
    return c;
  }
  if (layer !== "slope" && !metrics) return null;
  if (lastKey && lastKey[0] === layer && lastKey[1] === metrics && lastKey[2] === field) return lastCanvas;
  const n = field.meta.horizon.size;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const g = c.getContext("2d")!;
  const img = g.createImageData(n, n);
  paint(layer, metrics, field, img);
  g.putImageData(img, 0, 0);
  lastKey = [layer, metrics, field];
  lastCanvas = c;
  return c;
}
