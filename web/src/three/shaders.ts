import { CRATER_TEX_GLSL, GROUND_GLSL } from "./craterTexture";
import { LANDER_SHADOW_GLSL } from "./landerModel";
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
uniform vec2 uCenter;
uniform float uStep;
uniform float uOffset;
uniform sampler2D uOverlay;
uniform float uOverlayMix;
uniform float uSunPower;
uniform float uTime;
uniform vec3 uEarth;
uniform vec3 uEarthWorld;
uniform float uEarthshine;
uniform float uExaggeration;
uniform float uMapLight;
uniform float uCutOn;
uniform vec3 uCutA;
uniform vec3 uCutB;
uniform int uQuality;
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
  vec2 p = vec2((m.x - uCenter.x + uExtent) / uCell - 0.5, (uExtent - (m.y - uCenter.y)) / uCell - 0.5);
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

${CRATER_TEX_GLSL}
${GROUND_GLSL}
${LANDER_SHADOW_GLSL}

void main() {
  if (uCutOn > 0.5) {
    vec3 pc = vWorld - vec3(0.0, -1737.4, 0.0);
    if (dot(pc, uCutA) > 0.0 && dot(pc, uCutB) > 0.0) discard;
  }
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

  vec3 ev = normalize(uEarth - up * R_KM);
  float eel = degrees(asin(dot(ev, up)));
  float eaz = degrees(atan(dot(ev, east), dot(ev, north)));
  if (eaz < 0.0) eaz += 360.0;
  float earthVis = smoothstep(-0.6, 0.6, eel - horizonAt(vMap, eaz));

  float camDist = length(cameraPosition - vWorld);
  vec3 n = normalize(vNormal);
  // world directions of the map's x and y axes here, and the Sun's direction in map terms
  vec3 eastW = vec3(east.y, -east.z, -east.x);
  vec3 northW = vec3(north.y, -north.z, -north.x);
  vec3 mxW = sin(lon) * northW + cos(lon) * eastW;
  vec3 myW = cos(lon) * northW - sin(lon) * eastW;
  float sE = dot(sv, east);
  float sN = dot(sv, north);
  vec2 sunMap = normalize(sE * vec2(cos(lon), -sin(lon)) + sN * vec2(sin(lon), cos(lon)) + vec2(1e-6, 0.0));
  float halo = 0.0;
  // Quality: Saver keeps only the near crater detail and no rocks; High draws rocks further out.
  float detailFar = uQuality == 0 ? 25.0 : 60.0;
  float rockFar = uQuality == 0 ? 0.0 : uQuality == 1 ? 0.3 : 0.6;
  if (camDist < detailFar) {
    vec4 cd = craterDetailTex(vMap);
    float fade = 1.0 - smoothstep(detailFar * 0.58, detailFar, camDist);
    n = normalize(n - (cd.x * mxW + cd.y * myW) * 0.85 * fade * uExaggeration);
    halo = cd.w * fade;
    if (lit > 0.0 && sel > 3.0 && sel < 40.0 && uQuality > 0) {
      float cs = craterShadow(vMap, sunMap, tan(radians(sel)), camDist * 1000.0 * 0.0009);
      lit *= mix(1.0, cs, fade * smoothstep(3.0, 6.0, sel));
    }
  }
  float rockAlb = 1.0;
  if (camDist < rockFar) {
    float fd = 1.0 - smoothstep(rockFar * 0.4, rockFar, camDist);
    float rmask;
    vec2 g = groundDetail(vMap, rmask);
    n = normalize(n - (g.x * mxW + g.y * myW) * fd);
    if (lit > 0.0 && sel > 0.0) lit *= mix(1.0, rockShadow(vMap, sunMap, tan(radians(sel))), fd);
    rockAlb = mix(1.0, 1.2, rmask * fd);
  }
  if (lit > 0.0) lit *= landerShadow(vWorld, normalize(uSunWorld));

  vec3 L = normalize(uSunWorld);
  vec3 V = normalize(cameraPosition - vWorld);
  float mu0 = max(dot(n, L), 0.0);
  float mu = max(dot(n, V), 0.02);
  float phase = acos(clamp(dot(L, V), -1.0, 1.0));
  float lunarL = clamp(1.0 - 0.019 * degrees(phase) + 0.000242 * pow(degrees(phase), 2.0) - 0.00000146 * pow(degrees(phase), 3.0), 0.0, 1.0);
  float photometry = mu0 > 0.0 ? 2.0 * lunarL * mu0 / (mu0 + mu) + (1.0 - lunarL) * mu0 : 0.0;
  float surge = 1.0 + 0.35 * exp(-degrees(phase) / 6.0);

  float tone = vnoise(vMap / 2600.0) * 0.55 + vnoise(vMap / 700.0) * 0.3 + vnoise(vMap / 150.0) * 0.15;
  vec3 albedo = mix(vec3(0.105, 0.102, 0.098), vec3(0.165, 0.160, 0.152), tone);
  albedo *= 1.0 + 0.32 * halo;
  albedo *= rockAlb;

  vec3 sunCol = vec3(1.0, 0.975, 0.94) * uSunPower;
  vec3 earthshine = vec3(0.55, 0.68, 1.0) * uEarthshine * earthVis * (0.35 + 0.65 * max(dot(n, normalize(uEarthWorld)), 0.0));
  vec3 upW = normalize(vWorld - vec3(0.0, -1737.4, 0.0));
  vec3 Lh = normalize(L - upW * dot(L, upW) + upW * 0.15);
  float fill = uSunPower * 0.012 * (0.35 + 0.65 * max(dot(n, Lh), 0.0)) * smoothstep(-0.12, 0.05, dot(upW, L));
  vec3 col = albedo * (sunCol * photometry * surge * lit + vec3(0.85, 0.85, 0.88) * fill + earthshine + vec3(0.0008, 0.0009, 0.0012));
  if (uMapLight > 0.5) {
    // map view: shaded relief lit from a fixed direction, readable everywhere
    vec3 fixedW = vec3(-0.7, 0.0, -0.7);
    vec3 tW = fixedW - upW * dot(fixedW, upW);
    vec3 Lm = normalize(upW * 0.62 + (dot(tW, tW) > 1e-6 ? normalize(tW) : vec3(1.0, 0.0, 0.0)));
    float hill = max(dot(n, Lm), 0.0);
    col = albedo * 3.4 * (0.1 + 0.9 * hill);
    mu0 = hill;
  }


  if (uOverlayMix > 0.0) {
    vec2 uv = vec2((vMap.x - uCenter.x + uExtent) / (2.0 * uExtent), (vMap.y - uCenter.y + uExtent) / (2.0 * uExtent));
    vec4 o = texture(uOverlay, uv);
    float relief = clamp(0.55 + 0.6 * mu0, 0.55, 0.95);
    col = mix(col, o.rgb * relief, o.a * uOverlayMix);
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
