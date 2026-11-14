import type { FieldData } from "../data/field";
import type { FieldMetrics } from "../gpu/engine";

export interface ScatterPoint {
  x: number;
  y: number;
  ok: boolean;
  lived: number;
}

export interface MonteCarloResult {
  points: ScatterPoint[];
  okPct: number;
  radiusM: number;
  meanLived: number;
  worstLived: number;
}

function gauss(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

export function monteCarlo(field: FieldData, survival: FieldMetrics, x0: number, y0: number, radiusM: number, n = 4000): MonteCarloResult | null {
  const size = survival.size;
  const cell = field.meta.horizon.cellMeters;
  const E = field.meta.extentMeters;
  const sigma = radiusM / 2;
  const points: ScatterPoint[] = [];
  let ok = 0;
  let livedSum = 0;
  let worst = 1;
  for (let k = 0; k < n; k++) {
    const x = x0 + gauss() * sigma;
    const y = y0 + gauss() * sigma;
    const col = Math.floor((x + E) / cell);
    const row = Math.floor((E - y) / cell);
    if (col < 0 || row < 0 || col >= size || row >= size) continue;
    const lived = survival.data[(row * size + col) * 4];
    const good = lived >= 0.999;
    if (good) ok++;
    livedSum += lived;
    worst = Math.min(worst, lived);
    points.push({ x, y, ok: good, lived });
  }
  if (points.length === 0) return null;
  return { points, okPct: (100 * ok) / points.length, radiusM, meanLived: livedSum / points.length, worstLived: worst };
}
