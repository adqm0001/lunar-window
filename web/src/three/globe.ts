import * as THREE from "three";
import { R_MOON_KM, R_MOON_M } from "../lib/astro";

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

/**
 * Writes the world position (km) of south polar stereographic map point (x, y) (metres) at height heightM into
 * out[o..o+2]. Same as worldFromLatLon(...toLatLon(x, y), heightM) without trig or allocation, for building large
 * meshes. With t = rho / 2R: cos(lat) = 2t / (1 + t²), sin(lat) = -(1 - t²) / (1 + t²), cos(lon) = y / rho and
 * sin(lon) = x / rho, so cos(lat)cos(lon) = (y / R) / (1 + t²).
 */
export function polarToWorld(x: number, y: number, heightM: number, out: Float32Array, o: number) {
  const q = 1 / (1 + (x * x + y * y) / (4 * R_MOON_M * R_MOON_M));
  const ux = (y / R_MOON_M) * q;
  const uy = (x / R_MOON_M) * q;
  const uz = 1 - 2 * q;
  const rad = R_MOON_KM + heightM / 1000;
  out[o] = uy * rad + MOON_CENTER.x;
  out[o + 1] = -uz * rad + MOON_CENTER.y;
  out[o + 2] = -ux * rad + MOON_CENTER.z;
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
