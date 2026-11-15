import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cutawayLabelVisible, cutGeometry } from "./cutaway";
import { R_MOON_KM } from "../lib/astro";

const DIST = 4500;
const Y = new THREE.Vector3(0, 1, 0);
// camera at (lat, lon) in degrees with longitude measured about +y, looking at the centre with y up
function camAt(latDeg: number, lonDeg: number) {
  const la = (latDeg * Math.PI) / 180;
  const lo = (lonDeg * Math.PI) / 180;
  const pos = new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)).multiplyScalar(DIST);
  const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(), Y);
  return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m) };
}
// the wedge as Cutaway.orient makes it when the cut is switched on with the camera at lat -31.8, lon 180
const home = camAt(-31.8, 180);
const geo = cutGeometry(home.pos, home.quat);
const shown = (latDeg: number, lonDeg: number) =>
  geo.anchors.map((p) => cutawayLabelVisible(camAt(latDeg, lonDeg).pos, p, geo.a, geo.b, R_MOON_KM));
const count = (v: boolean[]) => v.filter(Boolean).length;

describe("cutaway label visibility", () => {
  it("the anchors lie on the wedge side of their face plane, at most 125 km off it", () => {
    for (const p of geo.anchors) {
      expect(p.dot(geo.a)).toBeGreaterThanOrEqual(0);
      expect(p.dot(geo.a)).toBeLessThan(125);
    }
  });
  it("shows all five labels from the default view", () => {
    expect(shown(-31.8, 180)).toEqual([true, true, true, true, true]);
  });
  it("shows all five for camera longitudes 120 to 192 (the open side of the wedge) at lat -31.8", () => {
    for (let lon = 120; lon <= 192; lon += 4) expect(count(shown(-31.8, lon))).toBe(5);
  });
  it("hides them all directly opposite the wedge (lat -31.8, lon 0)", () => {
    expect(count(shown(-31.8, 0))).toBe(0);
  });
  it("hides them all at lon 30 (the Mantle label used to show through the Moon)", () => {
    expect(count(shown(-31.8, 30))).toBe(0);
  });
  it("hides them all from the solid side at other latitudes", () => {
    for (const lat of [0, 31.8]) for (const lon of [0, 30, 330]) expect(count(shown(lat, lon))).toBe(0);
  });
  it("hides them all for camera longitudes 0 to 84 and 252 to 356 at lat -31.8 (behind the cut face)", () => {
    for (let lon = 0; lon <= 356; lon += 4) if (lon <= 84 || lon >= 252) expect(count(shown(-31.8, lon))).toBe(0);
  });
  it("hides them when the face they are on is seen edge-on, and shows them when it is clearly in view", () => {
    const edgeOn = geo.b.clone().multiplyScalar(DIST);
    expect(geo.anchors.map((p) => cutawayLabelVisible(edgeOn, p, geo.a, geo.b, R_MOON_KM))).toEqual([false, false, false, false, false]);
    const inView = geo.b.clone().addScaledVector(geo.a, 0.6).normalize().multiplyScalar(DIST);
    expect(geo.anchors.map((p) => cutawayLabelVisible(inView, p, geo.a, geo.b, R_MOON_KM))).toEqual([true, true, true, true, true]);
  });
});
