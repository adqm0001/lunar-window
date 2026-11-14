import type { FieldData } from "../data/field";
import type { FieldMetrics } from "./engine";
import { paint, type LayerId } from "./layers";

let lastKey: [LayerId, FieldMetrics | null, FieldData] | null = null;
let lastCanvas: HTMLCanvasElement | null = null;

export function overlayCanvas(layer: LayerId, metrics: FieldMetrics | null, field: FieldData | null): HTMLCanvasElement | null {
  if (!field || layer === "terrain") return null;
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
