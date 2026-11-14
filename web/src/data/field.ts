import { toMap } from "../lib/astro";

export interface FieldMeta {
  extentMeters: number;
  horizon: { size: number; cellMeters: number; azimuthBins: number; observerHeightM: number; decode: { offsetDeg: number; stepDeg: number } };
  heights: { size: number; cellMeters: number; min: number; max: number };
  slope: { size: number; cellMeters: number };
}

export interface FieldData {
  meta: FieldMeta;
  horizon: Uint8Array;
  heights: Int16Array;
  slope: Uint8Array;
}

const base = `${import.meta.env.BASE_URL}data/`;

async function fetchBytes(path: string, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(base + path);
  if (!res.ok || !res.body) throw new Error(`Couldn't load ${path} (${res.status})`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    total += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

export async function loadField(onProgress: (f: number) => void): Promise<FieldData> {
  const meta = (await (await fetch(base + "field_pole.json")).json()) as FieldMeta;
  const h = meta.horizon;
  const expected = h.size * h.size * h.azimuthBins + meta.heights.size ** 2 * 2 + meta.slope.size ** 2 * 2;
  let got = 0;
  const tick = (n: number) => {
    got += n;
    onProgress(Math.min(1, got / expected));
  };
  const [horizon, heights, slope] = await Promise.all([
    fetchBytes("field_pole.bin", tick),
    fetchBytes("heights_pole.bin", tick),
    fetchBytes("slope_pole.bin", tick),
  ]);
  return { meta, horizon: new Uint8Array(horizon), heights: new Int16Array(heights), slope: new Uint8Array(slope) };
}

export function fieldCell(f: FieldData, lat: number, lon: number): { col: number; row: number } | null {
  const [x, y] = toMap(lat, lon);
  const { size, cellMeters } = f.meta.horizon;
  const E = f.meta.extentMeters;
  const col = Math.floor((x + E) / cellMeters);
  const row = Math.floor((E - y) / cellMeters);
  if (col < 0 || row < 0 || col >= size || row >= size) return null;
  return { col, row };
}

export function fieldHorizon(f: FieldData, col: number, row: number): number[] {
  const { size, azimuthBins, decode } = f.meta.horizon;
  const out = new Array<number>(azimuthBins);
  for (let a = 0; a < azimuthBins; a++) out[a] = f.horizon[a * size * size + row * size + col] * decode.stepDeg + decode.offsetDeg;
  return out;
}

export function fieldHeight(f: FieldData, x: number, y: number): number | null {
  const { size, cellMeters } = f.meta.heights;
  const E = f.meta.extentMeters;
  const c = (x + E) / cellMeters - 0.5;
  const r = (E - y) / cellMeters - 0.5;
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  if (c0 < 0 || r0 < 0 || c0 >= size - 1 || r0 >= size - 1) return null;
  const fc = c - c0;
  const fr = r - r0;
  const z = f.heights;
  const at = (rr: number, cc: number) => z[rr * size + cc];
  return at(r0, c0) * (1 - fc) * (1 - fr) + at(r0, c0 + 1) * fc * (1 - fr) + at(r0 + 1, c0) * (1 - fc) * fr + at(r0 + 1, c0 + 1) * fc * fr;
}
