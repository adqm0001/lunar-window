import { describe, expect, it } from "vitest";
import { loadTestEphemeris, loadTestSites } from "./testData";
import { siteSeries, siteStateAt } from "./visibility";
import { nextChanges } from "./countdown";

const e = loadTestEphemeris();
const ridgeB = loadTestSites().find((s) => s.id === "connecting-ridge-b")!;
const series = siteSeries(e, ridgeB);
const next = (hour: number) => nextChanges(e, ridgeB, series, hour, siteStateAt(e, ridgeB, hour));
const sunUp = (hour: number) => siteStateAt(e, ridgeB, hour).sunFraction >= 0.5;

describe("nextChanges", () => {
  it("at hour 2077.5 on ridge B the Sun is down and rises with the real sunrise, not in an hour", () => {
    expect(sunUp(2077.5)).toBe(false);
    // Sunrise: the interpolated sun fraction crosses 0.5 at about hour 2170.3 (92.8 h away).
    expect(next(2077.5).sun).toBeCloseTo(92.8, 0);
  });

  it("counts the sunset from a fractional hour when the Sun is still up", () => {
    expect(sunUp(2077.25)).toBe(true);
    const d = next(2077.25).sun!;
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.3);
    expect(sunUp(2077.25 + d - 0.02)).toBe(true);
    expect(sunUp(2077.25 + d + 0.02)).toBe(false);
  });

  it("works exactly on a sample boundary", () => {
    expect(sunUp(2077)).toBe(true);
    expect(next(2077).sun!).toBeCloseTo(0.39, 1);
    expect(next(2078).sun!).toBeCloseTo(92.3, 0);
  });

  it("never reports an event in the past and always contradicts the shown state", () => {
    for (let h = 1500; h < 2500; h += 0.37) {
      const up = sunUp(h);
      const d = next(h).sun;
      expect(d).not.toBeNull();
      expect(d!).toBeGreaterThan(0);
      expect(sunUp(h + d! - 0.01)).toBe(up);
      expect(sunUp(h + d! + 0.01)).toBe(!up);
    }
  });

  it("agrees with the shown Earth and link states", () => {
    for (let h = 1500; h < 2500; h += 0.43) {
      const st = siteStateAt(e, ridgeB, h);
      const n = nextChanges(e, ridgeB, series, h, st);
      for (const [d, on, arr] of [
        [n.earth, st.earthUp, series.earth],
        [n.link, st.link, series.link],
      ] as const) {
        if (d === null) continue;
        expect(d).toBeGreaterThan(0);
        const now = (t: number) => (arr === series.earth ? siteStateAt(e, ridgeB, t).earthUp : siteStateAt(e, ridgeB, t).link);
        expect(now(h + d - 0.01)).toBe(on);
        expect(now(h + d + 0.01)).toBe(!on);
      }
    }
  });
});
