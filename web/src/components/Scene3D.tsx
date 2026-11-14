import { useEffect, useRef, useState } from "react";
import { ephemAt } from "../data/load";
import { customSiteAt } from "../data/field";
import { overlayCanvas } from "../gpu/overlay";
import { useFieldMetrics } from "../gpu/useFieldMetrics";
import { MoonScene } from "../three/MoonScene";
import { GlobalHorizon } from "../gpu/globalHorizon";
import { globeHeight } from "../data/globe";
import { toMap } from "../lib/astro";
import type { Site } from "../data/load";
import { useApp } from "../state/store";
import { useSelectedSite, useSiteState, useSites } from "../state/selectors";

let globalEngine: GlobalHorizon | null = null;

function pickGlobal(lat: number, lon: number) {
  const st = useApp.getState();
  const g = st.globe;
  if (!g) return;
  const [x, y] = toMap(lat, lon);
  if (st.field && Math.abs(x) < st.field.meta.extentMeters && Math.abs(y) < st.field.meta.extentMeters) {
    const c = customSiteAt(st.field, x, y);
    if (c) st.setCustomSite(c);
    return;
  }
  try {
    globalEngine ??= new GlobalHorizon(g);
  } catch (e) {
    console.warn((e as Error).message);
    return;
  }
  const { horizon, millis } = globalEngine.compute(lat, lon);
  const site: Site = {
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
  st.setCustomSite(site);
}

export default function Scene3D() {
  const host = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<MoonScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = useApp((s) => s.data)!;
  const field = useApp((s) => s.field);
  const globe = useApp((s) => s.globe);
  const orbitRequest = useApp((s) => s.orbitRequest);
  const fieldProgress = useApp((s) => s.fieldProgress);
  const hour = useApp((s) => s.hour);
  const layer = useApp((s) => s.layer);
  const finder = useApp((s) => s.finder);
  const sites = useSites();
  const site = useSelectedSite();
  const st = useSiteState();
  const { metrics } = useFieldMetrics();
  const lastSelected = useRef<string | null>(null);

  useEffect(() => {
    if (!field || !host.current) return;
    let s: MoonScene;
    try {
      s = new MoonScene(host.current, field);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    s.onSelectSite = (id) => useApp.getState().select(id);
    s.onPick = (x, y) => {
      const c = customSiteAt(field, x, y);
      if (c) useApp.getState().setCustomSite(c);
    };
    s.onPickLatLon = (lat, lon) => pickGlobal(lat, lon);
    lastSelected.current = null;
    setScene(s);
    return () => {
      s.dispose();
      setScene(null);
    };
  }, [field]);

  useEffect(() => {
    if (scene && globe) scene.setGlobe(globe);
  }, [scene, globe]);

  useEffect(() => {
    if (scene && orbitRequest > 0) scene.flyToOrbit();
  }, [scene, orbitRequest]);

  useEffect(() => {
    const { sun, earth } = ephemAt(data.ephem, hour);
    scene?.setBodies(sun, earth, hour);
  }, [scene, data, hour]);

  useEffect(() => {
    scene?.setSites(sites);
  }, [scene, sites]);

  useEffect(() => {
    if (!scene) return;
    scene.select(site, lastSelected.current !== site.id);
    lastSelected.current = site.id;
  }, [scene, site]);

  useEffect(() => {
    scene?.setRays(site, st.sunFraction >= 0.5, st.earthUp);
  }, [scene, site, st]);

  useEffect(() => {
    scene?.setOverlay(layer === "now" ? null : overlayCanvas(layer, metrics, field, finder));
  }, [scene, layer, metrics, field, finder]);

  return (
    <div className="scene-host" ref={host}>
      {!field && <div className="stage-msg">Loading terrain field {Math.round(fieldProgress * 100)}%</div>}
      {error && <div className="stage-msg error">{error}</div>}
    </div>
  );
}
