import { useEffect, useRef, useState } from "react";
import { ephemAt } from "../data/load";
import { customSiteAt } from "../data/field";
import { overlayCanvas } from "../gpu/overlay";
import { useFieldMetrics } from "../gpu/useFieldMetrics";
import { MoonScene } from "../three/MoonScene";
import { uniqueFeatures } from "../data/artemis";
import { analyzeArea } from "../gpu/regions";
import { useApp } from "../state/store";
import { addPointAt } from "../lib/points";
import { applyLate, registerScene, sharedCamera } from "../state/share";
import { useSelectedSite, useSiteState, useSites } from "../state/selectors";


export default function Scene3D() {
  const host = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<MoonScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = useApp((s) => s.data)!;
  const field = useApp((s) => s.field);
  const globe = useApp((s) => s.globe);
  const orbitRequest = useApp((s) => s.orbitRequest);
  const quality = useApp((s) => s.quality);
  const cutaway = useApp((s) => s.cutaway);
  const mc = useApp((s) => s.mc);
  const flyRequest = useApp((s) => s.flyRequest);
  const fieldProgress = useApp((s) => s.fieldProgress);
  const hour = useApp((s) => s.hour);
  const layer = useApp((s) => s.layer);
  const finder = useApp((s) => s.finder);
  const survival = useApp((s) => s.survival);
  const sites = useSites();
  const site = useSelectedSite();
  const st = useSiteState();
  const { metrics } = useFieldMetrics();
  const lastSelected = useRef<string | null>(null);

  const hasField = !!field;
  useEffect(() => {
    const field = useApp.getState().field;
    if (!field || !host.current) return;
    let s: MoonScene;
    try {
      s = new MoonScene(host.current, field);
      if (import.meta.env.DEV) (window as unknown as { __scene: MoonScene }).__scene = s;
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    s.onSelectSite = (id) => useApp.getState().select(id);
    s.onPick = (x, y) => {
      const f = useApp.getState().field;
      const c = f ? customSiteAt(f, x, y) : null;
      if (c) useApp.getState().setCustomSite(c);
    };
    s.onPickLatLon = (lat, lon) => addPointAt(lat, lon);
    if (sharedCamera()) s.skipIntro();
    registerScene(s);
    s.onFlyRegion = (r) => {
      useApp.getState().flyTo(r.lat, r.lon, Math.max(25, r.diameterKm * 1.3));
      analyzeArea(r.name, r.lat, r.lon);
    };
    s.setRegions(uniqueFeatures());
    lastSelected.current = null;
    setScene(s);
    return () => {
      registerScene(null);
      s.dispose();
      setScene(null);
    };
  }, [hasField]);

  useEffect(() => {
    if (scene && field) scene.setField(field);
  }, [scene, field]);

  useEffect(() => {
    if (scene && globe) scene.setGlobe(globe);
  }, [scene, globe]);

  useEffect(() => {
    if (scene && globe && field) setTimeout(applyLate, 0);
  }, [scene, globe, field]);

  useEffect(() => {
    if (scene && orbitRequest > 0) scene.flyToOrbit();
  }, [scene, orbitRequest]);

  useEffect(() => {
    scene?.setQuality(quality);
  }, [scene, quality]);

  useEffect(() => {
    scene?.setCutaway(cutaway);
  }, [scene, cutaway]);

  useEffect(() => {
    if (scene && flyRequest) scene.flyToLatLon(flyRequest.lat, flyRequest.lon, flyRequest.altKm);
  }, [scene, flyRequest]);

  useEffect(() => {
    scene?.setScatter(mc ? mc.points : null);
  }, [scene, mc]);

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
    scene?.setOverlay(layer === "now" ? null : overlayCanvas(layer, metrics, field, finder, survival));
  }, [scene, layer, metrics, field, finder, survival]);

  return (
    <div className="scene-host" ref={host}>
      {!field && <div className="stage-msg">Loading terrain field {Math.round(fieldProgress * 100)}%</div>}
      {error && <div className="stage-msg error">{error}</div>}
    </div>
  );
}
