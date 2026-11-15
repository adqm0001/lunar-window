import { describe, expect, it } from "vitest";
import { changedSurvivalInputs, survivalInputs, survivedFraction, type Lander, type SunTrack } from "./lander";

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
    // dies in hour 2 of 4, so it lasted 1 whole hour
    expect(survivedFraction(track(6), { ...lander, batteryWh: 4, dayLoadW: 2 }, 2, 4)).toBe(0.25);
  });
});

describe("survival map inputs", () => {
  const base = { name: "A", panelW: 600, panel: "vertical" as const, panelAz: -1, batteryWh: 2500, dayLoadW: 220, nightLoadW: 90, minSocPct: 10 };
  const was = survivalInputs(base, 100, 336);

  it("reports nothing when the settings are the same", () => {
    expect(changedSurvivalInputs(was, survivalInputs({ ...base, name: "Custom" }, 100, 336))).toEqual([]);
  });

  it("ignores settings the map does not use", () => {
    expect(changedSurvivalInputs(was, survivalInputs({ ...base, panel: "track", panelAz: 120 }, 100, 336))).toEqual([]);
  });

  it("names every changed setting in form order", () => {
    const now = survivalInputs({ ...base, panel: "horizontal", panelW: 0, minSocPct: 20 }, 101, 720);
    expect(changedSurvivalInputs(was, now)).toEqual(["start time", "mission length", "panel mounting", "panel power", "dead-below level"]);
  });
});
