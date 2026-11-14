// Test-only helper: loads the committed data files from web/public/data with node:fs,
// the same way src/data/load.ts does in the browser. Never import this from app code.
import fs from "node:fs";
import type { Ephemeris, Site, Station } from "../data/load";

const dataDir = new URL("../../public/data/", import.meta.url);

const readBytes = (name: string) => {
  const b = fs.readFileSync(new URL(name, dataDir));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const readJson = <T>(name: string): T => JSON.parse(fs.readFileSync(new URL(name, dataDir), "utf8")) as T;

export function loadTestEphemeris(): Ephemeris {
  const meta = readJson<{ start: string; stepHours: number; count: number; dsn: { stations: Station[] } }>("ephem.json");
  return {
    startMs: Date.parse(meta.start),
    stepHours: meta.stepHours,
    count: meta.count,
    data: new Float32Array(readBytes("ephem.bin")),
    dsn: new Int8Array(readBytes("dsn.bin")),
    stations: meta.dsn.stations,
  };
}

export function loadTestSites(): Site[] {
  return readJson<{ sites: Site[] }>("sites.json").sites;
}
