import { describe, expect, it } from "vitest";
import type { FieldData } from "../data/field";
import type { VisibilityBits } from "../gpu/engine";
import { Heap, isRoute, planRoute, type RoverParams, type RoverRoute } from "./rover";

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

describe("Heap", () => {
  it("pops keys in priority order, including after a key is re-pushed with a lower priority", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let t = 0; t < 500; t++) {
      const n = 3 + Math.floor(rnd() * 30);
      const heap = new Heap();
      const best = new Map<number, number>();
      const ops = 5 + Math.floor(rnd() * 60);
      for (let i = 0; i < ops; i++) {
        const key = Math.floor(rnd() * n);
        const pri = Math.floor(rnd() * 1000);
        const cur = best.get(key);
        if (cur === undefined || pri < cur) {
          best.set(key, pri); // decrease-key by re-push, as planRoute does
          heap.push(key, pri);
        }
      }
      const seen = new Set<number>();
      const pris: number[] = [];
      while (heap.size) {
        const k = heap.pop();
        if (seen.has(k)) continue; // stale duplicate of a key already popped
        seen.add(k);
        pris.push(best.get(k)!);
      }
      expect(seen.size).toBe(best.size);
      expect(pris).toEqual([...pris].sort((a, b) => a - b));
    }
  });
});

describe("planRoute shadow during a long move", () => {
  // 2 x 2 km hop at 0.1 km/h: the 250 m step takes 2.5 h, so it spans hours 0, 1 and 2.
  const slow: RoverParams = { ...params, speedKmh: 0.1, start: { col: 0, row: 2 }, goal: { col: 1, row: 2 } };

  it("does not drive through a cell that goes dark in an hour the move spans", () => {
    // goal is lit at hours 0 and 2 (departure and arrival) but dark at hour 1, then lit again from hour 4
    const bits = makeBits((col, _row, h) => col !== 1 || h === 0 || h === 2 || h >= 4);
    const r = planRoute(makeField(), bits, slow);
    expect(isRoute(r)).toBe(true);
    if (!isRoute(r)) return;
    const move = r.stops[1];
    const dep = r.stops[0].depart;
    for (let h = Math.floor(dep); h <= Math.floor(move.arrive); h++) {
      expect(h === 1 || h === 3).toBe(false);
    }
  });

  it("does not leave a cell that goes dark while the rover is still driving away from it", () => {
    const bits = makeBits((col, _row, h) => col !== 0 || h < 1 || h >= 4);
    const r = planRoute(makeField(), bits, slow);
    expect(isRoute(r)).toBe(true);
    if (!isRoute(r)) return;
    const dep = r.stops[0].depart;
    expect(dep).toBeGreaterThanOrEqual(4);
  });
});

describe("planRoute destination slope", () => {
  const adjacent: RoverParams = { ...params, start: { col: 0, row: 1 }, goal: { col: 1, row: 1 } };
  const allLit = () => {
    const bits = makeBits(() => true);
    return { ...bits, sun: bits.sun.slice(0, 9 * WORDS), link: bits.link.slice(0, 9 * WORDS) };
  };
  const destinationField = (slopeDeg: number) => {
    const field = makeField();
    field.meta.horizon.size = 3;
    field.meta.slope.size = 3;
    field.slope = new Uint8Array(18);
    field.slope[4] = slopeDeg * 4; // The goal (1,1); every other cell is flat.
    return field;
  };

  it("rejects the reported 50-degree destination with a 20-degree limit", () => {
    const r = planRoute(destinationField(50), allLit(), adjacent);
    expect(isRoute(r)).toBe(false);
    if (!isRoute(r)) expect(r.reason).toMatch(/destination.*steep/i);
  });

  it.each([15, 20, 25])("rejects a destination one encoded step above the %s-degree limit", (limit) => {
    const r = planRoute(destinationField(limit + 0.25), allLit(), { ...adjacent, maxSlopeDeg: limit });
    expect(isRoute(r)).toBe(false);
  });

  it.each([15, 20, 25])("allows a destination exactly at the %s-degree limit", (limit) => {
    const r = planRoute(destinationField(limit), allLit(), { ...adjacent, maxSlopeDeg: limit });
    expect(isRoute(r)).toBe(true);
    if (!isRoute(r)) return;
    expect(r.distanceKm).toBe(0.25);
    expect(r.arriveHour).toBe(0.625);
  });

  it("allows a previously rejected destination after the user raises the limit enough", () => {
    const field = destinationField(20.25);
    expect(isRoute(planRoute(field, allLit(), { ...adjacent, maxSlopeDeg: 20 }))).toBe(false);
    expect(isRoute(planRoute(field, allLit(), { ...adjacent, maxSlopeDeg: 25 }))).toBe(true);
  });

  it("allows a zero-distance result on steep ground because no drive is needed", () => {
    const r = planRoute(destinationField(50), allLit(), { ...adjacent, start: adjacent.goal });
    expect(isRoute(r)).toBe(true);
    if (!isRoute(r)) return;
    expect(r.distanceKm).toBe(0);
    expect(r.driveHours).toBe(0);
    expect(r.arriveHour).toBe(0);
  });
});
