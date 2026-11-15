// Regolith heat-flow model, run independently for every grid cell on the GPU.
// Physics and constants follow Hayne et al. 2017 (JGR Planets, "Global regolith thermophysical
// properties of the Moon from the Diviner Lunar Radiometer Experiment"):
//  - density rises from 1100 kg/m3 at the surface to 1800 kg/m3 with an e-folding depth H = 0.07 m
//  - contact conductivity rises the same way (7.4e-4 to 3.4e-3 W/m/K), plus a radiative T^3 term
//  - heat capacity is the temperature-dependent polynomial from the same paper
//  - albedo rises at low Sun (Keihm 1984), emissivity 0.95, interior heat flow 0.018 W/m2
// Sunlight on each cell uses the real horizon (partial Sun disk) and the ground's own slope.
// Light and heat bounced off surrounding terrain use the bowl-crater result of Ingersoll,
// Svitek & Murray 1992 (Icarus 100, "Stability of polar frosts in spherical bowl-shaped craters
// on the Moon, Mercury, and Mars"): sunlight entering the crater's opening (flux S0 sin e per unit
// area, e = Sun elevation above the flat horizon) is either reflected by the walls (fraction A) or
// absorbed and re-emitted as infrared; a point inside receives the fraction F of it, where F is
// the share of its sky covered by terrain (from the horizon). Absorbed by the point:
//   scattered sunlight  F * S0 sin e * A (1 - A)
//   infrared            F * S0 sin e * (1 - A) * emissivity
// Multiple reflections (a 1/(1 - A F) factor, ~2 %) and walls cooling after sunset are left out.

export const NZ = 14;
export const ICE_K = 110;
/** Ice is stable where the warmest temperature over a full year of sunlight stays below ICE_K (Paige et al. 2010, Science). */
export const ICE_HOURS = 365 * 24;
/** A shorter run hasn't seen the year's warmest days, so it can't say whether ice survives. */
export const iceVerdictPossible = (hours: number) => hours >= ICE_HOURS;
/** Whether the data from `startHour` to its end (`count` hours in all) covers the year an ice verdict needs. */
export const iceCovered = (count: number, startHour: number) => iceVerdictPossible(count - startHour);

// Normal-incidence albedo of the surrounding terrain and emissivity, as in the direct-sunlight terms.
export const WALL_ALBEDO = 0.12;
export const EMISSIVITY = 0.95;
// Fraction of the light entering a crater's opening that a shadowed point inside absorbs per unit F.
export const BOUNCE_ABSORBED = WALL_ALBEDO * (1 - WALL_ALBEDO) + (1 - WALL_ALBEDO) * EMISSIVITY;

export const THERMAL_MAIN = `
uniform highp sampler2D uHeights;
uniform int uHSize;
uniform float uHCell;
uniform int uSpin;

const int NZ = ${NZ};
const float S0 = 1361.0;
const float EMIS = 0.95;
const float SIGMA = 5.670374e-8;
const float QGEO = 0.018;
const float BOUNCE = ${BOUNCE_ABSORBED.toFixed(6)};

float cpOf(float T) {
  return -3.6125 + T * (2.7431 + T * (2.3616e-3 + T * (-1.2340e-5 + T * 8.9093e-9)));
}

float hAt(float x, float y) {
  float fc = (x - uCenter.x + uExtent) / uHCell - 0.5;
  float fr = (uExtent - (y - uCenter.y)) / uHCell - 0.5;
  ivec2 c = clamp(ivec2(floor(fc), floor(fr)), ivec2(0), ivec2(uHSize - 2));
  vec2 w = clamp(vec2(fc, fr) - vec2(c), 0.0, 1.0);
  float a = texelFetch(uHeights, c, 0).r;
  float b = texelFetch(uHeights, c + ivec2(1, 0), 0).r;
  float d = texelFetch(uHeights, c + ivec2(0, 1), 0).r;
  float e = texelFetch(uHeights, c + ivec2(1, 1), 0).r;
  return mix(mix(a, b, w.x), mix(d, e, w.x), w.y);
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

  float e = uCell * 0.5;
  vec2 g = vec2(hAt(x + e, y) - hAt(x - e, y), hAt(x, y + e) - hAt(x, y - e)) / (2.0 * e);
  float dN = dot(g, vec2(sin(lon), cos(lon)));
  float dE = dot(g, vec2(cos(lon), -sin(lon)));
  vec3 nrm = normalize(up - dE * east - dN * north);

  // Horizontal-surface approximation: 1 - F_sky in HORAYZON (2022), Eq. (5).
  // https://doi.org/10.5194/gmd-15-6817-2022
  // Negative horizons leave the upper hemisphere unobstructed.
  float F = 0.0;
  for (int a = 0; a < uAzBins; a++) {
    float az = float(a) * 360.0 / float(uAzBins);
    float sinH = sin(radians(max(horizonAt(col, row, az), 0.0)));
    F += sinH * sinH;
  }
  F /= float(uAzBins);

  // layer thicknesses grow with depth; node i sits at depth z[i]
  float dz[NZ];
  float z[NZ];
  float rhoZ[NZ];
  float kc[NZ];
  float T[NZ];
  float Tmx[NZ];
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

  // first pass: mean absorbed sunlight sets a sensible starting temperature profile
  float fluxSum = 0.0;
  for (int k = 0; k < uSteps; k++) {
    int i = uStart + k * uStride;
    vec3 sv = normalize(texelFetch(uSun, tc(i), 0).xyz - site);
    float sel = degrees(asin(dot(sv, up)));
    float saz = degrees(atan(dot(sv, east), dot(sv, north)));
    if (saz < 0.0) saz += 360.0;
    float d = clamp((sel - horizonAt(col, row, saz)) / SUN_R, -1.0, 1.0);
    float frac = (acos(-d) + d * sqrt(1.0 - d * d)) / PI;
    fluxSum += S0 * frac * max(0.0, dot(nrm, sv)) * 0.88 + F * S0 * max(0.0, sin(radians(sel))) * BOUNCE;
  }
  float T0 = max(30.0, pow((fluxSum / float(uSteps) + QGEO) / (EMIS * SIGMA), 0.25) * 0.9);
  for (int i = 0; i < NZ; i++) { T[i] = T0; Tmx[i] = 0.0; }

  float tMax = 0.0;
  float tMin = 1e9;
  float tSum = 0.0;
  float nRec = 0.0;
  for (int k = 0; k < uSteps; k++) {
    int idx = uStart + k * uStride;
    vec3 sv = normalize(texelFetch(uSun, tc(idx), 0).xyz - site);
    float sel = degrees(asin(dot(sv, up)));
    float saz = degrees(atan(dot(sv, east), dot(sv, north)));
    if (saz < 0.0) saz += 360.0;
    float d = clamp((sel - horizonAt(col, row, saz)) / SUN_R, -1.0, 1.0);
    float frac = (acos(-d) + d * sqrt(1.0 - d * d)) / PI;
    float mu = max(0.0, dot(nrm, sv));
    float inc = degrees(acos(clamp(mu, 0.0, 1.0)));
    float albedo = 0.12 + 0.06 * pow(inc / 45.0, 3.0) + 0.25 * pow(inc / 90.0, 8.0);
    float absorbed = (1.0 - albedo) * S0 * frac * mu;
    // light and heat bounced off the surrounding terrain (see the header comment)
    absorbed += F * S0 * max(0.0, sin(radians(sel))) * BOUNCE;

    for (int s = 0; s < nsub; s++) {
      float Tn[NZ];
      float kk[NZ];
      for (int i = 0; i < NZ; i++) {
        float r = T[i] / 350.0;
        kk[i] = kc[i] * (1.0 + 2.7 * r * r * r);
      }
      for (int i = 1; i < NZ - 1; i++) {
        float kU = 0.5 * (kk[i - 1] + kk[i]);
        float kD = 0.5 * (kk[i] + kk[i + 1]);
        float flux = kD * (T[i + 1] - T[i]) / dz[i] - kU * (T[i] - T[i - 1]) / dz[i - 1];
        float cell = 0.5 * (dz[i - 1] + dz[i]);
        Tn[i] = T[i] + h * flux / (rhoZ[i] * max(cpOf(T[i]), 60.0) * cell);
      }
      Tn[NZ - 1] = Tn[NZ - 2] + QGEO * dz[NZ - 2] / kk[NZ - 2];
      // surface: emitted = absorbed + heat conducted up from below (Newton's method)
      float k0 = kk[0];
      // the answer can't be above both the no-conduction equilibrium and the layer below,
      // so starting there makes Newton's method converge from above without overshooting
      float Teq = pow(absorbed / (EMIS * SIGMA) + 1.0, 0.25);
      float Ts = max(Teq, Tn[1]) + 0.5;
      for (int it = 0; it < 6; it++) {
        float f = EMIS * SIGMA * Ts * Ts * Ts * Ts - absorbed - k0 * (Tn[1] - Ts) / dz[0];
        float fp = 4.0 * EMIS * SIGMA * Ts * Ts * Ts + k0 / dz[0];
        Ts = max(15.0, Ts - f / fp);
      }
      Tn[0] = Ts;
      for (int i = 0; i < NZ; i++) T[i] = Tn[i];
    }
    if (k >= uSpin) {
      tMax = max(tMax, T[0]);
      tMin = min(tMin, T[0]);
      tSum += T[0];
      nRec += 1.0;
      for (int i = 0; i < NZ; i++) Tmx[i] = max(Tmx[i], T[i]);
    }
  }

  // shallowest depth where the warmest temperature all period stays below the ice limit
  float iceDepth = -1.0;
  for (int i = NZ - 1; i >= 0; i--) {
    if (Tmx[i] < ${ICE_K}.0) iceDepth = z[i];
    else break;
  }
  outColor = vec4(tMax, tSum / max(nRec, 1.0), tMin, iceDepth);
}`;
