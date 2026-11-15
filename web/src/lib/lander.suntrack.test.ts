import { describe, expect, it } from "vitest";
import type { Ephemeris, Site } from "../data/load";
import { sunTrack } from "./lander";

// A Sun circling the site at about 1.5e8 km, one turn per 48 hours, slightly above the equator plane.
const N = 48;
const eph = { count: N, data: new Float32Array(N * 6) } as unknown as Ephemeris;
for (let i = 0; i < N; i++) {
  const a = (2 * Math.PI * i) / N;
  eph.data.set([1.5e8 * Math.cos(a), 1.5e8 * Math.sin(a), 2e6, 0, 0, 0], i * 6);
}
const site = (over: Partial<Site> = {}): Site => ({ id: "best:1", name: "s", lat: 0, lon: 0, group: "g", terrain: false, height_m: 0, horizon: new Array(360).fill(0), ...over });
const lit = (t: { frac: Float32Array }) => t.frac.reduce((n, f) => n + (f >= 0.5 ? 1 : 0), 0);

describe("sunTrack cache", () => {
  it("does not share a track between sites with the same id and ends but a different horizon", () => {
    const flat = sunTrack(eph, site());
    const walled = sunTrack(eph, site({ horizon: new Array(360).fill(0).map((_, i) => (i === 0 ? 0 : 60)) }));
    expect(lit(flat)).toBeGreaterThan(lit(walled));
  });

  it("does not share a track between sites that differ only in height, lat or lon", () => {
    const base = sunTrack(eph, site({ id: "q" }));
    expect(sunTrack(eph, site({ id: "q", lon: 90 }))).not.toBe(base);
    expect(sunTrack(eph, site({ id: "q", lat: 45 }))).not.toBe(base);
    expect(sunTrack(eph, site({ id: "q", height_m: 5000 }))).not.toBe(base);
  });

  it("reuses the track for an identical site", () => {
    expect(sunTrack(eph, site({ id: "r" }))).toBe(sunTrack(eph, site({ id: "r" })));
  });

  it("is bounded: an old track is recomputed after many other sites", () => {
    const first = sunTrack(eph, site({ id: "old" }));
    for (let i = 0; i < 40; i++) sunTrack(eph, site({ id: "b", lon: i + 1 }));
    expect(sunTrack(eph, site({ id: "old" }))).not.toBe(first);
  });

  it("keeps a recently used track", () => {
    const keep = sunTrack(eph, site({ id: "keep", lon: 200 }));
    for (let i = 0; i < 40; i++) {
      sunTrack(eph, site({ id: "c", lon: i + 1 }));
      sunTrack(eph, site({ id: "keep", lon: 200 }));
    }
    expect(sunTrack(eph, site({ id: "keep", lon: 200 }))).toBe(keep);
  });
});
