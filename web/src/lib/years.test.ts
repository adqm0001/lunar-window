import { describe, expect, it } from "vitest";
import { loadTestEphemeris } from "./testData";
import { ephemYears } from "./years";

const start = Date.UTC(2026, 0, 1);
const hoursUntil = (y: number) => (Date.UTC(y, 0, 1) - start) / 3600e3;

describe("ephemYears", () => {
  it("reads the range of the committed ephemeris", () => {
    const ephem = loadTestEphemeris();
    expect(ephemYears(ephem)).toEqual({ first: 2026, last: 2036, label: "2026–2036" });
  });

  it("counts the last hour, not the hour after it", () => {
    // 2026-01-01 00:00 through 2036-12-31 23:00 is still 2036; one more hour reaches 2037.
    expect(ephemYears({ startMs: start, stepHours: 1, count: hoursUntil(2037) }).last).toBe(2036);
    expect(ephemYears({ startMs: start, stepHours: 1, count: hoursUntil(2037) + 1 }).last).toBe(2037);
  });

  it("labels a single year without a range", () => {
    const replay = Date.UTC(2025, 2, 6, 17, 30);
    expect(ephemYears({ startMs: replay, stepHours: 1, count: 30 * 24 })).toEqual({ first: 2025, last: 2025, label: "2025" });
  });
});
