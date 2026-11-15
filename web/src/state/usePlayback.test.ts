import { describe, expect, it, vi } from "vitest";

// The store registers itself on `window` in dev builds, which the node environment lacks.
vi.stubGlobal("window", {});
const { MAX_FRAME_SECONDS, nextHour, startHour } = await import("./usePlayback");

describe("nextHour", () => {
  it("advances a 250 ms frame at 24 h/s by 6 h", () => {
    expect(nextHour(10, 0.25, 24, 100)).toEqual({ hour: 16, done: false });
  });
  it("clamps a frame longer than 0.5 s to 0.5 s", () => {
    expect(MAX_FRAME_SECONDS).toBe(0.5);
    expect(nextHour(10, 30, 24, 1000).hour).toBe(22);
  });
  it("stops at the last hour", () => {
    expect(nextHour(98, 1, 24, 100)).toEqual({ hour: 99, done: true });
  });
});

describe("startHour", () => {
  it("restarts from 0 when play is pressed at the last hour", () => {
    expect(startHour(99, 100)).toBe(0);
    expect(startHour(150, 100)).toBe(0);
  });
  it("keeps the current hour otherwise", () => {
    expect(startHour(42.5, 100)).toBe(42.5);
  });
  it("restarts IM-2 at touchdown instead of the beginning of its ephemeris", () => {
    expect(startHour(1079, 1080, 473.5)).toBe(473.5);
    expect(startHour(600, 1080, 473.5)).toBe(600);
  });
});
