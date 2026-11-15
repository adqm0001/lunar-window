import { describe, expect, it } from "vitest";
import type { GlobalMetrics } from "../gpu/globalLayers";
import { regionReport } from "./regionReport";

// Whole-Moon results where every south-polar cell has the same values.
function metrics(kind: "light" | "thermal", px: [number, number, number, number]): GlobalMetrics {
  const n = 64;
  const data = new Float32Array(n * n * 4);
  for (let i = 0; i < n * n; i++) data.set(px, i * 4);
  return { kind, grids: [{ id: "south", w: n, h: n, data }], points: n * n, hours: 0, stride: 1, millis: 0 };
}

const light = metrics("light", [0.8, 0.5, 0.4, 24]);
const thermal = metrics("thermal", [100, 80, 40, 0]);

describe("Artemis III region report", () => {
  it("credits nearby ice when a full year of temperatures is available", () => {
    const rows = regionReport(light, thermal);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].iceArea).toBe(1);
    expect(rows[0].score).toBeCloseTo(0.5 * 0.8 + 0.3 * 0.4 + 0.1 * 1 + 0.1 * (1 - 24 / 360), 6);
  });

  it("leaves ice out of the area and the ranking without a full year of temperatures", () => {
    const rows = regionReport(light, null);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].iceArea).toBeNaN();
    expect(rows[0].score).toBeCloseTo((0.5 * 0.8 + 0.3 * 0.4 + 0.1 * (1 - 24 / 360)) / 0.9, 6);
  });
});
