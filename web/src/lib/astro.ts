export const R_MOON_M = 1737400;
export const R_MOON_KM = 1737.4;
export const SUN_RADIUS_DEG = 0.2665;
export const DSN_MIN_ELEVATION_DEG = 10;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export type Vec3 = [number, number, number];

export interface LocalFrame {
  up: Vec3;
  east: Vec3;
  north: Vec3;
}

export function localFrame(latDeg: number, lonDeg: number): LocalFrame {
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R;
  const up: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const east: Vec3 = [-Math.sin(lon), Math.cos(lon), 0];
  const north: Vec3 = [
    up[1] * east[2] - up[2] * east[1],
    up[2] * east[0] - up[0] * east[2],
    up[0] * east[1] - up[1] * east[0],
  ];
  return { up, east, north };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface AltAz {
  az: number;
  el: number;
}

export function altaz(bodyKm: Vec3, frame: LocalFrame, siteRadiusKm: number): AltAz {
  const v: Vec3 = [
    bodyKm[0] - frame.up[0] * siteRadiusKm,
    bodyKm[1] - frame.up[1] * siteRadiusKm,
    bodyKm[2] - frame.up[2] * siteRadiusKm,
  ];
  const n = Math.hypot(v[0], v[1], v[2]);
  const el = Math.asin(dot(v, frame.up) / n) * R2D;
  const az = ((Math.atan2(dot(v, frame.east), dot(v, frame.north)) * R2D) % 360 + 360) % 360;
  return { az, el };
}

export function horizonAt(h: ArrayLike<number>, azDeg: number): number {
  const n = h.length;
  const f = ((((azDeg % 360) + 360) % 360) / 360) * n;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const w = f - Math.floor(f);
  return h[i0] * (1 - w) + h[i1] * w;
}

export function discFraction(centerAboveDeg: number, radiusDeg = SUN_RADIUS_DEG): number {
  const d = Math.max(-1, Math.min(1, centerAboveDeg / radiusDeg));
  return (Math.acos(-d) + d * Math.sqrt(1 - d * d)) / Math.PI;
}

export function toMap(latDeg: number, lonDeg: number): [number, number] {
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R;
  const k = 2 * R_MOON_M * Math.tan(Math.PI / 4 + lat / 2);
  return [k * Math.sin(lon), k * Math.cos(lon)];
}

export function toLatLon(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y);
  const lat = -(Math.PI / 2 - 2 * Math.atan(rho / (2 * R_MOON_M)));
  return [lat * R2D, Math.atan2(x, y) * R2D];
}

export function formatLatLon(lat: number, lon: number): string {
  const ns = lat < 0 ? "S" : "N";
  const ew = lon < 0 ? "W" : "E";
  return `${Math.abs(lat).toFixed(3)}°${ns} ${Math.abs(lon).toFixed(3)}°${ew}`;
}
