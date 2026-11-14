import type { FieldData } from "../data/field";
import type { GlobeData } from "../data/globe";
import { globeHeight } from "../data/globe";
import { toLatLon } from "../lib/astro";
import { loadMosaic, mosaicHeight, MISSING, type Mosaic } from "../data/tiles";

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
uniform isampler2D uGlobe;
uniform isampler2D uPolar;
uniform isampler2D uFine;
uniform int uHasFine;
uniform vec2 uFineOrigin;
uniform ivec2 uFineSize;
uniform float uFineCell;
uniform ivec2 uGlobeSize;
uniform float uPpd;
uniform float uStep;
uniform int uPolarSize;
uniform float uPolarCell;
uniform float uPolarFirst;
uniform int uSize;
uniform float uCell;
uniform float uExtent;
uniform vec2 uCenter;
uniform float uAz;
uniform float uObserver;
out vec4 outColor;

const float PI = 3.14159265358979;
const float R = 1737400.0;

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

float fineSample(float x, float y, out bool ok) {
  ok = false;
  if (uHasFine == 0) return 0.0;
  float c = (x - uFineOrigin.x) / uFineCell;
  float r = (uFineOrigin.y - y) / uFineCell;
  if (c < 0.0 || r < 0.0 || c >= float(uFineSize.x) - 1.0 || r >= float(uFineSize.y) - 1.0) return 0.0;
  ivec2 p = ivec2(floor(vec2(c, r)));
  vec2 f = vec2(c, r) - floor(vec2(c, r));
  int a = texelFetch(uFine, p, 0).r;
  int b = texelFetch(uFine, p + ivec2(1, 0), 0).r;
  int d = texelFetch(uFine, p + ivec2(0, 1), 0).r;
  int e = texelFetch(uFine, p + ivec2(1, 1), 0).r;
  if (a == ${MISSING} || b == ${MISSING} || d == ${MISSING} || e == ${MISSING}) return 0.0;
  ok = true;
  return mix(mix(float(a), float(b), f.x), mix(float(d), float(e), f.x), f.y);
}

float heightAt(vec3 u) {
  if (u.z < -0.95) {
    float k = 2.0 * R / (1.0 - u.z);
    bool ok;
    float h = fineSample(k * u.y, k * u.x, ok);
    if (ok) return h;
  }
  if (u.z < -0.99) {
    float k = 2.0 * R / (1.0 - u.z);
    bool ok;
    float h = polarSample(k * u.y, k * u.x, ok);
    if (ok) return h;
  }
  return globeSample(degrees(asin(clamp(u.z, -1.0, 1.0))), degrees(atan(u.y, u.x)));
}

void main() {
  int col = int(gl_FragCoord.x);
  int row = uSize - 1 - int(gl_FragCoord.y);
  float x = (float(col) + 0.5) * uCell - uExtent + uCenter.x;
  float y = uExtent - (float(row) + 0.5) * uCell + uCenter.y;
  float rho = length(vec2(x, y));
  float lat = -(PI / 2.0 - 2.0 * atan(rho / (2.0 * R)));
  float lon = atan(x, y);
  vec3 up = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  vec3 east = vec3(-sin(lon), cos(lon), 0.0);
  vec3 north = cross(up, east);
  vec3 dir = cos(uAz) * north + sin(uAz) * east;
  float h0 = heightAt(up) + uObserver;
  float best = -1.5;
  float d = 120.0;
  for (int i = 0; i < 260; i++) {
    float delta = d / R;
    float sh = sin(0.5 * delta);
    vec3 p = cos(delta) * up + sin(delta) * dir;
    float dh = heightAt(p) - h0;
    best = max(best, atan(dh - 2.0 * R * sh * sh, R * sin(delta)));
    d += max(120.0, d * 0.035);
    if (d > 250000.0) break;
  }
  outColor = vec4(degrees(best), 0.0, 0.0, 1.0);
}`;

export interface RegionSpec {
  label: string;
  centerX: number;
  centerY: number;
  extentMeters: number;
}

const CELL = 250;
const BINS = 180;
const MESH_CELL = 50;
const FINE_MARGIN = 20000;
const Q_OFFSET = -8;
const Q_STEP = 0.1;

export async function buildRegionField(g: GlobeData, spec: RegionSpec, onProgress: (f: number) => void): Promise<FieldData> {
  const t0 = performance.now();
  const n = Math.round((2 * spec.extentMeters) / CELL);
  const reach = spec.extentMeters + FINE_MARGIN;
  const mosaic: Mosaic | null = await loadMosaic(spec.centerX - reach, spec.centerX + reach, spec.centerY - reach, spec.centerY + reach, (f) => onProgress(0.3 * f));
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const gl = canvas.getContext("webgl2");
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) throw new Error("WebGL2 float rendering is not available.");
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link error");
  gl.useProgram(prog);
  const u = (name: string) => gl.getUniformLocation(prog, name);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = (unit: number, w: number, h: number, data: Int16Array) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16I, w, h, 0, gl.RED_INTEGER, gl.SHORT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  };
  tex(0, g.width, g.height, g.globe);
  tex(1, g.polarSize, g.polarSize, g.polar);
  if (mosaic) tex(3, mosaic.width, mosaic.height, mosaic.data);
  else tex(3, 1, 1, new Int16Array([MISSING]));
  gl.uniform1i(u("uGlobe"), 0);
  gl.uniform1i(u("uPolar"), 1);
  gl.uniform1i(u("uFine"), 3);
  gl.uniform1i(u("uHasFine"), mosaic ? 1 : 0);
  gl.uniform2f(u("uFineOrigin"), mosaic?.x0 ?? 0, mosaic?.y0 ?? 0);
  gl.uniform2i(u("uFineSize"), mosaic?.width ?? 1, mosaic?.height ?? 1);
  gl.uniform1f(u("uFineCell"), mosaic?.cell ?? 40);
  gl.uniform2i(u("uGlobeSize"), g.width, g.height);
  gl.uniform1f(u("uPpd"), g.ppd);
  gl.uniform1f(u("uStep"), g.step);
  gl.uniform1i(u("uPolarSize"), g.polarSize);
  gl.uniform1f(u("uPolarCell"), g.polarCell);
  gl.uniform1f(u("uPolarFirst"), g.polarFirst);
  gl.uniform1i(u("uSize"), n);
  gl.uniform1f(u("uCell"), CELL);
  gl.uniform1f(u("uExtent"), spec.extentMeters);
  gl.uniform2f(u("uCenter"), spec.centerX, spec.centerY);
  gl.uniform1f(u("uObserver"), 2);
  gl.activeTexture(gl.TEXTURE2);
  const out = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, out);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, n, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer());
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
  gl.viewport(0, 0, n, n);

  const horizon = new Uint8Array(BINS * n * n);
  const buf = new Float32Array(n * n * 4);
  const azU = u("uAz");
  for (let a = 0; a < BINS; a++) {
    gl.uniform1f(azU, (2 * Math.PI * a) / BINS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.FLOAT, buf);
    const layer = a * n * n;
    for (let glRow = 0; glRow < n; glRow++) {
      const row = n - 1 - glRow;
      for (let c = 0; c < n; c++) {
        const v = Math.round((buf[(glRow * n + c) * 4] - Q_OFFSET) / Q_STEP);
        horizon[layer + row * n + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    if (a % 6 === 5) {
      onProgress(0.3 + (0.65 * (a + 1)) / BINS);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  gl.getExtension("WEBGL_lose_context")?.loseContext();

  const hn = Math.round((2 * spec.extentMeters) / MESH_CELL);
  const heights = new Int16Array(hn * hn);
  let zmin = Infinity;
  let zmax = -Infinity;
  for (let r = 0; r < hn; r++) {
    for (let c = 0; c < hn; c++) {
      const x = (c + 0.5) * MESH_CELL - spec.extentMeters + spec.centerX;
      const y = spec.extentMeters - (r + 0.5) * MESH_CELL + spec.centerY;
      const fine = mosaic ? mosaicHeight(mosaic, x, y) : null;
      const [lat, lon] = toLatLon(x, y);
      const z = Math.round(fine ?? globeHeight(g, lat, lon));
      heights[r * hn + c] = z;
      if (z < zmin) zmin = z;
      if (z > zmax) zmax = z;
    }
  }

  const slope = new Uint8Array(2 * n * n);
  const f = MESH_CELL / CELL;
  const per = Math.round(1 / f);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let sum = 0;
      let flat = 0;
      let cnt = 0;
      for (let dr = 0; dr < per; dr++) {
        for (let dc = 0; dc < per; dc++) {
          const rr = Math.min(hn - 2, r * per + dr);
          const cc = Math.min(hn - 2, c * per + dc);
          const z = heights[rr * hn + cc];
          const gx = (heights[rr * hn + cc + 1] - z) / MESH_CELL;
          const gy = (heights[(rr + 1) * hn + cc] - z) / MESH_CELL;
          const s = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
          sum += s;
          if (s < 10) flat++;
          cnt++;
        }
      }
      slope[r * n + c] = Math.min(255, Math.round((sum / cnt) * 4));
      slope[n * n + r * n + c] = Math.round((100 * flat) / cnt);
    }
  }

  onProgress(1);
  return {
    meta: {
      extentMeters: spec.extentMeters,
      centerX: spec.centerX,
      centerY: spec.centerY,
      label: spec.label,
      source: `${mosaic ? `NASA LOLA 40 m tiles (${Math.round(mosaic.coverage * 100)}% coverage)` : "NASA LOLA 240 m"}; horizons computed on your GPU in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
      horizon: { size: n, cellMeters: CELL, azimuthBins: BINS, observerHeightM: 2, decode: { offsetDeg: Q_OFFSET, stepDeg: Q_STEP } },
      heights: { size: hn, cellMeters: MESH_CELL, min: zmin, max: zmax },
      slope: { size: n, cellMeters: CELL },
    },
    horizon,
    heights,
    slope,
  };
}
