import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { R_MOON_KM } from "../lib/astro";
import { MOON_CENTER } from "./globe";
import { spreadLabels } from "./labelLayout";

export const LAYERS = [
  { name: "Solid inner core", detail: "iron-rich, ~240 km radius", r0: 0, r1: 240 },
  { name: "Fluid outer core", detail: "liquid iron, to ~330 km", r0: 240, r1: 330 },
  { name: "Partially molten layer", detail: "to ~480 km", r0: 330, r1: 480 },
  { name: "Mantle", detail: "rock, ~1,250 km thick", r0: 480, r1: 1697 },
  { name: "Crust", detail: "~40 km (thicker on the far side)", r0: 1697, r1: R_MOON_KM },
];

export const INTERIOR_SOURCE = "Layer radii: Weber et al. 2011, Science (re-analysis of Apollo seismometer data)";

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uCenter;
uniform vec3 uKeep;
uniform float uR;
varying vec3 vWorld;
out vec4 fragColor;
float band(float r, float a, float b) { return step(a, r) * (1.0 - step(b, r)); }
void main() {
  vec3 p = vWorld - uCenter;
  float r = length(p);
  if (r > uR || dot(p, uKeep) < 0.0) discard;
  vec3 col = vec3(0.0);
  col += band(r, 0.0, 240.0) * mix(vec3(1.9, 1.45, 0.7), vec3(1.5, 0.95, 0.35), r / 240.0);
  col += band(r, 240.0, 330.0) * vec3(1.15, 0.45, 0.13);
  col += band(r, 330.0, 480.0) * vec3(0.62, 0.16, 0.07);
  float m = clamp((r - 480.0) / (1697.0 - 480.0), 0.0, 1.0);
  col += band(r, 480.0, 1697.0) * mix(vec3(0.26, 0.085, 0.04), vec3(0.11, 0.085, 0.07), pow(m, 0.7));
  col += band(r, 1697.0, 9999.0) * vec3(0.24, 0.235, 0.225);
  float edge = 0.0;
  for (int i = 0; i < 4; i++) {
    float b = i == 0 ? 240.0 : i == 1 ? 330.0 : i == 2 ? 480.0 : 1697.0;
    edge = max(edge, 1.0 - smoothstep(0.0, 4.0, abs(r - b)));
  }
  col = mix(col, vec3(0.02), edge * 0.85);
  fragColor = vec4(col, 1.0);
}`;

/**
 * Whether the label anchored at `anchor` can be seen from `cam` (both relative to the Moon's centre, km). The removed
 * wedge is dot(p, a) > 0 and dot(p, b) > 0 (as in the shader). The anchor is drawn on the cut face whose normal is a,
 * so it is seen only if the camera is clearly in front of that face (dot(cam, a) > 0.2 |cam|) and the part of the line from the
 * camera that is inside the sphere, from where it enters to the anchor, is all in the wedge, where there is no rock
 * in the way. The wedge is convex, so its two ends decide: the entry point (the camera itself if it is inside the
 * sphere) must be in the wedge; the anchor is on the face, so it is. The anchors are lifted off the cut plane towards
 * the camera's up, by 0 to ~120 km (largest for the crust), always to the wedge side (cutGeometry's test checks
 * this); the 10 km tolerance only absorbs rounding where the line grazes the plane.
 */
export const LABEL_PLANE_TOL_KM = 10;
/** The cut face must be seen at more than ~12 degrees from edge-on (sin 12 deg = 0.2), or the anchors, lifted off the face, would float in the opening. */
export const MIN_FACE_VIEW = 0.2;
export function cutawayLabelVisible(cam: THREE.Vector3, anchor: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, radius: number): boolean {
  if (cam.dot(a) <= MIN_FACE_VIEW * cam.length()) return false; // the face is edge-on or turned away
  const d = anchor.clone().sub(cam);
  const A = d.lengthSq();
  if (A === 0) return true;
  let t = 0; // a camera inside the sphere sees from where it is
  if (cam.lengthSq() > radius * radius) {
    const B = cam.dot(d);
    const disc = B * B - A * (cam.lengthSq() - radius * radius);
    if (disc < 0) return false;
    t = (-B - Math.sqrt(disc)) / A;
    if (t > 1) return true; // the anchor is in front of the sphere
  }
  const p = cam.clone().addScaledVector(d, Math.max(t, 0));
  return p.dot(a) >= -LABEL_PLANE_TOL_KM && p.dot(b) >= -LABEL_PLANE_TOL_KM;
}

/**
 * The cut planes' normals a and b (the removed wedge is dot(p, a) > 0 and dot(p, b) > 0) and the label anchors
 * (relative to the Moon's centre, km), for a camera at `camPos` (relative to the centre) with orientation `camQuat`.
 */
export function cutGeometry(camPos: THREE.Vector3, camQuat: THREE.Quaternion) {
  const c0 = camPos.clone().normalize();
  const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camQuat);
  const c = c0.clone().applyAxisAngle(camUp, -0.55).add(camUp.clone().multiplyScalar(0.18)).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat);
  right.sub(c.clone().multiplyScalar(right.dot(c))).normalize();
  const a = c.clone().add(right).normalize();
  const b = c.clone().sub(right).normalize();
  const along = b.clone().sub(a.clone().multiplyScalar(b.dot(a))).normalize();
  const anchors = LAYERS.map((l, i) => {
    const r = l.r1 === R_MOON_KM ? R_MOON_KM - 8 : (l.r0 + l.r1) / 2;
    const dir = along.clone().multiplyScalar(Math.cos(0.5 + i * 0.12)).add(camUp.clone().multiplyScalar(Math.sin(0.5 + i * 0.12) * 0.25)).normalize();
    return dir.multiplyScalar(r);
  });
  return { a, b, anchors };
}

export class Cutaway {
  group = new THREE.Group();
  a = new THREE.Vector3(1, 0, 0);
  b = new THREE.Vector3(0, 0, 1);
  private faces: THREE.Mesh[] = [];
  private labels: CSS2DObject[] = [];
  private boxes: HTMLElement[] = [];
  private lines: HTMLElement[] = [];
  private heights: number[] = [];
  private widths: number[] = [];
  private scratch = new THREE.Vector3();
  // Box sizes come from a ResizeObserver: it reports each box once it is in the page (CSS2DRenderer adds it on the
  // first render) and again if fonts load late or the text size changes; the scene only renders on demand, so
  // onResize asks it for another frame to lay the labels out with the real sizes.
  private sizes: ResizeObserver | null = null;
  onResize: (() => void) | null = null;

  constructor() {
    for (let k = 0; k < 2; k++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        glslVersion: THREE.GLSL3,
        side: THREE.DoubleSide,
        uniforms: { uCenter: { value: MOON_CENTER.clone() }, uKeep: { value: new THREE.Vector3() }, uR: { value: R_MOON_KM } },
      });
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(R_MOON_KM, 256), mat);
      mesh.frustumCulled = false;
      this.faces.push(mesh);
      this.group.add(mesh);
    }
    for (const l of LAYERS) {
      // a zero-size anchor on the layer: a dot, a leader line and the text box, which layout() may move up or down
      const el = document.createElement("div");
      el.className = "layer-label";
      el.innerHTML = `<span class="ll-dot" aria-hidden="true"></span><span class="ll-line" aria-hidden="true"></span><div class="ll-box"><b>${l.name}</b><span>${l.detail}</span></div>`;
      const obj = new CSS2DObject(el);
      this.labels.push(obj);
      this.boxes.push(el.querySelector(".ll-box") as HTMLElement);
      this.lines.push(el.querySelector(".ll-line") as HTMLElement);
      this.heights.push(0);
      this.widths.push(0);
      this.group.add(obj);
    }
    this.group.visible = false;
    if (typeof ResizeObserver !== "undefined") {
      this.sizes = new ResizeObserver(() => {
        let changed = false;
        this.boxes.forEach((b, i) => {
          if (!b.isConnected) return;
          if (b.offsetHeight !== this.heights[i] || b.offsetWidth !== this.widths[i]) changed = true;
          this.heights[i] = b.offsetHeight;
          this.widths[i] = b.offsetWidth;
        });
        if (changed) this.onResize?.();
      });
      for (const b of this.boxes) this.sizes.observe(b);
    }
  }

  dispose() {
    this.sizes?.disconnect();
  }

  orient(camera: THREE.Camera) {
    const geo = cutGeometry(camera.position.clone().sub(MOON_CENTER), camera.quaternion);
    this.a.copy(geo.a);
    this.b.copy(geo.b);
    const set = (mesh: THREE.Mesh, normal: THREE.Vector3, keep: THREE.Vector3) => {
      mesh.position.copy(MOON_CENTER);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      (mesh.material as THREE.ShaderMaterial).uniforms.uKeep.value.copy(keep);
    };
    set(this.faces[0], this.a, this.b);
    set(this.faces[1], this.b, this.a);
    geo.anchors.forEach((p, i) => this.labels[i].position.copy(MOON_CENTER).add(p));
  }

  /**
   * The inner layers are only ~120 km apart, a few pixels on screen from orbit, so their boxes would overlap. Each
   * box sits to the right of its layer's dot with a leader line; boxes that would collide are spread apart
   * vertically and lined up in one column right of the group's dots, so no box covers a dot. Call before the labels
   * are rendered, with the size of the label layer in CSS pixels.
   */
  layout(camera: THREE.Camera, width: number, height: number) {
    if (!this.group.visible) return;
    if (!(width > 0 && height > 0)) return;
    // where CSS2DRenderer puts each label; one it hides (outside the depth range, e.g. behind the camera) gets NaN
    // so it doesn't push the visible ones around; a label hidden by the Moon's rock (seen from outside the open
    // wedge) is hidden (CSS2DRenderer gives it display none) and gets NaN the same way
    const cam = camera.position.clone().sub(MOON_CENTER);
    const pts = this.labels.map((o) => {
      const w = o.getWorldPosition(this.scratch);
      const seen = cutawayLabelVisible(cam, w.clone().sub(MOON_CENTER), this.a, this.b, R_MOON_KM);
      o.visible = seen; // CSS2DRenderer sets display none on an invisible label (it overwrites the element style)
      if (!seen) return [NaN, NaN];
      const v = w.project(camera);
      return v.z < -1 || v.z > 1 ? [NaN, NaN] : [(v.x + 1) * 0.5 * width, (1 - v.y) * 0.5 * height];
    });
    // until the observer has measured a box (before its first render) use typical sizes; it then re-renders
    const hs = this.heights.map((h) => h || 37);
    const ws = this.widths.map((w) => w || 160);
    const { dy, group } = spreadLabels(
      pts.map((q) => q[1]),
      hs,
      4,
    );
    const colX = new Map<number, number>();
    pts.forEach((q, i) => colX.set(group[i], Math.max(colX.get(group[i]) ?? -Infinity, q[0])));
    pts.forEach((q, i) => {
      if (!Number.isFinite(q[0]) || !Number.isFinite(q[1])) return;
      // keep the box on screen (on a phone the Moon's rim can be wider than the screen); boxes are already apart
      // vertically, so this can't make them overlap
      const left = Math.max(8, Math.min(width - ws[i] - 8, colX.get(group[i])! + 14));
      const dx = left - q[0];
      this.boxes[i].style.transform = `translate(${dx.toFixed(1)}px, calc(-50% + ${dy[i].toFixed(1)}px))`;
      // leader line from the dot to the middle of the box's left edge
      const line = this.lines[i].style;
      line.width = `${Math.hypot(dx, dy[i]).toFixed(1)}px`;
      line.transform = `rotate(${Math.atan2(dy[i], dx).toFixed(4)}rad)`;
    });
  }

  setVisible(on: boolean) {
    this.group.visible = on;
    for (const l of this.labels) l.visible = on;
  }
}
