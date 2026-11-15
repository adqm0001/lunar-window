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

export interface AppData {
  ephem: Ephemeris;
  sites: Site[];
  /** Set when the app was opened as a historical replay (`?replay=<id>`): the ephemeris is that replay's. */
  replay: Replay | null;
}

/** A historical replay: its own ephemeris files (pipeline/ephemeris.py), the moment it starts at and its site. */
export interface Replay {
  id: string;
  name: string;
  /** ephem<suffix>.json / .bin, with the DSN file named in that metadata */
  suffix: string;
  startUtc: string;
  siteId: string;
}

export const REPLAYS: Record<string, Replay> = {
  im2: {
    id: "im2",
    name: "IM-2",
    suffix: "_2025",
    // Athena touched down at about 11:30 a.m. CST (17:30 UTC) on 6 March 2025: Intuitive Machines, "Intuitive
    // Machines Lands and Operates Second Mission on the Moon", 6 March 2025,
    // https://investors.intuitivemachines.com/news-releases/news-release-details/intuitive-machines-lands-and-operates-second-mission-moon
    // (NASA's coverage advisory listed landing at 12:30 p.m. EST, the same time). It came down on its side in a
    // crater about 250 m from this target, and with "the direction of the Sun, the orientation of the solar panels,
    // and extreme cold temperatures in the crater" did not recharge (Intuitive Machines, 7 March 2025).
    startUtc: "2025-03-06T17:30:00Z",
    siteId: "im2-athena",
  },
};

/** The replay named in the page URL (`?replay=im2`), if any. */
export function replayFromUrl(): Replay | null {
  const id = new URLSearchParams(location.search).get("replay");
  return (id && REPLAYS[id]) || null;
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

export async function loadAppData(onProgress: (fraction: number, label: string) => void): Promise<AppData> {
  const replay = replayFromUrl();
  const suffix = replay?.suffix ?? "";
  onProgress(0, "Ephemeris");
  const meta = await fetchJson<{ start: string; stepHours: number; count: number; dsn: { stations: Station[]; file?: string } }>(`ephem${suffix}.json`);
  // float32 x 6 per hour for the vectors, one int8 per station per hour for DSN
  const expectedBytes = meta.count * (24 + meta.dsn.stations.length);
  let bytes = 0;
  const tick = (label: string) => (n: number) => {
    bytes += n;
    onProgress(Math.min(0.95, bytes / expectedBytes), label);
  };
  const [ephemBuf, dsnBuf, sitesJson] = await Promise.all([
    fetchWithProgress(`ephem${suffix}.bin`, tick("Sun and Earth positions")),
    fetchWithProgress(meta.dsn.file ?? `dsn${suffix}.bin`, tick("Deep Space Network")),
    fetchJson<{ sites: Site[] }>("sites.json"),
  ]);
  onProgress(1, "Ready");
  return {
    replay,
    ephem: {
      startMs: Date.parse(meta.start),
      stepHours: meta.stepHours,
      count: meta.count,
      data: new Float32Array(ephemBuf),
      dsn: new Int8Array(dsnBuf),
      stations: meta.dsn.stations,
    },
    sites: sitesJson.sites,
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
