const base = `${import.meta.env.BASE_URL}data/tiles64/`;
const TILE = 480;
const PPD = 64;
const COLS = 48;
const ROWS = 24;
const MAX_INFLIGHT = 6;

type Entry = Int16Array | "loading" | "missing";
const tiles = new Map<number, Entry>();
const listeners = new Set<(key: number) => void>();
const waiting: number[] = [];
let inflight = 0;

export const tileKey = (tx: number, ty: number) => ty * COLS + tx;

export function onGlobalTile(cb: (key: number) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function pump() {
  while (inflight < MAX_INFLIGHT && waiting.length) {
    const key = waiting.shift()!;
    inflight++;
    const tx = key % COLS;
    const ty = Math.floor(key / COLS);
    fetch(`${base}${tx}_${ty}.bin.gz`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const raw = await gunzip(new Uint8Array(await r.arrayBuffer()));
        const a = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
        for (let row = 0; row < TILE; row++) {
          const o = row * TILE;
          for (let c = 1; c < TILE; c++) a[o + c] += a[o + c - 1];
        }
        tiles.set(key, a);
        listeners.forEach((cb) => cb(key));
      })
      .catch(() => tiles.set(key, "missing"))
      .finally(() => {
        inflight--;
        pump();
      });
  }
}

export function getGlobalTile(key: number): Int16Array | null {
  const t = tiles.get(key);
  return t instanceof Int16Array ? t : null;
}

export function requestGlobalTile(key: number) {
  if (tiles.has(key)) return;
  tiles.set(key, "loading");
  waiting.push(key);
  pump();
}

function px(lat: number, lon: number): [number, number] {
  return [((((lon % 360) + 360) % 360) * PPD) - 0.5, (90 - lat) * PPD - 0.5];
}

export function tileFor(lat: number, lon: number): number {
  const [x, y] = px(lat, lon);
  const tx = Math.min(COLS - 1, Math.max(0, Math.floor(Math.max(0, x) / TILE)));
  const ty = Math.min(ROWS - 1, Math.max(0, Math.floor(Math.max(0, y) / TILE)));
  return tileKey(tx, ty);
}

let lastMissing = -1;

export function lastMissingGlobal64() {
  return lastMissing;
}

function pix(gx: number, gy: number): number | null {
  const W = COLS * TILE;
  const x = ((gx % W) + W) % W;
  const y = Math.max(0, Math.min(ROWS * TILE - 1, gy));
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const key = tileKey(tx, ty);
  const t = tiles.get(key);
  if (!(t instanceof Int16Array)) {
    lastMissing = key;
    return null;
  }
  return t[(y - ty * TILE) * TILE + (x - tx * TILE)];
}

export function sampleGlobal64(lat: number, lon: number): number | null {
  const [x, y] = px(lat, lon);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  lastMissing = -1;
  const a = pix(x0, y0);
  const b = pix(x0 + 1, y0);
  const c = pix(x0, y0 + 1);
  const d = pix(x0 + 1, y0 + 1);
  if (a === null || b === null || c === null || d === null) return null;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}
