const base = `${import.meta.env.BASE_URL}data/tiles40/`;
export const MISSING = -32768;

interface TileIndex {
  tile: number;
  cellMeters: number;
  tiles: string[];
}

let indexPromise: Promise<TileIndex | null> | null = null;
const tileCache = new Map<string, Promise<Int16Array | null>>();

function loadIndex(): Promise<TileIndex | null> {
  indexPromise ??= fetch(base + "index.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return indexPromise;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function loadTile(key: string, size: number): Promise<Int16Array | null> {
  let p = tileCache.get(key);
  if (!p) {
    p = fetch(`${base}${key}.bin.gz`)
      .then(async (r) => {
        if (!r.ok) return null;
        const raw = await gunzip(new Uint8Array(await r.arrayBuffer()));
        const a = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
        for (let row = 0; row < size; row++) {
          const o = row * size;
          for (let c = 1; c < size; c++) a[o + c] += a[o + c - 1];
        }
        return a;
      })
      .catch(() => null);
    tileCache.set(key, p);
  }
  return p;
}

export interface Mosaic {
  data: Int16Array;
  width: number;
  height: number;
  x0: number;
  y0: number;
  cell: number;
  coverage: number;
}

export async function loadMosaic(xMin: number, xMax: number, yMin: number, yMax: number, onProgress?: (f: number) => void): Promise<Mosaic | null> {
  const idx = await loadIndex();
  if (!idx) return null;
  const T = idx.tile;
  const cell = idx.cellMeters;
  const span = T * cell;
  const i0 = Math.floor(xMin / span);
  const i1 = Math.floor(xMax / span);
  const j0 = Math.floor(-yMax / span);
  const j1 = Math.floor(-yMin / span);
  const have = new Set(idx.tiles);
  const keys: [number, number][] = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) keys.push([i, j]);
  let done = 0;
  const tiles = await Promise.all(
    keys.map(async ([i, j]) => {
      const key = `${i}_${j}`;
      const t = have.has(key) ? await loadTile(key, T) : null;
      done++;
      onProgress?.(done / keys.length);
      return t;
    }),
  );
  const width = (i1 - i0 + 1) * T;
  const height = (j1 - j0 + 1) * T;
  const data = new Int16Array(width * height).fill(MISSING);
  let found = 0;
  keys.forEach(([i, j], k) => {
    const t = tiles[k];
    if (!t) return;
    found++;
    const ox = (i - i0) * T;
    const oy = (j - j0) * T;
    for (let r = 0; r < T; r++) data.set(t.subarray(r * T, r * T + T), (oy + r) * width + ox);
  });
  if (found === 0) return null;
  return { data, width, height, x0: i0 * span + cell / 2, y0: -j0 * span - cell / 2, cell, coverage: found / keys.length };
}

export function mosaicHeight(m: Mosaic, x: number, y: number): number | null {
  const c = (x - m.x0) / m.cell;
  const r = (m.y0 - y) / m.cell;
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  if (c0 < 0 || r0 < 0 || c0 >= m.width - 1 || r0 >= m.height - 1) return null;
  const d = m.data;
  const w = m.width;
  const a = d[r0 * w + c0];
  const b = d[r0 * w + c0 + 1];
  const e = d[(r0 + 1) * w + c0];
  const f = d[(r0 + 1) * w + c0 + 1];
  if (a === MISSING || b === MISSING || e === MISSING || f === MISSING) return null;
  const fc = c - c0;
  const fr = r - r0;
  return a * (1 - fc) * (1 - fr) + b * fc * (1 - fr) + e * (1 - fc) * fr + f * fc * fr;
}
