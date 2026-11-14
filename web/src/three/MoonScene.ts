import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { FieldData } from "../data/field";
import { fieldHeight, inField } from "../data/field";
import type { Site } from "../data/load";
import type { Vec3 } from "../lib/astro";
import { toLatLon, toMap } from "../lib/astro";
import { EARTH_FRAG, EARTH_VERT, TERRAIN_FRAG, TERRAIN_VERT } from "./shaders";
import type { GlobeData } from "../data/globe";
import { globeHeight } from "../data/globe";
import { latLonFromWorld, MOON_CENTER, worldFromLatLon } from "./globe";
import { LodTerrain, surfaceHeightM, type Quality } from "./lod";
import { Cutaway } from "./cutaway";
import { LanderModel } from "./landerModel";
import { altaz, localFrame } from "../lib/astro";
import type { GlobalOverlay } from "../gpu/globalOverlay";
import { craterTexture } from "./craterTexture";
import { R_MOON_KM } from "../lib/astro";
import type { ScatterPoint } from "../lib/montecarlo";
import { roverAt, type RoverRoute } from "../lib/rover";
import type { ArtemisRegion } from "../data/artemis";
import { dirFromLatLon } from "./globe";

export const EXAGGERATION = 1.0;

export interface ViewState {
  orbit: boolean;
  t: [number, number];
  c: [number, number, number];
}
const SKY_R = 6000;

export function meToWorld(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[1], -v[2], -v[0]).normalize();
}

export class MoonScene {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private lens: ShaderPass;
  private terrainMat: THREE.ShaderMaterial;
  private sun: THREE.Sprite;
  private sunHalo: THREE.Sprite;
  private earth: THREE.Mesh;
  private earthMat: THREE.ShaderMaterial;
  private earthLabel: CSS2DObject;
  private beacons = new Map<string, { group: THREE.Group; label: HTMLDivElement; pos: THREE.Vector3 }>();
  private sunRay: THREE.Line;
  private earthRay: THREE.Line;
  private selected: string | null = null;
  private flight: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t: number; dur: number; orbit: boolean } | null = null;
  private globeMats: THREE.ShaderMaterial[] = [];
  private lod: LodTerrain | null = null;
  private terrainMesh!: THREE.Mesh;
  private stars!: THREE.Points;
  private sunDir = new THREE.Vector3(1, 0, 0);
  private earthDir = new THREE.Vector3(0, 1, 0);
  private globe: GlobeData | null = null;
  private pendingIntro: Site | null = null;
  private lastSites: Site[] = [];
  onPickLatLon: ((lat: number, lon: number) => void) | null = null;
  private dirty = true;
  private lastRender = 0;
  private orbitMode = true;
  private keys = new Set<string>();
  private dragging = false;
  private upDirty = false;
  private sunGain = 1;
  private lander = new LanderModel();
  private landerSite: Site | null = null;
  private landerMode = "vertical";
  private landerAz = -1;
  private landerFixedAz = 0;
  private lastSunMe: Vec3 = [1, 0, 0];
  private mapMode = false;
  private mapTarget = new THREE.Vector3();
  private mapDist = 120;
  // Pointers down on the 2D map by pointerId, and the distance between two of them while pinching (0 otherwise).
  private mapPointers = new Map<number, { x: number; y: number }>();
  private mapPinch = 0;
  private quality: Quality = "balanced";
  private bloom!: UnrealBloomPass;
  private cutaway = new Cutaway();
  private cutOn = false;
  private cutPending = false;
  private scatter: THREE.Points | null = null;
  private routeGroup = new THREE.Group();
  private route: RoverRoute | null = null;
  private rover: THREE.Group | null = null;
  private regionGroup = new THREE.Group();
  private labelObjs: CSS2DObject[] = [];
  private pendingRegions: ArtemisRegion[] | null = null;
  onFlyRegion: ((r: ArtemisRegion) => void) | null = null;
  private introDone = false;
  private frameTimes: number[] = [];
  private dpr = Math.min(window.devicePixelRatio, 1.75);
  private maxDpr = Math.min(window.devicePixelRatio, 1.75);
  private lastDprChange = 0;
  private raf = 0;
  private last = performance.now();
  private field: FieldData;
  private host: HTMLElement;
  private resizeObs: ResizeObserver;
  onPick: ((x: number, y: number) => void) | null = null;
  onSelectSite: ((id: string) => void) | null = null;

  constructor(host: HTMLElement, field: FieldData) {
    this.host = host;
    this.field = field;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "labels-layer";
    host.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.02, 20000);
    this.camera.position.copy(MOON_CENTER).add(new THREE.Vector3(0, 0.62, 1).normalize().multiplyScalar(R_MOON_KM + 3600));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.target.copy(MOON_CENTER);
    this.configureControls(true);
    this.bindMovement();
    this.bindMapInput();

    this.scene.background = new THREE.Color(0x000000);
    this.stars = this.makeStars();
    this.scene.add(this.stars);
    this.scene.add(this.cutaway.group);
    this.scene.add(this.lander.group, this.lander.lights);

    const { geometry } = this.makeTerrain();
    const h = field.meta.horizon;
    const tex = fieldTexture(field);
    this.terrainMat = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      glslVersion: THREE.GLSL3,
      uniforms: {
        uCraterTex: { value: craterTexture() },
        uField: { value: tex },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uSunWorld: { value: new THREE.Vector3(1, 0, 0) },
        uSize: { value: h.size },
        uAzBins: { value: h.azimuthBins },
        uCell: { value: h.cellMeters },
        uExtent: { value: field.meta.extentMeters },
        uCenter: { value: new THREE.Vector2(field.meta.centerX ?? 0, field.meta.centerY ?? 0) },
        uStep: { value: h.decode.stepDeg },
        uOffset: { value: h.decode.offsetDeg },
        uOverlay: { value: new THREE.Texture() },
        uOverlayMix: { value: 0 },
        uSunPower: { value: 10.5 },
        uEarth: { value: new THREE.Vector3(0, 0, 1) },
        uEarthWorld: { value: new THREE.Vector3(0, 1, 0) },
        uEarthshine: { value: 0 },
        uExaggeration: { value: EXAGGERATION },
        uMapLight: { value: 0 },
        uCutOn: { value: 0 },
        uCutA: { value: new THREE.Vector3(1, 0, 0) },
        uCutB: { value: new THREE.Vector3(0, 0, 1) },
        uTime: { value: 0 },
      },
    });
    this.terrainMesh = new THREE.Mesh(geometry, this.terrainMat);
    this.scene.add(this.terrainMesh);

    const glow = glowTexture();
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(6, 5.2, 4), blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sun.scale.setScalar(260);
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.2, 0.8, 0.45), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    this.sunHalo.scale.setScalar(1500);
    this.scene.add(this.sunHalo, this.sun);

    this.earthMat = new THREE.ShaderMaterial({
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
      uniforms: { uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uSpin: { value: 0 } },
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * Math.tan((1.9 * 2.6 * Math.PI) / 360), 64, 48), this.earthMat);
    this.scene.add(this.earth);
    const el = document.createElement("div");
    el.className = "sky-label earth";
    el.textContent = "EARTH";
    this.earthLabel = new CSS2DObject(el);
    this.earthLabel.center.set(0.5, -1.4);
    this.earth.add(this.earthLabel);

    this.sunRay = rayLine(0xffb547);
    this.earthRay = rayLine(0x4ea8ff);
    this.scene.add(this.sunRay, this.earthRay);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.5, 1.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.lens = new ShaderPass(LENS_SHADER);
    this.composer.addPass(this.lens);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.bindPicking();
    this.loop();
    if (import.meta.env.DEV) (window as unknown as { __moon: MoonScene }).__moon = this;
  }

  private makeTerrain() {
    const f = this.field;
    const n = f.meta.heights.size;
    const cell = f.meta.heights.cellMeters;
    const E = f.meta.extentMeters;
    const cx = f.meta.centerX ?? 0;
    const cy = f.meta.centerY ?? 0;
    const pos = new Float32Array(n * n * 3);
    const map = new Float32Array(n * n * 2);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        const x = (c + 0.5) * cell - E + cx;
        const y = E - (r + 0.5) * cell + cy;
        const w = this.mapToWorld(x, y, f.heights[i]);
        pos[i * 3] = w.x;
        pos[i * 3 + 1] = w.y;
        pos[i * 3 + 2] = w.z;
        map[i * 2] = x;
        map[i * 2 + 1] = y;
      }
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let k = 0;
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const a = r * n + c;
        const b = a + 1;
        const d = a + n;
        const e = d + 1;
        idx[k++] = a;
        idx[k++] = d;
        idx[k++] = b;
        idx[k++] = b;
        idx[k++] = d;
        idx[k++] = e;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("aMap", new THREE.BufferAttribute(map, 2));
    geometry.setIndex(new THREE.BufferAttribute(idx, 1));
    geometry.computeVertexNormals();
    return { geometry };
  }

  // Exact placement of a polar map point (metres) at height h (metres) on the sphere.
  // (A flat-map shortcut was fine near the pole but kilometres off for areas far from it.)
  mapToWorld(x: number, y: number, h: number): THREE.Vector3 {
    const [lat, lon] = toLatLon(x, y);
    return worldFromLatLon(lat, lon, h * EXAGGERATION);
  }

  private makeStars() {
    const count = 9000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([s * Math.cos(t) * SKY_R * 1.2, u * SKY_R * 1.2, s * Math.sin(t) * SKY_R * 1.2], i * 3);
      const b = (Math.pow(Math.random(), 7) * 1.6 + 0.05) * 0.45;
      const tint = Math.random();
      col.set([b * (0.85 + 0.15 * tint), b * 0.9, b * (1.05 - 0.2 * tint)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  }

  setBodies(sunMe: Vec3, earthMe: Vec3, hour: number) {
    this.dirty = true;
    this.lastSunMe = sunMe;
    this.updateLander();
    const s = meToWorld(sunMe);
    const e = meToWorld(earthMe);
    this.terrainMat.uniforms.uSun.value.set(sunMe[0], sunMe[1], sunMe[2]);
    this.terrainMat.uniforms.uSunWorld.value.copy(s);
    this.terrainMat.uniforms.uEarth.value.set(earthMe[0], earthMe[1], earthMe[2]);
    this.terrainMat.uniforms.uEarthWorld.value.copy(e);
    const se = new THREE.Vector3(sunMe[0] - earthMe[0], sunMe[1] - earthMe[1], sunMe[2] - earthMe[2]).normalize();
    const me = new THREE.Vector3(-earthMe[0], -earthMe[1], -earthMe[2]).normalize();
    const earthLitFraction = (1 + se.dot(me)) / 2;
    this.terrainMat.uniforms.uEarthshine.value = 0.035 * earthLitFraction;
    for (const m of this.globeMats) {
      m.uniforms.uSunME.value.set(sunMe[0], sunMe[1], sunMe[2]);
      m.uniforms.uSunWorld.value.copy(s);
      m.uniforms.uEarthWorld.value.copy(e);
      m.uniforms.uEarthshine.value = 0.035 * earthLitFraction;
    }
    this.sunDir.copy(s);
    this.earthDir.copy(e);
    this.earthMat.uniforms.uSunDir.value.copy(s);
    this.earthMat.uniforms.uSpin.value = ((hour % 24) / 24) * Math.PI * 2;
  }

  private gOverlay: GlobalOverlay | null = null;
  setGlobalOverlay(o: GlobalOverlay | null) {
    this.dirty = true;
    this.gOverlay = o;
    if (!this.lod) return;
    const u = this.lod.material.uniforms;
    if (!o) {
      u.uGOverlayMix.value = 0;
      return;
    }
    const tex = (canvas: HTMLCanvasElement, wrap: boolean) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      if (wrap) t.wrapS = THREE.RepeatWrapping;
      return t;
    };
    for (const [k, c, wrap] of [["uGOverlay", o.eq, true], ["uGOverlayS", o.south, false], ["uGOverlayN", o.north, false]] as const) {
      (u[k].value as THREE.Texture).dispose();
      u[k].value = tex(c, wrap);
    }
    u.uGOverlayMix.value = 0.9;
  }

  private overlayOn = false;

  setOverlay(canvas: HTMLCanvasElement | null) {
    this.dirty = true;
    this.overlayOn = !!canvas;
    this.updateHoles();
    const u = this.terrainMat.uniforms;
    if (!canvas) {
      u.uOverlayMix.value = 0;
      return;
    }
    const prev = u.uOverlay.value as THREE.Texture;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    u.uOverlay.value = t;
    u.uOverlayMix.value = 0.9;
    prev.dispose();
  }

  sitePosition(site: Site): THREE.Vector3 | null {
    const [x, y] = toMap(site.lat, site.lon);
    if (!inField(this.field, x, y)) {
      if (!this.globe) return null;
      return worldFromLatLon(site.lat, site.lon, globeHeight(this.globe, site.lat, site.lon));
    }
    const h = fieldHeight(this.field, x, y) ?? site.height_m;
    return this.mapToWorld(x, y, h);
  }

  setSites(sites: Site[]) {
    this.dirty = true;
    this.lastSites = sites;
    for (const b of this.beacons.values()) this.dropGroup(b.group);
    this.beacons.clear();
    for (const s of sites) {
      const p = this.sitePosition(s);
      if (!p) continue;
      const group = new THREE.Group();
      group.position.copy(p);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(MOON_CENTER).normalize());
      const stem = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.6, 0)]),
        new THREE.LineBasicMaterial({ color: 0xaab6ff, transparent: true, opacity: 0.55 }),
      );
      group.add(stem);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.8, 3.0) }));
      group.add(dot);
      const label = document.createElement("div");
      label.className = "site-label";
      label.textContent = s.name;
      label.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
        this.onSelectSite?.(s.id);
      });
      const obj = new CSS2DObject(label);
      this.labelObjs.push(obj);
      obj.position.set(0, 1.75, 0);
      obj.center.set(0.5, 1);
      group.add(obj);
      this.scene.add(group);
      this.beacons.set(s.id, { group, label, pos: p });
    }
    if (this.selected) this.highlight(this.selected);
  }

  select(site: Site, fly: boolean) {
    this.dirty = true;
    this.selected = site.id;
    this.highlight(site.id);
    const p = this.beacons.get(site.id)?.pos ?? this.sitePosition(site);
    if (!p || !fly) return;
    if (!this.introDone && !this.globe) {
      this.pendingIntro = site;
      return;
    }
    const up = p.clone().sub(MOON_CENTER).normalize();
    let offset = this.camera.position.clone().sub(this.controls.target);
    let dur = 1.8;
    if (!this.introDone) {
      this.introDone = true;
      const s = this.sunDir.clone().projectOnPlane(up).normalize();
      offset = s.multiplyScalar(-9).add(up.clone().multiplyScalar(3.2)).applyAxisAngle(up, 0.5);
      dur = 7.5;
    } else {
      const tangent = offset.clone().projectOnPlane(up);
      if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0).projectOnPlane(up);
      const dist = Math.min(Math.max(offset.length(), 6), 14);
      offset = tangent.setLength(dist * 0.92).add(up.clone().multiplyScalar(dist * 0.38));
    }
    this.startFlight(p, offset, dur, up);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  // 3D lander standing at a site, its solar panel facing a fixed azimuth or tracking the Sun
  setLander(site: Site | null, mode: string, panelAz: number) {
    this.landerSite = site;
    this.landerMode = mode;
    this.landerAz = panelAz;
    if (site && panelAz < 0) {
      // "face the Sun at landing": freeze the panel toward where the Sun is now
      const f = localFrame(site.lat, site.lon);
      this.landerFixedAz = altaz(this.lastSunMe, f, R_MOON_KM + site.height_m / 1000).az;
    }
    this.updateLander();
  }

  private updateLander() {
    const site = this.landerSite;
    const p = site ? this.sitePosition(site) : null;
    this.lander.setVisible(!!p);
    if (!site || !p) return;
    const f = localFrame(site.lat, site.lon);
    const up = p.clone().sub(MOON_CENTER).normalize();
    const north = new THREE.Vector3(f.north[1], -f.north[2], -f.north[0]);
    this.lander.place(p, up, north);
    const sun = altaz(this.lastSunMe, f, R_MOON_KM + site.height_m / 1000);
    const az = this.landerMode === "track" ? sun.az : this.landerAz >= 0 ? this.landerAz : this.landerFixedAz;
    this.lander.setPanel(this.landerMode, az);
    this.lander.setSun(this.sunDir);
    this.dirty = true;
  }

  viewLander() {
    const site = this.landerSite;
    const p = site ? this.sitePosition(site) : null;
    if (!p) return;

    const up = p.clone().sub(MOON_CENTER).normalize();
    const away = this.sunDir.clone().projectOnPlane(up);
    if (away.lengthSq() < 1e-6) away.set(1, 0, 0).projectOnPlane(up);
    const side = away.clone().normalize().cross(up).multiplyScalar(0.012);
    const offset = away.normalize().multiplyScalar(-0.022).add(side).add(up.clone().multiplyScalar(0.007));
    this.startFlight(p.clone().add(up.clone().multiplyScalar(0.002)), offset, 2.4, up);
  }

  getView(): ViewState {
    const t = latLonFromWorld(this.controls.target);
    const c = latLonFromWorld(this.camera.position);
    const alt = this.camera.position.distanceTo(MOON_CENTER) - R_MOON_KM;
    return { orbit: this.orbitMode, t, c: [c[0], c[1], alt] };
  }

  skipIntro() {
    this.introDone = true;
    this.pendingIntro = null;
  }

  setView(v: ViewState) {
    this.skipIntro();
    this.flight = null;
    const cdir = dirFromLatLon(v.c[0], v.c[1]);
    let target: THREE.Vector3;
    if (v.orbit) {
      target = MOON_CENTER.clone();
      this.camera.up.set(0, 1, 0);
    } else {
      const tdir = dirFromLatLon(v.t[0], v.t[1]);
      target = MOON_CENTER.clone().addScaledVector(tdir, this.groundRadius(tdir, 0.1));
      this.camera.up.copy(tdir);
    }
    this.camera.position.copy(MOON_CENTER).addScaledVector(cdir, R_MOON_KM + Math.max(0.2, v.c[2]));
    this.controls.target.copy(target);
    this.configureControls(v.orbit);
    this.camera.lookAt(target);
    this.dirty = true;
  }

  flyToOrbit(dur = 3.5) {
    const dir = this.camera.position.clone().sub(MOON_CENTER).normalize();
    if (dir.y > 0.97) dir.set(0, 0.62, 1).normalize();
    this.startFlight(MOON_CENTER.clone(), dir.multiplyScalar(R_MOON_KM + 3600), dur, null);
  }

  private startFlight(to: THREE.Vector3, offTo: THREE.Vector3, dur: number, up: THREE.Vector3 | null) {
    const from = this.controls.target.clone();
    const camFrom = this.camera.position.clone();
    this.camera.up.copy(up ?? new THREE.Vector3(0, 1, 0));
    this.controls.enabled = false;
    this.flight = { from, to: to.clone(), camFrom, camTo: to.clone().add(offTo), t: 0, dur, orbit: up === null };
  }

  private configureControls(orbit: boolean) {
    const target = this.controls ? this.controls.target.clone() : MOON_CENTER.clone();
    this.controls?.dispose();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.target.copy(target);
    this.orbitMode = orbit;
    this.controls.addEventListener("start", () => (this.dragging = true));
    this.controls.addEventListener("end", () => (this.dragging = false));
    if (orbit) {
      this.controls.minDistance = R_MOON_KM + 120;
      this.controls.maxDistance = R_MOON_KM + 14000;
      this.controls.rotateSpeed = 0.5;
      this.controls.zoomSpeed = 0.8;
      this.controls.enablePan = false;
    } else {
      this.controls.maxPolarAngle = Math.PI * 0.495;
      this.controls.minDistance = 0.012;
      this.controls.maxDistance = 600;
      this.controls.enablePan = true;
      this.controls.screenSpacePanning = false;
      this.controls.panSpeed = 1.2;
    }
  }

  // ---- 2D map mode: the same terrain seen straight down, north up (0 longitude up near the poles)
  setMapMode(on: boolean) {
    if (on === this.mapMode) return;
    this.mapMode = on;
    this.flight = null;
    this.dirty = true;
    for (const m of [this.terrainMat, ...(this.lod ? [this.lod.material] : [])]) m.uniforms.uMapLight.value = on ? 1 : 0;
    this.bloom.enabled = !on && this.quality !== "saver";
    if (on) {
      this.controls.enabled = false;
      const dir = (this.orbitMode ? this.camera.position.clone() : this.controls.target.clone()).sub(MOON_CENTER).normalize();
      this.mapTarget.copy(MOON_CENTER).addScaledVector(dir, this.groundRadius(dir, 0.1));
      const d = this.orbitMode ? this.camera.position.distanceTo(MOON_CENTER) - R_MOON_KM : this.camera.position.distanceTo(this.controls.target);
      this.mapDist = Math.min(3500, Math.max(3, d));
      this.placeMapCamera();
      return;
    }
    const up = this.mapTarget.clone().sub(MOON_CENTER).normalize();
    if (this.mapDist > 900) {
      this.controls.target.copy(MOON_CENTER);
      this.camera.up.set(0, 1, 0);
      this.camera.position.copy(MOON_CENTER).addScaledVector(up, R_MOON_KM + Math.max(1500, this.mapDist));
      this.configureControls(true);
    } else {
      this.controls.target.copy(this.mapTarget);
      this.camera.up.copy(up);
      const h = this.mapHeading(up);
      this.camera.position.copy(this.mapTarget).addScaledVector(up, this.mapDist * 0.6).addScaledVector(h, -this.mapDist * 0.8);
      this.configureControls(false);
    }
    this.camera.lookAt(this.controls.target);
  }

  refreshPolar80() {
    this.lod?.refreshPolar80();
    this.dirty = true;
  }

  get isMapMode() {
    return this.mapMode;
  }

  private mapHeading(up: THREE.Vector3): THREE.Vector3 {
    const proj = (v: THREE.Vector3) => v.clone().sub(up.clone().multiplyScalar(v.dot(up)));
    const north = proj(new THREE.Vector3(0, -1, 0));
    const zero = proj(new THREE.Vector3(0, 0, -1));
    const lat = Math.abs((Math.asin(Math.max(-1, Math.min(1, -up.y))) * 180) / Math.PI);
    const w = Math.min(1, Math.max(0, (lat - 70) / 15));
    const nl = north.length();
    const zl = zero.length();
    const h = new THREE.Vector3();
    if (nl > 1e-6) h.addScaledVector(north, (1 - w) / nl);
    if (zl > 1e-6) h.addScaledVector(zero, w / zl);
    return h.lengthSq() > 1e-8 ? h.normalize() : new THREE.Vector3(1, 0, 0);
  }

  private placeMapCamera() {
    const up = this.mapTarget.clone().sub(MOON_CENTER).normalize();
    this.mapTarget.copy(MOON_CENTER).addScaledVector(up, this.groundRadius(up, Math.max(0.05, this.mapDist * 0.002)));
    this.camera.up.copy(this.mapHeading(up));
    this.camera.position.copy(this.mapTarget).addScaledVector(up, this.mapDist);
    this.camera.lookAt(this.mapTarget);
    this.controls.target.copy(this.mapTarget);
  }

  private mapPan(dxPx: number, dyPx: number) {
    const h = this.renderer.domElement.clientHeight || 1;
    const kmPerPx = (2 * this.mapDist * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
    const up = this.mapTarget.clone().sub(MOON_CENTER).normalize();
    const north = this.mapHeading(up);
    const right = north.clone().cross(up).normalize();
    const move = right.multiplyScalar(-dxPx * kmPerPx).addScaledVector(north, dyPx * kmPerPx);
    const ang = move.length() / R_MOON_KM;
    if (ang > 0) {
      const axis = up.clone().cross(move).normalize();
      const nd = up.clone().applyAxisAngle(axis, ang);
      this.mapTarget.copy(MOON_CENTER).addScaledVector(nd, R_MOON_KM);
    }
    this.placeMapCamera();
    this.dirty = true;
  }

  private mapKeys(dt: number): boolean {
    if (!this.keys.size) return false;
    const sp = (this.keys.has("shift") ? 3 : 1) * 500 * dt;
    let dx = 0;
    let dy = 0;
    if (this.keys.has("w")) dy += sp;
    if (this.keys.has("s")) dy -= sp;
    if (this.keys.has("a")) dx += sp;
    if (this.keys.has("d")) dx -= sp;
    if (this.keys.has("r")) this.mapDist = Math.min(3500, this.mapDist * (1 + 1.2 * dt));
    if (this.keys.has("f")) this.mapDist = Math.max(0.6, this.mapDist * (1 - 1.2 * dt));
    if (dx || dy) this.mapPan(dx, dy);
    else this.placeMapCamera();
    return true;
  }

  private mapPinchSpan() {
    const [a, b] = [...this.mapPointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private bindMapInput() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if (!this.mapMode) return;
      this.mapPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.mapPointers.size === 2) this.mapPinch = this.mapPinchSpan();
    });
    window.addEventListener("pointermove", (e) => {
      const prev = this.mapPointers.get(e.pointerId);
      if (!this.mapMode || !prev) return;
      this.mapPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.mapPointers.size >= 2) {
        // Two fingers: zoom by how much they spread or pinch, and don't pan.
        const span = this.mapPinchSpan();
        if (this.mapPinch > 0 && span > 0) {
          this.mapDist = Math.min(3500, Math.max(0.6, (this.mapDist * this.mapPinch) / span));
          this.placeMapCamera();
          this.dirty = true;
        }
        this.mapPinch = span;
        return;
      }
      this.mapPan(e.clientX - prev.x, e.clientY - prev.y);
    });
    const end = (e: PointerEvent) => {
      this.mapPointers.delete(e.pointerId);
      if (this.mapPointers.size < 2) this.mapPinch = 0;
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    el.addEventListener(
      "wheel",
      (e) => {
        if (!this.mapMode) return;
        e.preventDefault();
        this.mapDist = Math.min(3500, Math.max(0.6, this.mapDist * Math.exp(e.deltaY * 0.0015)));
        this.placeMapCamera();
        this.dirty = true;
      },
      { passive: false },
    );
  }

  // Ground point under a screen position, for hover readouts
  pickAt(clientX: number, clientY: number): { lat: number; lon: number; heightM: number; inPatch: boolean } | null {
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects([this.terrainMesh, ...(this.lod?.meshes ?? [])])[0];
    if (!hit) return null;
    const [lat, lon] = latLonFromWorld(hit.point);
    const heightM = (hit.point.distanceTo(MOON_CENTER) - R_MOON_KM) * 1000;
    return { lat, lon, heightM, inPatch: hit.object === this.terrainMesh };
  }

  private groundRadius(dir: THREE.Vector3, spacingKm: number) {
    if (!this.globe) return R_MOON_KM;
    return R_MOON_KM + surfaceHeightM(this.globe, dir, spacingKm).h / 1000;
  }

  private syncControlsUp() {
    const c = this.controls as unknown as { _quat: THREE.Quaternion; _quatInverse: THREE.Quaternion };
    c._quat.setFromUnitVectors(this.camera.up, new THREE.Vector3(0, 1, 0));
    c._quatInverse.copy(c._quat).invert();
  }

  private moveOnSurface(dt: number) {
    const target = this.controls.target;
    const up = target.clone().sub(MOON_CENTER).normalize();
    const dist = this.camera.position.distanceTo(target);
    if (this.keys.size) {
      const fwd = target.clone().sub(this.camera.position).projectOnPlane(up);
      if (fwd.lengthSq() < 1e-9) fwd.set(0, 0, -1).projectOnPlane(up);
      fwd.normalize();
      const right = fwd.clone().cross(up);
      const v = new THREE.Vector3();
      if (this.keys.has("w")) v.add(fwd);
      if (this.keys.has("s")) v.sub(fwd);
      if (this.keys.has("d")) v.add(right);
      if (this.keys.has("a")) v.sub(right);
      if (v.lengthSq() > 0) {
        const fast = this.keys.has("shift") ? 3 : 1;
        v.setLength(Math.max(0.3, dist) * 0.9 * fast * dt);
        target.add(v);
        this.camera.position.add(v);
      }
      const lift = (this.keys.has("r") ? 1 : 0) - (this.keys.has("f") ? 1 : 0);
      if (lift) {
        const camUp = this.camera.position.clone().sub(MOON_CENTER).normalize();
        const alt = Math.max(0.15, this.camera.position.distanceTo(MOON_CENTER) - this.groundRadius(camUp, 0.1));
        const fast = this.keys.has("shift") ? 3 : 1;
        this.camera.position.addScaledVector(camUp, lift * alt * 1.1 * fast * dt);
        if (lift > 0 && this.camera.position.distanceTo(target) > this.controls.maxDistance * 0.97) this.flyToOrbit(1.8);
      }
      const turn = (this.keys.has("e") ? 1 : 0) - (this.keys.has("q") ? 1 : 0);
      if (turn) {
        const off = this.camera.position.clone().sub(target).applyAxisAngle(up, -turn * 1.4 * dt);
        this.camera.position.copy(target).add(off);
      }
    }
    const tDir = target.clone().sub(MOON_CENTER).normalize();
    const tR = this.groundRadius(tDir, Math.max(0.03, dist * 0.004));
    const tPos = MOON_CENTER.clone().addScaledVector(tDir, tR);
    const shift = tPos.clone().sub(target);
    if (shift.lengthSq() > 1e-10) {
      target.copy(tPos);
      this.camera.position.add(shift);
    }
    if (tDir.angleTo(this.camera.up) > 0.002) {
      this.camera.up.copy(tDir);
      this.upDirty = true;
    }
    if (this.upDirty && !this.dragging) {
      this.upDirty = false;
      this.syncControlsUp();
    }
  }

  // Like an eye or camera adapting: the polar look is tuned for a grazing Sun, so where the Sun
  // is high the sunlight gain is lowered to keep detail instead of blowing out to white.
  private autoExposure(dt: number): boolean {
    const sun = this.sunDir;
    const camRel = this.camera.position.clone().sub(MOON_CENTER);
    const alt = camRel.length() - R_MOON_KM;
    const focus = this.orbitMode ? camRel.normalize() : this.controls.target.clone().sub(MOON_CENTER).normalize();
    const local = Math.max(focus.dot(sun), 0.2);
    const surfaceGain = Math.pow(0.2 / local, 0.95);
    const ang = Math.acos(Math.max(-1, Math.min(1, camRel.normalize().dot(sun))));
    const brightestVisible = ang < Math.PI / 2 ? 1 : Math.cos(ang - Math.PI / 2);
    const diskGain = Math.pow(0.16 / Math.max(brightestVisible, 0.16), 0.55);
    const w = Math.min(1, Math.max(0, (alt - 150) / 1200));
    const target = surfaceGain + (diskGain - surfaceGain) * w;
    const next = this.sunGain + (target - this.sunGain) * Math.min(1, dt * 2.5);
    const changed = Math.abs(next - this.sunGain) > 0.0015;
    this.sunGain = Math.abs(target - next) < 0.0015 ? target : next;
    const power = 10.5 * this.sunGain;
    for (const m of [this.terrainMat, ...(this.lod ? [this.lod.material] : [])]) m.uniforms.uSunPower.value = power;
    return changed;
  }

  private keepAboveGround(): boolean {
    const rel = this.camera.position.clone().sub(MOON_CENTER);
    const d = rel.length();
    if (d - R_MOON_KM > 40) return false;
    const dir = rel.divideScalar(d);
    const clearance = Math.min(0.12, Math.max(0.003, this.camera.position.distanceTo(this.controls.target) * 0.25));
    const minR = this.groundRadius(dir, 0.05) + clearance;
    if (d >= minR) return false;
    this.camera.position.copy(MOON_CENTER).addScaledVector(dir, minR);
    return true;
  }

  private bindMovement() {
    const el = this.renderer.domElement;
    el.addEventListener(
      "wheel",
      (e) => {
        if (this.flight || this.mapMode) return;
        const d = this.camera.position.distanceTo(this.controls.target);
        if (!this.orbitMode && e.deltaY > 0 && d > this.controls.maxDistance * 0.97) {
          this.flyToOrbit(1.8);
          return;
        }
        if (this.orbitMode && e.deltaY < 0 && d < this.controls.minDistance * 1.01 + 30) {
          const rect = el.getBoundingClientRect();
          const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
          const ray = new THREE.Raycaster();
          ray.setFromCamera(ndc, this.camera);
          const hit = ray.intersectObjects([this.terrainMesh, ...(this.lod?.meshes ?? [])])[0];
          if (hit) this.diveTo(hit.point);
        }
      },
      { passive: true },
    );
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    window.addEventListener("keydown", (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k.length === 1 && "wasdqerf".includes(k)) this.keys.add(k);
      if (k === "shift") this.keys.add("shift");
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  private diveTo(p: THREE.Vector3) {
    const up = p.clone().sub(MOON_CENTER).normalize();
    const back = this.camera.position.clone().sub(p).projectOnPlane(up);
    if (back.lengthSq() < 1e-6) back.set(1, 0, 0).projectOnPlane(up);
    this.startFlight(p, back.setLength(70).add(up.clone().multiplyScalar(45)), 1.8, up);
  }

  private spinOrbit(dt: number) {
    const lift = (this.keys.has("r") ? 1 : 0) - (this.keys.has("f") ? 1 : 0);
    if (lift) {
      const off = this.camera.position.clone().sub(MOON_CENTER);
      const alt = off.length() - R_MOON_KM;
      const next = Math.min(this.controls.maxDistance - R_MOON_KM, Math.max(this.controls.minDistance - R_MOON_KM, alt * (1 + lift * 1.2 * dt)));
      this.camera.position.copy(MOON_CENTER).addScaledVector(off.normalize(), R_MOON_KM + next);
      if (lift < 0 && next <= this.controls.minDistance - R_MOON_KM + 1) {
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const hit = ray.intersectObjects([this.terrainMesh, ...(this.lod?.meshes ?? [])])[0];
        if (hit) this.diveTo(hit.point);
      }
    }
    const moving = ["w", "a", "s", "d"].some((k) => this.keys.has(k));
    if (!moving) return;
    const off = this.camera.position.clone().sub(MOON_CENTER);
    const alt = off.length() - R_MOON_KM;
    const rate = 0.9 * Math.min(1, Math.max(0.08, alt / 3000)) * (this.keys.has("shift") ? 2.5 : 1) * dt;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    if (this.keys.has("a")) off.applyAxisAngle(camUp, -rate);
    if (this.keys.has("d")) off.applyAxisAngle(camUp, rate);
    if (this.keys.has("w")) off.applyAxisAngle(right, -rate);
    if (this.keys.has("s")) off.applyAxisAngle(right, rate);
    if (Math.abs(off.clone().normalize().y) > 0.995) return;
    this.camera.position.copy(MOON_CENTER).add(off);
    this.camera.lookAt(MOON_CENTER);
  }

  setRays(site: Site, sunUp: boolean, earthUp: boolean) {
    this.dirty = true;
    const p = this.beacons.get(site.id)?.pos ?? this.sitePosition(site);
    for (const [line, target, up] of [
      [this.sunRay, this.sun.position, sunUp],
      [this.earthRay, this.earth.position, earthUp],
    ] as const) {
      line.visible = !!p;
      if (!p) continue;
      const dir = target.clone().sub(p).normalize();
      const a = p.clone().add(new THREE.Vector3(0, 0.05, 0));
      line.geometry.setFromPoints([a, a.clone().add(dir.multiplyScalar(60))]);
      line.computeLineDistances();
      const m = line.material as THREE.LineDashedMaterial;
      m.opacity = up ? 0.95 : 0.35;
      m.dashSize = up ? 1000 : 0.4;
      m.gapSize = up ? 0 : 0.35;
    }
  }

  private highlight(id: string) {
    for (const [k, b] of this.beacons) b.label.classList.toggle("active", k === id);
  }

  private bindPicking() {
    const el = this.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => (down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null));
    el.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObjects([this.terrainMesh, ...(this.lod?.meshes ?? [])])[0];
      if (!hit) return;
      if (hit.object === this.terrainMesh) {
        const [plat, plon] = latLonFromWorld(hit.point);
        const [mx, my] = toMap(plat, plon);
        this.onPick?.(mx, my);
      }
      else this.onPickLatLon?.(...latLonFromWorld(hit.point));
    });
  }

  private resize() {
    this.dirty = true;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      this.controls.target.lerpVectors(f.from, f.to, k);
      const a = f.camFrom.clone().sub(MOON_CENTER);
      const b = f.camTo.clone().sub(MOON_CENTER);
      const altA = Math.max(0.05, a.length() - R_MOON_KM);
      const altB = Math.max(0.05, b.length() - R_MOON_KM);
      const arc = a.angleTo(b);
      const hop = arc * R_MOON_KM * 0.7 * Math.sin(Math.PI * k);
      const alt = Math.exp(Math.log(altA) + (Math.log(altB) - Math.log(altA)) * k) + hop;
      const dir = new THREE.Vector3().copy(a.normalize()).lerp(b.normalize(), k);
      if (dir.lengthSq() < 1e-8) dir.copy(b);
      this.camera.position.copy(MOON_CENTER).add(dir.normalize().multiplyScalar(R_MOON_KM + alt));
      this.camera.lookAt(this.controls.target);
      if (f.t >= 1) {
        this.flight = null;
        this.configureControls(f.orbit);
        if (this.cutPending) this.applyCut();
      }
      this.dirty = true;
    } else if (this.mapMode) {
      if (this.mapKeys(dt)) this.dirty = true;
    } else {
      if (this.orbitMode) {
        const alt = this.camera.position.distanceTo(MOON_CENTER) - R_MOON_KM;
        this.controls.rotateSpeed = 0.5 * Math.min(1, Math.max(0.05, alt / 3000));
        this.spinOrbit(dt);
      } else this.moveOnSurface(dt);
      if (this.controls.update() || this.keys.size) this.dirty = true;
      if (this.keepAboveGround()) this.dirty = true;
    }
    this.updateDepthAndSky();
    if (this.autoExposure(dt)) this.dirty = true;
    if (this.lod?.update(this.camera)) this.dirty = true;
    if (!this.dirty) return;
    const fps = this.quality === "saver" ? 30 : this.quality === "balanced" ? 60 : 0;
    if (fps) {
      const gap = 1000 / fps;
      const since = now - this.lastRender;
      if (since < gap - 2) return;
      this.lastRender = now - Math.min(Math.max(since - gap, 0), gap);
    } else this.lastRender = now;
    this.dirty = false;
    this.adaptResolution(dt, now);
    this.composer.render();
    this.labels.render(this.scene, this.camera);
  };

  setGlobe(g: GlobeData) {
    this.dirty = true;
    this.globe = g;
    const tex = new THREE.Texture(g.color);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    if (this.lod) {
      this.scene.remove(this.lod.group);
      this.lod.dispose();
    }
    this.lod = new LodTerrain(g, tex);
    this.lod.setQuality(this.quality);
    this.lod.material.uniforms.uMapLight.value = this.mapMode ? 1 : 0;
    if (this.gOverlay) setTimeout(() => this.setGlobalOverlay(this.gOverlay), 0);
    this.setCutUniforms(this.cutOn && !this.cutPending);
    this.globeMats = [this.lod.material];
    this.updateHoles();
    this.scene.add(this.lod.group);
    for (const m of this.globeMats) {
      m.uniforms.uSunME.value.copy(this.terrainMat.uniforms.uSun.value);
      m.uniforms.uSunWorld.value.copy(this.sunDir);
      m.uniforms.uEarthWorld.value.copy(this.earthDir);
      m.uniforms.uEarthshine.value = this.terrainMat.uniforms.uEarthshine.value;
    }
    this.setSites(this.lastSites);
    if (this.pendingRegions) {
      const r = this.pendingRegions;
      this.pendingRegions = null;
      this.setRegions(r);
    }
    if (this.pendingIntro) {
      const s = this.pendingIntro;
      this.pendingIntro = null;
      this.select(s, true);
    }
  }

  setField(field: FieldData) {
    this.dirty = true;
    if (field === this.field) return;
    this.field = field;
    const old = this.terrainMesh;
    this.scene.remove(old);
    old.geometry.dispose();
    (this.terrainMat.uniforms.uField.value as THREE.Texture).dispose();
    const u = this.terrainMat.uniforms;
    const h = field.meta.horizon;
    u.uField.value = fieldTexture(field);
    u.uSize.value = h.size;
    u.uAzBins.value = h.azimuthBins;
    u.uCell.value = h.cellMeters;
    u.uExtent.value = field.meta.extentMeters;
    u.uCenter.value.set(field.meta.centerX ?? 0, field.meta.centerY ?? 0);
    u.uStep.value = h.decode.stepDeg;
    u.uOffset.value = h.decode.offsetDeg;
    u.uOverlayMix.value = 0;
    this.terrainMesh = new THREE.Mesh(this.makeTerrain().geometry, this.terrainMat);
    this.scene.add(this.terrainMesh);
    this.updateHoles();
    this.setScatter(null);
    this.setSites(this.lastSites);
  }

  // Detailed areas away from the pole are built from coarser terrain than the globe around them,
  // so they only replace it while a data layer is shown on them. The polar patch always shows.
  private updateHoles() {
    const cx = this.field.meta.centerX ?? 0;
    const cy = this.field.meta.centerY ?? 0;
    const e = this.field.meta.extentMeters;
    const show = !this.field.meta.label || this.overlayOn;
    if (this.terrainMesh) this.terrainMesh.visible = show;
    this.lod?.material.uniforms.uHole.value.set(cx, cy, show ? e : 0);
  }

  // Removing a parent group does not delete child label elements from the page, so do it by hand.
  private dropGroup(group: THREE.Object3D) {
    group.removeFromParent();
    const gone = new Set<CSS2DObject>();
    group.traverse((o) => {
      if (o instanceof CSS2DObject) {
        o.element.remove();
        gone.add(o);
      } else if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    if (gone.size) this.labelObjs = this.labelObjs.filter((o) => !gone.has(o));
  }

  private hideOccludedLabels() {
    const cam = this.camera.position.clone().sub(MOON_CENTER);
    const p = new THREE.Vector3();
    for (const o of this.labelObjs) {
      o.getWorldPosition(p);
      const v = p.sub(MOON_CENTER);
      const toCam = cam.clone().sub(v);
      const inCut = this.cutOn && !this.cutPending && v.dot(this.cutaway.a) > 0 && v.dot(this.cutaway.b) > 0;
      o.visible = !inCut && v.dot(toCam) / (v.length() * toCam.length()) > -0.08;
    }
  }

  private updateDepthAndSky() {
    this.hideOccludedLabels();
    if (this.rover) this.rover.scale.setScalar(Math.min(1, Math.max(0.05, this.camera.position.distanceTo(this.rover.position) / 12)));
    for (const b of this.beacons.values()) {
      const dist = this.camera.position.distanceTo(b.pos);
      b.group.visible = dist > 0.15;
      const k = Math.min(1, Math.max(0.06, dist / 12));
      if (Math.abs(b.group.scale.x - k) > 0.002) b.group.scale.setScalar(k);
    }
    const rel = this.camera.position.clone().sub(MOON_CENTER);
    const camR = rel.length();
    const alt = Math.max(0.05, camR - R_MOON_KM);
    // height above the actual ground (ridges stand kilometres above the reference sphere)
    const ground = camR - R_MOON_KM < 60 ? this.groundRadius(rel.divideScalar(camR), 0.1) : R_MOON_KM;
    const agl = Math.max(0.002, camR - ground);
    const near = Math.min(20, Math.max(0.0004, Math.min(alt, agl) * 0.01));
    const far = Math.min(alt + 2 * R_MOON_KM + 4000, Math.max(600, alt * 60 + 600));
    if (Math.abs(this.camera.near - near) / near > 0.05 || Math.abs(this.camera.far - far) / far > 0.05) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    const sky = far * 0.6;
    const k = sky / SKY_R;
    const c = this.camera.position;
    this.sun.position.copy(c).addScaledVector(this.sunDir, sky);
    this.sunHalo.position.copy(c).addScaledVector(this.sunDir, sky * 0.99);
    this.sun.scale.setScalar(260 * k);
    this.sunHalo.scale.setScalar(1500 * k);
    this.earth.position.copy(c).addScaledVector(this.earthDir, sky * 0.95);
    this.earth.scale.setScalar(k);
    this.stars.position.copy(c);
    this.stars.scale.setScalar(k);
  }

  private cellToWorld(col: number, row: number, lift: number): THREE.Vector3 {
    const f = this.field;
    const cell = f.meta.horizon.cellMeters;
    const E = f.meta.extentMeters;
    const x = (col + 0.5) * cell - E + (f.meta.centerX ?? 0);
    const y = E - (row + 0.5) * cell + (f.meta.centerY ?? 0);
    const h = fieldHeight(f, x, y) ?? 0;
    const p = this.mapToWorld(x, y, h);
    return p.addScaledVector(p.clone().sub(MOON_CENTER).normalize(), lift);
  }

  setRoute(route: RoverRoute | null) {
    this.dirty = true;
    this.dropGroup(this.routeGroup);
    this.routeGroup = new THREE.Group();
    this.scene.add(this.routeGroup);
    this.route = route;
    this.rover = null;
    if (!route || route.stops.length < 2) return;
    const pts: THREE.Vector3[] = [];
    const s = route.stops;
    for (let i = 1; i < s.length; i++) {
      for (let k = 0; k < 4; k++) {
        const t = k / 4;
        pts.push(this.cellToWorld(s[i - 1].col + (s[i].col - s[i - 1].col) * t, s[i - 1].row + (s[i].row - s[i - 1].row) * t, 0.03));
      }
    }
    pts.push(this.cellToWorld(s[s.length - 1].col, s[s.length - 1].row, 0.03));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(0.4, 2.2, 1.6), transparent: true, opacity: 0.95, depthTest: true }));
    line.renderOrder = 5;
    this.routeGroup.add(line);
    const rover = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 3.0, 2.0) }));
    rover.add(body);
    const stem = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.9, 0)]),
      new THREE.LineBasicMaterial({ color: 0x7dffc8, transparent: true, opacity: 0.7 }),
    );
    rover.add(stem);
    const el = document.createElement("div");
    el.className = "site-label rover-label";
    el.textContent = "Rover";
    const label = new CSS2DObject(el);
    label.position.set(0, 1.0, 0);
    label.center.set(0.5, 1);
    rover.add(label);
    this.labelObjs.push(label);
    this.routeGroup.add(rover);
    this.rover = rover;
    this.setRoverHour(this.lastHour);
  }

  private lastHour = 0;
  setRoverHour(hour: number) {
    this.lastHour = hour;
    if (!this.route || !this.rover) return;
    const [c, r] = roverAt(this.route, hour);
    const p = this.cellToWorld(c, r, 0.02);
    this.rover.position.copy(p);
    const k = Math.min(1, Math.max(0.05, this.camera.position.distanceTo(p) / 12));
    this.rover.scale.setScalar(k);
    this.dirty = true;
  }

  setScatter(points: ScatterPoint[] | null) {
    this.dirty = true;
    if (this.scatter) {
      this.scene.remove(this.scatter);
      this.scatter.geometry.dispose();
      this.scatter = null;
    }
    if (!points || points.length === 0) return;
    const pos = new Float32Array(points.length * 3);
    const col = new Float32Array(points.length * 3);
    points.forEach((pt, i) => {
      const h = fieldHeight(this.field, pt.x, pt.y) ?? 0;
      const p = this.mapToWorld(pt.x, pt.y, h);
      p.addScaledVector(p.clone().sub(MOON_CENTER).normalize(), 0.012);
      pos.set([p.x, p.y, p.z], i * 3);
      col.set(pt.ok ? [0.22, 0.85, 0.55] : [0.95, 0.3, 0.36], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.scatter = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, depthWrite: false, transparent: true, opacity: 0.85 }));
    this.scene.add(this.scatter);
  }

  setRegions(regions: ArtemisRegion[]) {
    this.dirty = true;
    if (!this.globe) {
      this.pendingRegions = regions;
      return;
    }
    this.dropGroup(this.regionGroup);
    this.regionGroup = new THREE.Group();
    const g = this.globe;
    for (const r of regions) {
      const pts: THREE.Vector3[] = [];
      const up = dirFromLatLon(r.lat, r.lon);
      const east = new THREE.Vector3(0, 1, 0).cross(up);
      if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
      east.normalize();
      const north = up.clone().cross(east).normalize();
      const ang = (r.diameterKm / 2) / R_MOON_KM;
      for (let k = 0; k <= 96; k++) {
        const a = (k / 96) * Math.PI * 2;
        const d = up
          .clone()
          .multiplyScalar(Math.cos(ang))
          .add(north.clone().multiplyScalar(Math.sin(ang) * Math.cos(a)))
          .add(east.clone().multiplyScalar(Math.sin(ang) * Math.sin(a)))
          .normalize();
        const ux = -d.z;
        const uy = d.x;
        const uz = -d.y;
        const lat = (Math.asin(uz) * 180) / Math.PI;
        const lon = (Math.atan2(uy, ux) * 180) / Math.PI;
        pts.push(d.multiplyScalar(R_MOON_KM + globeHeight(g, lat, lon) / 1000 + 0.35).add(MOON_CENTER));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineDashedMaterial({ color: new THREE.Color(1.6, 1.25, 0.45), dashSize: 2.2, gapSize: 1.4, transparent: true, opacity: 0.9 }),
      );
      line.computeLineDistances();
      this.regionGroup.add(line);
      const el = document.createElement("div");
      el.className = "region-label";
      el.innerHTML = `<b>ARTEMIS III</b> ${r.name}`;
      el.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
        this.onFlyRegion?.(r);
      });
      const label = new CSS2DObject(el);
      this.labelObjs.push(label);
      label.position.copy(worldFromLatLon(r.lat, r.lon, globeHeight(g, r.lat, r.lon) + 2500));
      this.regionGroup.add(label);
    }
    this.scene.add(this.regionGroup);
  }

  flyToLatLon(lat: number, lon: number, altKm: number) {
    const ground = this.globe ? globeHeight(this.globe, lat, lon) : 0;
    const p = worldFromLatLon(lat, lon, ground);
    const up = p.clone().sub(MOON_CENTER).normalize();
    const side = this.camera.position.clone().sub(p).projectOnPlane(up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0).projectOnPlane(up);
    const offset = side.setLength(altKm * 0.75).add(up.clone().multiplyScalar(altKm));
    this.startFlight(p, offset, 2.6, up);
  }

  setQuality(q: Quality) {
    this.quality = q;
    const native = window.devicePixelRatio || 1;
    this.maxDpr = q === "high" ? Math.min(native, 1.75) : q === "balanced" ? Math.min(native, 1.25) : 1;
    this.dpr = Math.min(this.dpr, this.maxDpr);
    if (q !== "high") this.dpr = this.maxDpr;
    this.renderer.setPixelRatio(this.dpr);
    this.composer.setPixelRatio(this.dpr);
    this.bloom.enabled = q !== "saver" && !this.mapMode;
    this.lod?.setQuality(q);
    this.resize();
    this.dirty = true;
  }

  setCutaway(on: boolean) {
    this.cutOn = on;
    if (!on) {
      this.cutPending = false;
      this.cutaway.setVisible(false);
      this.setCutUniforms(false);
      this.dirty = true;
      return;
    }
    const alt = this.camera.position.distanceTo(MOON_CENTER) - R_MOON_KM;
    if (alt < 1500) {
      this.cutPending = true;
      this.flyToOrbit();
    } else this.applyCut();
  }

  private applyCut() {
    this.cutPending = false;
    if (!this.cutOn) return;
    this.cutaway.orient(this.camera);
    this.cutaway.setVisible(true);
    this.setCutUniforms(true);
    this.dirty = true;
  }

  private setCutUniforms(on: boolean) {
    for (const m of [this.terrainMat, ...(this.lod ? [this.lod.material] : [])]) {
      m.uniforms.uCutOn.value = on ? 1 : 0;
      m.uniforms.uCutA.value.copy(this.cutaway.a);
      m.uniforms.uCutB.value.copy(this.cutaway.b);
    }
  }

  invalidate() {
    this.dirty = true;
  }

  private adaptResolution(dt: number, now: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (now - this.lastDprChange < 1500) return;
    let next = this.dpr;
    if (avg > 1 / 40 && this.dpr > 0.6) next = Math.max(0.6, this.dpr - 0.25);
    else if (avg < 1 / 58 && this.dpr < this.maxDpr) next = Math.min(this.maxDpr, this.dpr + 0.25);
    if (next !== this.dpr) {
      this.dpr = next;
      this.lastDprChange = now;
      this.renderer.setPixelRatio(next);
      this.composer.setPixelRatio(next);
      this.resize();
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}

const LENS_SHADER = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float ca = 0.0012 * length(c);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ca).b;
      float vig = smoothstep(0.95, 0.25, length(c * vec2(1.15, 1.0)));
      col *= mix(0.62, 1.0, vig);
      col += (h(vUv * 913.0) - 0.5) * 0.022;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

function fieldTexture(field: FieldData) {
  const h = field.meta.horizon;
  const tex = new THREE.DataArrayTexture(field.horizon, h.size, h.size, h.azimuthBins);
  tex.format = THREE.RedIntegerFormat;
  tex.type = THREE.UnsignedByteType;
  tex.internalFormat = "R8UI";
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

function rayLine(color: number) {
  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.9, dashSize: 1000, gapSize: 0, depthTest: true }),
  );
  line.frustumCulled = false;
  return line;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.08, "rgba(255,250,235,0.95)");
  grad.addColorStop(0.2, "rgba(255,210,140,0.35)");
  grad.addColorStop(0.5, "rgba(255,170,80,0.08)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
