import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { vertexNormals } from "./meshNormals";

describe("vertexNormals", () => {
  it("gives exactly what three.js computeVertexNormals gives on a bumpy grid", () => {
    const n = 41;
    const pos = new Float32Array(n * n * 3);
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const i = (r * n + c) * 3;
        pos[i] = c * 0.0625 + 12.5;
        pos[i + 1] = -1737.4 + Math.sin(c * 0.3) * 0.2 + rnd() * 0.05;
        pos[i + 2] = r * 0.0625 - 40;
      }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let k = 0;
    for (let r = 0; r < n - 1; r++)
      for (let c = 0; c < n - 1; c++) {
        const a = r * n + c;
        idx.set([a, a + n, a + 1, a + 1, a + n, a + n + 1], k);
        k += 6;
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    expect(Array.from(vertexNormals(pos, idx))).toEqual(Array.from(g.getAttribute("normal").array as Float32Array));
  });
});
