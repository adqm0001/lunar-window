import { describe, expect, it } from "vitest";
import { toLatLon, toMap } from "./astro";

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
