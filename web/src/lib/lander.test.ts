import { describe, expect, it } from "vitest";
import { survivedFraction, type Lander, type SunTrack } from "./lander";

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
