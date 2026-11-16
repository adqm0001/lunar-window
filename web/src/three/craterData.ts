// The crater detail tile, computed without three.js so it can run in a worker (craterWorker.ts). Each texel holds
// the surface slope (x, y), the height and a bright-ejecta "halo" value; a full mip chain is built here too.

export const CRATER_N = 1024;
const N = CRATER_N;

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
  else sharp = (rim * (1 / (r * r * r) - 0.064)) / 0.936;
  const soft = r < 1.35 ? -0.12 * 0.5 * (1 + Math.cos((Math.PI * r) / 1.35)) : 0;
  const k = Math.min(1, fresh * 1.6);
  const v = soft * (1 - k) + sharp * k;
  return r < 2.5 ? v : 0;
}

export function build() {
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
      // The rim wobble 1 + .09 sin(2a + ph) + .05 sin(3a + 2.1ph) + .03 sin(5a + 3.3ph) is evaluated with
      // multiple-angle formulas from the pixel's direction instead of atan2 and three sines per pixel, and
      // pixels beyond the largest possible reach (wobble 1.17) are skipped first. Same result, about 7x faster
      // (this ran on the main thread at startup and took ~6 s).
      const s1 = Math.sin(ph), c1 = Math.cos(ph);
      const s2 = Math.sin(2.1 * ph), c2 = Math.cos(2.1 * ph);
      const s3 = Math.sin(3.3 * ph), c3 = Math.cos(3.3 * ph);
      const reach = radius * 2.6 * 1.17;
      for (let dy = -ext; dy <= ext; dy++) {
        const py = Math.floor(cy) + dy;
        const row = (((py % N) + N) % N) * N;
        const sy = py + 0.5 - cy;
        for (let dx = -ext; dx <= ext; dx++) {
          const px = Math.floor(cx) + dx;
          const sx = px + 0.5 - cx;
          const d2 = sx * sx + sy * sy;
          if (d2 >= reach * reach) continue;
          const d = Math.sqrt(d2);
          const ca = d > 0 ? sx / d : 1;
          const sa = d > 0 ? sy / d : 0;
          const c2a = ca * ca - sa * sa, s2a = 2 * sa * ca;
          const c3a = ca * c2a - sa * s2a, s3a = sa * c2a + ca * s2a;
          const c5a = c2a * c3a - s2a * s3a, s5a = s2a * c3a + c2a * s3a;
          const wob = 1 + 0.09 * (s2a * c1 + c2a * s1) + 0.05 * (s3a * c2 + c3a * s2) + 0.03 * (s5a * c3 + c5a * s3);
          const rr = d / (radius * wob);
          if (rr >= 2.6) continue;
          const i = row + (((px % N) + N) % N);
          h[i] += shape(rr, fresh) * depth;
          if (fresh > 0.8) {
            const m = Math.max(rr - 0.9, 0) * 1.8;
            const v = (fresh - 0.8) * 5 * Math.exp(-(m * m));
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

// float32 -> float16 bits, the same tables and rounding as three.js DataUtils.toHalfFloat
// (fox-toolkit.org/ftp/fasthalffloatconversion.pdf), done on a whole array through its bit view.
const baseTable = new Uint32Array(512);
const shiftTable = new Uint32Array(512);
for (let i = 0; i < 256; ++i) {
  const e = i - 127;
  if (e < -27) {
    baseTable[i] = 0x0000;
    baseTable[i | 0x100] = 0x8000;
    shiftTable[i] = 24;
    shiftTable[i | 0x100] = 24;
  } else if (e < -14) {
    baseTable[i] = 0x0400 >> (-e - 14);
    baseTable[i | 0x100] = (0x0400 >> (-e - 14)) | 0x8000;
    shiftTable[i] = -e - 1;
    shiftTable[i | 0x100] = -e - 1;
  } else if (e <= 15) {
    baseTable[i] = (e + 15) << 10;
    baseTable[i | 0x100] = ((e + 15) << 10) | 0x8000;
    shiftTable[i] = 13;
    shiftTable[i | 0x100] = 13;
  } else if (e < 128) {
    baseTable[i] = 0x7c00;
    baseTable[i | 0x100] = 0xfc00;
    shiftTable[i] = 24;
    shiftTable[i | 0x100] = 24;
  } else {
    baseTable[i] = 0x7c00;
    baseTable[i | 0x100] = 0xfc00;
    shiftTable[i] = 13;
    shiftTable[i | 0x100] = 13;
  }
}

export function toHalfArray(f: Float32Array): Uint16Array {
  const g = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) g[i] = Math.max(-65504, Math.min(65504, f[i]));
  const bits = new Uint32Array(g.buffer);
  const out = new Uint16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const b = bits[i];
    const e = (b >> 23) & 0x1ff;
    out[i] = baseTable[e] + ((b & 0x007fffff) >> shiftTable[e]);
  }
  return out;
}

/** The tile and its mip chain as RGBA half floats, largest first (1024² down to 1²). */
export function buildCraterLevels(): Uint16Array[] {
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
  return levels.map(toHalfArray);
}
