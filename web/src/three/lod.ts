import * as THREE from "three";
import type { GlobeData } from "../data/globe";
import { globeHeight } from "../data/globe";
import { R_MOON_KM, toMap } from "../lib/astro";
import { craterDetailKm, PROCEDURAL_GLSL } from "../lib/procedural";
import { craterTexture, CRATER_TEX_GLSL, GROUND_GLSL } from "./craterTexture";
import { LANDER_SHADOW_GLSL, LANDER_SHADOW_H_KM, LANDER_SHADOW_R_KM } from "./landerModel";
import { POLAR_EXTENT_M } from "../gpu/globalLayers";
import { MOON_CENTER } from "./globe";
import { lastMissingGlobal64, onGlobalTile, requestGlobalTile, sampleGlobal64, tileFor } from "../data/globalTiles";
import { GpuTileCache, TILE_CACHE_GLSL } from "./tileCache";

const GRID = 32;
const MAX_LEVEL = 12;
const SPLIT = 2.4;
const BUILD_BUDGET_MS = 7;
const MAX_CACHED = 2400;

export type Quality = "saver" | "balanced" | "high";

interface Face {
  n: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
}

const FACES: Face[] = [
  { n: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, -1), v: new THREE.Vector3(0, 1, 0) },
  { n: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0) },
  { n: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1) },
  { n: new THREE.Vector3(0, -1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) },
  { n: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
  { n: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(-1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
];

// world direction (unit vector) -> planetocentric latitude/longitude in degrees
function latLonOfWorldDir(d: THREE.Vector3): [number, number] {
  return [(Math.asin(Math.max(-1, Math.min(1, -d.y))) * 180) / Math.PI, (Math.atan2(d.x, -d.z) * 180) / Math.PI];
}

function cubeToDir(f: Face, a: number, b: number, out: THREE.Vector3) {
  const ta = Math.tan((a * Math.PI) / 4);
  const tb = Math.tan((b * Math.PI) / 4);
  return out.copy(f.n).addScaledVector(f.u, ta).addScaledVector(f.v, tb).normalize();
}

function dataResKm(lat: number, lon: number): number {
  if (lat < -81) {
    const [x, y] = toMap(lat, lon);
    if (Math.hypot(x, y) < 248000) return 0.08;
  }
  if (lat < -82) return 0.24;
  return 1.9;
}

export interface Surface {
  h: number;
  res: number;
  want: number;
}

const surf: Surface = { h: 0, res: 0, want: -1 };

export function surfaceHeightM(g: GlobeData, dirWorld: THREE.Vector3, vertexSpacingKm: number): Surface {
  const ux = -dirWorld.z;
  const uy = dirWorld.x;
  const uz = -dirWorld.y;
  const lat = (Math.asin(Math.max(-1, Math.min(1, uz))) * 180) / Math.PI;
  const lon = (Math.atan2(uy, ux) * 180) / Math.PI;
  let res = dataResKm(lat, lon);
  let base: number;
  surf.want = -1;
  if (res > 1 && vertexSpacingKm < 2.0) {
    const h64 = sampleGlobal64(lat, lon);
    if (h64 !== null) {
      base = h64;
      res = 0.474;
    } else {
      const miss = lastMissingGlobal64();
      surf.want = miss >= 0 ? miss : tileFor(lat, lon);
      base = globeHeight(g, lat, lon);
    }
  } else base = globeHeight(g, lat, lon);
  const detail = craterDetailKm(ux * R_MOON_KM, uy * R_MOON_KM, uz * R_MOON_KM, vertexSpacingKm * 2.5, res * 2.5);
  surf.h = base + detail * 1000;
  surf.res = res;
  return surf;
}

class Node {
  key: string;
  mesh: THREE.Mesh | null = null;
  lastUsed = 0;
  pending = new Set<number>();
  dirty = false;
  center = new THREE.Vector3();
  constructor(
    public face: number,
    public level: number,
    public i: number,
    public j: number,
  ) {
    this.key = `${face}/${level}/${i}/${j}`;
    const n = 1 << level;
    const a = ((i + 0.5) / n) * 2 - 1;
    const b = ((j + 0.5) / n) * 2 - 1;
    cubeToDir(FACES[face], a, b, this.center);
  }
  get sizeKm() {
    return (Math.PI / 2) * R_MOON_KM / (1 << this.level);
  }
}

export class LodTerrain {
  group = new THREE.Group();
  material: THREE.ShaderMaterial;
  private nodes = new Map<string, Node>();
  private queue: Node[] = [];
  private frame = 0;
  private tmp = new THREE.Vector3();
  meshes: THREE.Mesh[] = [];
  private cache = new GpuTileCache();

  constructor(
    private g: GlobeData,
    color: THREE.Texture,
  ) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      glslVersion: THREE.GLSL3,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: color },
        uGOverlay: { value: new THREE.Texture() },
        uGOverlayS: { value: new THREE.Texture() },
        uGOverlayN: { value: new THREE.Texture() },
        uPolarExt: { value: POLAR_EXTENT_M },
        uGOverlayMix: { value: 0 },
        uGlobe: { value: intTexture(g.globe, g.width, g.height) },
        uGlobeSize: { value: new THREE.Vector2(g.width, g.height) },
        uPpd: { value: g.ppd },
        uStep: { value: g.step },
        uP80: { value: intTexture(g.p80, g.p80Size, g.p80Size) },
        uP80Size: { value: g.p80Size },
        uP80Cell: { value: g.p80Cell },
        uP80First: { value: g.p80First },
        uSunME: { value: new THREE.Vector3(1, 0, 0) },
        uSunWorld: { value: new THREE.Vector3(1, 0, 0) },
        uEarthWorld: { value: new THREE.Vector3(0, 1, 0) },
        uSunPower: { value: 10.5 },
        uEarthshine: { value: 0 },
        uHole: { value: new THREE.Vector3(0, 0, 0) },
        uCamPos: { value: new THREE.Vector3() },
        uT64: { value: null },
        uQuality: { value: 1 },
        uMapLight: { value: 0 },
        uCraterTex: { value: craterTexture() },
        uCutOn: { value: 0 },
        uCutA: { value: new THREE.Vector3(1, 0, 0) },
        uCutB: { value: new THREE.Vector3(0, 0, 1) },
        uT64Index: { value: null },
        uLanderPos: { value: new THREE.Vector3() },
        uLanderUp: { value: new THREE.Vector3(0, 1, 0) },
        uLanderR: { value: LANDER_SHADOW_R_KM },
        uLanderH: { value: LANDER_SHADOW_H_KM },
        uLanderOn: { value: 0 },
      },
    });
    this.group.name = "lod-terrain";
    this.material.uniforms.uT64.value = this.cache.array;
    this.material.uniforms.uT64Index.value = this.cache.index;
    onGlobalTile((key) => {
      for (const n of this.nodes.values()) {
        if (n.pending.has(key)) {
          n.dirty = true;
          this.hasWork = true;
        }
      }
    });
  }

  private node(face: number, level: number, i: number, j: number): Node {
    const key = `${face}/${level}/${i}/${j}`;
    let n = this.nodes.get(key);
    if (!n) {
      n = new Node(face, level, i, j);
      this.nodes.set(key, n);
    }
    return n;
  }

  private lastCams: THREE.Vector3[] = [];
  // One visible set per camera (split screen renders two views of the same tiles); useView picks one.
  private viewSets: Set<Node>[] = [];
  private viewCams: THREE.Camera[] = [];
  private hasWork = true;
  private changedFlag = false;

  // the 80 m polar data arrived after the globe: upload it and rebuild the polar tiles
  refreshPolar80() {
    const g = this.g;
    const u = this.material.uniforms;
    (u.uP80.value as THREE.Texture).dispose();
    u.uP80.value = intTexture(g.p80, g.p80Size, g.p80Size);
    u.uP80Size.value = g.p80Size;
    u.uP80Cell.value = g.p80Cell;
    u.uP80First.value = g.p80First;
    for (const n of this.nodes.values()) if (n.center.y > 0.97) n.dirty = true;
    this.hasWork = true;
  }

  get polar80Texture(): THREE.DataTexture {
    return this.material.uniforms.uP80.value as THREE.DataTexture;
  }

  // A rectangle of the 80 m grid (polar map metres) just got data: rebuild the tiles that cover it.
  markPolar80Rect(x0: number, y0: number, x1: number, y1: number) {
    const d = new THREE.Vector3();
    for (const n of this.nodes.values()) {
      d.copy(n.center);
      if (d.y < 0.95) continue;
      const [lat, lon] = latLonOfWorldDir(d);
      const [x, y] = toMap(lat, lon);
      const r = n.sizeKm * 1000 * 0.75;
      if (x + r < x0 || x - r > x1 || y + r < y0 || y - r > y1) continue;
      n.dirty = true;
      this.hasWork = true;
    }
  }

  setQuality(q: Quality) {
    this.material.uniforms.uQuality.value = q === "saver" ? 0 : q === "balanced" ? 1 : 2;
  }

  /** Refines the terrain for one or more cameras (split screen passes two), then shows the first camera's tiles. */
  update(cameras: THREE.Camera | THREE.Camera[]): boolean {
    const cams = Array.isArray(cameras) ? cameras : [cameras];
    const moved = cams.length !== this.lastCams.length || cams.some((c, i) => c.position.distanceToSquared(this.lastCams[i]) >= 1e-10);
    if (!this.hasWork && !moved) return false;
    this.lastCams = cams.map((c) => c.position.clone());
    this.changedFlag = false;
    this.frame++;
    this.queue = [];
    const sets = cams.map((c) => this.collect(c));
    for (const set of sets) for (const n of set) if (n.dirty) this.queue.push(n);
    const seen = new Set<string>();
    this.queue = this.queue.filter((n) => (seen.has(n.key) ? false : (seen.add(n.key), true)));
    const dirs = cams.map((c) => c.position.clone().sub(MOON_CENTER).normalize());
    const near = (n: Node) => Math.min(...dirs.map((d) => this.tmp.copy(n.center).distanceTo(d)));
    this.queue.sort((a, b) => a.level - b.level || near(a) - near(b));
    const t0 = performance.now();
    for (const n of this.queue) {
      if (performance.now() - t0 > BUILD_BUDGET_MS && n.level > 1) break;
      this.build(n);
      this.changedFlag = true;
    }
    this.hasWork = this.changedFlag || this.queue.some((n) => !n.mesh || n.dirty);

    const same = (a: Set<Node>, b: Set<Node> | undefined) => !!b && a.size === b.size && [...a].every((n) => b.has(n));
    if (sets.some((s, i) => !same(s, this.viewSets[i])) || sets.length !== this.viewSets.length) this.changedFlag = true;
    this.viewSets = sets;
    this.viewCams = cams;
    for (const set of sets) for (const n of set) n.lastUsed = this.frame;
    this.useView(0);
    if (this.nodes.size > MAX_CACHED) this.evict();
    return this.changedFlag;
  }

  /** Shows the tiles chosen for camera `i` of the last update (and points the detail fade at that camera). */
  useView(i: number) {
    const set = this.viewSets[i] ?? this.viewSets[0];
    const cam = this.viewCams[i] ?? this.viewCams[0];
    if (!set) return;
    this.meshes = [];
    for (const n of this.nodes.values()) {
      if (!n.mesh) continue;
      const on = set.has(n);
      n.mesh.visible = on;
      if (on) this.meshes.push(n.mesh);
    }
    if (cam) this.material.uniforms.uCamPos.value.copy(cam.position);
  }

  // Quadtree walk for one camera: queues tiles that need building and returns the ones to draw.
  private collect(camera: THREE.Camera): Set<Node> {
    const cam = camera.position.clone().sub(MOON_CENTER);
    const camDist = cam.length();
    const camDir = cam.clone().normalize();
    const horizon = Math.acos(Math.min(1, R_MOON_KM / Math.max(camDist, R_MOON_KM + 0.01))) + 0.08;
    const visible = new Set<Node>();
    const visit = (n: Node) => {
      const ang = (n.sizeKm / R_MOON_KM) * 0.75;
      if (camDir.dot(n.center) < Math.cos(Math.min(Math.PI, horizon + ang))) return;
      const world = this.tmp.copy(n.center).multiplyScalar(R_MOON_KM).add(MOON_CENTER);
      const dist = world.distanceTo(camera.position);
      const wantSplit = n.level < MAX_LEVEL && dist < n.sizeKm * SPLIT;
      if (wantSplit) {
        const kids = [0, 1, 2, 3].map((q) => this.node(n.face, n.level + 1, n.i * 2 + (q & 1), n.j * 2 + (q >> 1)));
        const ready = kids.every((k) => k.mesh);
        if (ready) {
          kids.forEach(visit);
          return;
        }
        kids.forEach((k) => {
          if (!k.mesh) this.queue.push(k);
        });
      }
      if (!n.mesh) {
        this.queue.push(n);
        if (n.level > 0) return;
      }
      if (n.mesh) visible.add(n);
    };
    for (let f = 0; f < 6; f++) visit(this.node(f, 0, 0, 0));
    return visible;
  }

  private evict() {
    const built = [...this.nodes.values()].filter((n) => n.mesh && n.level > 1 && n.lastUsed < this.frame - 120);
    built.sort((a, b) => a.lastUsed - b.lastUsed);
    for (const n of built.slice(0, built.length / 2)) {
      this.group.remove(n.mesh!);
      n.mesh!.geometry.dispose();
      n.mesh = null;
      this.nodes.delete(n.key);
    }
  }

  private build(n: Node) {
    const f = FACES[n.face];
    const cells = 1 << n.level;
    const a0 = (n.i / cells) * 2 - 1;
    const b0 = (n.j / cells) * 2 - 1;
    const span = 2 / cells;
    const spacingKm = n.sizeKm / GRID;
    const E = GRID + 3;
    const world = new Float32Array(E * E * 3);
    const resArr = new Float32Array(E * E);
    const dir = new THREE.Vector3();
    n.pending.clear();
    n.dirty = false;
    for (let r = 0; r < E; r++) {
      for (let c = 0; c < E; c++) {
        const a = a0 + ((c - 1) / GRID) * span;
        const b = b0 + ((r - 1) / GRID) * span;
        cubeToDir(f, a, b, dir);
        const s = surfaceHeightM(this.g, dir, spacingKm);
        if (s.want >= 0 && !n.pending.has(s.want)) {
          n.pending.add(s.want);
          requestGlobalTile(s.want);
        }
        resArr[r * E + c] = s.res;
        const h = s.h / 1000;
        const k = (r * E + c) * 3;
        world[k] = dir.x * (R_MOON_KM + h);
        world[k + 1] = dir.y * (R_MOON_KM + h);
        world[k + 2] = dir.z * (R_MOON_KM + h);
      }
    }
    const V = GRID + 1;
    const centerIdx = ((1 + GRID / 2) * E + 1 + GRID / 2) * 3;
    const ox = world[centerIdx];
    const oy = world[centerIdx + 1];
    const oz = world[centerIdx + 2];
    const skirtDepth = spacingKm * 1.5;
    const total = V * V + 4 * V;
    const pos = new Float32Array(total * 3);
    const resV = new Float32Array(total).fill(1.9);
    const nor = new Float32Array(total * 3);
    const at = (r: number, c: number) => (r * E + c) * 3;
    for (let r = 0; r < V; r++) {
      for (let c = 0; c < V; c++) {
        const k = at(r + 1, c + 1);
        const o = (r * V + c) * 3;
        pos[o] = world[k] - ox;
        pos[o + 1] = world[k + 1] - oy;
        pos[o + 2] = world[k + 2] - oz;
        resV[r * V + c] = resArr[(r + 1) * E + c + 1];
        const L = at(r + 1, c);
        const Rr = at(r + 1, c + 2);
        const D = at(r, c + 1);
        const U = at(r + 2, c + 1);
        const tx = world[Rr] - world[L];
        const ty = world[Rr + 1] - world[L + 1];
        const tz = world[Rr + 2] - world[L + 2];
        const sx = world[U] - world[D];
        const sy = world[U + 1] - world[D + 1];
        const sz = world[U + 2] - world[D + 2];
        let nx = ty * sz - tz * sy;
        let ny = tz * sx - tx * sz;
        let nz = tx * sy - ty * sx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        const outward = nx * world[k] + ny * world[k + 1] + nz * world[k + 2];
        const s = outward < 0 ? -1 : 1;
        nor[o] = nx * s;
        nor[o + 1] = ny * s;
        nor[o + 2] = nz * s;
      }
    }
    const edges: number[][] = [[], [], [], []];
    for (let t = 0; t < V; t++) {
      edges[0].push(t);
      edges[1].push((V - 1) * V + t);
      edges[2].push(t * V);
      edges[3].push(t * V + V - 1);
    }
    let sk = V * V;
    const skirtStart: number[] = [];
    for (let e = 0; e < 4; e++) {
      skirtStart.push(sk);
      for (const vi of edges[e]) {
        const o = vi * 3;
        const wx = pos[o] + ox;
        const wy = pos[o + 1] + oy;
        const wz = pos[o + 2] + oz;
        const l = Math.hypot(wx, wy, wz);
        const q = sk * 3;
        pos[q] = pos[o] - (wx / l) * skirtDepth;
        pos[q + 1] = pos[o + 1] - (wy / l) * skirtDepth;
        pos[q + 2] = pos[o + 2] - (wz / l) * skirtDepth;
        nor[q] = nor[o];
        nor[q + 1] = nor[o + 1];
        nor[q + 2] = nor[o + 2];
        sk++;
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const p = r * V + c;
        idx.push(p, p + 1, p + V, p + 1, p + V + 1, p + V);
      }
    }
    for (let e = 0; e < 4; e++) {
      for (let t = 0; t < GRID; t++) {
        const a = edges[e][t];
        const b = edges[e][t + 1];
        const sa = skirtStart[e] + t;
        const sb = skirtStart[e] + t + 1;
        idx.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("aSpacing", new THREE.BufferAttribute(new Float32Array(total).fill(spacingKm), 1));
    geo.setAttribute("aRes", new THREE.BufferAttribute(resV, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(ox + MOON_CENTER.x, oy + MOON_CENTER.y, oz + MOON_CENTER.z);
    mesh.visible = n.mesh?.visible ?? false;
    if (n.mesh) {
      this.group.remove(n.mesh);
      n.mesh.geometry.dispose();
    }
    this.group.add(mesh);
    n.mesh = mesh;
  }

  dispose() {
    for (const n of this.nodes.values()) n.mesh?.geometry.dispose();
    this.nodes.clear();
    this.material.dispose();
  }
}

function intTexture(data: Int16Array, w: number, h: number) {
  const tex = new THREE.DataTexture(data, w, h, THREE.RedIntegerFormat, THREE.ShortType);
  tex.internalFormat = "R16I";
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.unpackAlignment = 1;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */ `
attribute float aSpacing;
attribute float aRes;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vSpacing;
varying float vRes;
void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vSpacing = aSpacing;
  vRes = aRes;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
precision highp isampler2D;
uniform sampler2D uColor;
uniform sampler2D uGOverlay;
uniform sampler2D uGOverlayS;
uniform sampler2D uGOverlayN;
uniform float uGOverlayMix;
uniform float uPolarExt;
uniform isampler2D uGlobe;
uniform vec2 uGlobeSize;
uniform float uPpd;
uniform float uStep;
uniform isampler2D uP80;
uniform int uP80Size;
uniform float uP80Cell;
uniform float uP80First;
uniform vec3 uSunME;
uniform vec3 uSunWorld;
uniform vec3 uEarthWorld;
uniform float uSunPower;
uniform float uEarthshine;
uniform vec3 uHole;
uniform vec3 uCamPos;
uniform int uQuality;
uniform float uMapLight;
uniform float uCutOn;
uniform vec3 uCutA;
uniform vec3 uCutB;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vSpacing;
varying float vRes;
out vec4 fragColor;

const float PI = 3.14159265358979;
const float R_M = 1737400.0;
const float R_KM = 1737.4;
const vec3 CENTER = vec3(0.0, -1737.4, 0.0);

${PROCEDURAL_GLSL}
${TILE_CACHE_GLSL}
${CRATER_TEX_GLSL}
${GROUND_GLSL}
${LANDER_SHADOW_GLSL}

// The crater tile projected onto the sphere from three directions, blended by which way the
// ground faces, so it covers the whole Moon without seams. Returns the 3D slope and halo.
vec4 craterTri(vec3 pm, vec3 up) {
  vec3 w = pow(abs(up), vec3(6.0));
  w /= (w.x + w.y + w.z);
  vec4 a = w.x > 0.02 ? craterDetailTex(pm.yz) : vec4(0.0);
  vec4 b = w.y > 0.02 ? craterDetailTex(pm.zx) : vec4(0.0);
  vec4 c = w.z > 0.02 ? craterDetailTex(pm.xy) : vec4(0.0);
  vec3 G = w.x * vec3(0.0, a.x, a.y) + w.y * vec3(b.y, 0.0, b.x) + w.z * vec3(c.x, c.y, 0.0);
  return vec4(G, w.x * a.w + w.y * b.w + w.z * c.w);
}

float hashf(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h3(ivec3 c) { return float(pcg3(c.x, c.y, c.z) & 0xffffu) / 65535.0; }

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  ivec3 c = ivec3(i);
  float a = mix(h3(c), h3(c + ivec3(1, 0, 0)), f.x);
  float b = mix(h3(c + ivec3(0, 1, 0)), h3(c + ivec3(1, 1, 0)), f.x);
  float d = mix(h3(c + ivec3(0, 0, 1)), h3(c + ivec3(1, 0, 1)), f.x);
  float e = mix(h3(c + ivec3(0, 1, 1)), h3(c + ivec3(1, 1, 1)), f.x);
  return mix(mix(a, b, f.y), mix(d, e, f.y), f.z);
}

// Fine brightness variation of the regolith below the color map's ~1.3 km pixels.
// Octaves smaller than a few screen pixels fade out so it never shimmers.
float mottle(vec3 p, float footprint) {
  float s = 0.0;
  float wl = 6.0;
  float amp = 0.11;
  for (int o = 0; o < 5; o++) {
    float fade = smoothstep(footprint * 3.0, footprint * 9.0, wl);
    s += (vnoise3(p / wl + float(o) * 17.3) - 0.5) * 2.0 * amp * fade;
    wl *= 0.42;
    amp *= 0.8;
  }
  return s;
}

float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashf(i), hashf(i + vec2(1, 0)), u.x), mix(hashf(i + vec2(0, 1)), hashf(i + vec2(1, 1)), u.x), u.y);
}

float p80(vec2 m, out bool ok) {
  float c = (m.x - uP80First) / uP80Cell;
  float r = (-uP80First - m.y) / uP80Cell;
  float n = float(uP80Size);
  ok = false;
  if (c < 0.0 || r < 0.0 || c >= n - 1.0 || r >= n - 1.0) return 0.0;
  ivec2 p = ivec2(floor(vec2(c, r)));
  vec2 f = vec2(c, r) - floor(vec2(c, r));
  int a = texelFetch(uP80, p, 0).r;
  int b = texelFetch(uP80, p + ivec2(1, 0), 0).r;
  int d = texelFetch(uP80, p + ivec2(0, 1), 0).r;
  int e = texelFetch(uP80, p + ivec2(1, 1), 0).r;
  if (a == -32768 || b == -32768 || d == -32768 || e == -32768) return 0.0;
  ok = true;
  return mix(mix(float(a), float(b), f.x), mix(float(d), float(e), f.x), f.y);
}

float globeH(float latDeg, float lonDeg) {
  float fx = mod(lonDeg + 360.0, 360.0) * uPpd - 0.5;
  float fy = clamp((90.0 - latDeg) * uPpd - 0.5, 0.0, uGlobeSize.y - 1.001);
  int w = int(uGlobeSize.x);
  int x0 = int(floor(fx));
  int y0 = int(floor(fy));
  float tx = fx - floor(fx);
  float ty = fy - floor(fy);
  int xa = ((x0 % w) + w) % w;
  int xb = (xa + 1) % w;
  float a = float(texelFetch(uGlobe, ivec2(xa, y0), 0).r);
  float b = float(texelFetch(uGlobe, ivec2(xb, y0), 0).r);
  float d = float(texelFetch(uGlobe, ivec2(xa, y0 + 1), 0).r);
  float e = float(texelFetch(uGlobe, ivec2(xb, y0 + 1), 0).r);
  return mix(mix(a, b, tx), mix(d, e, tx), ty) * uStep;
}

float demH(vec3 u, out float res) {
  if (u.z < -0.988) {
    float k = 2.0 * R_M / (1.0 - u.z);
    bool ok;
    float h = p80(vec2(k * u.y, k * u.x), ok);
    if (ok) { res = 0.08; return h; }
  }
  float la = degrees(asin(clamp(u.z, -1.0, 1.0)));
  float lo = degrees(atan(u.y, u.x));
  bool ok64;
  float t64 = h64(la, lo, ok64);
  if (ok64) { res = 0.474; return t64; }
  res = 1.9;
  return globeH(la, lo);
}

void main() {
  if (uCutOn > 0.5) {
    vec3 pc = vWorld - vec3(0.0, -1737.4, 0.0);
    if (dot(pc, uCutA) > 0.0 && dot(pc, uCutB) > 0.0) discard;
  }
  vec3 dW = normalize(vWorld - CENTER);
  vec3 u = vec3(-dW.z, dW.x, -dW.y);
  float latR = asin(clamp(u.z, -1.0, 1.0));
  float lonR = atan(u.y, u.x);
  float lat = degrees(latR);
  float lon = degrees(lonR);

  float kk = 2.0 * R_M * tan(PI / 4.0 + latR / 2.0);
  vec2 mp = vec2(kk * sin(lonR), kk * cos(lonR));
  if (uHole.z > 0.0 && lat < -72.0 && abs(mp.x - uHole.x) < uHole.z && abs(mp.y - uHole.y) < uHole.z) discard;

  float camDist = length(uCamPos - vWorld);
  float res;
  float h0 = demH(u, res);

  vec3 n = normalize(vNormal);
  float halo = 0.0;
  float footprint = max(camDist * 0.0012, 0.004);
  float maxCell = min(vSpacing * 2.5, min(res, vRes) * 2.5);
  if (camDist < 140.0) {
    vec4 cd = craterTri((vWorld - CENTER) * 1000.0, dW);
    float fade = 1.0 - smoothstep(80.0, 140.0, camDist);
    vec3 G = cd.xyz - dW * dot(cd.xyz, dW);
    n = normalize(n - G * 0.85 * fade);
    halo = cd.w * fade;
  }

  vec3 sv = normalize(uSunME - u * R_KM);
  float sel = asin(dot(sv, u));
  float lit = 1.0;
  bool facing = dot(normalize(vNormal), normalize(uSunWorld)) > -0.08;
  if (!facing) lit = 0.0;
  if (facing && sel < radians(30.0)) {
    vec3 east = normalize(vec3(-u.y, u.x, 0.0) + vec3(1e-6, 0.0, 0.0));
    vec3 north = cross(u, east);
    vec3 sdir = normalize(sv - u * dot(sv, u));
    float hs = h0 + 2.0;
    float best = -1.5;
    float d = max(res * 1000.0 * 0.6, camDist * 1.5);
    float hsDetail = camDist < 30.0 ? craterDetail(u * R_KM, max(footprint * 4.0, 0.45), min(vSpacing * 2.5, min(res, vRes) * 2.5)) * 1000.0 : 0.0;
    hs += hsDetail;
    int steps = uQuality == 0 ? 28 : uQuality == 1 ? 42 : 70;
    float grow = uQuality == 0 ? 1.2 : uQuality == 1 ? 1.14 : 1.095;
    for (int i = 0; i < 90; i++) {
      if (i >= steps) break;
      float delta = d / R_M;
      float sh = sin(0.5 * delta);
      vec3 q = cos(delta) * u + sin(delta) * sdir;
      float r2;
      float dh = demH(q, r2) - hs;
      if (uQuality > 0 && camDist < 25.0 && i < 10) dh += craterDetail(q * R_KM, max(d * 0.0025, max(footprint * 4.0, 0.45)), min(vSpacing * 2.5, min(res, vRes) * 2.5)) * 1000.0;
      best = max(best, atan(dh - 2.0 * R_M * sh * sh, R_M * sin(delta)));
      if (best > sel + 0.02) break;
      d *= grow;
      if (d > 220000.0) break;
    }
    lit = clamp((sel - best) / radians(0.53) + 0.5, 0.0, 1.0);
  }

  if (camDist < 140.0 && lit > 0.0) {
    vec3 Ls = normalize(uSunWorld);
    float sinE = dot(Ls, dW);
    if (sinE > 0.05 && sinE < 0.65) {
      vec3 aw = abs(dW);
      vec3 pm = (vWorld - CENTER) * 1000.0;
      vec2 m;
      vec2 sd;
      float wmax;
      if (aw.x >= aw.y && aw.x >= aw.z) { m = pm.yz; sd = vec2(Ls.y, Ls.z); wmax = aw.x; }
      else if (aw.y >= aw.z) { m = pm.zx; sd = vec2(Ls.z, Ls.x); wmax = aw.y; }
      else { m = pm.xy; sd = vec2(Ls.x, Ls.y); wmax = aw.z; }
      vec3 a6 = pow(aw, vec3(6.0));
      float wn = pow(wmax, 6.0) / (a6.x + a6.y + a6.z);
      float tanE = sinE / sqrt(max(1.0 - sinE * sinE, 1e-4));
      float cs = craterShadow(m, normalize(sd + vec2(1e-6, 0.0)), tanE, footprint * 1000.0);
      lit *= mix(1.0, cs, smoothstep(0.55, 0.85, wn) * (1.0 - smoothstep(80.0, 140.0, camDist)) * smoothstep(0.05, 0.1, sinE));
    }
  }

  float rockAlb = 1.0;
  if (camDist < 0.3) {
    float fd = 1.0 - smoothstep(0.12, 0.3, camDist);
    vec3 aw = abs(dW);
    vec3 pw = vWorld * 1000.0;
    vec3 Lr = normalize(uSunWorld);
    vec2 m;
    vec2 sdp;
    int ax;
    if (aw.x >= aw.y && aw.x >= aw.z) { m = pw.yz; sdp = vec2(Lr.y, Lr.z); ax = 0; }
    else if (aw.y >= aw.z) { m = pw.zx; sdp = vec2(Lr.z, Lr.x); ax = 1; }
    else { m = pw.xy; sdp = vec2(Lr.x, Lr.y); ax = 2; }
    float rmask;
    vec2 g = groundDetail(m, rmask);
    vec3 G = ax == 0 ? vec3(0.0, g.x, g.y) : ax == 1 ? vec3(g.y, 0.0, g.x) : vec3(g.x, g.y, 0.0);
    G -= dW * dot(G, dW);
    n = normalize(n - G * fd);
    float sinR = dot(Lr, dW);
    if (lit > 0.0 && sinR > 0.0) lit *= mix(1.0, rockShadow(m, normalize(sdp + vec2(1e-6, 0.0)), sinR / sqrt(max(1.0 - sinR * sinR, 1e-4))), fd);
    rockAlb = mix(1.0, 1.2, rmask * fd);
  }
  if (lit > 0.0) lit *= landerShadow(vWorld, normalize(uSunWorld));

  vec2 uv = vec2((lon + 180.0) / 360.0, (lat + 90.0) / 180.0);
  // uv.x jumps from 1 to 0 at longitude ±180°, which would make the GPU pick the smallest mip level along that
  // line. Take the x derivative from a copy shifted by half a turn wherever that copy is continuous.
  vec2 uvDx = dFdx(uv), uvDy = dFdy(uv);
  float uxs = fract(uv.x + 0.5);
  float sDx = dFdx(uxs), sDy = dFdy(uxs);
  if (abs(sDx) + abs(sDy) < abs(uvDx.x) + abs(uvDy.x)) { uvDx.x = sDx; uvDy.x = sDy; }
  vec3 mapAlbedo = textureGrad(uColor, uv, uvDx, uvDy).rgb * 0.30;
  float tone = vnoise(mp / 2600.0) * 0.55 + vnoise(mp / 700.0) * 0.3 + vnoise(mp / 150.0) * 0.15;
  vec3 polarAlbedo = mix(vec3(0.105, 0.102, 0.098), vec3(0.165, 0.160, 0.152), tone);
  float polarW = 1.0 - smoothstep(-82.0, -76.0, lat);
  vec3 albedo = mix(mapAlbedo, polarAlbedo, polarW);
  albedo *= 0.92 + 0.16 * vnoise3(dW * 58.0);
  albedo *= 1.0 + 0.32 * halo;
  albedo *= rockAlb;
  if (camDist < 150.0) albedo *= 1.0 + mottle(u * R_KM, footprint) * (1.0 - smoothstep(90.0, 150.0, camDist));

  vec3 L = normalize(uSunWorld);
  vec3 V = normalize(cameraPosition - vWorld);
  float mu0 = max(dot(n, L), 0.0);
  float mu = max(dot(n, V), 0.02);
  float ph = degrees(acos(clamp(dot(L, V), -1.0, 1.0)));
  float lunarL = clamp(1.0 - 0.019 * ph + 0.000242 * ph * ph - 0.00000146 * ph * ph * ph, 0.0, 1.0);
  float photometry = mu0 > 0.0 ? 2.0 * lunarL * mu0 / (mu0 + mu) + (1.0 - lunarL) * mu0 : 0.0;
  float surge = 1.0 + 0.35 * exp(-ph / 6.0);
  // light bounced off nearby sunlit ground: faint, mostly from the Sun's side
  vec3 Lh = normalize(L - dW * dot(L, dW) + dW * 0.15);
  float fill = uSunPower * 0.012 * (0.35 + 0.65 * max(dot(n, Lh), 0.0)) * smoothstep(-0.12, 0.05, dot(dW, L));
  vec3 col = albedo * (vec3(1.0, 0.975, 0.94) * uSunPower * photometry * surge * lit + vec3(0.85, 0.85, 0.88) * fill + vec3(0.55, 0.68, 1.0) * uEarthshine * max(dot(n, normalize(uEarthWorld)), 0.0) + 0.0008);
  if (uMapLight > 0.5) {
    // map view: shaded relief lit from a fixed direction, readable everywhere
    vec3 fixedW = vec3(-0.7, 0.0, -0.7);
    vec3 tW = fixedW - dW * dot(fixedW, dW);
    vec3 Lm = normalize(dW * 0.62 + (dot(tW, tW) > 1e-6 ? normalize(tW) : vec3(1.0, 0.0, 0.0)));
    float hill = max(dot(n, Lm), 0.0);
    col = albedo * 3.4 * (0.1 + 0.9 * hill);
    mu0 = hill;
  }

  if (any(isnan(col))) col = vec3(0.0);
  if (uGOverlayMix > 0.0) {
    vec4 o = texture(uGOverlay, uv);
    // near either pole switch to the polar grids (square cells instead of thin wedges)
    float kp = 2.0 * R_M * tan((PI / 2.0 - abs(latR)) / 2.0);
    vec2 pm = vec2(kp * sin(lonR), kp * cos(lonR));
    float wp = 1.0 - smoothstep(0.8 * uPolarExt, 0.95 * uPolarExt, kp);
    if (wp > 0.0) {
      vec2 puv = (pm + uPolarExt) / (2.0 * uPolarExt);
      vec4 po = latR < 0.0 ? texture(uGOverlayS, puv) : texture(uGOverlayN, puv);
      o = mix(o, po, wp);
    }
    float relief = clamp(0.55 + 0.6 * mu0, 0.55, 0.95);
    col = mix(col, o.rgb * relief, o.a * uGOverlayMix);
  }
  fragColor = vec4(clamp(col, 0.0, 40.0), 1.0);
}`;
