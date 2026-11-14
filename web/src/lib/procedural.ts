export const CRATER_CELLS_KM = [12, 4, 1.4, 0.5, 0.18, 0.065];
export const CRATER_DENSITY = [0.22, 0.3, 0.38, 0.46, 0.52, 0.58];
const R_KM = 1737.4;

function pcg3(x: number, y: number, z: number): number {
  let a = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  let b = (Math.imul(y, 1664525) + 1013904223) >>> 0;
  let c = (Math.imul(z, 1664525) + 1013904223) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0;
  b = (b + Math.imul(c, a)) >>> 0;
  c = (c + Math.imul(a, b)) >>> 0;
  a ^= a >>> 16;
  b ^= b >>> 16;
  c ^= c >>> 16;
  a = (a + Math.imul(b, c)) >>> 0;
  b = (b + Math.imul(c, a)) >>> 0;
  c = (c + Math.imul(a, b)) >>> 0;
  return (a ^ b ^ c) >>> 0;
}

const U32 = 4294967296;

function profile(r: number, fresh: number): number {
  const rim = 0.2 * fresh * fresh * Math.exp(-(((r - 1) * (3 + 2 * fresh)) ** 2));
  if (r < 1) {
    const s = r * r * (3 - 2 * r);
    return (s - 1) * 0.5 * fresh + rim;
  }
  if (r < 2.2) return rim + 0.08 * fresh * Math.exp(-(r - 1) * 3.5);
  return 0;
}

function layer(px: number, py: number, pz: number, cell: number, seed: number, density: number): number {
  const gx = px / cell - 0.5;
  const gy = py / cell - 0.5;
  const gz = pz / cell - 0.5;
  const bx = Math.floor(gx);
  const by = Math.floor(gy);
  const bz = Math.floor(gz);
  let h = 0;
  for (let k = 0; k < 8; k++) {
    const cx = bx + (k & 1);
    const cy = by + ((k >> 1) & 1);
    const cz = bz + ((k >> 2) & 1);
    const hh = pcg3(cx + seed, cy, cz);
    if (hh / U32 > density) continue;
    const h2 = pcg3(cx, cy + seed, cz + 7);
    const fx = (cx + 0.25 + 0.5 * ((hh & 0xffff) / 65536)) * cell;
    const fy = (cy + 0.25 + 0.5 * ((hh >>> 16) / 65536)) * cell;
    const fz = (cz + 0.25 + 0.5 * ((h2 & 0xffff) / 65536)) * cell;
    const fl = Math.hypot(fx, fy, fz);
    const sx = (fx / fl) * R_KM - px;
    const sy = (fy / fl) * R_KM - py;
    const sz = (fz / fl) * R_KM - pz;
    const sizeU = (h2 >>> 16) / 65536;
    const radius = cell * (0.07 + 0.36 * sizeU * sizeU);
    const fresh = 0.12 + 0.88 * Math.pow(((h2 >>> 8) & 0xff) / 255, 3.2);
    const nx = fx / fl;
    const ny = fy / fl;
    const nz = fz / fl;
    let t1x = -ny;
    let t1y = nx;
    let t1z = 0;
    const tl = Math.hypot(t1x, t1y) || 1;
    t1x /= tl;
    t1y /= tl;
    const t2x = ny * t1z - nz * t1y;
    const t2y = nz * t1x - nx * t1z;
    const t2z = nx * t1y - ny * t1x;
    const ang = Math.atan2(sx * t2x + sy * t2y + sz * t2z, sx * t1x + sy * t1y + sz * t1z);
    const ph = (hh >>> 24) / 40.7;
    const wobble = 1 + 0.1 * Math.sin(2 * ang + ph) + 0.06 * Math.sin(3 * ang + 2.1 * ph) + 0.035 * Math.sin(5 * ang + 3.3 * ph);
    const r = Math.hypot(sx, sy, sz) / (radius * wobble);
    if (r < 2.2) h += profile(r, fresh) * radius * 0.3;
  }
  return h;
}

export function craterDetailKm(px: number, py: number, pz: number, minCellKm: number, maxCellKm: number): number {
  let h = 0;
  for (let i = 0; i < CRATER_CELLS_KM.length; i++) {
    const c = CRATER_CELLS_KM[i];
    if (c < minCellKm || c > maxCellKm) continue;
    h += layer(px, py, pz, c, i * 101 + 17, CRATER_DENSITY[i]);
  }
  return h;
}

export const PROCEDURAL_GLSL = /* glsl */ `
uint pcg3(int x, int y, int z) {
  uint a = uint(x) * 1664525u + 1013904223u;
  uint b = uint(y) * 1664525u + 1013904223u;
  uint c = uint(z) * 1664525u + 1013904223u;
  a += b * c; b += c * a; c += a * b;
  a ^= a >> 16u; b ^= b >> 16u; c ^= c >> 16u;
  a += b * c; b += c * a; c += a * b;
  return a ^ b ^ c;
}

float craterProfile(float r, float fresh) {
  float rim = 0.2 * fresh * fresh * exp(-pow((r - 1.0) * (3.0 + 2.0 * fresh), 2.0));
  if (r < 1.0) {
    float s = r * r * (3.0 - 2.0 * r);
    return (s - 1.0) * 0.5 * fresh + rim;
  }
  if (r < 2.2) return rim + 0.08 * fresh * exp(-(r - 1.0) * 3.5);
  return 0.0;
}

float gHalo = 0.0;

float craterLayer(vec3 p, float cell, int seed, float density) {
  vec3 g = p / cell - 0.5;
  ivec3 b = ivec3(floor(g));
  float h = 0.0;
  for (int k = 0; k < 8; k++) {
    ivec3 c = b + ivec3(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    uint hh = pcg3(c.x + seed, c.y, c.z);
    if (float(hh) / 4294967296.0 > density) continue;
    uint h2 = pcg3(c.x, c.y + seed, c.z + 7);
    vec3 f = (vec3(c) + 0.25 + 0.5 * vec3(float(hh & 0xffffu) / 65536.0, float(hh >> 16u) / 65536.0, float(h2 & 0xffffu) / 65536.0)) * cell;
    vec3 s = normalize(f) * ${R_KM} - p;
    float sizeU = float(h2 >> 16u) / 65536.0;
    float radius = cell * (0.07 + 0.36 * sizeU * sizeU);
    float fresh = 0.12 + 0.88 * pow(float((h2 >> 8u) & 0xffu) / 255.0, 3.2);
    vec3 nn = normalize(f);
    vec3 t1 = normalize(vec3(-nn.y, nn.x, 0.0) + vec3(1e-6, 0.0, 0.0));
    vec3 t2 = cross(nn, t1);
    float ang = atan(dot(s, t2), dot(s, t1));
    float ph = float(hh >> 24u) / 40.7;
    float wobble = 1.0 + 0.1 * sin(2.0 * ang + ph) + 0.06 * sin(3.0 * ang + 2.1 * ph) + 0.035 * sin(5.0 * ang + 3.3 * ph);
    float r = length(s) / (radius * wobble);
    if (r < 2.2) {
      h += craterProfile(r, fresh) * radius * 0.3;
      if (fresh > 0.7 && r < 2.6) gHalo = max(gHalo, (fresh - 0.7) * 2.6 * exp(-pow(max(r - 0.85, 0.0) * 2.2, 2.0)));
    }
  }
  return h;
}

const float CRATER_CELLS[${CRATER_CELLS_KM.length}] = float[](${CRATER_CELLS_KM.map((c) => c.toFixed(4)).join(", ")});
const float CRATER_DENSITY[${CRATER_DENSITY.length}] = float[](${CRATER_DENSITY.map((c) => c.toFixed(4)).join(", ")});

float craterDetail(vec3 p, float minCell, float maxCell) {
  float h = 0.0;
  for (int i = 0; i < ${CRATER_CELLS_KM.length}; i++) {
    float c = CRATER_CELLS[i];
    if (c < minCell || c > maxCell) continue;
    h += craterLayer(p, c, i * 101 + 17, CRATER_DENSITY[i]);
  }
  return h;
}
`;
