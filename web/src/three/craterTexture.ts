import * as THREE from "three";

// A seamless tile of small craters, built once at startup. Each texel holds the surface slope
// (x, y), the height and a bright-ejecta "halo" value. Sampling it at a few scales gives crater
// detail for the price of three texture reads, and the mipmaps stop it from shimmering far away.

const N = 1024;
let cached: THREE.DataTexture | null = null;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simple crater shape from lunar morphometry: parabolic bowl about 1/5 as deep as it is wide,
// a raised rim, and ejecta thinning out as r^-3. Old craters (low "fresh") are eroded into
// shallow, rimless cosine dips. Radius is 1 at the rim.
function shape(r: number, fresh: number): number {
  const d = 0.4 * fresh;
  const rim = 0.08 * fresh;
  let sharp: number;
  if (r < 1) sharp = rim + d * (r * r - 1);
  else sharp = (rim * (Math.pow(r, -3) - 0.064)) / 0.936;
  const soft = -0.12 * 0.5 * (1 + Math.cos(Math.PI * Math.min(r / 1.35, 1)));
  const k = Math.min(1, fresh * 1.6);
  const v = soft * (1 - k) + sharp * k;
  return r < 2.5 ? v : 0;
}

function build() {
  const rand = rng(20261114);
  const h = new Float32Array(N * N);
  const halo = new Float32Array(N * N);
  for (let r = 150; r >= 1.6; r /= 1.25) {
    const count = Math.round((0.07 * Math.pow(r / 150, 0.85) * N * N) / (r * r));
    for (let k = 0; k < count; k++) {
      const cx = rand() * N;
      const cy = rand() * N;
      const radius = r * (0.85 + 0.3 * rand());
      const fresh = Math.pow(rand(), 2.2 + radius / 90);
      const ph = rand() * 6.283;
      const ext = Math.ceil(radius * 2.6);
      const depth = radius;
      for (let dy = -ext; dy <= ext; dy++) {
        const py = Math.floor(cy) + dy;
        const row = (((py % N) + N) % N) * N;
        const sy = py + 0.5 - cy;
        for (let dx = -ext; dx <= ext; dx++) {
          const px = Math.floor(cx) + dx;
          const sx = px + 0.5 - cx;
          const d = Math.hypot(sx, sy);
          const ang = Math.atan2(sy, sx);
          const wob = 1 + 0.09 * Math.sin(2 * ang + ph) + 0.05 * Math.sin(3 * ang + 2.1 * ph) + 0.03 * Math.sin(5 * ang + 3.3 * ph);
          const rr = d / (radius * wob);
          if (rr >= 2.6) continue;
          const i = row + (((px % N) + N) % N);
          h[i] += shape(rr, fresh) * depth;
          if (fresh > 0.8) {
            const v = (fresh - 0.8) * 5 * Math.exp(-((Math.max(rr - 0.9, 0) * 1.8) ** 2));
            if (v > halo[i]) halo[i] = v;
          }
        }
      }
    }
  }
  return { h, halo };
}

function level(src: Float32Array, n: number): Float32Array {
  const m = n >> 1;
  const out = new Float32Array(m * m * 4);
  for (let y = 0; y < m; y++)
    for (let x = 0; x < m; x++)
      for (let c = 0; c < 4; c++) {
        const a = (2 * y * n + 2 * x) * 4 + c;
        out[(y * m + x) * 4 + c] = 0.25 * (src[a] + src[a + 4] + src[a + n * 4] + src[a + n * 4 + 4]);
      }
  return out;
}

export function craterTexture(): THREE.DataTexture {
  if (cached) return cached;
  const { h, halo } = build();
  const base = new Float32Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    const up = ((y + N - 1) % N) * N;
    const dn = ((y + 1) % N) * N;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const l = y * N + ((x + N - 1) % N);
      const r = y * N + ((x + 1) % N);
      base[i * 4] = (h[r] - h[l]) / 2;
      base[i * 4 + 1] = (h[dn + x] - h[up + x]) / 2;
      base[i * 4 + 2] = h[i];
      base[i * 4 + 3] = halo[i];
    }
  }
  const levels: Float32Array[] = [base];
  for (let n = N; n > 1; n >>= 1) levels.push(level(levels[levels.length - 1], n));
  const toHalf = (f: Float32Array) => {
    const u = new Uint16Array(f.length);
    for (let i = 0; i < f.length; i++) u[i] = THREE.DataUtils.toHalfFloat(f[i]);
    return u;
  };
  const tex = new THREE.DataTexture(toHalf(base), N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mipmaps = levels.map((d, k) => ({ data: toHalf(d), width: N >> k, height: N >> k })) as unknown as typeof tex.mipmaps;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cached = tex;
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
  float a = craterShadow1(m, 5200.0, 0.0, vec2(0.0), sd, tanE / 0.85, fpm);
  float b = a > 0.0 ? craterShadow1(m, 1300.0, 2.1, vec2(0.37, 0.71), sd, tanE / (0.85 * 0.55), fpm) : 1.0;
  float c = a * b > 0.0 ? craterShadow1(m, 330.0, 4.2, vec2(0.13, 0.52), sd, tanE / (0.85 * 0.3), fpm) : 1.0;
  return a * b * c;
}

// slow random variation, used to blend two copies of the tile so the pattern never repeats visibly
float ctHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ctNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ctHash(i), ctHash(i + vec2(1.0, 0.0)), f.x), mix(ctHash(i + vec2(0.0, 1.0)), ctHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec4 craterDetailTex(vec2 m) {
  float w = smoothstep(0.3, 0.7, ctNoise(m / 7300.0));
  vec4 a = mix(craterTap(m, 5200.0, 0.0, vec2(0.0)), craterTap(m, 4300.0, 1.3, vec2(0.61, 0.27)), w);
  float w2 = smoothstep(0.3, 0.7, ctNoise(m / 1900.0 + 17.0));
  vec4 b = mix(craterTap(m, 1300.0, 2.1, vec2(0.37, 0.71)), craterTap(m, 1070.0, 5.0, vec2(0.83, 0.44)), w2);
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
