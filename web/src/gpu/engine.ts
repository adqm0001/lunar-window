import type { Ephemeris } from "../data/load";
import type { FieldData } from "../data/field";
import { DSN_MIN_ELEVATION_DEG } from "../lib/astro";
import { missionFits } from "../lib/lander";
import { THERMAL_MAIN } from "./thermal";

const ROW = 4096;

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2DArray;
uniform usampler2DArray uField;
uniform highp sampler2D uSun;
uniform highp sampler2D uEarth;
uniform int uSize;
uniform int uAzBins;
uniform float uCell;
uniform float uExtent;
uniform vec2 uCenter;
uniform float uDecodeStep;
uniform float uDecodeOffset;
uniform int uStart;
uniform int uSteps;
uniform int uStride;
out vec4 outColor;

const float R_KM = 1737.4;
const float R_M = 1737400.0;
const float PI = 3.14159265358979;
const float SUN_R = 0.2665;

ivec2 tc(int i) { return ivec2(i % ${ROW}, i / ${ROW}); }

float horizonAt(int col, int row, float az) {
  float f = az / 360.0 * float(uAzBins);
  float fl = floor(f);
  int i0 = int(fl) % uAzBins;
  int i1 = (i0 + 1) % uAzBins;
  float a = float(texelFetch(uField, ivec3(col, row, i0), 0).r);
  float b = float(texelFetch(uField, ivec3(col, row, i1), 0).r);
  return mix(a, b, f - fl) * uDecodeStep + uDecodeOffset;
}

void main() {
  int col = int(gl_FragCoord.x);
  int row = uSize - 1 - int(gl_FragCoord.y);
  float x = (float(col) + 0.5) * uCell - uExtent + uCenter.x;
  float y = uExtent - (float(row) + 0.5) * uCell + uCenter.y;
  float rho = length(vec2(x, y));
  float lat = -(PI / 2.0 - 2.0 * atan(rho / (2.0 * R_M)));
  float lon = atan(x, y);
  vec3 up = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  vec3 east = vec3(-sin(lon), cos(lon), 0.0);
  vec3 north = cross(up, east);
  vec3 site = up * R_KM;

  float sunSum = 0.0;
  float earthSum = 0.0;
  float linkSum = 0.0;
  float run = 0.0;
  float best = 0.0;
  for (int k = 0; k < uSteps; k++) {
    int i = uStart + k * uStride;
    vec4 s = texelFetch(uSun, tc(i), 0);
    vec4 e = texelFetch(uEarth, tc(i), 0);
    vec3 sv = normalize(s.xyz - site);
    vec3 ev = normalize(e.xyz - site);
    float sel = degrees(asin(dot(sv, up)));
    float saz = degrees(atan(dot(sv, east), dot(sv, north)));
    if (saz < 0.0) saz += 360.0;
    float d = clamp((sel - horizonAt(col, row, saz)) / SUN_R, -1.0, 1.0);
    float frac = (acos(-d) + d * sqrt(1.0 - d * d)) / PI;
    float eel = degrees(asin(dot(ev, up)));
    float eaz = degrees(atan(dot(ev, east), dot(ev, north)));
    if (eaz < 0.0) eaz += 360.0;
    float eUp = eel > horizonAt(col, row, eaz) ? 1.0 : 0.0;
    sunSum += frac;
    earthSum += eUp;
    linkSum += (frac >= 0.5 && eUp > 0.5 && e.w > 0.5) ? 1.0 : 0.0;
    if (frac < 0.5) { run += 1.0; best = max(best, run); } else { run = 0.0; }
  }
  float n = float(uSteps);
  outColor = vec4(sunSum / n, earthSum / n, linkSum / n, best * float(uStride));
}`;

const SURVIVE_MAIN = `
uniform float uPanelW;
uniform float uBattery;
uniform float uDayLoad;
uniform float uNightLoad;
uniform float uMinSoc;
uniform int uPanelMode;

void main() {
  int col = int(gl_FragCoord.x);
  int row = uSize - 1 - int(gl_FragCoord.y);
  float x = (float(col) + 0.5) * uCell - uExtent + uCenter.x;
  float y = uExtent - (float(row) + 0.5) * uCell + uCenter.y;
  float rho = length(vec2(x, y));
  float lat = -(PI / 2.0 - 2.0 * atan(rho / (2.0 * R_M)));
  float lon = atan(x, y);
  vec3 up = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  vec3 east = vec3(-sin(lon), cos(lon), 0.0);
  vec3 north = cross(up, east);
  vec3 site = up * R_KM;
  float wh = uBattery;
  bool alive = true;
  float diedAt = -1.0;
  float minSoc = 1.0;
  float sunSum = 0.0;
  for (int k = 0; k < uSteps; k++) {
    int i = uStart + k * uStride;
    vec3 sv = normalize(texelFetch(uSun, tc(i), 0).xyz - site);
    float sel = degrees(asin(dot(sv, up)));
    float saz = degrees(atan(dot(sv, east), dot(sv, north)));
    if (saz < 0.0) saz += 360.0;
    float d = clamp((sel - horizonAt(col, row, saz)) / SUN_R, -1.0, 1.0);
    float frac = (acos(-d) + d * sqrt(1.0 - d * d)) / PI;
    float el = radians(sel);
    float f = uPanelMode == 2 ? max(0.0, sin(el)) : max(0.0, cos(el));
    float p = uPanelW * frac * f;
    float load = frac >= 0.5 ? uDayLoad : uNightLoad;
    if (alive) {
      wh = min(uBattery, wh + (p - load) * float(uStride));
      if (wh / uBattery <= uMinSoc) { alive = false; diedAt = float((k + 1) * uStride); wh = 0.0; }
    }
    minSoc = min(minSoc, alive ? wh / uBattery : 0.0);
    sunSum += frac;
  }
  float total = float(uSteps * uStride);
  outColor = vec4(diedAt < 0.0 ? 1.0 : diedAt / total, minSoc, sunSum / float(uSteps), diedAt);
}`;

// Packs "Sun up" and "link to Earth" into bits: 4 x 32-bit words = 128 hours per pass.
const BITS_MAIN = `
uniform int uMode;
uniform int uEnd;
void main() {
  int col = int(gl_FragCoord.x);
  int row = uSize - 1 - int(gl_FragCoord.y);
  float x = (float(col) + 0.5) * uCell - uExtent + uCenter.x;
  float y = uExtent - (float(row) + 0.5) * uCell + uCenter.y;
  float rho = length(vec2(x, y));
  float lat = -(PI / 2.0 - 2.0 * atan(rho / (2.0 * R_M)));
  float lon = atan(x, y);
  vec3 up = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  vec3 east = vec3(-sin(lon), cos(lon), 0.0);
  vec3 north = cross(up, east);
  vec3 site = up * R_KM;
  uvec4 bits = uvec4(0u);
  for (int w = 0; w < 4; w++) {
    uint word = 0u;
    for (int b = 0; b < 32; b++) {
      int i = uStart + w * 32 + b;
      if (i >= uEnd) break;
      bool on;
      if (uMode == 0) {
        vec3 sv = normalize(texelFetch(uSun, tc(i), 0).xyz - site);
        float sel = degrees(asin(dot(sv, up)));
        float saz = degrees(atan(dot(sv, east), dot(sv, north)));
        if (saz < 0.0) saz += 360.0;
        on = sel - horizonAt(col, row, saz) > 0.0;
      } else {
        vec4 e = texelFetch(uEarth, tc(i), 0);
        vec3 ev = normalize(e.xyz - site);
        float eel = degrees(asin(dot(ev, up)));
        float eaz = degrees(atan(dot(ev, east), dot(ev, north)));
        if (eaz < 0.0) eaz += 360.0;
        on = e.w > 0.5 && eel > horizonAt(col, row, eaz);
      }
      if (on) word |= (1u << uint(b));
    }
    bits[w] = word;
  }
  outBits = bits;
}`;

export interface VisibilityBits {
  start: number;
  hours: number;
  words: number;
  sun: Uint32Array;
  link: Uint32Array;
  millis: number;
}

export interface SurvivalLander {
  panelW: number;
  batteryWh: number;
  dayLoadW: number;
  nightLoadW: number;
  minSocPct: number;
  horizontal: boolean;
}

export interface FieldMetrics {
  size: number;
  hours: number;
  stride: number;
  data: Float32Array;
  millis: number;
}

export class GpuEngine {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private survProg: WebGLProgram;
  private survUni: Record<string, WebGLUniformLocation | null> = {};
  private thermProg: WebGLProgram | null = null;
  private thermUni: Record<string, WebGLUniformLocation | null> = {};
  private field: FieldData;
  private bitsProg: WebGLProgram | null = null;
  private bitsUni: Record<string, WebGLUniformLocation | null> = {};
  private bitsFbo: WebGLFramebuffer | null = null;
  private fbo: WebGLFramebuffer;
  private size: number;
  private count: number;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private buf: Float32Array;

  constructor(field: FieldData, ephem: Ephemeris) {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("This browser doesn't support WebGL2.");
    if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("This GPU can't render float textures (EXT_color_buffer_float).");
    this.gl = gl;
    this.field = field;
    const { size, azimuthBins, cellMeters, decode } = field.meta.horizon;
    this.size = size;
    this.count = ephem.count;
    this.buf = new Float32Array(size * size * 4);
    canvas.width = size;
    canvas.height = size;

    this.survProg = link(gl, VERT, FRAG.split("void main() {")[0] + SURVIVE_MAIN);
    this.prog = link(gl, VERT, FRAG);
    gl.useProgram(this.prog);
    for (const n of ["uField", "uSun", "uEarth", "uSize", "uAzBins", "uCell", "uExtent", "uCenter", "uDecodeStep", "uDecodeOffset", "uStart", "uSteps", "uStride"]) {
      this.uni[n] = gl.getUniformLocation(this.prog, n);
    }

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    const ft = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, ft);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R8UI, size, size, azimuthBins, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, field.horizon);
    nearest(gl, gl.TEXTURE_2D_ARRAY);

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
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ROW, rows, 0, gl.RGBA, gl.FLOAT, sun);
    nearest(gl, gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ROW, rows, 0, gl.RGBA, gl.FLOAT, earth);
    nearest(gl, gl.TEXTURE_2D);

    gl.uniform1i(this.uni.uField, 0);
    gl.uniform1i(this.uni.uSun, 1);
    gl.uniform1i(this.uni.uEarth, 2);
    gl.uniform1i(this.uni.uSize, size);
    gl.uniform1i(this.uni.uAzBins, azimuthBins);
    gl.uniform1f(this.uni.uCell, cellMeters);
    gl.uniform1f(this.uni.uExtent, field.meta.extentMeters);
    gl.uniform2f(this.uni.uCenter, field.meta.centerX ?? 0, field.meta.centerY ?? 0);
    gl.uniform1f(this.uni.uDecodeStep, decode.stepDeg);
    gl.uniform1f(this.uni.uDecodeOffset, decode.offsetDeg);

    gl.useProgram(this.survProg);
    for (const n of ["uField", "uSun", "uEarth", "uSize", "uAzBins", "uCell", "uExtent", "uCenter", "uDecodeStep", "uDecodeOffset", "uStart", "uSteps", "uStride", "uPanelW", "uBattery", "uDayLoad", "uNightLoad", "uMinSoc", "uPanelMode"]) {
      this.survUni[n] = gl.getUniformLocation(this.survProg, n);
    }
    gl.uniform1i(this.survUni.uField, 0);
    gl.uniform1i(this.survUni.uSun, 1);
    gl.uniform1i(this.survUni.uEarth, 2);
    gl.uniform1i(this.survUni.uSize, size);
    gl.uniform1i(this.survUni.uAzBins, azimuthBins);
    gl.uniform1f(this.survUni.uCell, cellMeters);
    gl.uniform1f(this.survUni.uExtent, field.meta.extentMeters);
    gl.uniform2f(this.survUni.uCenter, field.meta.centerX ?? 0, field.meta.centerY ?? 0);
    gl.uniform1f(this.survUni.uDecodeStep, decode.stepDeg);
    gl.uniform1f(this.survUni.uDecodeOffset, decode.offsetDeg);
    gl.useProgram(this.prog);

    gl.activeTexture(gl.TEXTURE3);
    const out = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, out);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, null);
    nearest(gl, gl.TEXTURE_2D);
    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
    gl.viewport(0, 0, size, size);
  }

  /** Null when the ephemeris doesn't cover the whole mission, so a shortened run never shows as survival. */
  computeSurvival(startHour: number, hours: number, lander: SurvivalLander): FieldMetrics | null {
    if (!missionFits(startHour, hours, this.count)) return null;
    const gl = this.gl;
    const start = startHour;
    const len = hours;
    const stride = Math.max(1, Math.ceil(len / 4400));
    const steps = Math.max(1, Math.floor(len / stride));
    const t0 = performance.now();
    gl.useProgram(this.survProg);
    const u = this.survUni;
    gl.uniform1i(u.uStart, start);
    gl.uniform1i(u.uSteps, steps);
    gl.uniform1i(u.uStride, stride);
    gl.uniform1f(u.uPanelW, lander.panelW);
    gl.uniform1f(u.uBattery, lander.batteryWh);
    gl.uniform1f(u.uDayLoad, lander.dayLoadW);
    gl.uniform1f(u.uNightLoad, lander.nightLoadW);
    gl.uniform1f(u.uMinSoc, lander.minSocPct / 100);
    gl.uniform1i(u.uPanelMode, lander.horizontal ? 2 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, this.size, this.size, gl.RGBA, gl.FLOAT, this.buf);
    gl.useProgram(this.prog);
    const data = new Float32Array(this.buf.length);
    const rowLen = this.size * 4;
    for (let r = 0; r < this.size; r++) data.set(this.buf.subarray((this.size - 1 - r) * rowLen, (this.size - r) * rowLen), r * rowLen);
    return { size: this.size, hours: steps * stride, stride, data, millis: performance.now() - t0 };
  }

  // Surface temperature through time for every cell (see thermal.ts). Output per cell:
  // max, mean and min surface temperature (K) and the shallowest depth (m) where ice stays stable.
  computeThermal(startHour: number, hours: number): FieldMetrics {
    const gl = this.gl;
    if (!this.thermProg) {
      this.thermProg = link(gl, VERT, FRAG.split("void main() {")[0] + THERMAL_MAIN);
      gl.useProgram(this.thermProg);
      for (const n of ["uField", "uSun", "uEarth", "uSize", "uAzBins", "uCell", "uExtent", "uCenter", "uDecodeStep", "uDecodeOffset", "uStart", "uSteps", "uStride", "uHeights", "uHSize", "uHCell", "uSpin"]) {
        this.thermUni[n] = gl.getUniformLocation(this.thermProg, n);
      }
      const f = this.field;
      const { size: hs, cellMeters: hc } = f.meta.heights;
      const hf = new Float32Array(hs * hs);
      for (let i = 0; i < hf.length; i++) hf[i] = f.heights[i];
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, hs, hs, 0, gl.RED, gl.FLOAT, hf);
      nearest(gl, gl.TEXTURE_2D);
      gl.activeTexture(gl.TEXTURE3);
      const { azimuthBins, cellMeters, decode } = f.meta.horizon;
      const u = this.thermUni;
      gl.uniform1i(u.uField, 0);
      gl.uniform1i(u.uSun, 1);
      gl.uniform1i(u.uEarth, 2);
      gl.uniform1i(u.uHeights, 4);
      gl.uniform1i(u.uSize, this.size);
      gl.uniform1i(u.uAzBins, azimuthBins);
      gl.uniform1f(u.uCell, cellMeters);
      gl.uniform1f(u.uExtent, f.meta.extentMeters);
      gl.uniform2f(u.uCenter, f.meta.centerX ?? 0, f.meta.centerY ?? 0);
      gl.uniform1f(u.uDecodeStep, decode.stepDeg);
      gl.uniform1f(u.uDecodeOffset, decode.offsetDeg);
      gl.uniform1i(u.uHSize, hs);
      gl.uniform1f(u.uHCell, hc);
    }
    const start = Math.max(0, Math.min(this.count - 1, Math.floor(startHour)));
    const len = Math.max(1, Math.min(this.count - start, Math.floor(hours)));
    const stride = Math.max(1, Math.ceil(len / 2200));
    const steps = Math.max(1, Math.floor(len / stride));
    const t0 = performance.now();
    gl.useProgram(this.thermProg);
    const u = this.thermUni;
    gl.uniform1i(u.uStart, start);
    gl.uniform1i(u.uSteps, steps);
    gl.uniform1i(u.uStride, stride);
    gl.uniform1i(u.uSpin, Math.min(Math.floor(steps / 4), Math.round(709 / stride)));
    // draw in bands so no single GPU job runs long enough to trip the driver watchdog
    gl.enable(gl.SCISSOR_TEST);
    const band = 32;
    for (let y = 0; y < this.size; y += band) {
      gl.scissor(0, y, this.size, Math.min(band, this.size - y));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.flush();
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.readPixels(0, 0, this.size, this.size, gl.RGBA, gl.FLOAT, this.buf);
    gl.useProgram(this.prog);
    const data = new Float32Array(this.buf.length);
    const rowLen = this.size * 4;
    for (let r = 0; r < this.size; r++) data.set(this.buf.subarray((this.size - 1 - r) * rowLen, (this.size - r) * rowLen), r * rowLen);
    return { size: this.size, hours: steps * stride, stride, data, millis: performance.now() - t0 };
  }

  // Hour-by-hour "Sun up" and "Earth link" for every cell, packed as bits ([cell][word]).
  visibilityBits(startHour: number, hours: number): VisibilityBits {
    const gl = this.gl;
    const n = this.size;
    if (!this.bitsProg) {
      const head = FRAG.split("void main() {")[0].replace("out vec4 outColor;", "out uvec4 outBits;");
      this.bitsProg = link(gl, VERT, head + BITS_MAIN);
      gl.useProgram(this.bitsProg);
      for (const k of ["uField", "uSun", "uEarth", "uSize", "uAzBins", "uCell", "uExtent", "uCenter", "uDecodeStep", "uDecodeOffset", "uStart", "uMode", "uEnd"]) {
        this.bitsUni[k] = gl.getUniformLocation(this.bitsProg, k);
      }
      const f = this.field;
      const { azimuthBins, cellMeters, decode } = f.meta.horizon;
      const u = this.bitsUni;
      gl.uniform1i(u.uField, 0);
      gl.uniform1i(u.uSun, 1);
      gl.uniform1i(u.uEarth, 2);
      gl.uniform1i(u.uSize, n);
      gl.uniform1i(u.uAzBins, azimuthBins);
      gl.uniform1f(u.uCell, cellMeters);
      gl.uniform1f(u.uExtent, f.meta.extentMeters);
      gl.uniform2f(u.uCenter, f.meta.centerX ?? 0, f.meta.centerY ?? 0);
      gl.uniform1f(u.uDecodeStep, decode.stepDeg);
      gl.uniform1f(u.uDecodeOffset, decode.offsetDeg);
      gl.activeTexture(gl.TEXTURE5);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, n, n, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, null);
      nearest(gl, gl.TEXTURE_2D);
      gl.activeTexture(gl.TEXTURE3);
      this.bitsFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bitsFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    }
    const t0 = performance.now();
    const start = Math.max(0, Math.min(this.count - 1, Math.floor(startHour)));
    const len = Math.max(1, Math.min(this.count - start, Math.floor(hours)));
    const words = Math.ceil(len / 32);
    const passes = Math.ceil(words / 4);
    const sun = new Uint32Array(n * n * words);
    const linkBits = new Uint32Array(n * n * words);
    const buf = new Uint32Array(n * n * 4);
    gl.useProgram(this.bitsProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bitsFbo);
    gl.viewport(0, 0, n, n);
    gl.uniform1i(this.bitsUni.uEnd, start + len);
    for (const [mode, out] of [[0, sun], [1, linkBits]] as const) {
      gl.uniform1i(this.bitsUni.uMode, mode);
      for (let p = 0; p < passes; p++) {
        gl.uniform1i(this.bitsUni.uStart, start + p * 128);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.readPixels(0, 0, n, n, gl.RGBA_INTEGER, gl.UNSIGNED_INT, buf);
        for (let r = 0; r < n; r++) {
          const src = (n - 1 - r) * n;
          for (let c = 0; c < n; c++) {
            const cell = r * n + c;
            for (let w = 0; w < 4; w++) {
              const word = p * 4 + w;
              if (word < words) out[cell * words + word] = buf[(src + c) * 4 + w];
            }
          }
        }
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.useProgram(this.prog);
    return { start, hours: len, words, sun, link: linkBits, millis: performance.now() - t0 };
  }

  dispose() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  compute(startHour: number, hours: number, maxSteps = 2000): FieldMetrics {
    const gl = this.gl;
    const start = Math.max(0, Math.min(this.count - 1, Math.floor(startHour)));
    const len = Math.max(1, Math.min(this.count - start, Math.floor(hours)));
    const stride = Math.max(1, Math.ceil(len / maxSteps));
    const steps = Math.max(1, Math.floor(len / stride));
    const t0 = performance.now();
    gl.uniform1i(this.uni.uStart, start);
    gl.uniform1i(this.uni.uSteps, steps);
    gl.uniform1i(this.uni.uStride, stride);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, this.size, this.size, gl.RGBA, gl.FLOAT, this.buf);
    const data = new Float32Array(this.buf.length);
    const rowLen = this.size * 4;
    for (let r = 0; r < this.size; r++) data.set(this.buf.subarray((this.size - 1 - r) * rowLen, (this.size - r) * rowLen), r * rowLen);
    return { size: this.size, hours: steps * stride, stride, data, millis: performance.now() - t0 };
  }
}

function nearest(gl: WebGL2RenderingContext, target: number) {
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
  return p;
}
