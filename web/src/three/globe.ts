import * as THREE from "three";
import type { GlobeData } from "../data/globe";
import { globeHeight } from "../data/globe";
import { R_MOON_KM, toLatLon } from "../lib/astro";

export const MOON_CENTER = new THREE.Vector3(0, -R_MOON_KM, 0);
const D2R = Math.PI / 180;

export function dirFromLatLon(lat: number, lon: number): THREE.Vector3 {
  const a = lat * D2R;
  const b = lon * D2R;
  const ux = Math.cos(a) * Math.cos(b);
  const uy = Math.cos(a) * Math.sin(b);
  const uz = Math.sin(a);
  return new THREE.Vector3(uy, -uz, -ux);
}

export function worldFromLatLon(lat: number, lon: number, heightM: number): THREE.Vector3 {
  return dirFromLatLon(lat, lon)
    .multiplyScalar(R_MOON_KM + heightM / 1000)
    .add(MOON_CENTER);
}

export function latLonFromWorld(p: THREE.Vector3): [number, number] {
  const d = p.clone().sub(MOON_CENTER).normalize();
  const ux = -d.z;
  const uy = d.x;
  const uz = -d.y;
  return [Math.asin(Math.max(-1, Math.min(1, uz))) / D2R, Math.atan2(uy, ux) / D2R];
}

const VERT = /* glsl */ `
attribute vec2 aLL;
varying vec2 vLL;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vLL = aLL;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
precision highp isampler2D;
uniform sampler2D uColor;
uniform isampler2D uPolar;
uniform int uPolarSize;
uniform float uPolarCell;
uniform float uPolarFirst;
uniform vec3 uSunME;
uniform float uShadows;
uniform vec3 uSunWorld;
uniform vec3 uEarthWorld;
uniform float uSunPower;
uniform float uEarthshine;
uniform vec3 uHoleA;
uniform vec3 uHoleB;
varying vec2 vLL;
varying vec3 vNormal;
varying vec3 vWorld;
out vec4 fragColor;
const float PI = 3.14159265358979;
const float R_M = 1737400.0;
float hashf(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashf(i), hashf(i + vec2(1, 0)), u.x), mix(hashf(i + vec2(0, 1)), hashf(i + vec2(1, 1)), u.x), u.y);
}

float polarH(vec2 m, out bool ok) {
  float c = (m.x - uPolarFirst) / uPolarCell;
  float r = (-uPolarFirst - m.y) / uPolarCell;
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

float craterH(vec2 p, float cellSize, float seed) {
  vec2 g = p / cellSize;
  vec2 gi = floor(g);
  float h = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = gi + vec2(float(i), float(j));
      if (hashf(c + seed) > 0.6) continue;
      vec2 center = c + vec2(hashf(c + seed + 3.1), hashf(c + seed + 7.7));
      float radius = mix(0.18, 0.48, hashf(c + seed + 11.3));
      float r = length(g - center) / radius;
      float prof = r < 1.0 ? (r * r - 1.0) * 0.55 + 0.22 * exp(-pow((r - 1.0) * 4.5, 2.0)) : (r < 2.2 ? 0.22 * exp(-pow((r - 1.0) * 4.5, 2.0)) + 0.12 * exp(-(r - 1.0) * 3.0) : 0.0);
      h += prof * radius * cellSize * 0.32;
    }
  }
  return h;
}

float terrainH(vec2 m, float lod) {
  bool ok;
  float h = polarH(m, ok);
  h += craterH(m, 900.0, 5.0) + (lod > 0.3 ? craterH(m, 260.0, 19.0) * lod : 0.0);
  return h;
}

void main() {
  float lat = radians(vLL.x);
  float lon = radians(vLL.y);
  if (vLL.x < -80.0) {
    float k = 2.0 * R_M * tan(PI / 4.0 + lat / 2.0);
    vec2 m = vec2(k * sin(lon), k * cos(lon));
    if (uHoleA.z > 0.0 && abs(m.x - uHoleA.x) < uHoleA.z && abs(m.y - uHoleA.y) < uHoleA.z) discard;
    if (uHoleB.z > 0.0 && abs(m.x - uHoleB.x) < uHoleB.z && abs(m.y - uHoleB.y) < uHoleB.z) discard;
  }
  vec2 uv = vec2((vLL.y + 180.0) / 360.0, (vLL.x + 90.0) / 180.0);
  vec3 mapAlbedo = texture(uColor, uv).rgb * 0.30;
  float kk = 2.0 * R_M * tan(PI / 4.0 + lat / 2.0);
  vec2 mp = vec2(kk * sin(lon), kk * cos(lon));
  float tone = vnoise(mp / 2600.0) * 0.55 + vnoise(mp / 700.0) * 0.3 + vnoise(mp / 150.0) * 0.15;
  vec3 polarAlbedo = mix(vec3(0.105, 0.102, 0.098), vec3(0.165, 0.160, 0.152), tone);
  vec3 albedo = mix(polarAlbedo, mapAlbedo, smoothstep(-82.0, -76.0, vLL.x));

  float lit = 1.0;
  if (uShadows > 0.5 && vLL.x < -82.0) {
    vec3 up = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
    vec3 east = vec3(-sin(lon), cos(lon), 0.0);
    vec3 north = cross(up, east);
    vec3 sv = normalize(uSunME - up * 1737.4);
    float sel = asin(dot(sv, up));
    float saz = atan(dot(sv, east), dot(sv, north));
    vec2 northMap = vec2(sin(lon), cos(lon));
    vec2 eastMap = vec2(cos(lon), -sin(lon));
    vec2 dirMap = cos(saz) * northMap + sin(saz) * eastMap;
    bool ok;
    float h0 = polarH(mp, ok) + 2.0;
    if (ok) {
      float maxEl = -1.0;
      float d = 250.0;
      for (int i = 0; i < 64; i++) {
        bool ok2;
        float h = polarH(mp + dirMap * d, ok2);
        if (!ok2) break;
        maxEl = max(maxEl, atan((h - h0) / d - d / (2.0 * R_M)));
        d *= 1.085;
        if (d > 120000.0) break;
      }
      lit = clamp((sel - maxEl) / radians(0.53) + 0.5, 0.0, 1.0);
    }
  }
  vec3 n = normalize(vNormal);
  if (uShadows > 0.5 && vLL.x < -82.0) {
    float camDist = length(cameraPosition - vWorld);
    float lod = clamp(1.0 - camDist / 60.0, 0.0, 1.0);
    float e = max(60.0, camDist * 4.0);
    float h0 = terrainH(mp, lod);
    float hx = terrainH(mp + vec2(e, 0.0), lod);
    float hy = terrainH(mp + vec2(0.0, e), lod);
    vec3 upW = normalize(vWorld - vec3(0.0, -1737.4, 0.0));
    vec3 tx = normalize(vec3(1.0, 0.0, 0.0) - upW * upW.x);
    vec3 ty = normalize(vec3(0.0, 0.0, -1.0) + upW * upW.z);
    n = normalize(upW - tx * (hx - h0) / e - ty * (hy - h0) / e);
  }
  vec3 L = normalize(uSunWorld);
  vec3 V = normalize(cameraPosition - vWorld);
  float mu0 = max(dot(n, L), 0.0);
  float mu = max(dot(n, V), 0.02);
  float ph = degrees(acos(clamp(dot(L, V), -1.0, 1.0)));
  float lunarL = clamp(1.0 - 0.019 * ph + 0.000242 * ph * ph - 0.00000146 * ph * ph * ph, 0.0, 1.0);
  float photometry = mu0 > 0.0 ? 2.0 * lunarL * mu0 / (mu0 + mu) + (1.0 - lunarL) * mu0 : 0.0;
  vec3 col = albedo * (vec3(1.0, 0.975, 0.94) * uSunPower * photometry * lit + vec3(0.55, 0.68, 1.0) * uEarthshine * max(dot(n, normalize(uEarthWorld)), 0.0) + 0.0008);
  if (any(isnan(col))) col = vec3(0.0);
  fragColor = vec4(clamp(col, 0.0, 40.0), 1.0);
}`;

export function globeMaterial(color: THREE.Texture, hole: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    glslVersion: THREE.GLSL3,
    uniforms: {
      uColor: { value: color },
      uSunWorld: { value: new THREE.Vector3(1, 0, 0) },
      uEarthWorld: { value: new THREE.Vector3(0, 1, 0) },
      uSunPower: { value: 14 },
      uEarthshine: { value: 0 },
      uHoleA: { value: new THREE.Vector3(0, 0, hole) },
      uHoleB: { value: new THREE.Vector3(0, 0, 0) },
      uPolar: { value: null },
      uPolarSize: { value: 0 },
      uPolarCell: { value: 240 },
      uPolarFirst: { value: 0 },
      uSunME: { value: new THREE.Vector3(1, 0, 0) },
      uShadows: { value: 0 },
    },
  });
}

export function polarTexture(g: GlobeData): THREE.DataTexture {
  const tex = new THREE.DataTexture(g.polar, g.polarSize, g.polarSize, THREE.RedIntegerFormat, THREE.ShortType);
  tex.internalFormat = "R16I";
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.unpackAlignment = 1;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

export function setPolarUniforms(m: THREE.ShaderMaterial, g: GlobeData, tex: THREE.DataTexture, shadows: boolean) {
  m.uniforms.uPolar.value = tex;
  m.uniforms.uPolarSize.value = g.polarSize;
  m.uniforms.uPolarCell.value = g.polarCell;
  m.uniforms.uPolarFirst.value = g.polarFirst;
  m.uniforms.uShadows.value = shadows ? 1 : 0;
}

function finish(pos: Float32Array, ll: Float32Array, idx: Uint32Array) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aLL", new THREE.BufferAttribute(ll, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function gridIndex(cols: number, rows: number) {
  const idx = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      idx[k++] = a;
      idx[k++] = d;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = d;
      idx[k++] = e;
    }
  }
  return idx;
}

export function buildGlobe(g: GlobeData, cols = 1024, rows = 512): THREE.BufferGeometry {
  const pos = new Float32Array(cols * rows * 3);
  const ll = new Float32Array(cols * rows * 2);
  for (let r = 0; r < rows; r++) {
    const lat = 90 - (180 * r) / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const lon = -180 + (360 * c) / (cols - 1);
      const i = r * cols + c;
      const p = worldFromLatLon(lat, lon, globeHeight(g, lat, lon));
      pos.set([p.x, p.y, p.z], i * 3);
      ll.set([lat, lon], i * 2);
    }
  }
  return finish(pos, ll, gridIndex(cols, rows));
}

export function buildSkirt(g: GlobeData, extentM: number, cellM: number): THREE.BufferGeometry {
  const n = Math.round((2 * extentM) / cellM) + 1;
  const pos = new Float32Array(n * n * 3);
  const ll = new Float32Array(n * n * 2);
  for (let r = 0; r < n; r++) {
    const y = extentM - r * cellM;
    for (let c = 0; c < n; c++) {
      const x = -extentM + c * cellM;
      const [lat, lon] = toLatLon(x, y);
      const i = r * n + c;
      const p = worldFromLatLon(lat, lon, globeHeight(g, lat, lon) - 15);
      pos.set([p.x, p.y, p.z], i * 3);
      ll.set([lat, lon], i * 2);
    }
  }
  return finish(pos, ll, gridIndex(n, n));
}
