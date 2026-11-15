import { describe, expect, it } from "vitest";
import { compareStats, compareWindow } from "./compareStats";
import { siteSeries } from "./visibility";
import { loadTestEphemeris, loadTestSites } from "./testData";

describe("compare window", () => {
  it("keeps the nominal span while the data lasts", () => {
    expect(compareWindow(2400, 720, 96432)).toEqual({ start: 2400, end: 3120, hours: 720, truncated: false });
  });

  it("reports the real span when the data ends first", () => {
    const w = compareWindow(96432 - 100 * 24, 8760, 96432);
    expect(w).toEqual({ start: 96432 - 2400, end: 96432, hours: 2400, truncated: true });
  });
});

describe("compare stats", () => {
  const e = loadTestEphemeris();
  const site = loadTestSites().find((s) => /malapert/i.test(s.name))!;
  const series = siteSeries(e, site);

  it("counts power + comms only while the Sun is up and the DSN link is open", () => {
    const day = 2400;
    const s = compareStats(series, day, day + 720);
    let both = 0;
    for (let i = day; i < day + 720; i++) if (series.sun[i] >= 128 && series.link[i] === 1) both++;
    expect(s.powerComms).toBeCloseTo((100 * both) / 720, 9);
    expect(s.powerComms).toBeLessThanOrEqual(s.sunlit);
    // Earth + DSN alone (the old number) is far higher for Malapert here.
    expect(s.powerComms).toBeCloseTo(22.6, 0);
  });
});
