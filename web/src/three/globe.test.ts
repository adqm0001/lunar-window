import { describe, expect, it } from "vitest";
import { toLatLon } from "../lib/astro";
import { polarToWorld, worldFromLatLon } from "./globe";

describe("polarToWorld", () => {
  it("places polar map points exactly where worldFromLatLon(toLatLon()) does", () => {
    const out = new Float32Array(3);
    let worst = 0;
    // the pole, the 80 km patch, the 250 m region areas and well beyond (~82°S)
    for (const x of [-250000, -40000, -12345.6, 0, 31.25, 39968.75, 248000]) {
      for (const y of [-250000, -39968.75, 0, 777.7, 40000, 250000]) {
        for (const h of [-4200, 0, 6100]) {
          polarToWorld(x, y, h, out, 0);
          const [lat, lon] = toLatLon(x, y);
          const w = worldFromLatLon(lat, lon, h);
          worst = Math.max(worst, Math.abs(out[0] - w.x), Math.abs(out[1] - w.y), Math.abs(out[2] - w.z));
        }
      }
    }
    // Float32 storage of ~1737 km coordinates is good to ~0.1 mm; the formula itself agrees far better
    expect(worst).toBeLessThan(2e-4);
  });

  it("writes at the given offset", () => {
    const out = new Float32Array(9).fill(7);
    polarToWorld(0, 0, 0, out, 3);
    expect([...out.slice(0, 3)]).toEqual([7, 7, 7]);
    expect([...out.slice(6)]).toEqual([7, 7, 7]);
    // the south pole: straight down from the Moon's centre by one radius
    const p = worldFromLatLon(-90, 0, 0);
    expect(out[4]).toBeCloseTo(p.y, 3);
  });
});
