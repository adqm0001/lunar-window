import { describe, expect, it } from "vitest";
import { LUNAR_DAY_HOURS, STAND_IN_HOURS, STEP_HOUR_GLSL, WARMUP_HOURS, thermalSchedule, thermalWarmup } from "./thermal";

// The GPU thermal shaders (THERMAL_MAIN here, THERMAL in globalLayers.ts) step through the hours
// given by thermalSchedule; these tests pin down which hours warm the model up and which are recorded.
const COUNT = 96432; // hours in the bundled ephemeris
const recorded = (start: number, steps: number, stride: number, count = COUNT) =>
  thermalSchedule(start, steps, stride, count).filter((s) => s.record).map((s) => s.hour);
const warmup = (start: number, steps: number, stride: number, count = COUNT) =>
  thermalSchedule(start, steps, stride, count).filter((s) => !s.record).map((s) => s.hour);
const range = (from: number, n: number, step = 1) => Array.from({ length: n }, (_, i) => from + i * step);

describe("GPU thermal schedule", () => {
  it("records every hour of a 7-day window", () => {
    expect(recorded(9600, 168, 1)).toEqual(range(9600, 168));
  });

  it("records every step of a 30-day and a full-year window", () => {
    expect(recorded(9600, 720, 1)).toEqual(range(9600, 720));
    // a year runs at a 4 h stride, so 2190 steps cover all 8760 h the ice verdict needs
    expect(recorded(9600, 2190, 4)).toEqual(range(9600, 2190, 4));
  });

  it("warms up on the lunar days just before the window when the data has them", () => {
    expect(WARMUP_HOURS).toBe(4 * LUNAR_DAY_HOURS);
    expect(warmup(9600, 168, 1)).toEqual(range(9600 - WARMUP_HOURS, WARMUP_HOURS));
    expect(warmup(9600, 2190, 4)).toEqual(range(9600 - 709 * 4, 709, 4));
  });

  it("at the start of the data, warms up on the same days 12 lunar days later", () => {
    expect(STAND_IN_HOURS).toBe(12 * LUNAR_DAY_HOURS);
    expect(warmup(0, 168, 1)).toEqual(range(STAND_IN_HOURS - WARMUP_HOURS, WARMUP_HOURS));
    expect(recorded(0, 168, 1)).toEqual(range(0, 168));
    expect(recorded(0, 720, 1)).toEqual(range(0, 720));
  });

  it("uses what history there is and stands in for the rest", () => {
    expect(thermalWarmup(300, 1, COUNT)).toEqual({ replay: WARMUP_HOURS - 300, history: 300 });
    expect(warmup(300, 720, 1)).toEqual([...range(300 + STAND_IN_HOURS - WARMUP_HOURS, WARMUP_HOURS - 300), ...range(0, 300)]);
    expect(recorded(300, 720, 1)).toEqual(range(300, 720));
  });

  it("warms up on history only when the data is too short for a stand-in", () => {
    expect(thermalWarmup(300, 1, 5000)).toEqual({ replay: 0, history: 300 });
    expect(warmup(300, 720, 1, 5000)).toEqual(range(0, 300));
    expect(recorded(300, 720, 1, 5000)).toEqual(range(300, 720));
  });

  it("never reads before hour 0 or past the end of the data", () => {
    for (const [start, steps, stride, count] of [[0, 1, 1, COUNT], [5, 3, 1, COUNT], [700, 168, 1, COUNT], [708, 2190, 4, COUNT], [1000, 1460, 6, COUNT], [96000, 432, 1, COUNT], [0, 100, 1, 100], [10, 50, 1, 60], [0, 8508, 1, 8508], [1, 8507, 1, 8508]]) {
      const hours = thermalSchedule(start, steps, stride, count).map((s) => s.hour);
      expect(Math.min(...hours)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...hours)).toBeLessThan(count);
    }
  });

  it("matches the hour formula the shaders run", () => {
    const glsl = new Function("uStart", "uStride", "uReplay", "uHistory", "j", `return ${STEP_HOUR_GLSL};`);
    for (const [start, steps, stride] of [[9600, 168, 1], [300, 720, 1], [0, 168, 1], [0, 2190, 4], [1000, 1460, 6]]) {
      const { replay, history } = thermalWarmup(start, stride, COUNT);
      thermalSchedule(start, steps, stride, COUNT).forEach((s, j) => expect(glsl(start, stride, replay, history, j)).toBe(s.hour));
    }
  });
});
