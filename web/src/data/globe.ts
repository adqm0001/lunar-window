import { toMap } from "../lib/astro";

export interface GlobeData {
  globe: Int16Array;
  width: number;
  height: number;
  ppd: number;
  step: number;
  polar: Int16Array;
  polarSize: number;
  polarCell: number;
  polarFirst: number;
  p80: Int16Array;
  p80Size: number;
  p80Cell: number;
  p80First: number;
  color: HTMLImageElement;
}

const base = `${import.meta.env.BASE_URL}data/`;

async function gunzipFetch(path: string): Promise<Uint8Array> {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function undelta(bytes: Uint8Array, width: number): Int16Array {
  const a = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  for (let r = 0; r < a.length / width; r++) {
    const o = r * width;
    for (let c = 1; c < width; c++) a[o + c] += a[o + c - 1];
  }
  return a;
}

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${path}`));
    img.src = base + path;
  });
}

let fullColorFile: string | null = null;

export async function loadGlobe(): Promise<GlobeData> {
  const meta = await (await fetch(base + "globe.json")).json();
  // The 80 m polar terrain is fetched afterwards (startPolar80) and the colour map starts as the 100 KB preview
  // (the 7 MB full map follows via loadFullColor), so the Moon appears sooner.
  const colorFile: string = meta.color.preview ?? meta.color.file;
  fullColorFile = colorFile === meta.color.file ? null : meta.color.file;
  const [g, p, color] = await Promise.all([gunzipFetch(meta.globe.file), gunzipFetch(meta.polar.file), loadImage(colorFile)]);
  polar80Meta = meta.polar80;
  return {
    globe: undelta(g, meta.globe.width),
    width: meta.globe.width,
    height: meta.globe.height,
    ppd: meta.globe.pixelsPerDegree,
    step: meta.globe.stepMeters,
    polar: undelta(p, meta.polar.size),
    polarSize: meta.polar.size,
    polarCell: meta.polar.cellMeters,
    polarFirst: meta.polar.firstCenterMeters,
    p80: new Int16Array(4).fill(-32768),
    p80Size: 2,
    p80Cell: meta.polar80.cellMeters,
    p80First: meta.polar80.firstCenterMeters,
    color,
  };
}

/** The full-size colour map that replaces the preview loadGlobe started with, or null if it already has it. */
export async function loadFullColor(): Promise<HTMLImageElement | null> {
  return fullColorFile ? loadImage(fullColorFile) : null;
}

export const P80_MISSING = -32768;

interface Polar80Meta {
  file: string;
  size: number;
  cellMeters: number;
  firstCenterMeters: number;
  tiles?: number;
  tile?: number;
  tileDir?: string;
}

let polar80Meta: Polar80Meta | null = null;

/** One 80 m polar tile, already decoded, placed at grid column x0 / row y0 (row 0 = +y). */
export interface Polar80Tile {
  x0: number;
  y0: number;
  w: number;
  h: number;
  data: Int16Array;
}

export interface Polar80Hooks {
  /** Polar map position (metres) to load around first, or null to start at the pole. */
  focus: () => [number, number] | null;
  /** Called once the full-size (still empty) grid exists on the globe. */
  onStart: () => void;
  /** Called after each tile has been copied into the globe's grid. */
  onTile: (t: Polar80Tile) => void;
}

const P80_MAX_IN_FLIGHT = 4;

// Streams the 80 m polar terrain tile by tile, nearest to the camera first, into a full-size grid on
// the globe (missing until its tile arrives). Falls back to the single file if the tiles aren't listed.
export async function startPolar80(g: GlobeData, hooks: Polar80Hooks): Promise<boolean> {
  const m = polar80Meta;
  if (!m) return false;
  if (!m.tiles || !m.tile || !m.tileDir) {
    const ok = await loadPolar80(g);
    if (ok) {
      hooks.onStart();
      hooks.onTile({ x0: 0, y0: 0, w: m.size, h: m.size, data: g.p80 });
    }
    return ok;
  }
  const n = m.size;
  const per = m.tile;
  const count = m.tiles;
  g.p80 = new Int16Array(n * n).fill(P80_MISSING);
  g.p80Size = n;
  g.p80Cell = m.cellMeters;
  g.p80First = m.firstCenterMeters;
  hooks.onStart();

  const pending = new Set<number>();
  for (let ty = 0; ty < count; ty++) for (let tx = 0; tx < count; tx++) pending.add(ty * count + tx);
  const centre = (key: number): [number, number] => {
    const tx = key % count;
    const ty = (key - tx) / count;
    const c = Math.min(n, tx * per + per / 2);
    const r = Math.min(n, ty * per + per / 2);
    return [m.firstCenterMeters + c * m.cellMeters, -m.firstCenterMeters - r * m.cellMeters];
  };
  const next = (): number | null => {
    if (!pending.size) return null;
    const [fx, fy] = hooks.focus() ?? [0, 0];
    let best = -1;
    let bestD = Infinity;
    for (const k of pending) {
      const [x, y] = centre(k);
      const d = (x - fx) ** 2 + (y - fy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    pending.delete(best);
    return best;
  };
  const fetchTile = async (key: number) => {
    const tx = key % count;
    const ty = (key - tx) / count;
    const x0 = tx * per;
    const y0 = ty * per;
    const w = Math.min(per, n - x0);
    const h = Math.min(per, n - y0);
    const bytes = await gunzipFetch(`${m.tileDir}/${ty}_${tx}.bin.gz`);
    const data = undelta(bytes, w);
    for (let r = 0; r < h; r++) g.p80.set(data.subarray(r * w, (r + 1) * w), (y0 + r) * n + x0);
    hooks.onTile({ x0, y0, w, h, data });
  };
  const worker = async () => {
    for (let k = next(); k !== null; k = next()) {
      try {
        await fetchTile(k);
      } catch (e) {
        console.warn(`80 m polar tile ${k} failed to load:`, (e as Error).message);
      }
    }
  };
  await Promise.all(Array.from({ length: P80_MAX_IN_FLIGHT }, worker));
  return true;
}

// Fills in the 80 m polar terrain on an already-loaded globe from the single file (in place).
export async function loadPolar80(g: GlobeData): Promise<boolean> {
  if (!polar80Meta) return false;
  const bytes = await gunzipFetch(polar80Meta.file);
  g.p80 = undelta(bytes, polar80Meta.size);
  g.p80Size = polar80Meta.size;
  g.p80Cell = polar80Meta.cellMeters;
  g.p80First = polar80Meta.firstCenterMeters;
  return true;
}

function p80Height(g: GlobeData, x: number, y: number): number | null {
  const c = (x - g.p80First) / g.p80Cell;
  const r = (-g.p80First - y) / g.p80Cell;
  const n = g.p80Size;
  if (c < 0 || r < 0 || c >= n - 1 || r >= n - 1) return null;
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  const z = g.p80;
  const a = z[r0 * n + c0];
  const b = z[r0 * n + c0 + 1];
  const d = z[(r0 + 1) * n + c0];
  const e = z[(r0 + 1) * n + c0 + 1];
  if (a === P80_MISSING || b === P80_MISSING || d === P80_MISSING || e === P80_MISSING) return null;
  const fc = c - c0;
  const fr = r - r0;
  return a * (1 - fc) * (1 - fr) + b * fc * (1 - fr) + d * (1 - fc) * fr + e * fc * fr;
}

export function globeHeight(g: GlobeData, lat: number, lon: number): number {
  if (lat < -81) {
    const [x, y] = toMap(lat, lon);
    const h = p80Height(g, x, y);
    if (h !== null) return h;
  }
  if (lat < -82) {
    const [x, y] = toMap(lat, lon);
    const c = (x - g.polarFirst) / g.polarCell;
    const r = (-g.polarFirst - y) / g.polarCell;
    const n = g.polarSize;
    if (c >= 0 && r >= 0 && c < n - 1 && r < n - 1) {
      const c0 = Math.floor(c);
      const r0 = Math.floor(r);
      const fc = c - c0;
      const fr = r - r0;
      const z = g.polar;
      return (
        z[r0 * n + c0] * (1 - fc) * (1 - fr) + z[r0 * n + c0 + 1] * fc * (1 - fr) + z[(r0 + 1) * n + c0] * (1 - fc) * fr + z[(r0 + 1) * n + c0 + 1] * fc * fr
      );
    }
  }
  const w = g.width;
  const h = g.height;
  const fx = ((((lon % 360) + 360) % 360) * g.ppd) - 0.5;
  const fy = (90 - lat) * g.ppd - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.max(0, Math.min(h - 2, Math.floor(fy)));
  const tx = fx - x0;
  const ty = Math.max(0, Math.min(1, fy - y0));
  const xa = ((x0 % w) + w) % w;
  const xb = (xa + 1) % w;
  const z = g.globe;
  const v = z[y0 * w + xa] * (1 - tx) * (1 - ty) + z[y0 * w + xb] * tx * (1 - ty) + z[(y0 + 1) * w + xa] * (1 - tx) * ty + z[(y0 + 1) * w + xb] * tx * ty;
  return v * g.step;
}
