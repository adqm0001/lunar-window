export const TERRAIN_VERT = /* glsl */ `
attribute vec2 aMap;
varying vec2 vMap;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vMap = aMap;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const TERRAIN_FRAG = /* glsl */ `
precision highp usampler2DArray;
uniform usampler2DArray uField;
uniform vec3 uSun;
uniform vec3 uSunWorld;
uniform int uSize;
uniform int uAzBins;
uniform float uCell;
uniform float uExtent;
uniform float uStep;
uniform float uOffset;
uniform sampler2D uOverlay;
uniform float uOverlayMix;
uniform float uSunPower;
uniform float uTime;
varying vec2 vMap;
varying vec3 vNormal;
varying vec3 vWorld;
out vec4 fragColor;

const float PI = 3.14159265358979;
const float R_M = 1737400.0;
const float R_KM = 1737.4;
const float SUN_R = 0.2665;

float hashf(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashf(i), hashf(i + vec2(1, 0)), u.x), mix(hashf(i + vec2(0, 1)), hashf(i + vec2(1, 1)), u.x), u.y);
}

float binAt(ivec2 c, float az) {
  float f = az / 360.0 * float(uAzBins);
  float fl = floor(f);
  int i0 = int(fl) % uAzBins;
  int i1 = (i0 + 1) % uAzBins;
  float a = float(texelFetch(uField, ivec3(c, i0), 0).r);
  float b = float(texelFetch(uField, ivec3(c, i1), 0).r);
  return mix(a, b, f - fl);
}

float horizonAt(vec2 m, float az) {
  vec2 p = vec2((m.x + uExtent) / uCell - 0.5, (uExtent - m.y) / uCell - 0.5);
  p = clamp(p, vec2(0.0), vec2(float(uSize) - 1.001));
  ivec2 c0 = ivec2(floor(p));
  vec2 w = p - floor(p);
  ivec2 c1 = min(c0 + 1, ivec2(uSize - 1));
  float h00 = binAt(c0, az);
  float h10 = binAt(ivec2(c1.x, c0.y), az);
  float h01 = binAt(ivec2(c0.x, c1.y), az);
  float h11 = binAt(c1, az);
  return mix(mix(h00, h10, w.x), mix(h01, h11, w.x), w.y) * uStep + uOffset;
}

void main() {
  float rho = length(vMap);
  float lat = -(PI / 2.0 - 2.0 * atan(rho / (2.0 * R_M)));
  float lon = atan(vMap.x, vMap.y);
  vec3 up = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  vec3 east = vec3(-sin(lon), cos(lon), 0.0);
  vec3 north = cross(up, east);
  vec3 sv = normalize(uSun - up * R_KM);
  float sel = degrees(asin(dot(sv, up)));
  float saz = degrees(atan(dot(sv, east), dot(sv, north)));
  if (saz < 0.0) saz += 360.0;
  float d = clamp((sel - horizonAt(vMap, saz)) / SUN_R, -1.0, 1.0);
  float lit = (acos(-d) + d * sqrt(1.0 - d * d)) / PI;

  vec3 n = normalize(vNormal);
  float lambert = max(dot(n, normalize(uSunWorld)), 0.0);
  lambert = lambert * (0.6 + 0.4 * lambert);
  float grain = vnoise(vMap / 900.0) * 0.5 + vnoise(vMap / 180.0) * 0.3 + vnoise(vMap / 45.0) * 0.2;
  vec3 albedo = mix(vec3(0.20, 0.195, 0.19), vec3(0.34, 0.33, 0.32), grain);
  vec3 sunCol = vec3(1.0, 0.96, 0.9) * uSunPower;
  vec3 ambient = vec3(0.010, 0.013, 0.022) + vec3(0.02, 0.025, 0.04) * (0.5 + 0.5 * n.y);
  vec3 col = albedo * (sunCol * lambert * lit + ambient);

  if (uOverlayMix > 0.0) {
    vec2 uv = vec2((vMap.x + uExtent) / (2.0 * uExtent), (vMap.y + uExtent) / (2.0 * uExtent));
    vec4 o = texture(uOverlay, uv);
    vec3 shade = 0.35 + 0.65 * vec3(clamp(lambert * 3.0, 0.0, 1.0));
    col = mix(col, o.rgb * shade * 1.4, o.a * uOverlayMix);
  }

  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  fragColor = vec4(clamp(col, 0.0, 40.0), 1.0);
}`;

export const EARTH_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const EARTH_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform float uSpin;
varying vec3 vN;
varying vec3 vP;
float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 p = normalize(vP);
  float c = cos(uSpin), s = sin(uSpin);
  vec3 q = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
  float land = smoothstep(0.52, 0.56, fbm(q * 2.2));
  float cloud = smoothstep(0.5, 0.75, fbm(q * 4.0 + 7.0));
  vec3 ocean = vec3(0.02, 0.09, 0.28);
  vec3 ground = mix(vec3(0.10, 0.22, 0.08), vec3(0.42, 0.36, 0.22), fbm(q * 6.0));
  vec3 base = mix(ocean, ground, land);
  base = mix(base, vec3(0.95), cloud * 0.85);
  float day = dot(normalize(vN), normalize(uSunDir));
  float light = smoothstep(-0.08, 0.25, day);
  vec3 col = base * light * 2.2 + vec3(0.15, 0.35, 0.9) * pow(1.0 - max(dot(normalize(vN), vec3(0.0, 0.0, 1.0)), 0.0), 3.0) * 0.0;
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition))), 2.0);
  col += vec3(0.25, 0.5, 1.0) * fres * light * 0.8;
  gl_FragColor = vec4(clamp(col, 0.0, 20.0), 1.0);
}`;
