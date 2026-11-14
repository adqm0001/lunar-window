import type { Vec3 } from "../lib/astro";

export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  group: string;
  terrain: boolean;
  height_m: number;
  horizon: number[];
  published?: { lat: number; lon: number; sunlit_pct: number; source: string };
  computedMs?: number;
}

export interface Station {
  name: string;
  lat: number;
  lon: number;
}

export interface Ephemeris {
  startMs: number;
  stepHours: number;
  count: number;
  data: Float32Array;
  dsn: Int8Array;
  stations: Station[];
}

export interface Basemap {
  image: HTMLImageElement;
  extentMeters: number;
}

export interface AppData {
  ephem: Ephemeris;
  sites: Site[];
  basemap: Basemap;
}

const base = `${import.meta.env.BASE_URL}data/`;

async function fetchWithProgress(path: string, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(base + path);
  if (!res.ok || !res.body) throw new Error(`Couldn't load ${path} (${res.status})`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out.buffer;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${path}`));
    img.src = base + path;
  });
}

const EXPECTED_BYTES = 631296 + 78912;

export async function loadAppData(onProgress: (fraction: number, label: string) => void): Promise<AppData> {
  let bytes = 0;
  const tick = (label: string) => (n: number) => {
    bytes += n;
    onProgress(Math.min(0.95, bytes / EXPECTED_BYTES), label);
  };
  onProgress(0, "Ephemeris");
  const meta = await fetchJson<{ start: string; stepHours: number; count: number; dsn: { stations: Station[] } }>("ephem.json");
  const [ephemBuf, dsnBuf, sitesJson, image, basemapMeta] = await Promise.all([
    fetchWithProgress("ephem.bin", tick("Sun and Earth positions")),
    fetchWithProgress("dsn.bin", tick("Deep Space Network")),
    fetchJson<{ sites: Site[] }>("sites.json"),
    loadImage("basemap.png"),
    fetchJson<{ extentMeters: number }>("basemap.json"),
  ]);
  onProgress(1, "Ready");
  return {
    ephem: {
      startMs: Date.parse(meta.start),
      stepHours: meta.stepHours,
      count: meta.count,
      data: new Float32Array(ephemBuf),
      dsn: new Int8Array(dsnBuf),
      stations: meta.dsn.stations,
    },
    sites: sitesJson.sites,
    basemap: { image, extentMeters: basemapMeta.extentMeters },
  };
}

export function ephemAt(e: Ephemeris, hour: number): { sun: Vec3; earth: Vec3 } {
  const h = Math.max(0, Math.min(e.count - 1.0001, hour));
  const i = Math.floor(h);
  const f = h - i;
  const a = e.data;
  const o0 = i * 6;
  const o1 = (i + 1) * 6;
  const lerp = (k: number) => a[o0 + k] * (1 - f) + a[o1 + k] * f;
  return { sun: [lerp(0), lerp(1), lerp(2)], earth: [lerp(3), lerp(4), lerp(5)] };
}

export function dsnAt(e: Ephemeris, hour: number): number[] {
  const i = Math.max(0, Math.min(e.count - 1, Math.round(hour)));
  const n = e.stations.length;
  return Array.from(e.dsn.subarray(i * n, i * n + n));
}
