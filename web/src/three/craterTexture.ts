import * as THREE from "three";
import { buildCraterLevels, CRATER_N } from "./craterData";

// A seamless tile of small craters (craterData.ts). Sampling it at a few scales gives crater detail for the price of
// three texture reads, and the mipmaps stop it from shimmering far away.
//
// Building it takes about a second, so it happens in a worker: the texture starts out flat (no crater detail) and
// is filled in when the worker is done, instead of freezing the page while the Moon first loads.

const N = CRATER_N;
let cached: THREE.DataTexture | null = null;
const ready = new Set<() => void>();

/** Calls cb once the crater detail has been filled in (so a render-on-demand scene can redraw). */
export function onCraterTexture(cb: () => void): () => void {
  ready.add(cb);
  return () => ready.delete(cb);
}

function fill(tex: THREE.DataTexture, levels: Uint16Array[]) {
  (tex.image as unknown as { data: Uint16Array }).data = levels[0];
  tex.mipmaps?.forEach((m, k) => ((m as unknown as { data: Uint16Array }).data = levels[k]));
  tex.needsUpdate = true;
  ready.forEach((cb) => cb());
}

export function craterTexture(): THREE.DataTexture {
  if (cached) return cached;
  // flat until the real tile arrives: all slopes, heights and halos zero
  const sizes: number[] = [];
  for (let n = N; n >= 1; n >>= 1) sizes.push(n);
  const tex = new THREE.DataTexture(new Uint16Array(N * N * 4), N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mipmaps = sizes.map((n) => ({ data: new Uint16Array(n * n * 4), width: n, height: n })) as unknown as typeof tex.mipmaps;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cached = tex;
  if (typeof Worker !== "undefined") {
    try {
      const worker = new Worker(new URL("./craterWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<Uint16Array[]>) => {
        worker.terminate();
        fill(tex, e.data);
      };
      const fallback = () => {
        worker.terminate();
        fill(tex, buildCraterLevels());
      };
      worker.onerror = fallback;
      worker.onmessageerror = fallback;
      return tex;
    } catch {
      // Some environments expose Worker but block its construction. Build the texture locally there.
    }
  }
  fill(tex, buildCraterLevels());
  return tex;
}

// Slope (xy, in the map plane) and halo from three rotated scales of the crater tile.
export const CRATER_TEX_GLSL = /* glsl */ `
uniform sampler2D uCraterTex;
vec4 craterTap(vec2 m, float size, float ang, vec2 off) {
  float c = cos(ang);
  float s = sin(ang);
  mat2 R = mat2(c, s, -s, c);
  vec4 t = texture(uCraterTex, (R * m) / size + off);
  t.xy = transpose(R) * t.xy;
  return t;
}
// slow random variation, used to pick which copy of the tile to show so the pattern never repeats visibly
float ctHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ctNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ctHash(i), ctHash(i + vec2(1.0, 0.0)), f.x), mix(ctHash(i + vec2(0.0, 1.0)), ctHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Anti-tiling (I. Quilez, "Texture repetition", technique 3): a slow noise chooses one of 8 random shifts
// of the tile in each patch of ground and blends two neighbouring choices, so the same craters never
// line up in a visible grid. Returns the two shifts (xy, zw) and the blend weight.
vec4 craterShifts(vec2 m, float size, float seed, out float w) {
  // patches about half a tile across: larger ones still show the tile repeating inside them
  float l = ctNoise(m / (size * 0.55) + seed) * 8.0;
  float ia = floor(l);
  w = smoothstep(0.2, 0.8, l - ia);
  return vec4(sin(vec2(3.0, 7.0) * (ia + seed)), sin(vec2(3.0, 7.0) * (ia + 1.0 + seed)));
}
vec4 craterVar(vec2 m, float size, float ang, float seed) {
  float w;
  vec4 sh = craterShifts(m, size, seed, w);
  float c = cos(ang);
  float s = sin(ang);
  mat2 R = mat2(c, s, -s, c);
  vec2 uv = (R * m) / size;
  // explicit gradients: the shift jumps where the choice changes, and the implicit ones would then pick
  // the blurriest mip level along those lines
  vec2 gx = dFdx(uv);
  vec2 gy = dFdy(uv);
  vec4 a = textureGrad(uCraterTex, uv + sh.xy, gx, gy);
  vec4 b = textureGrad(uCraterTex, uv + sh.zw, gx, gy);
  vec4 t = mix(a, b, w);
  t.xy = transpose(R) * t.xy;
  return t;
}
vec2 craterShift(vec2 m, float size, float seed) {
  float w;
  vec4 sh = craterShifts(m, size, seed, w);
  return w < 0.5 ? sh.xy : sh.zw;
}
// Cast shadows inside the crater tile: march from the pixel toward the Sun through the height
// channel; if the terrain rises above the ray the pixel is shadowed. k is that scale's weight.
float craterShadow1(vec2 m, float size, float ang, vec2 off, vec2 sd, float tanE, float fpm) {
  float fpx = fpm / size * 1024.0;
  if (fpx > 24.0) return 1.0;
  float c = cos(ang);
  float s = sin(ang);
  mat2 R = mat2(c, s, -s, c);
  vec2 uv = (R * m) / size + off;
  vec2 d = R * sd / 1024.0;
  float lod0 = log2(max(fpx, 1.0));
  float h0 = textureLod(uCraterTex, uv, lod0).z;
  float lit = 1.0;
  float t = max(1.5, fpx);
  for (int i = 0; i < 11; i++) {
    float h = textureLod(uCraterTex, uv + d * t, max(lod0, log2(t * 0.2))).z;
    lit = min(lit, clamp((h0 + t * tanE - h) / (t * 0.03) + 0.5, 0.0, 1.0));
    t *= 1.6;
    if (t > 340.0 || lit <= 0.0) break;
  }
  return lit;
}
float craterShadow(vec2 m, vec2 sd, float tanE, float fpm) {
  float a = craterShadow1(m, 5200.0, 0.0, craterShift(m, 5200.0, 0.0), sd, tanE / 0.85, fpm);
  float b = a > 0.0 ? craterShadow1(m, 1300.0, 2.1, craterShift(m, 1300.0, 3.7), sd, tanE / (0.85 * 0.55), fpm) : 1.0;
  float c = a * b > 0.0 ? craterShadow1(m, 330.0, 4.2, vec2(0.13, 0.52), sd, tanE / (0.85 * 0.3), fpm) : 1.0;
  return a * b * c;
}

vec4 craterDetailTex(vec2 m) {
  vec4 a = craterVar(m, 5200.0, 0.0, 0.0);
  vec4 b = craterVar(m, 1300.0, 2.1, 3.7);
  vec4 c = craterTap(m, 330.0, 4.2, vec2(0.13, 0.52));
  return vec4(a.xy + b.xy * 0.55 + c.xy * 0.3, 0.0, max(a.w, max(b.w * 0.7, c.w * 0.4)));
}
`;

export const GROUND_GLSL = /* glsl */ `
// ---- Close-range ground: rocks, small craters and soil roughness (looks only, never data).
// Coordinates are metres in a local plane.
uint gHash(ivec2 c, uint s) {
  uint x = uint(c.x) * 0x8da6b343u ^ uint(c.y) * 0xd8163841u ^ s * 0xcb1ab31fu;
  x ^= x >> 13u;
  x *= 0x5bd1e995u;
  x ^= x >> 15u;
  return x;
}
float gNoise(vec2 p, uint s) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  float a = float(gHash(c, s) & 65535u) / 65535.0;
  float b = float(gHash(c + ivec2(1, 0), s) & 65535u) / 65535.0;
  float d = float(gHash(c + ivec2(0, 1), s) & 65535u) / 65535.0;
  float e = float(gHash(c + ivec2(1, 1), s) & 65535u) / 65535.0;
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}
const float ROCK_CELL = 1.6;
// rock in grid cell c: centre (metres) in xy, radius in z (0 = no rock)
vec3 rockIn(ivec2 c) {
  uint h = gHash(c, 913u);
  vec2 cellC = (vec2(c) + 0.5) * ROCK_CELL;
  float density = 0.015 + 0.07 * gNoise(cellC / 35.0, 77u);
  if (float(h & 1023u) / 1023.0 > density) return vec3(0.0);
  vec2 ctr = (vec2(c) + vec2(float((h >> 10u) & 255u), float((h >> 18u) & 255u)) / 255.0) * ROCK_CELL;
  float rad = 0.08 + 0.5 * pow(float((h >> 26u) & 63u) / 63.0, 3.4);
  return vec3(ctr, rad);
}
float rocksH(vec2 m) {
  ivec2 b = ivec2(floor(m / ROCK_CELL));
  float h = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 c = b + ivec2(i, j);
      vec3 rk = rockIn(c);
      if (rk.z == 0.0) continue;
      vec2 dv = m - rk.xy;
      float ang = atan(dv.y, dv.x);
      uint hh = gHash(c, 31u);
      float wob = 1.0 + 0.2 * sin(3.0 * ang + float(hh & 63u)) + 0.1 * sin(5.0 * ang + float((hh >> 6u) & 63u));
      float dd = length(dv) / (rk.z * wob);
      if (dd < 1.0) h = max(h, rk.z * 0.55 * pow(1.0 - dd * dd, 0.55));
    }
  }
  return h;
}
// slope (dh/dx, dh/dy) of rocks + soil + small craters; rockMask = 1 on a rock
vec2 groundDetail(vec2 m, out float rockMask) {
  float e = 0.03;
  float h0 = rocksH(m);
  vec2 g = vec2(rocksH(m + vec2(e, 0.0)) - h0, rocksH(m + vec2(0.0, e)) - h0) / e;
  rockMask = h0 > 0.0 ? 1.0 : 0.0;
  float s0 = gNoise(m * 3.0, 5u) * 0.025 + gNoise(m * 0.9, 6u) * 0.06;
  float sx = gNoise((m + vec2(0.05, 0.0)) * 3.0, 5u) * 0.025 + gNoise((m + vec2(0.05, 0.0)) * 0.9, 6u) * 0.06;
  float sy = gNoise((m + vec2(0.0, 0.05)) * 3.0, 5u) * 0.025 + gNoise((m + vec2(0.0, 0.05)) * 0.9, 6u) * 0.06;
  g += vec2(sx - s0, sy - s0) / 0.05;
  vec4 a = craterTap(m, 48.0, 0.7, vec2(0.21, 0.64));
  vec4 b = craterTap(m, 13.0, 3.3, vec2(0.58, 0.11));
  g += a.xy * 0.45 + b.xy * 0.3;
  return g;
}
// shadow cast by rocks onto point m; sd = direction to the Sun in the plane, tanE = Sun slope
float rockShadow(vec2 m, vec2 sd, float tanE) {
  float s = 1.0;
  float h0 = rocksH(m);
  float maxL = min(40.0, 0.6 / max(tanE, 0.012));
  for (int k = 0; k < 14; k++) {
    float t = float(k) * ROCK_CELL * 1.5;
    if (t > maxL) break;
    ivec2 b = ivec2(floor((m + sd * t) / ROCK_CELL));
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 rk = rockIn(b + ivec2(i, j));
        if (rk.z == 0.0) continue;
        vec2 v = m - rk.xy;
        float along = -dot(v, sd);
        if (along <= rk.z * 0.3) continue;
        float H = rk.z * 0.55 - h0;
        if (H <= 0.0) continue;
        float len = H / max(tanE, 1e-3);
        if (along > len) continue;
        float perp = abs(v.x * sd.y - v.y * sd.x);
        float w = rk.z * max(0.0, 1.0 - along / len);
        s = min(s, smoothstep(w * 0.7, w + 0.02, perp));
      }
    }
    if (s <= 0.0) break;
  }
  return s;
}
`;
