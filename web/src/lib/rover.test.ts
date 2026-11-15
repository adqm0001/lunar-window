import { describe, expect, it } from "vitest";
import type { FieldData } from "../data/field";
import type { VisibilityBits } from "../gpu/engine";
import { Heap, isRoute, planRoute, type RoverParams, type RoverRoute } from "./rover";

const N = 5;
const HOURS = 48;
const WORDS = Math.ceil(HOURS / 32);

// planRoute only reads meta.horizon.size, meta.horizon.cellMeters, meta.slope.size and slope.
function makeField(slopeDeg: (col: number, row: number) => number = () => 0, n = N): FieldData {
  const slope = new Uint8Array(2 * n * n);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) slope[row * n + col] = slopeDeg(col, row) * 4; // layer 0: degrees × 4
  }
  return {
    meta: { horizon: { size: n, cellMeters: 250 }, slope: { size: n } },
    slope,
  } as unknown as FieldData;
}

// Bit h of cell c lives at sun[c·words + (h >> 5)] >>> (h & 31).
function makeBits(lit: (col: number, row: number, hour: number) => boolean, contact = lit, n = N): VisibilityBits {
  const sun = new Uint32Array(n * n * WORDS);
  const link = new Uint32Array(n * n * WORDS);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const c = row * n + col;
      for (let h = 0; h < HOURS; h++) {
        if (lit(col, row, h)) sun[c * WORDS + (h >> 5)] |= 1 << (h & 31);
        if (contact(col, row, h)) link[c * WORDS + (h >> 5)] |= 1 << (h & 31);
      }
    }
  }
  return { start: 0, hours: HOURS, words: WORDS, sun, link, millis: 0 };
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

describe("planRoute Earth-link rule", () => {
  // The issue's flat 3×3 field: a 250 m drive at 0.1 km/h takes 2.5 hours.
  const slow: RoverParams = { ...params, start: { col: 0, row: 1 }, goal: { col: 1, row: 1 }, speedKmh: 0.1, needLink: true };
  const field = () => makeField(() => 0, 3);
  const bits = (contact: (col: number, row: number, hour: number) => boolean) => makeBits(() => true, contact, 3);

  it("rejects the reported route when contact is available only at departure", () => {
    expect(isRoute(planRoute(field(), bits((_c, _r, h) => h === 0), slow))).toBe(false);
  });

  it("rejects a long drive when departure and arrival have contact but the middle hour does not", () => {
    expect(isRoute(planRoute(field(), bits((_c, _r, h) => h === 0 || h === 2), slow))).toBe(false);
  });

  it.each([0.1, 0.8])("requires contact at the destination too, at %s km/h", (speedKmh) => {
    const b = bits((col, row) => col !== slow.goal.col || row !== slow.goal.row);
    expect(isRoute(planRoute(field(), b, { ...slow, speedKmh }))).toBe(false);
  });

  it.each(["departure", "destination"])("waits out contact loss at the %s cell during a move", (end) => {
    const cell = end === "departure" ? slow.start : slow.goal;
    const b = bits((col, row, h) => col !== cell.col || row !== cell.row || h !== 1);
    const r = planRoute(field(), b, slow);
    expect(isRoute(r)).toBe(true);
    if (!isRoute(r)) return;
    expect(r.stops[0].depart).toBe(2);
    expect(r.arriveHour).toBe(4.5);
  });

  it.each([3, 31])("can wait without contact for a complete drive window starting at hour %s", (start) => {
    // Hour 31 crosses the Uint32 word boundary; only hours start..start+2 have contact.
    const r = planRoute(field(), bits((_c, _r, h) => h >= start && h <= start + 2), slow);
    expect(isRoute(r)).toBe(true);
    if (!isRoute(r)) return;
    expect(r.stops[0].depart).toBe(start);
    expect(r.arriveHour).toBe(start + 2.5);
    expect(r.waitHours).toBe(start);
    expect(r.driveHours).toBe(2.5);
  });

  it("keeps routes unrestricted when the Earth-link rule is off", () => {
    const r = planRoute(field(), bits(() => false), { ...slow, needLink: false });
    expect(isRoute(r)).toBe(true);
    if (!isRoute(r)) return;
    expect(r.arriveHour).toBe(2.5);
    expect(r.waitHours).toBe(0);
  });

  it("fails when no contact window exists", () => {
    expect(isRoute(planRoute(field(), bits(() => false), slow))).toBe(false);
  });

  it("uses the same inclusive arrival-hour convention as sunlight for an exact-hour arrival", () => {
    const b = bits((_c, _r, h) => h < 2);
    expect(isRoute(planRoute(field(), b, { ...slow, speedKmh: 0.125 }))).toBe(false);
  });
});
