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

vec4 craterDetailTex(vec2 m) {
  vec4 a = craterTap(m, 5200.0, 0.0, vec2(0.0));
  vec4 b = craterTap(m, 1300.0, 2.1, vec2(0.37, 0.71));
  vec4 c = craterTap(m, 330.0, 4.2, vec2(0.13, 0.52));
  return vec4(a.xy + b.xy * 0.55 + c.xy * 0.3, 0.0, max(a.w, max(b.w * 0.7, c.w * 0.4)));
}
`;
