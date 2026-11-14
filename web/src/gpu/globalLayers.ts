import type { Ephemeris } from "../data/load";
import type { GlobeData } from "../data/globe";
import { DSN_MIN_ELEVATION_DEG } from "../lib/astro";
import { NZ, ICE_K } from "./thermal";

// The same sunlight, Earth, link, night, temperature and ice maps as the polar engine, for the
// whole Moon on a 0.25° grid (1440 x 720, about a million points), all on the GPU.
// Step 1 (once): a horizon for every point in 32 directions, marched across the global terrain
// out to 300 km with the Moon's curvature. Step 2 (per request): walk through time.

export const GW = 1440;
export const GH = 720;
// polar stereographic grids around each pole, so the poles get square ~1.4 km cells
export const PN = 768;
export const POLAR_EXTENT_M = 540000;
const N_AZ = 32;
const HZ_MIN = -10;
const HZ_SPAN = 50;
const ROW = 4096;

export type GridId = "eq" | "south" | "north";

export interface GridData {
  id: GridId;
  w: number;
  h: number;
  data: Float32Array;
}

export interface GlobalMetrics {
  kind: "light" | "thermal";
  grids: GridData[];
  points: number;
  hours: number;
  stride: number;
  millis: number;
}

const GRIDS: { id: GridId; code: number; w: number; h: number }[] = [
  { id: "eq", code: 0, w: GW, h: GH },
  { id: "south", code: 1, w: PN, h: PN },
  { id: "north", code: 2, w: PN, h: PN },
];

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
precision highp sampler2DArray;
uniform isampler2D uGlobe;
uniform isampler2D uPolar;
uniform ivec2 uGlobeSize;
uniform float uPpd;
uniform float uStep;
uniform int uPolarSize;
uniform float uPolarCell;
uniform float uPolarFirst;
uniform int uGrid;
uniform int uGW;
uniform int uGH;
const float PI = 3.14159265358979;
const float R = 1737400.0;
const float R_KM = 1737.4;
const float SUN_R = 0.2665;

float polarSample(float x, float y, out bool ok) {
  float c = (x - uPolarFirst) / uPolarCell;
  float r = (-uPolarFirst - y) / uPolarCell;
  float n = float(uPolarSize);
  ok = c >= 0.0 && r >= 0.0 && c < n - 1.0 && r < n - 1.0;
  if (!ok) return 0.0;
  ivec2 p = ivec2(floor(vec2(c, r)));
  vec2 f = vec2(c, r) - floor(vec2(c, r));
  float a = float(texelFetch(uPolar, p, 0).r);
  float b = float(texelFetch(uPolar, p + ivec2(1, 0), 0).r);
  float d = float(texelFetch(uPolar, p + ivec2(0, 1), 0).r);
  float e = float(texelFetch(uPolar, p + ivec2(1, 1), 0).r);
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}

float globeSample(float latDeg, float lonDeg) {
  float fx = mod(lonDeg + 360.0, 360.0) * uPpd - 0.5;
  float fy = clamp((90.0 - latDeg) * uPpd - 0.5, 0.0, float(uGlobeSize.y) - 1.001);
  int x0 = int(floor(fx));
  int y0 = int(floor(fy));
  float tx = fx - floor(fx);
  float ty = fy - floor(fy);
  int xa = ((x0 % uGlobeSize.x) + uGlobeSize.x) % uGlobeSize.x;
  int xb = (xa + 1) % uGlobeSize.x;
  float a = float(texelFetch(uGlobe, ivec2(xa, y0), 0).r);
  float b = float(texelFetch(uGlobe, ivec2(xb, y0), 0).r);
  float d = float(texelFetch(uGlobe, ivec2(xa, y0 + 1), 0).r);
  float e = float(texelFetch(uGlobe, ivec2(xb, y0 + 1), 0).r);
  return mix(mix(a, b, tx), mix(d, e, tx), ty) * uStep;
}

float heightAt(vec3 u) {
  float lat = asin(clamp(u.z, -1.0, 1.0));
  if (degrees(lat) < -82.0) {
    float k = 2.0 * R / (1.0 - u.z);
    bool ok;
    float h = polarSample(k * u.y, k * u.x, ok);
    if (ok) return h;
  }
  return globeSample(degrees(lat), degrees(atan(u.y, u.x)));
}

void cellFrame(out vec3 up, out vec3 east, out vec3 north, out float latDeg) {
  int col = int(gl_FragCoord.x);
  int row = uGH - 1 - int(gl_FragCoord.y);
  float lat;
  float lon;
  if (uGrid == 0) {
    lat = radians(90.0 - (float(row) + 0.5) * 180.0 / float(uGH));
    lon = radians(-180.0 + (float(col) + 0.5) * 360.0 / float(uGW));
  } else {
    float cell = 2.0 * ${POLAR_EXTENT_M}.0 / float(uGW);
    float x = (float(col) + 0.5) * cell - ${POLAR_EXTENT_M}.0;
    float y = ${POLAR_EXTENT_M}.0 - (float(row) + 0.5) * cell;
    float colat = 2.0 * atan(length(vec2(x, y)) / (2.0 * R));
    lat = uGrid == 1 ? -(PI / 2.0 - colat) : PI / 2.0 - colat;
    lon = atan(x, y);
  }
  latDeg = degrees(lat);
  up = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  east = vec3(-sin(lon), cos(lon), 0.0);
  north = cross(up, east);
}
`;

const HORIZON = `${COMMON}
uniform int uLayer;
out vec4 outColor;
void main() {
  vec3 up, east, north;
  float latDeg;
  cellFrame(up, east, north, latDeg);
  float h0 = heightAt(up) + 2.0;
  vec4 res;
  for (int k = 0; k < 4; k++) {
    float az = 2.0 * PI * float(uLayer * 4 + k) / ${N_AZ}.0;
    vec3 dir = cos(az) * north + sin(az) * east;
    float best = radians(${HZ_MIN}.0);
    float d = 400.0;
    for (int i = 0; i < 48; i++) {
      float delta = d / R;
      float sh = sin(0.5 * delta);
      vec3 p = cos(delta) * up + sin(delta) * dir;
      float dh = heightAt(p) - h0;
      best = max(best, atan(dh - 2.0 * R * sh * sh, R * sin(delta)));
      d *= 1.17;
      if (d > 300000.0) break;
    }
    res[k] = clamp((degrees(best) - ${HZ_MIN}.0) / ${HZ_SPAN}.0, 0.0, 1.0);
  }
  outColor = res;
}`;

const TIME_HEAD = `${COMMON}
uniform sampler2DArray uHz;
uniform highp sampler2D uSun;
uniform highp sampler2D uEarth;
uniform int uStart;
uniform int uSteps;
uniform int uStride;
out vec4 outColor;
ivec2 tc(int i) { return ivec2(i % ${ROW}, i / ${ROW}); }
float hzBin(ivec2 c, int b) {
  vec4 v = texelFetch(uHz, ivec3(c, b / 4), 0);
  int k = b - (b / 4) * 4;
  float x = k == 0 ? v.r : k == 1 ? v.g : k == 2 ? v.b : v.a;
  return x * ${HZ_SPAN}.0 + ${HZ_MIN}.0;
}
float horizonAt(ivec2 c, float azDeg) {
  float f = azDeg / 360.0 * ${N_AZ}.0;
  float fl = floor(f);
  int i0 = int(fl) % ${N_AZ};
  int i1 = (i0 + 1) % ${N_AZ};
  return mix(hzBin(c, i0), hzBin(c, i1), f - fl);
}
`;

const LIGHT = `${TIME_HEAD}
void main() {
  vec3 up, east, north;
  float latDeg;
  cellFrame(up, east, north, latDeg);
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec3 site = up * R_KM;
  float sunSum = 0.0, earthSum = 0.0, linkSum = 0.0, run = 0.0, best = 0.0;
  for (int k = 0; k < uSteps; k++) {
    int i = uStart + k * uStride;
    vec4 s = texelFetch(uSun, tc(i), 0);
    vec4 e = texelFetch(uEarth, tc(i), 0);
    vec3 sv = normalize(s.xyz - site);
    vec3 ev = normalize(e.xyz - site);
    float sel = degrees(asin(dot(sv, up)));
    float saz = degrees(atan(dot(sv, east), dot(sv, north)));
    if (saz < 0.0) saz += 360.0;
    float d = clamp((sel - horizonAt(c, saz)) / SUN_R, -1.0, 1.0);
    float frac = (acos(-d) + d * sqrt(1.0 - d * d)) / PI;
    float eel = degrees(asin(dot(ev, up)));
    float eaz = degrees(atan(dot(ev, east), dot(ev, north)));
    if (eaz < 0.0) eaz += 360.0;
    float eUp = eel > horizonAt(c, eaz) ? 1.0 : 0.0;
    sunSum += frac;
    earthSum += eUp;
    linkSum += (frac >= 0.5 && eUp > 0.5 && e.w > 0.5) ? 1.0 : 0.0;
    if (frac < 0.5) { run += 1.0; best = max(best, run); } else { run = 0.0; }
  }
  float n = float(uSteps);
  outColor = vec4(sunSum / n, earthSum / n, linkSum / n, best * float(uStride));
}`;

const THERMAL = `${TIME_HEAD}
uniform int uSpin;
const int NZ = ${NZ};
const float S0 = 1361.0;
const float EMIS = 0.95;
const float SIGMA = 5.670374e-8;
const float QGEO = 0.018;
float cpOf(float T) { return -3.6125 + T * (2.7431 + T * (2.3616e-3 + T * (-1.2340e-5 + T * 8.9093e-9))); }
void main() {
  vec3 up, east, north;
  float latDeg;
  cellFrame(up, east, north, latDeg);
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec3 site = up * R_KM;
  // ground slope over ~2 km from the global terrain
  float e = 1000.0 / R;
  float dE = (heightAt(normalize(up + east * e)) - heightAt(normalize(up - east * e))) / 2000.0;
  float dN = (heightAt(normalize(up + north * e)) - heightAt(normalize(up - north * e))) / 2000.0;
  vec3 nrm = normalize(up - dE * east - dN * north);

  float dz[NZ]; float z[NZ]; float rhoZ[NZ]; float kc[NZ]; float T[NZ]; float Tmx[NZ];
  float depth = 0.0;
  for (int i = 0; i < NZ; i++) {
    dz[i] = 0.012 * pow(1.25, float(i));
    z[i] = depth;
    depth += dz[i];
    float f = exp(-z[i] / 0.07);
    rhoZ[i] = 1800.0 - 700.0 * f;
    kc[i] = 3.4e-3 - (3.4e-3 - 7.4e-4) * f;
  }
  float dt = float(uStride) * 3600.0;
  int nsub = int(ceil(dt / 6000.0));
  float h = dt / float(nsub);
  float fluxSum = 0.0;
  for (int k = 0; k < uSteps; k++) {
    int i = uStart + k * uStride;
    vec3 sv = normalize(texelFetch(uSun, tc(i), 0).xyz - site);
    float sel = degrees(asin(dot(sv, up)));
    float saz = degrees(atan(dot(sv, east), dot(sv, north)));
    if (saz < 0.0) saz += 360.0;
    float d = clamp((sel - horizonAt(c, saz)) / SUN_R, -1.0, 1.0);
    fluxSum += S0 * (acos(-d) + d * sqrt(1.0 - d * d)) / PI * max(0.0, dot(nrm, sv)) * 0.88;
  }
  float T0 = max(30.0, pow((fluxSum / float(uSteps) + QGEO) / (EMIS * SIGMA), 0.25) * 0.9);
  for (int i = 0; i < NZ; i++) { T[i] = T0; Tmx[i] = 0.0; }
  float tMax = 0.0, tMin = 1e9, tSum = 0.0, nRec = 0.0;
  for (int k = 0; k < uSteps; k++) {
    int idx = uStart + k * uStride;
    vec3 sv = normalize(texelFetch(uSun, tc(idx), 0).xyz - site);
    float sel = degrees(asin(dot(sv, up)));
    float saz = degrees(atan(dot(sv, east), dot(sv, north)));
    if (saz < 0.0) saz += 360.0;
    float d = clamp((sel - horizonAt(c, saz)) / SUN_R, -1.0, 1.0);
    float frac = (acos(-d) + d * sqrt(1.0 - d * d)) / PI;
    float mu = max(0.0, dot(nrm, sv));
    float inc = degrees(acos(clamp(mu, 0.0, 1.0)));
    float albedo = 0.12 + 0.06 * pow(inc / 45.0, 3.0) + 0.25 * pow(inc / 90.0, 8.0);
    float absorbed = (1.0 - albedo) * S0 * frac * mu;
    for (int s = 0; s < nsub; s++) {
      float Tn[NZ]; float kk[NZ];
      for (int i = 0; i < NZ; i++) { float r = T[i] / 350.0; kk[i] = kc[i] * (1.0 + 2.7 * r * r * r); }
      for (int i = 1; i < NZ - 1; i++) {
        float flux = 0.5 * (kk[i] + kk[i + 1]) * (T[i + 1] - T[i]) / dz[i] - 0.5 * (kk[i - 1] + kk[i]) * (T[i] - T[i - 1]) / dz[i - 1];
        Tn[i] = T[i] + h * flux / (rhoZ[i] * max(cpOf(T[i]), 60.0) * 0.5 * (dz[i - 1] + dz[i]));
      }
      Tn[NZ - 1] = Tn[NZ - 2] + QGEO * dz[NZ - 2] / kk[NZ - 2];
      float Ts = max(pow(absorbed / (EMIS * SIGMA) + 1.0, 0.25), Tn[1]) + 0.5;
      for (int it = 0; it < 6; it++) {
        float f = EMIS * SIGMA * Ts * Ts * Ts * Ts - absorbed - kk[0] * (Tn[1] - Ts) / dz[0];
        float fp = 4.0 * EMIS * SIGMA * Ts * Ts * Ts + kk[0] / dz[0];
        Ts = max(15.0, Ts - f / fp);
      }
      Tn[0] = Ts;
      for (int i = 0; i < NZ; i++) T[i] = Tn[i];
    }
    if (k >= uSpin) {
      tMax = max(tMax, T[0]); tMin = min(tMin, T[0]); tSum += T[0]; nRec += 1.0;
      for (int i = 0; i < NZ; i++) Tmx[i] = max(Tmx[i], T[i]);
    }
  }
  float iceDepth = -1.0;
  for (int i = NZ - 1; i >= 0; i--) {
    if (Tmx[i] < ${ICE_K}.0) iceDepth = z[i];
    else break;
  }
  outColor = vec4(tMax, tSum / max(nRec, 1.0), tMin, iceDepth);
}`;

function compile(gl: WebGL2RenderingContext, fs: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
  return p;
}

function nearest(gl: WebGL2RenderingContext, target: number) {
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

export class GlobalLayers {
  private gl: WebGL2RenderingContext;
  private light: WebGLProgram;
  private thermal: WebGLProgram;
  private outFbo: WebGLFramebuffer;
  private count: number;
  private buf = new Float32Array(GW * GH * 4);
  private hzTex = new Map<GridId, WebGLTexture>();
  horizonMillis = 0;

  private setGrid(p: WebGLProgram, grid: { code: number; w: number; h: number }) {
    const gl = this.gl;
    gl.uniform1i(gl.getUniformLocation(p, "uGrid"), grid.code);
    gl.uniform1i(gl.getUniformLocation(p, "uGW"), grid.w);
    gl.uniform1i(gl.getUniformLocation(p, "uGH"), grid.h);
  }

  constructor(g: GlobeData, ephem: Ephemeris) {
    const canvas = document.createElement("canvas");
    canvas.width = GW;
    canvas.height = GH;
    const gl = canvas.getContext("webgl2");
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) throw new Error("WebGL2 float rendering is not available.");
    this.gl = gl;
    this.count = ephem.count;
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const itex = (unit: number, w: number, h: number, data: Int16Array) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16I, w, h, 0, gl.RED_INTEGER, gl.SHORT, data);
      nearest(gl, gl.TEXTURE_2D);
    };
    itex(0, g.width, g.height, g.globe);
    itex(1, g.polarSize, g.polarSize, g.polar);

    const rows = Math.ceil(ephem.count / ROW);
    const sun = new Float32Array(ROW * rows * 4);
    const earth = new Float32Array(ROW * rows * 4);
    const ns = ephem.stations.length;
    for (let i = 0; i < ephem.count; i++) {
      const o = i * 6;
      sun.set([ephem.data[o], ephem.data[o + 1], ephem.data[o + 2], 0], i * 4);
      let dsn = 0;
      for (let k = 0; k < ns; k++) if (ephem.dsn[i * ns + k] >= DSN_MIN_ELEVATION_DEG) dsn = 1;
      earth.set([ephem.data[o + 3], ephem.data[o + 4], ephem.data[o + 5], dsn], i * 4);
    }
    for (const [unit, arr] of [[2, sun], [3, earth]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ROW, rows, 0, gl.RGBA, gl.FLOAT, arr);
      nearest(gl, gl.TEXTURE_2D);
    }

    const setCommon = (p: WebGLProgram) => {
      gl.useProgram(p);
      const u = (n: string) => gl.getUniformLocation(p, n);
      gl.uniform1i(u("uGlobe"), 0);
      gl.uniform1i(u("uPolar"), 1);
      gl.uniform2i(u("uGlobeSize"), g.width, g.height);
      gl.uniform1f(u("uPpd"), g.ppd);
      gl.uniform1f(u("uStep"), g.step);
      gl.uniform1i(u("uPolarSize"), g.polarSize);
      gl.uniform1f(u("uPolarCell"), g.polarCell);
      gl.uniform1f(u("uPolarFirst"), g.polarFirst);
      gl.uniform1i(u("uSun"), 2);
      gl.uniform1i(u("uEarth"), 3);
      gl.uniform1i(u("uHz"), 4);
    };

    // horizons for every cell of every grid: 8 RGBA8 layers x 4 directions
    const t0 = performance.now();
    const hz = compile(gl, HORIZON);
    setCommon(hz);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.enable(gl.SCISSOR_TEST);
    const uLayer = gl.getUniformLocation(hz, "uLayer");
    for (const grid of GRIDS) {
      gl.activeTexture(gl.TEXTURE4);
      const hzTex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, hzTex);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, grid.w, grid.h, N_AZ / 4);
      nearest(gl, gl.TEXTURE_2D_ARRAY);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
      this.hzTex.set(grid.id, hzTex);
      gl.useProgram(hz);
      this.setGrid(hz, grid);
      gl.viewport(0, 0, grid.w, grid.h);
      for (let l = 0; l < N_AZ / 4; l++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, hzTex, 0, l);
        gl.uniform1i(uLayer, l);
        for (let y = 0; y < grid.h; y += 96) {
          gl.scissor(0, y, grid.w, Math.min(96, grid.h - y));
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.flush();
        }
      }
    }
    gl.disable(gl.SCISSOR_TEST);
    const probe = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);
    this.horizonMillis = performance.now() - t0;

    this.light = compile(gl, LIGHT);
    setCommon(this.light);
    this.thermal = compile(gl, THERMAL);
    setCommon(this.thermal);

    gl.activeTexture(gl.TEXTURE5);
    const out = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, out);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, GW, GH, 0, gl.RGBA, gl.FLOAT, null);
    nearest(gl, gl.TEXTURE_2D);
    this.outFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
  }

  compute(kind: "light" | "thermal", startHour: number, hours: number): GlobalMetrics {
    const gl = this.gl;
    const start = Math.max(0, Math.min(this.count - 1, Math.floor(startHour)));
    const len = Math.max(1, Math.min(this.count - start, Math.floor(hours)));
    const maxSteps = 1500;
    const stride = Math.max(1, Math.ceil(len / maxSteps));
    const steps = Math.max(1, Math.floor(len / stride));
    const t0 = performance.now();
    const p = kind === "thermal" ? this.thermal : this.light;
    gl.useProgram(p);
    gl.uniform1i(gl.getUniformLocation(p, "uStart"), start);
    gl.uniform1i(gl.getUniformLocation(p, "uSteps"), steps);
    gl.uniform1i(gl.getUniformLocation(p, "uStride"), stride);
    if (kind === "thermal") gl.uniform1i(gl.getUniformLocation(p, "uSpin"), Math.min(Math.floor(steps / 4), Math.round(709 / stride)));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outFbo);
    const grids: GridData[] = [];
    for (const grid of GRIDS) {
      this.setGrid(p, grid);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.hzTex.get(grid.id)!);
      gl.viewport(0, 0, grid.w, grid.h);
      gl.enable(gl.SCISSOR_TEST);
      const band = kind === "thermal" ? 24 : 96;
      for (let y = 0; y < grid.h; y += band) {
        gl.scissor(0, y, grid.w, Math.min(band, grid.h - y));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.flush();
      }
      gl.disable(gl.SCISSOR_TEST);
      const n = grid.w * grid.h * 4;
      const buf = this.buf.subarray(0, n);
      gl.readPixels(0, 0, grid.w, grid.h, gl.RGBA, gl.FLOAT, buf);
      const data = new Float32Array(n);
      const rowLen = grid.w * 4;
      for (let r = 0; r < grid.h; r++) data.set(buf.subarray((grid.h - 1 - r) * rowLen, (grid.h - r) * rowLen), r * rowLen);
      grids.push({ id: grid.id, w: grid.w, h: grid.h, data });
    }
    const points = GRIDS.reduce((s, g) => s + g.w * g.h, 0);
    return { kind, grids, points, hours: steps * stride, stride, millis: performance.now() - t0 };
  }
}
