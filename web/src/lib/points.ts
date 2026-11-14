import type { Site } from "../data/load";
import { customSiteAt, inField } from "../data/field";
import { globeHeight } from "../data/globe";
import { GlobalHorizon } from "../gpu/globalHorizon";
import { analyzeArea } from "../gpu/regions";
import { useApp } from "../state/store";
import { toMap } from "./astro";

let globalEngine: GlobalHorizon | null = null;

// Adds a custom point at a latitude/longitude. Inside a loaded horizon field the point reads the
// precomputed horizon; anywhere else the GPU computes a fresh 720-direction horizon from the globe.
export function addPointAt(lat: number, lon: number, name?: string): Site | null {
  const st = useApp.getState();
  const g = st.globe;
  if (!g) return null;
  const [x, y] = toMap(lat, lon);
  let site: Site | null = null;
  if (st.field && inField(st.field, x, y)) {
    site = customSiteAt(st.field, x, y);
  } else {
    try {
      globalEngine ??= new GlobalHorizon(g);
    } catch (e) {
      console.warn((e as Error).message);
      return null;
    }
    const { horizon, millis } = globalEngine.compute(lat, lon);
    site = {
      id: `custom:${lat.toFixed(4)},${lon.toFixed(4)}`,
      name: "Custom point",
      lat,
      lon,
      group: "Custom",
      terrain: true,
      height_m: globeHeight(g, lat, lon),
      horizon,
      computedMs: millis,
    };
  }
  if (!site) return null;
  st.setCustomSite(site);
  if (name) useApp.getState().renameCustomSite(site.id, name);
  if (lat < -75 && !(st.field && inField(st.field, x, y))) analyzeArea(name ?? "Custom point", lat, lon);
  return useApp.getState().customSites.find((c) => c.id === site!.id) ?? site;
}
