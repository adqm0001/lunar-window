import { toLatLon, toMap } from "../lib/astro";
import type { Site } from "./load";

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

async function fetchBytes(path: string, onBytes: (n: number, total: number) => void): Promise<Uint8Array> {
  const res = await fetch(base + path);
  if (!res.ok || !res.body) throw new Error(`Couldn't load ${path} (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onBytes(value.length, total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const APPROX_BYTES = 6_300_000 + 2_150_000 + 130_000;

export async function loadField(onProgress: (f: number) => void): Promise<FieldData> {
  const meta = (await (await fetch(base + "field_pole.json")).json()) as FieldMeta & { horizon: { file: string }; heights: { file: string }; slope: { file: string } };
  let got = 0;
  const tick = (n: number) => {
    got += n;
    onProgress(Math.min(0.99, got / APPROX_BYTES));
  };
  const [h, z, s] = await Promise.all([fetchBytes(meta.horizon.file, tick), fetchBytes(meta.heights.file, tick), fetchBytes(meta.slope.file, tick)]);
  const [horizon, heights, slope] = await Promise.all([gunzip(h), gunzip(z), gunzip(s)]);
  const layer = meta.horizon.size * meta.horizon.size;
  for (let a = 1; a < meta.horizon.azimuthBins; a++) {
    const o = a * layer;
    const p = o - layer;
    for (let i = 0; i < layer; i++) horizon[o + i] = (horizon[o + i] + horizon[p + i]) & 255;
  }
  onProgress(1);
  return { meta, horizon, heights: new Int16Array(heights.buffer, heights.byteOffset, heights.byteLength / 2), slope };
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

export function customSiteAt(f: FieldData, x: number, y: number): Site | null {
  const [lat, lon] = toLatLon(x, y);
  const cell = fieldCell(f, lat, lon);
  if (!cell) return null;
  return {
    id: `custom:${lat.toFixed(4)},${lon.toFixed(4)}`,
    name: "Custom point",
    lat,
    lon,
    group: "Custom",
    terrain: true,
    height_m: fieldHeight(f, x, y) ?? 0,
    horizon: fieldHorizon(f, cell.col, cell.row),
  };
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
