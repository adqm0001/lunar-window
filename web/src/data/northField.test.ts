import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { loadField } from "./field";

afterEach(() => vi.unstubAllGlobals());

it("streams and decodes the north field using the existing file format", async () => {
  // Selecting north and applying its projection in the app belongs to task 55.
  vi.stubGlobal("fetch", async (input: string) => {
    const file = input.split("/").pop()!.replace("field_pole.json", "field_north.json");
    const path = fileURLToPath(new URL(`../../public/data/${file}`, import.meta.url));
    return new Response(new Uint8Array(readFileSync(path)), { status: 200 });
  });
  const progress: number[] = [];
  const f = await loadField(p => progress.push(p));
  expect(f.meta).toMatchObject({ hemisphere: "north", extentMeters: 40000 });
  expect(f.meta.horizon).toMatchObject({ size: 320, cellMeters: 250, azimuthBins: 180, observerHeightM: 2 });
  expect(f.horizon.length).toBe(320 * 320 * 180);
  expect(f.heights.length).toBe(1280 * 1280);
  expect(f.slope.length).toBe(2 * 320 * 320);
  expect(f.meta.heights.size * f.meta.heights.cellMeters).toBe(80000);
  expect(f.meta.slope.size * f.meta.slope.cellMeters).toBe(80000);
  expect(f.slope.subarray(320 * 320).every(p => p <= 100)).toBe(true);
  expect(f.heights.every(z => z >= Math.floor(f.meta.heights.min) && z <= Math.ceil(f.meta.heights.max))).toBe(true);
  expect(progress.at(-1)).toBe(1);
});
