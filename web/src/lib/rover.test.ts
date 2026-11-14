import { describe, expect, it } from "vitest";
import type { FieldData } from "../data/field";
import type { VisibilityBits } from "../gpu/engine";
import { isRoute, planRoute, type RoverParams, type RoverRoute } from "./rover";

const N = 5;
const HOURS = 48;
const WORDS = Math.ceil(HOURS / 32);

// planRoute only reads meta.horizon.size, meta.horizon.cellMeters, meta.slope.size and slope.
function makeField(slopeDeg: (col: number, row: number) => number = () => 0): FieldData {
  const slope = new Uint8Array(2 * N * N);
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) slope[row * N + col] = slopeDeg(col, row) * 4; // layer 0: degrees × 4
  }
  return {
    meta: { horizon: { size: N, cellMeters: 250 }, slope: { size: N } },
    slope,
  } as unknown as FieldData;
}

// Bit h of cell c lives at sun[c·words + (h >> 5)] >>> (h & 31).
function makeBits(lit: (col: number, row: number, hour: number) => boolean): VisibilityBits {
  const sun = new Uint32Array(N * N * WORDS);
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const c = row * N + col;
      for (let h = 0; h < HOURS; h++) {
        if (lit(col, row, h)) sun[c * WORDS + (h >> 5)] |= 1 << (h & 31);
      }
    }
  }
  return { start: 0, hours: HOURS, words: WORDS, sun, link: sun.slice(), millis: 0 };
}

const params: RoverParams = {
  start: { col: 0, row: 2 },
  goal: { col: 4, row: 2 },
  speedKmh: 0.4,
  maxSlopeDeg: 20,
  needLink: false,
};

function route(field: FieldData, bits: VisibilityBits): RoverRoute {
  const r = planRoute(field, bits, params);
  if (!isRoute(r)) throw new Error(`expected a route, got failure: ${r.reason}`);
  return r;
}

describe("planRoute", () => {
  it("drives straight across when everything is always sunlit", () => {
    const r = route(makeField(), makeBits(() => true));
    expect(r.stops).toHaveLength(5);
    expect(r.stops.map((s) => [s.col, s.row])).toEqual([[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]]);
    expect(r.waitHours).toBeCloseTo(0, 9);
    expect(r.distanceKm).toBeCloseTo(1.0, 9);
  });

  it("waits for a dark column to become sunlit before crossing it", () => {
    const r = route(makeField(), makeBits((col, _row, h) => col !== 2 || h >= 24));
    const crossing = r.stops.find((s) => s.col === 2)!;
    expect(crossing.arrive).toBeGreaterThanOrEqual(24);
    expect(r.arriveHour).toBeGreaterThanOrEqual(24);
    expect(r.waitHours).toBeGreaterThan(0);
  });

  it("detours around ground steeper than the slope limit", () => {
    // 50° on column 2 except row 0, above maxSlopeDeg = 20
    const r = route(makeField((col, row) => (col === 2 && row !== 0 ? 50 : 0)), makeBits(() => true));
    expect(r.stops).toContainEqual(expect.objectContaining({ col: 2, row: 0 }));
    expect(r.stops.filter((s) => s.col === 2 && s.row !== 0)).toEqual([]);
  });

  it("fails with a reason when a dark column always blocks the goal", () => {
    const r = planRoute(makeField(), makeBits((col) => col !== 2), params);
    expect(isRoute(r)).toBe(false);
    expect(r).toHaveProperty("reason");
    expect((r as { reason: string }).reason.length).toBeGreaterThan(0);
  });
});
