export interface ArtemisRegion {
  name: string;
  feature: string;
  lat: number;
  lon: number;
  diameterKm: number;
}

export const ARTEMIS_SOURCE =
  "NASA's nine Artemis III candidate regions (Oct 2024). NASA has not published region outlines; each is shown at its named feature, IAU Gazetteer of Planetary Nomenclature (USGS) center and size.";

export const ARTEMIS_REGIONS: ArtemisRegion[] = [
  { name: "Peak near Cabeus B", feature: "Cabeus B", lat: -82.26, lon: -54.58, diameterKm: 59.62 },
  { name: "Haworth", feature: "Haworth", lat: -87.45, lon: -5.17, diameterKm: 51.42 },
  { name: "Malapert Massif", feature: "Malapert massif (peak)", lat: -86.012, lon: 2.89, diameterKm: 30 },
  { name: "Mons Mouton Plateau", feature: "Mons Mouton", lat: -84.6, lon: 31.0, diameterKm: 130 },
  { name: "Mons Mouton", feature: "Mons Mouton", lat: -84.6, lon: 31.0, diameterKm: 60 },
  { name: "Nobile Rim 1", feature: "Nobile", lat: -85.28, lon: 53.27, diameterKm: 79.27 },
  { name: "Nobile Rim 2", feature: "Nobile", lat: -85.28, lon: 53.27, diameterKm: 79.27 },
  { name: "de Gerlache Rim 2", feature: "de Gerlache", lat: -88.48, lon: -88.34, diameterKm: 32.71 },
  { name: "Slater Plain", feature: "Slater", lat: -88.08, lon: 111.29, diameterKm: 25.12 },
];

export function uniqueFeatures(): ArtemisRegion[] {
  const seen = new Map<string, ArtemisRegion & { names: string[] }>();
  for (const r of ARTEMIS_REGIONS) {
    const k = `${r.lat},${r.lon},${r.diameterKm}`;
    const hit = seen.get(k);
    if (hit) hit.names.push(r.name);
    else seen.set(k, { ...r, names: [r.name] });
  }
  return [...seen.values()].map((r) => ({ ...r, name: r.names.join(" / ") }));
}
