import { describe, expect, it } from "vitest";
import { LANDER_PRESETS, missionFits, simulate, survivedFraction, type Lander, type SunTrack } from "./lander";
import { loadTestEphemeris, loadTestSites } from "./testData";

const lander: Lander = { name: "Boundary reference", panelW: 0, panel: "horizontal", panelAz: 0, batteryWh: 100, dayLoadW: 1, nightLoadW: 1, minSocPct: 0 };
const track = (n: number): SunTrack => ({ frac: new Float32Array(n).fill(1), az: new Float32Array(n), el: new Float32Array(n).fill(90) });

describe("mission data coverage", () => {
  it("simulates a full mission ending exactly at the data cutoff", () => {
    expect(survivedFraction(track(6), lander, 2, 4)).toBe(1);
  });

  it("does not report survival for a mission crossing the cutoff by one hour", () => {
    expect(survivedFraction(track(6), lander, 2, 5)).toBeNaN();
  });

  it.each([6, 7])("marks a mission starting at or past the cutoff unavailable (%s)", (start) => {
    expect(survivedFraction(track(6), lander, start, 1)).toBeNaN();
  });

  it("marks an empty track unavailable", () => {
    expect(survivedFraction(track(0), lander, 0, 1)).toBeNaN();
  });

  it.each<[number, number]>([[-1, 2], [0, 0], [0, -1], [0.5, 1], [0, 1.5], [NaN, 1], [0, Infinity]])("rejects invalid hourly windows (%s, %s)", (start, hours) => {
    expect(survivedFraction(track(6), lander, start, hours)).toBeNaN();
  });

  it.each(["az", "el"] as const)("requires coverage in the %s array too", (key) => {
    const t = track(6);
    t[key] = new Float32Array(3);
    expect(survivedFraction(t, lander, 2, 4)).toBeNaN();
  });

  it("keeps a real battery failure distinct from unavailable data", () => {
    expect(survivedFraction(track(6), { ...lander, batteryWh: 4, dayLoadW: 2 }, 2, 4)).toBe(0.5);
  });
});

describe("standalone simulator data coverage", () => {
  const ephem = loadTestEphemeris();
  const site = loadTestSites().find((s) => s.id === "connecting-ridge-b")!;
  const small = LANDER_PRESETS[0];
  const mission = 14 * 24;
  const start = 1000;
  // the same data, cut off so the mission ends exactly at the last hour (or one hour later)
  const endingAt = (count: number) => ({ ...ephem, count });

  it.each<[number, number, number, boolean]>([[0, 1, 1, true], [2, 4, 6, true], [2, 5, 6, false], [6, 1, 6, false], [-1, 2, 6, false], [0, 0, 6, false], [0.5, 1, 6, false], [0, 1.5, 6, false]])(
    "missionFits(%s, %s, %s) is %s",
    (s, h, n, ok) => {
      expect(missionFits(s, h, n)).toBe(ok);
    },
  );

  it("simulates every hour of a normal mid-ephemeris mission", () => {
    const r = simulate(ephem, site, small, start, mission)!;
    expect(r.hours).toBe(mission);
    expect(r.soc).toHaveLength(mission + 1);
  });

  it("simulates a mission ending exactly at the cutoff in full, with the same result", () => {
    const full = simulate(ephem, site, small, start, mission)!;
    const atCutoff = simulate(endingAt(start + mission), site, small, start, mission)!;
    expect(atCutoff.hours).toBe(mission);
    expect(atCutoff.diedAtHour).toBe(full.diedAtHour);
    expect(Array.from(atCutoff.soc)).toEqual(Array.from(full.soc));
  });

  it("marks a mission one hour past the cutoff unavailable instead of reporting survival", () => {
    expect(simulate(endingAt(start + mission - 1), site, small, start, mission)).toBeNull();
  });

  it("marks a 14-day mission from the final ephemeris hour unavailable", () => {
    expect(simulate(ephem, site, small, ephem.count - 1, mission)).toBeNull();
    expect(simulate(ephem, site, small, ephem.count - mission, mission)?.hours).toBe(mission);
  });
});
