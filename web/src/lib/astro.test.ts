import { describe, expect, it } from "vitest";
import { discFraction, horizonAt, toLatLon, toMap } from "./astro";

// Signed difference a − b wrapped into (−180, 180], so 180 and −180 compare equal.
const lonDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

describe("south polar stereographic projection", () => {
  const points: [number, number][] = [
    [-89.9, 0],
    [-89.5, 45],
    [-85, -120],
    [-80, 179.9],
    [-75, -179.9],
  ];

  it.each(points)("toLatLon(toMap(%f, %f)) round-trips", (lat, lon) => {
    const [lat2, lon2] = toLatLon(...toMap(lat, lon));
    expect(Math.abs(lat2 - lat)).toBeLessThan(1e-6);
    expect(Math.abs(lonDiff(lon2, lon))).toBeLessThan(1e-6);
  });

  it.each([0, 45, -120, 180])("toMap(-90, %f) is the origin", (lon) => {
    const [x, y] = toMap(-90, lon);
    expect(Math.abs(x)).toBeLessThan(1e-6);
    expect(Math.abs(y)).toBeLessThan(1e-6);
  });
});

describe("discFraction", () => {
  it("is half the disc when the centre is on the horizon", () => {
    expect(discFraction(0)).toBeCloseTo(0.5, 12);
  });

  it("is the whole disc when the lower limb touches the horizon", () => {
    expect(discFraction(0.2665)).toBeCloseTo(1, 12);
  });

  it("is nothing when the upper limb touches the horizon", () => {
    expect(discFraction(-0.2665)).toBeCloseTo(0, 12);
  });

  it("never decreases as the Sun rises from -0.3 to 0.3 degrees", () => {
    let prev = discFraction(-0.3);
    for (let i = 1; i <= 600; i++) {
      const f = discFraction(-0.3 + i * 0.001);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
});

describe("horizonAt", () => {
  // 4 bins of 90°: bin 0 at az 0, bin 1 at 90, bin 2 at 180, bin 3 at 270.
  const h = [0, 10, 20, 30];

  it.each([
    [45, 5],
    [0, 0],
    [315, 15], // between bin 3 and bin 0: wraps around
    [360, 0],
    [-45, 15],
  ])("az %f gives %f", (az, expected) => {
    expect(horizonAt(h, az)).toBeCloseTo(expected, 12);
  });
});
