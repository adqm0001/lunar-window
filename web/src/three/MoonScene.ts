import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { FieldData } from "../data/field";
import { fieldHeight } from "../data/field";
import type { Site } from "../data/load";
import type { Vec3 } from "../lib/astro";
import { toMap, R_MOON_M } from "../lib/astro";
import { EARTH_FRAG, EARTH_VERT, TERRAIN_FRAG, TERRAIN_VERT } from "./shaders";

export const EXAGGERATION = 1.6;
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
  private flight: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t: number } | null = null;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "labels-layer";
    host.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.02, 20000);
    this.camera.position.set(-22, 16, 34);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 140;
    this.controls.target.set(0, 0, 0);

    this.scene.background = new THREE.Color(0x000000);
    this.scene.add(this.makeStars());

    const { geometry } = this.makeTerrain();
    const h = field.meta.horizon;
    const tex = new THREE.DataArrayTexture(field.horizon, h.size, h.size, h.azimuthBins);
    tex.format = THREE.RedIntegerFormat;
    tex.type = THREE.UnsignedByteType;
    tex.internalFormat = "R8UI";
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    this.terrainMat = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      glslVersion: THREE.GLSL3,
      uniforms: {
        uField: { value: tex },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uSunWorld: { value: new THREE.Vector3(1, 0, 0) },
        uSize: { value: h.size },
        uAzBins: { value: h.azimuthBins },
        uCell: { value: h.cellMeters },
        uExtent: { value: field.meta.extentMeters },
        uStep: { value: h.decode.stepDeg },
        uOffset: { value: h.decode.offsetDeg },
        uOverlay: { value: new THREE.Texture() },
        uOverlayMix: { value: 0 },
        uSunPower: { value: 4.2 },
        uTime: { value: 0 },
      },
    });
    this.scene.add(new THREE.Mesh(geometry, this.terrainMat));

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
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.5, 1.6));
    this.composer.addPass(new OutputPass());

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
    const pos = new Float32Array(n * n * 3);
    const map = new Float32Array(n * n * 2);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        const x = (c + 0.5) * cell - E;
        const y = E - (r + 0.5) * cell;
        const h = f.heights[i];
        pos[i * 3] = x / 1000;
        pos[i * 3 + 1] = this.worldY(x, y, h);
        pos[i * 3 + 2] = -y / 1000;
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

  worldY(x: number, y: number, h: number) {
    return (h * EXAGGERATION - (x * x + y * y) / (2 * R_MOON_M)) / 1000;
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
      const b = Math.pow(Math.random(), 6) * 2.2 + 0.15;
      const tint = Math.random();
      col.set([b * (0.85 + 0.15 * tint), b * 0.9, b * (1.05 - 0.2 * tint)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  }

  setBodies(sunMe: Vec3, earthMe: Vec3, hour: number) {
    const s = meToWorld(sunMe);
    const e = meToWorld(earthMe);
    this.terrainMat.uniforms.uSun.value.set(sunMe[0], sunMe[1], sunMe[2]);
    this.terrainMat.uniforms.uSunWorld.value.copy(s);
    this.sun.position.copy(s).multiplyScalar(SKY_R);
    this.sunHalo.position.copy(s).multiplyScalar(SKY_R * 0.99);
    this.earth.position.copy(e).multiplyScalar(SKY_R * 0.95);
    this.earthMat.uniforms.uSunDir.value.copy(s);
    this.earthMat.uniforms.uSpin.value = ((hour % 24) / 24) * Math.PI * 2;
  }

  setOverlay(canvas: HTMLCanvasElement | null) {
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
    const E = this.field.meta.extentMeters;
    if (Math.abs(x) > E || Math.abs(y) > E) return null;
    const h = fieldHeight(this.field, x, y) ?? site.height_m;
    return new THREE.Vector3(x / 1000, this.worldY(x, y, h), -y / 1000);
  }

  setSites(sites: Site[]) {
    for (const b of this.beacons.values()) this.scene.remove(b.group);
    this.beacons.clear();
    for (const s of sites) {
      const p = this.sitePosition(s);
      if (!p) continue;
      const group = new THREE.Group();
      group.position.copy(p);
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
      obj.position.set(0, 1.75, 0);
      obj.center.set(0.5, 1);
      group.add(obj);
      this.scene.add(group);
      this.beacons.set(s.id, { group, label, pos: p });
    }
    if (this.selected) this.highlight(this.selected);
  }

  select(site: Site, fly: boolean) {
    this.selected = site.id;
    this.highlight(site.id);
    const p = this.beacons.get(site.id)?.pos ?? this.sitePosition(site);
    if (!p || !fly) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const dist = Math.min(Math.max(offset.length(), 6), 14);
    offset.setLength(dist);
    if (offset.y < dist * 0.35) offset.y = dist * 0.35;
    this.flight = { from: this.controls.target.clone(), to: p.clone(), camFrom: this.camera.position.clone(), camTo: p.clone().add(offset), t: 0 };
  }

  setRays(site: Site, sunUp: boolean, earthUp: boolean) {
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
    el.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObjects(this.scene.children.filter((o) => o instanceof THREE.Mesh && o.material === this.terrainMat))[0];
      if (hit) this.onPick?.(hit.point.x * 1000, -hit.point.z * 1000);
    });
  }

  private resize() {
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
      f.t = Math.min(1, f.t + dt / 1.6);
      const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      this.controls.target.lerpVectors(f.from, f.to, k);
      this.camera.position.lerpVectors(f.camFrom, f.camTo, k);
      if (f.t >= 1) this.flight = null;
    }
    this.controls.update();
    this.terrainMat.uniforms.uTime.value = now / 1000;
    this.composer.render();
    this.labels.render(this.scene, this.camera);
  };

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
