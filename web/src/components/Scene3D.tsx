import { useEffect, useRef, useState } from "react";
import { ephemAt } from "../data/load";
import { customSiteAt } from "../data/field";
import { overlayCanvas } from "../gpu/overlay";
import { useFieldMetrics } from "../gpu/useFieldMetrics";
import { MoonScene } from "../three/MoonScene";
import { uniqueFeatures } from "../data/artemis";
import { analyzeArea } from "../gpu/regions";
import { useApp } from "../state/store";
import { computeGlobal, globalValueAt, paintGlobalOverlay, type GlobalPaintSource } from "../gpu/globalOverlay";
import { formatLayerValue, layerValue } from "../gpu/layers";
import { fieldCell } from "../data/field";
import { formatLatLon } from "../lib/astro";
import { GLOBAL_LAYERS } from "../gpu/layers";
import { addPointAt } from "../lib/points";
import { applyLate, registerScene, sharedCamera } from "../state/share";
import { useSelectedSite, useSiteState, useSites } from "../state/selectors";


// How far the side panels reach into the 3D view on each side, in CSS px (0 where there are none).
// Only the side columns count (the <aside> panels); a phone sheet spanning the width is not a side panel.
function panelInsets(host: HTMLElement, panels: Iterable<Element>) {
  const h = host.getBoundingClientRect();
  let left = 0;
  let right = 0;
  for (const el of panels) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.width > h.width * 0.45) continue;
    if (r.left + r.width / 2 < h.left + h.width / 2) left = Math.max(left, r.right - h.left);
    else right = Math.max(right, h.right - r.left);
  }
  return { left, right };
}

export default function Scene3D() {
  const host = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<MoonScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Top of the split-view site names: just under the layer bar, which wraps to more rows on narrow screens.
  const [tagTop, setTagTop] = useState(84);
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
  const palette = useApp((s) => s.palette);
  const finder = useApp((s) => s.finder);
  const survival = useApp((s) => s.survival);
  const rover = useApp((s) => s.rover);
  const landerOpen = useApp((s) => s.landerOpen);
  const lander = useApp((s) => s.lander);
  const rangeDays = useApp((s) => s.rangeDays);
  const playing = useApp((s) => s.playing);
  const day = Math.floor(hour / 24);
  const sites = useSites();
  const site = useSelectedSite();
  const st = useSiteState();
  const { metrics } = useFieldMetrics();
  const lastSelected = useRef<string | null>(null);
  const displayedGlobal = useRef<GlobalPaintSource | null>(null);
  const view = useApp((s) => s.view);
  const split = useApp((s) => s.split);
  const pinned = useApp((s) => s.pinned);
  const splitPair = split && pinned.length >= 2 ? [pinned[0], pinned[1]] : null;
  const [hover, setHover] = useState<{ x: number; y: number; text: string; value: string | null } | null>(null);
  const hoverAt = useRef(0);

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
    scene?.setMapMode(view === "2d");
  }, [scene, view]);

  useEffect(() => {
    scene?.setLander(landerOpen ? site : null, lander.panel, lander.panelAz);
  }, [scene, landerOpen, site, lander, field, globe]);

  useEffect(() => {
    scene?.setCutaway(cutaway);
  }, [scene, cutaway]);

  useEffect(() => {
    if (scene && flyRequest) scene.flyToLatLon(flyRequest.lat, flyRequest.lon, flyRequest.altKm);
  }, [scene, flyRequest]);

  // Side by side: left view goes to the first pinned site (and selects it), right view to the second.
  const leftId = splitPair?.[0].id;
  const rightId = splitPair?.[1].id;
  useEffect(() => {
    const viewport = host.current;
    const app = viewport?.closest(".app");
    if (!scene || !viewport || !app) return;
    if (!leftId || !rightId) {
      scene.setSplit(false);
      return;
    }

    const panelSelector = ":scope > aside.left, :scope > aside.right";
    const toolbarSelector = ":scope > .layer-bar";
    let lastInsets: ReturnType<typeof panelInsets> | undefined;
    const fit = () => {
      const insets = panelInsets(viewport, app.querySelectorAll(panelSelector));
      if (!lastInsets || insets.left !== lastInsets.left || insets.right !== lastInsets.right) {
        scene.setSplit(true, insets);
        lastInsets = insets;
      }
      const bar = app.querySelector(toolbarSelector);
      if (bar) setTagTop(Math.round(bar.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top) + 8);
    };
    fit();
    const { pinned, selectedId, select } = useApp.getState();
    const [a, b] = [pinned.find((p) => p.id === leftId), pinned.find((p) => p.id === rightId)];
    if (a) {
      if (selectedId === a.id) scene.select(a, true);
      else select(a.id);
    }
    if (b) scene.flySplitTo(b);
    // Lazy tool panels can appear after the state change. Watch their DOM nodes once they mount.
    const sizes = new ResizeObserver(fit);
    const watchLayout = () => {
      sizes.disconnect();
      sizes.observe(viewport);
      app.querySelectorAll(panelSelector + ", " + toolbarSelector).forEach((el) => sizes.observe(el));
      fit();
    };
    const layout = new MutationObserver(watchLayout);
    layout.observe(app, { childList: true, attributes: true, attributeFilter: ["class"] });
    watchLayout();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      layout.disconnect();
      sizes.disconnect();
    };
  }, [scene, leftId, rightId]);

  useEffect(() => {
    scene?.setScatter(mc && landerOpen ? mc.points : null);
  }, [scene, mc, landerOpen]);

  // whole-Moon version of the current layer, painted onto the globe outside the detailed area
  useEffect(() => {
    if (!scene) return;
    if (!globe || !GLOBAL_LAYERS.includes(layer)) {
      displayedGlobal.current = null;
      scene.setGlobalOverlay(null);
      useApp.getState().setGlobalInfo(null);
      return;
    }
    if (playing) return;
    let cancelled = false;
    computeGlobal(layer, day * 24, rangeDays).then((source) => {
      if (!cancelled) {
        displayedGlobal.current = source;
        scene.setGlobalOverlay(source ? paintGlobalOverlay(source, useApp.getState().palette) : null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [scene, globe, layer, rangeDays, day, playing]);

  // Repaint the displayed window even while playback freezes new GPU calculations.
  useEffect(() => {
    const source = displayedGlobal.current;
    if (scene && source?.layer === layer) scene.setGlobalOverlay(paintGlobalOverlay(source, palette));
  }, [scene, layer, palette]);

  useEffect(() => {
    scene?.setRoute(rover && "stops" in rover ? rover : null);
  }, [scene, rover, field]);

  useEffect(() => {
    scene?.setRoverHour(hour);
  }, [scene, hour, rover]);

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
    scene?.setOverlay(layer === "now" && view === "3d" ? null : overlayCanvas(layer, metrics, field, finder, survival, palette));
  }, [scene, layer, metrics, field, finder, survival, view, palette]);

  const onMove = (e: React.PointerEvent) => {
    if (!scene || e.buttons) return;
    const now = performance.now();
    if (now - hoverAt.current < 60) return;
    hoverAt.current = now;
    const p = scene.pickAt(e.clientX, e.clientY);
    if (!p) {
      setHover(null);
      return;
    }
    let value: string | null = null;
    const f = useApp.getState().field;
    const cell = f ? fieldCell(f, p.lat, p.lon) : null;
    if (cell && f && layer !== "terrain") {
      const v = layerValue(layer, metrics, f, cell.row * f.meta.horizon.size + cell.col);
      if (v !== null) value = formatLayerValue(layer, v);
    }
    if (value === null && layer !== "terrain") {
      const g = globalValueAt(p.lat, p.lon);
      if (g && g.layer === layer) value = formatLayerValue(layer, g.value);
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: `${formatLatLon(p.lat, p.lon)} · ${Math.round(p.heightM)} m`, value });
  };

  return (
    <div className="scene-host" ref={host} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {hover && (
        <div className="hover-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.text}
          {hover.value && <b> · {hover.value}</b>}
        </div>
      )}
      {splitPair && (
        <>
          <div className="split-tag split-tag-l" style={{ top: tagTop }}>{splitPair[0].name}</div>
          <div className="split-tag split-tag-r" style={{ top: tagTop }}>{splitPair[1].name}</div>
        </>
      )}
      {!field && <div className="stage-msg">Loading terrain field {Math.round(fieldProgress * 100)}%</div>}
      {error && <div className="stage-msg error">{error}</div>}
    </div>
  );
}
