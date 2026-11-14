import * as THREE from "three";
import { R_MOON_KM } from "../lib/astro";

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
