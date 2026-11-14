import type { FieldData } from "../data/field";
import { customSiteAt } from "../data/field";
import type { Site } from "../data/load";
import { getEngine } from "./useFieldMetrics";

export interface FinderParams {
  startHour: number;
  missionDays: number;
  maxNightHours: number;
  minSafePct: number;
  weights: { sun: number; link: number; earth: number; flat: number };
}

export interface Candidate {
  rank: number;
  score: number;
  sun: number;
  earth: number;
  link: number;
  nightHours: number;
  safePct: number;
  x: number;
  y: number;
  site: Site;
}

export interface FinderResult {
  params: FinderParams;
  scores: Float32Array;
  candidates: Candidate[];
  evaluated: number;
  rejected: number;
  millis: number;
}

export const DEFAULT_WEIGHTS = { sun: 0.45, link: 0.3, earth: 0.1, flat: 0.15 };
const MIN_SPACING_M = 1500;
const TOP_N = 10;

export function findBestSpots(field: FieldData, params: FinderParams): FinderResult | null {
  const engine = getEngine();
  if (!engine) return null;
  const t0 = performance.now();
  const m = engine.compute(params.startHour, params.missionDays * 24, 4000);
  const n = field.meta.horizon.size;
  const cell = field.meta.horizon.cellMeters;
  const E = field.meta.extentMeters;
  const cx = field.meta.centerX ?? 0;
  const cy = field.meta.centerY ?? 0;
  const safeLayer = field.slope.subarray(n * n, 2 * n * n);
  const scores = new Float32Array(n * n);
  const w = params.weights;
  const wsum = w.sun + w.link + w.earth + w.flat || 1;
  let rejected = 0;
  for (let i = 0; i < n * n; i++) {
    const sun = m.data[i * 4];
    const earth = m.data[i * 4 + 1];
    const link = m.data[i * 4 + 2];
    const night = m.data[i * 4 + 3];
    const safe = safeLayer[i];
    if (night > params.maxNightHours || safe < params.minSafePct) {
      scores[i] = -1;
      rejected++;
      continue;
    }
    scores[i] = (w.sun * sun + w.link * link + w.earth * earth + (w.flat * safe) / 100) / wsum;
  }

  const order = Array.from(scores.keys())
    .filter((i) => scores[i] >= 0)
    .sort((a, b) => scores[b] - scores[a]);
  const picked: Candidate[] = [];
  for (const i of order) {
    if (picked.length >= TOP_N) break;
    const row = Math.floor(i / n);
    const col = i % n;
    const x = (col + 0.5) * cell - E + cx;
    const y = E - (row + 0.5) * cell + cy;
    if (picked.some((p) => Math.hypot(p.x - x, p.y - y) < MIN_SPACING_M)) continue;
    const site = customSiteAt(field, x, y);
    if (!site) continue;
    const rank = picked.length + 1;
    picked.push({
      rank,
      score: scores[i],
      sun: m.data[i * 4],
      earth: m.data[i * 4 + 1],
      link: m.data[i * 4 + 2],
      nightHours: m.data[i * 4 + 3],
      safePct: safeLayer[i],
      x,
      y,
      site: { ...site, id: `best:${rank}`, name: `Best spot #${rank}`, group: "Best landing spots" },
    });
  }
  return { params, scores, candidates: picked, evaluated: n * n, rejected, millis: performance.now() - t0 };
}
