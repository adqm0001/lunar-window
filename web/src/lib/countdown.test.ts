import { describe, expect, it } from "vitest";
import { loadTestEphemeris, loadTestSites } from "./testData";
import { siteSeries, siteStateAt } from "./visibility";
import { createCountdownCache, nextChanges } from "./countdown";

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

  it("does not throw at the end of the data and gives null or a positive time", () => {
    const n = next(e.count - 1.5);
    for (const d of [n.sun, n.earth, n.link]) expect(d === null || d > 0).toBe(true);
  });
});

describe("createCountdownCache", () => {
  it("matches a fresh nextChanges at fractional hours within one hour, including a state flip inside it", () => {
    for (const base of [2077, 2170, 1800]) {
      const cache = createCountdownCache();
      for (let f = 0; f < 1; f += 0.05) {
        const h = base + f;
        const st = siteStateAt(e, ridgeB, h);
        const got = cache(e, ridgeB, series, h, st);
        const want = nextChanges(e, ridgeB, series, h, st);
        for (const k of ["sun", "earth", "link"] as const) {
          if (want[k] === null) expect(got[k]).toBeNull();
          else expect(Math.abs(got[k]! - want[k]!)).toBeLessThan(2 / 3600);
        }
      }
    }
  });

  it("recomputes when the site changes", () => {
    const other = loadTestSites().find((s) => s.id === "shackleton-a")!;
    const cache = createCountdownCache();
    cache(e, ridgeB, series, 2077.5, siteStateAt(e, ridgeB, 2077.5));
    const so = siteSeries(e, other);
    const got = cache(e, other, so, 2077.5, siteStateAt(e, other, 2077.5));
    const want = nextChanges(e, other, so, 2077.5, siteStateAt(e, other, 2077.5));
    expect(got).toEqual(want);
  });
});
