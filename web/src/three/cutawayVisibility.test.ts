import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cutawayLabelVisible, LAYERS } from "./cutaway";
import { R_MOON_KM } from "../lib/astro";

// Camera at 4000 km from the centre; the removed wedge is dot(p, a) > 0 && dot(p, b) > 0, as in the shader.
const a = new THREE.Vector3(1, 0, 1).normalize();
const b = new THREE.Vector3(1, 0, -1).normalize();
const dir = a.clone().add(b).normalize(); // the middle of the open wedge
const up = new THREE.Vector3(0, 1, 0);
// anchors as Cutaway.orient places them: along the b face, at each layer's radius, a little above it
const along = b.clone().sub(a.clone().multiplyScalar(b.dot(a))).normalize();
const anchors = LAYERS.map((l, i) => {
  const r = l.r1 === R_MOON_KM ? R_MOON_KM - 8 : (l.r0 + l.r1) / 2;
  return along.clone().multiplyScalar(Math.cos(0.5 + i * 0.12)).add(up.clone().multiplyScalar(Math.sin(0.5 + i * 0.12) * 0.25)).normalize().multiplyScalar(r);
});
const vis = (cam: THREE.Vector3) => anchors.map((p) => cutawayLabelVisible(cam, p, a, b, R_MOON_KM));

describe("cutaway label visibility", () => {
  it("shows all five labels from the default view, looking into the wedge", () => {
    expect(vis(dir.clone().multiplyScalar(4000))).toEqual([true, true, true, true, true]);
  });
  it("hides them all when orbiting 180 degrees to look at the solid side", () => {
    expect(vis(dir.clone().multiplyScalar(-4000))).toEqual([false, false, false, false, false]);
  });
  it("hides them when looking from the side of the Moon behind the cut", () => {
    const side = up.clone().cross(dir).multiplyScalar(4000).add(dir.clone().multiplyScalar(-1500));
    expect(vis(side).some(Boolean)).toBe(false);
  });
  it("still shows them from a moderate angle off the default view", () => {
    const cam = dir.clone().applyAxisAngle(up, 0.5).multiplyScalar(4000);
    expect(vis(cam)).toEqual([true, true, true, true, true]);
  });
  it("hides the labels when the camera is on the solid side of one cut plane", () => {
    const cam = a.clone().multiplyScalar(-1).applyAxisAngle(up, 0.0).multiplyScalar(4000).add(b.clone().multiplyScalar(-100));
    expect(vis(cam)[0]).toBe(false);
  });
  it("hides the labels on the far face when the camera is in front of one face and behind the other", () => {
    // in front of face a (dot a > 0) but behind face b (dot b < 0): the solid is between camera and the b-face anchors
    const cam = a.clone().multiplyScalar(3000).addScaledVector(b, -3000);
    expect(vis(cam)[0]).toBe(false);
  });
});
