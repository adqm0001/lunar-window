import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toLatLon, toMap } from "../lib/astro";
import { fieldCell, fieldHeight, fieldHorizon, fieldSafePct, inField, loadField } from "./field";

// Exercise the production streaming/gzip/delta loader against committed files.
// Task 52 will add selection of the fine field; no app routing is changed here.
function serveField(name: "pole" | "ridge_b") {
  vi.stubGlobal("fetch", async (input: string) => {
    const file = input.split("/").pop()!.replace("field_pole.json", `field_${name}.json`);
    const path = fileURLToPath(new URL(`../../public/data/${file}`, import.meta.url));
    return new Response(new Uint8Array(readFileSync(path)), { status: 200 });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Connecting ridge B field artifacts", () => {
  it("loads all three arrays with the production loader and declared dimensions", async () => {
    serveField("ridge_b");
    const progress: number[] = [];
    const f = await loadField(p => progress.push(p));
    expect(f.meta.label).toBe("Connecting ridge B");
    expect(f.meta.extentMeters * 2).toBe(5000);
    expect(f.meta.horizon).toMatchObject({ size: 250, cellMeters: 20, azimuthBins: 180, observerHeightM: 2 });
    expect(f.horizon.length).toBe(250 * 250 * 180);
    expect(f.heights.length).toBe(1000 * 1000);
    expect(f.slope.length).toBe(2 * 250 * 250);
    expect(f.meta.heights.size * f.meta.heights.cellMeters).toBe(5000);
    expect(f.meta.slope.size * f.meta.slope.cellMeters).toBe(5000);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((p, i) => p >= 0 && p <= 1 && (i === 0 || p >= progress[i - 1]))).toBe(true);
    const [siteX, siteY] = toMap(-89.44, -137.3708);
    expect(Math.hypot(f.meta.centerX! - siteX, f.meta.centerY! - siteY)).toBeLessThan(5);
  });

  it("agrees with every exactly shared pole-grid point in every direction", async () => {
    serveField("pole");
    const pole = await loadField(() => {});
    serveField("ridge_b");
    const fine = await loadField(() => {});
    let points = 0;
    let maxError = 0;
    for (let row = 0; row < pole.meta.horizon.size; row++) {
      const y = pole.meta.extentMeters - (row + 0.5) * pole.meta.horizon.cellMeters;
      for (let col = 0; col < pole.meta.horizon.size; col++) {
        const x = (col + 0.5) * pole.meta.horizon.cellMeters - pole.meta.extentMeters;
        if (!inField(fine, x, y)) continue;
        const fc = (x - fine.meta.centerX! + fine.meta.extentMeters) / 20 - 0.5;
        const fr = (fine.meta.extentMeters - y + fine.meta.centerY!) / 20 - 0.5;
        if (Math.abs(fc - Math.round(fc)) > 1e-8 || Math.abs(fr - Math.round(fr)) > 1e-8) continue;
        const [lat, lon] = toLatLon(x, y);
        const cell = fieldCell(fine, lat, lon);
        expect(cell).toEqual({ col: fc, row: fr });
        const reference = fieldHorizon(pole, col, row);
        const actual = fieldHorizon(fine, cell!.col, cell!.row);
        for (let a = 0; a < 180; a++) maxError = Math.max(maxError, Math.abs(reference[a] - actual[a]));
        points++;
      }
    }
    expect(points).toBe(100);
    expect(maxError).toBeLessThanOrEqual(0.3);
  });

  it("uses the shifted centre and north-first rows in the existing sampling helpers", async () => {
    serveField("ridge_b");
    const f = await loadField(() => {});
    const cx = f.meta.centerX!, cy = f.meta.centerY!;
    for (const [row, col] of [[0, 0], [0, 249], [249, 0], [249, 249], [124, 125]]) {
      const x = cx - 2500 + (col + 0.5) * 20;
      const y = cy + 2500 - (row + 0.5) * 20;
      const [lat, lon] = toLatLon(x, y);
      expect(fieldCell(f, lat, lon)).toEqual({ row, col });
      expect(fieldSafePct(f, lat, lon)).toBe(f.slope[250 * 250 + row * 250 + col]);
      expect(fieldHorizon(f, col, row)).toHaveLength(180);
      const height = fieldHeight(f, x, y);
      expect(height).not.toBeNull();
      expect(height!).toBeGreaterThanOrEqual(Math.floor(f.meta.heights.min));
      expect(height!).toBeLessThanOrEqual(Math.ceil(f.meta.heights.max));
    }
    for (const [dx, dy] of [[2501, 0], [-2501, 0], [0, 2501], [0, -2501]]) {
      const [lat, lon] = toLatLon(cx + dx, cy + dy);
      expect(fieldCell(f, lat, lon)).toBeNull();
      expect(fieldHeight(f, cx + dx, cy + dy)).toBeNull();
    }
    expect(inField(f, 0, 0)).toBe(false);
    expect(f.slope.subarray(250 * 250).every(p => p <= 100)).toBe(true);
  });
});
