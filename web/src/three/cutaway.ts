import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { R_MOON_KM } from "../lib/astro";
import { MOON_CENTER } from "./globe";

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

export class Cutaway {
  group = new THREE.Group();
  a = new THREE.Vector3(1, 0, 0);
  b = new THREE.Vector3(0, 0, 1);
  private faces: THREE.Mesh[] = [];
  private labels: CSS2DObject[] = [];

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
      const el = document.createElement("div");
      el.className = "layer-label";
      el.innerHTML = `<b>${l.name}</b><span>${l.detail}</span>`;
      const obj = new CSS2DObject(el);
      this.labels.push(obj);
      this.group.add(obj);
    }
    this.group.visible = false;
  }

  orient(camera: THREE.Camera) {
    const c0 = camera.position.clone().sub(MOON_CENTER).normalize();
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const c = c0.clone().applyAxisAngle(camUp, -0.55).add(camUp.clone().multiplyScalar(0.18)).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.sub(c.clone().multiplyScalar(right.dot(c))).normalize();
    this.a.copy(c).add(right).normalize();
    this.b.copy(c).sub(right).normalize();
    const set = (mesh: THREE.Mesh, normal: THREE.Vector3, keep: THREE.Vector3) => {
      mesh.position.copy(MOON_CENTER);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      (mesh.material as THREE.ShaderMaterial).uniforms.uKeep.value.copy(keep);
    };
    set(this.faces[0], this.a, this.b);
    set(this.faces[1], this.b, this.a);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const along = this.b.clone().sub(this.a.clone().multiplyScalar(this.b.dot(this.a))).normalize();
    LAYERS.forEach((l, i) => {
      const r = l.r1 === R_MOON_KM ? R_MOON_KM - 8 : (l.r0 + l.r1) / 2;
      const dir = along.clone().multiplyScalar(Math.cos(0.5 + i * 0.12)).add(up.clone().multiplyScalar(Math.sin(0.5 + i * 0.12) * 0.25)).normalize();
      this.labels[i].position.copy(MOON_CENTER).addScaledVector(dir, r);
    });
  }

  setVisible(on: boolean) {
    this.group.visible = on;
    for (const l of this.labels) l.visible = on;
  }
}
