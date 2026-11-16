import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { toHalfArray } from "./craterData";

describe("toHalfArray", () => {
  it("matches three.js DataUtils.toHalfFloat bit for bit", () => {
    const vals: number[] = [0, -0, 1, -1, 0.5, 1e-8, -1e-8, 6.1e-5, 5.9e-8, 3e-6, 65504, -65504, 70000, -1e9, 31.018482, -4.25, Infinity, -Infinity];
    let seed = 7;
    for (let i = 0; i < 20000; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      vals.push(((seed / 0x7fffffff) - 0.5) * Math.pow(10, (i % 12) - 6));
    }
    const f = new Float32Array(vals);
    const fast = toHalfArray(f);
    const ref = Array.from(f, (v) => THREE.DataUtils.toHalfFloat(v));
    expect(Array.from(fast)).toEqual(ref);
  });
});
