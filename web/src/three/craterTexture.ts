import * as THREE from "three";
import { profile } from "../lib/procedural";

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
      const fresh = Math.min(1, 0.3 + 0.7 * Math.pow(rand(), 0.8 + radius / 120));
      const ph = rand() * 6.283;
      const ext = Math.ceil(radius * 2.6);
      const depth = radius * 0.62;
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
          if (rr < 2.2) h[i] += profile(rr, fresh) * depth;
          if (fresh > 0.75) {
            const v = (fresh - 0.75) * 4 * Math.exp(-((Math.max(rr - 0.85, 0) * 2.2) ** 2));
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
vec4 craterDetailTex(vec2 m) {
  vec4 a = craterTap(m, 5200.0, 0.0, vec2(0.0));
  vec4 b = craterTap(m, 1300.0, 2.1, vec2(0.37, 0.71));
  vec4 c = craterTap(m, 330.0, 4.2, vec2(0.13, 0.52));
  return vec4(a.xy + b.xy * 0.55 + c.xy * 0.3, 0.0, max(a.w, max(b.w * 0.7, c.w * 0.4)));
}
`;
