import { uniqueFeatures, type ArtemisRegion } from "../data/artemis";
import { POLAR_EXTENT_M, type GlobalMetrics } from "../gpu/globalLayers";
import { R_MOON_M } from "./astro";

// Scores each Artemis III candidate region from the whole-Moon results: averages over the
// region's footprint (south polar grid, ~1.4 km cells) plus the single best spot inside it.

export interface RegionRow {
  region: ArtemisRegion;
  cells: number;
  sunAvg: number;
  sunBest: number;
  earthAvg: number;
  linkAvg: number;
  linkBest: number;
  nightBestH: number;
  iceArea: number;
  best: { lat: number; lon: number };
  score: number;
}

function toPolar(lat: number, lon: number): [number, number] {
  const colat = ((90 + lat) * Math.PI) / 180;
  const k = 2 * R_MOON_M * Math.tan(colat / 2);
  return [k * Math.sin((lon * Math.PI) / 180), k * Math.cos((lon * Math.PI) / 180)];
}

function fromPolar(x: number, y: number): [number, number] {
  const colat = 2 * Math.atan(Math.hypot(x, y) / (2 * R_MOON_M));
  return [-(90 - (colat * 180) / Math.PI), (Math.atan2(x, y) * 180) / Math.PI];
}

export function regionReport(light: GlobalMetrics, thermal: GlobalMetrics): RegionRow[] {
  const L = light.grids.find((g) => g.id === "south")!;
  const T = thermal.grids.find((g) => g.id === "south")!;
  const n = L.w;
  const cell = (2 * POLAR_EXTENT_M) / n;
  const rows: RegionRow[] = [];
  for (const r of uniqueFeatures()) {
    const [cx, cy] = toPolar(r.lat, r.lon);
    const rad = (r.diameterKm / 2) * 1000;
    const c0 = Math.floor((cx - rad + POLAR_EXTENT_M) / cell);
    const c1 = Math.ceil((cx + rad + POLAR_EXTENT_M) / cell);
    const r0 = Math.floor((POLAR_EXTENT_M - (cy + rad)) / cell);
    const r1 = Math.ceil((POLAR_EXTENT_M - (cy - rad)) / cell);
    let count = 0;
    let sun = 0;
    let earth = 0;
    let link = 0;
    let ice = 0;
    let best = -1;
    let bestScore = -1;
    for (let row = Math.max(0, r0); row <= Math.min(n - 1, r1); row++) {
      for (let col = Math.max(0, c0); col <= Math.min(n - 1, c1); col++) {
        const x = (col + 0.5) * cell - POLAR_EXTENT_M;
        const y = POLAR_EXTENT_M - (row + 0.5) * cell;
        if (Math.hypot(x - cx, y - cy) > rad) continue;
        const i = (row * n + col) * 4;
        count++;
        sun += L.data[i];
        earth += L.data[i + 1];
        link += L.data[i + 2];
        if (T.data[i + 3] >= 0) ice++;
        const s = 0.6 * L.data[i] + 0.4 * L.data[i + 2];
        if (s > bestScore) {
          bestScore = s;
          best = row * n + col;
        }
      }
    }
    if (!count || best < 0) continue;
    const bc = best % n;
    const br = (best - bc) / n;
    const [blat, blon] = fromPolar((bc + 0.5) * cell - POLAR_EXTENT_M, POLAR_EXTENT_M - (br + 0.5) * cell);
    const bi = best * 4;
    const row: RegionRow = {
      region: r,
      cells: count,
      sunAvg: sun / count,
      sunBest: L.data[bi],
      earthAvg: earth / count,
      linkAvg: link / count,
      linkBest: L.data[bi + 2],
      nightBestH: L.data[bi + 3],
      iceArea: ice / count,
      best: { lat: blat, lon: blon },
      score: 0,
    };
    // landing quality at the best spot, plus a little credit for nearby ice (the reason to go)
    row.score = 0.5 * row.sunBest + 0.3 * row.linkBest + 0.1 * Math.min(1, row.iceArea * 4) + 0.1 * (1 - Math.min(1, row.nightBestH / (24 * 15)));
    rows.push(row);
  }
  rows.sort((a, b) => b.score - a.score);
  return rows;
}
