import { describe, expect, it } from "vitest";
import type { Ephemeris, Site } from "../data/load";
import type { FieldData } from "../data/field";
import { batteryDead, chargePct, simulate, sunTrack, survivalInputs, survivalMapCell, survivedFraction, survivedMission, type Lander } from "./lander";
import { monteCarlo } from "./montecarlo";

// A 500 m field of 4 x 4 cells and a survival map with the same output in every cell: [lived, lowest charge,
// sunlight, diedAt], as the GPU writes it.
const field = { meta: { extentMeters: 500, horizon: { cellMeters: 250 } } } as unknown as FieldData;
const uniform = (cell: number[]) => ({ size: 4, hours: 4, stride: 1, millis: 0, data: new Float32Array(16 * 4).map((_, i) => cell[i % 4]) });

// The Sun straight overhead (lit) or straight below (dark) a site on the equator at longitude 0, so a flat panel
// gets its full rating or nothing, with no geometry in between.
const SUN_KM = 1.5e8;
function ephem(lit: boolean[]): Ephemeris {
  const data = new Float32Array(lit.length * 6);
  lit.forEach((l, i) => {
    data[i * 6] = l ? SUN_KM : -SUN_KM;
    data[i * 6 + 3] = 3.8e5;
  });
  return { startMs: 0, stepHours: 1, count: lit.length, data, dsn: new Int8Array(lit.length), stations: [] };
}
const site = (id: string): Site => ({ id, name: id, lat: 0, lon: 0, group: "test", terrain: false, height_m: 0, horizon: [0, 0, 0, 0] });
const hours = (n: number, lit: boolean) => new Array<boolean>(n).fill(lit);
const flat = (patch: Partial<Lander>): Lander => ({ name: "Edge case", panelW: 0, panel: "horizontal", panelAz: 0, batteryWh: 100, dayLoadW: 1, nightLoadW: 1, minSocPct: 0, ...patch });

interface Scenario {
  name: string;
  lit: boolean[];
  lander: Lander;
  /** The hour the battery dies in (1-based), or null when it lasts the whole mission. */
  diedAtHour: number | null;
}

const ZERO = { batteryWh: 0, panelW: 600, dayLoadW: 220, nightLoadW: 90, minSocPct: 10 };
const SCENARIOS: Scenario[] = [
  { name: "dies in the final hour", lit: hours(4, false), lander: flat({ batteryWh: 4 }), diedAtHour: 4 },
  { name: "lasts the whole mission with 1 Wh to spare", lit: hours(4, false), lander: flat({ batteryWh: 5 }), diedAtHour: null },
  { name: "90-day mission dying 2 h early", lit: hours(2160, false), lander: flat({ batteryWh: 2158 }), diedAtHour: 2158 },
  { name: "90-day mission dying in the final hour", lit: hours(2160, false), lander: flat({ batteryWh: 2160 }), diedAtHour: 2160 },
  { name: "zero battery, sunlit then dark", lit: [...hours(2, true), ...hours(2, false)], lander: flat(ZERO), diedAtHour: 3 },
  { name: "zero battery, dark from the start", lit: hours(3, false), lander: flat(ZERO), diedAtHour: 1 },
  { name: "zero battery, sunlit all mission", lit: hours(3, true), lander: flat(ZERO), diedAtHour: null },
];

describe.each(SCENARIOS)("battery edge case: $name", ({ name, lit, lander, diedAtHour }) => {
  const e = ephem(lit);
  const s = site(name);
  const n = lit.length;
  const survives = diedAtHour === null;

  it("simulate reports the hour it dies, with no NaN charge", () => {
    const r = simulate(e, s, lander, 0, n);
    expect(r.diedAtHour).toBe(diedAtHour);
    expect(Number.isFinite(r.minSocPct)).toBe(true);
    expect(Array.from(r.soc).every(Number.isFinite)).toBe(true);
  });

  it("survivedFraction is 1 only when the battery never dies", () => {
    const lived = survivedFraction(sunTrack(e, s), lander, 0, n);
    if (survives) expect(lived).toBe(1);
    else expect(lived).toBeCloseTo((diedAtHour - 1) / n, 12);
    expect(survivedMission(lived)).toBe(survives);
  });

  it("the survival map shader reference dies in the same hour, with no NaN", () => {
    const t = sunTrack(e, s);
    const cell = survivalMapCell(t.frac, t.el, survivalInputs(lander, 0, n));
    expect(cell.every(Number.isFinite)).toBe(true);
    expect(cell[3]).toBe(diedAtHour ?? -1);
    expect(cell[0]).toBe(survivedFraction(t, lander, 0, n));
    expect(survivedMission(cell[0])).toBe(survives);
  });

  it("the landing odds on that survival map agree", () => {
    const t = sunTrack(e, s);
    const cell = survivalMapCell(t.frac, t.el, survivalInputs(lander, 0, n));
    const mc = monteCarlo(field, uniform(cell), 0, 0, 100, 200)!;
    expect(mc.okPct).toBe(survives ? 100 : 0);
    expect(mc.points.every((p) => p.ok === survivedMission(p.lived))).toBe(true);
  });
});

describe("the survival map shader reference on a long mission sampled every 2 h", () => {
  it("keeps a battery that dies in the final step below 1", () => {
    const dark = { frac: new Float32Array(8), el: new Float32Array(8).fill(-90) };
    const s = survivalInputs(flat({ batteryWh: 8 }), 0, 8);
    // 4 steps of 2 h at 1 W: 8 -> 6 -> 4 -> 2 -> 0 Wh, dead in the step ending at hour 8
    expect(survivalMapCell(dark.frac, dark.el, s, 2)).toEqual([0.75, 0, 0, 8]);
    expect(survivalMapCell(dark.frac, dark.el, { ...s, batteryWh: 9 }, 2)[3]).toBe(-1);
  });
});

describe("a battery with no capacity", () => {
  it("is dead only once an hour draws more than the panels supply", () => {
    expect(batteryDead(0, 0, 10)).toBe(false);
    expect(batteryDead(-1, 0, 10)).toBe(true);
    expect(batteryDead(0, 0, 0)).toBe(false);
  });

  it("still uses the dead-below level for any positive capacity, however small", () => {
    expect(batteryDead(1e-9, 1e-9, 10)).toBe(false);
    expect(batteryDead(1e-10, 1e-9, 10)).toBe(true);
    expect(batteryDead(0, 100, 0)).toBe(true);
  });

  it("reports a full charge instead of NaN", () => {
    expect(chargePct(0, 0)).toBe(100);
    expect(chargePct(25, 100)).toBe(25);
  });
});

describe("landing odds count only touchdowns whose battery never dies", () => {
  it("counts a map where every cell dies in the final hour as 0% ok", () => {
    // what the survival shader used to write for a battery dying in hour 4 of 4: lived 4/4 = 1, diedAt 4
    expect(monteCarlo(field, uniform([1, 0, 0, 4]), 0, 0, 100, 200)!.okPct).toBe(0);
  });

  it("counts a map where the battery dies 2 h before the end of 2160 h as 0% ok", () => {
    expect(monteCarlo(field, uniform([2158 / 2160, 0, 0, 2158]), 0, 0, 100, 200)!.okPct).toBe(0);
  });

  it("counts a map where every cell lasts the whole mission as 100% ok", () => {
    expect(monteCarlo(field, uniform([1, 0.2, 0, -1]), 0, 0, 100, 200)!.okPct).toBe(100);
  });
});
