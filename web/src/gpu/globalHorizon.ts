import type { GlobeData } from "../data/globe";

const N_AZ = 720;

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
uniform isampler2D uGlobe;
uniform isampler2D uPolar;
uniform ivec2 uGlobeSize;
uniform float uPpd;
uniform float uStep;
uniform int uPolarSize;
uniform float uPolarCell;
uniform float uPolarFirst;
uniform float uLat;
uniform float uLon;
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

float heightAt(vec3 u) {
  float lat = asin(clamp(u.z, -1.0, 1.0));
  float lon = atan(u.y, u.x);
  if (degrees(lat) < -82.0) {
    float k = 2.0 * R / (1.0 - u.z);
    bool ok;
    float h = polarSample(k * u.y, k * u.x, ok);
    if (ok) return h;
  }
  return globeSample(degrees(lat), degrees(lon));
}

void main() {
  int a = int(gl_FragCoord.x);
  float az = 2.0 * PI * float(a) / ${N_AZ}.0;
  float lat = radians(uLat);
  float lon = radians(uLon);
  vec3 up = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  vec3 east = vec3(-sin(lon), cos(lon), 0.0);
  vec3 north = cross(up, east);
  vec3 dir = cos(az) * north + sin(az) * east;
  float h0 = heightAt(up) + uObserver;
  float best = -1.5;
  float d = 60.0;
  for (int i = 0; i < 320; i++) {
    float delta = d / R;
    float sh = sin(0.5 * delta);
    vec3 p = cos(delta) * up + sin(delta) * dir;
    float dh = heightAt(p) - h0;
    best = max(best, atan(dh - 2.0 * R * sh * sh, R * sin(delta)));
    d += max(60.0, d * 0.03);
    if (d > 350000.0) break;
  }
  outColor = vec4(degrees(best), 0.0, 0.0, 1.0);
}`;

export class GlobalHorizon {
  private gl: WebGL2RenderingContext;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private buf = new Float32Array(N_AZ * 4);

  constructor(g: GlobeData) {
    const canvas = document.createElement("canvas");
    canvas.width = N_AZ;
    canvas.height = 1;
    const gl = canvas.getContext("webgl2");
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) throw new Error("WebGL2 float rendering is not available.");
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    gl.useProgram(p);
    for (const n of ["uGlobe", "uPolar", "uGlobeSize", "uPpd", "uStep", "uPolarSize", "uPolarCell", "uPolarFirst", "uLat", "uLon", "uObserver"]) {
      this.uni[n] = gl.getUniformLocation(p, n);
    }
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, "aPos");
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
    gl.uniform1i(this.uni.uGlobe, 0);
    gl.uniform1i(this.uni.uPolar, 1);
    gl.uniform2i(this.uni.uGlobeSize, g.width, g.height);
    gl.uniform1f(this.uni.uPpd, g.ppd);
    gl.uniform1f(this.uni.uStep, g.step);
    gl.uniform1i(this.uni.uPolarSize, g.polarSize);
    gl.uniform1f(this.uni.uPolarCell, g.polarCell);
    gl.uniform1f(this.uni.uPolarFirst, g.polarFirst);

    gl.activeTexture(gl.TEXTURE2);
    const out = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, out);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, N_AZ, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
    gl.viewport(0, 0, N_AZ, 1);
  }

  compute(lat: number, lon: number, observerM = 2): { horizon: number[]; millis: number } {
    const gl = this.gl;
    const t0 = performance.now();
    gl.uniform1f(this.uni.uLat, lat);
    gl.uniform1f(this.uni.uLon, lon);
    gl.uniform1f(this.uni.uObserver, observerM);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, N_AZ, 1, gl.RGBA, gl.FLOAT, this.buf);
    const horizon = new Array<number>(N_AZ);
    for (let i = 0; i < N_AZ; i++) horizon[i] = this.buf[i * 4];
    return { horizon, millis: performance.now() - t0 };
  }
}
