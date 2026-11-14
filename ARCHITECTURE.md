# Architecture

Technical reference for working on the code. Read this before starting a task in [TASKS.md](TASKS.md).

## 0. Project context

- **What:** Lunar Window, a NASA Space Apps Challenge 2026 entry for the lunar landing site challenge: help pick **where and when** to land at the Moon's south pole, given sunlight, Earth/DSN contact, terrain and temperature.
- **Judged on:** impact, creativity, validity (scientific soundness), relevance (does it answer the challenge, is it easy to use), presentation. Validity matters a lot: every number shown must be traceable to real data or a cited model.
- **Status:** feature-complete for submission and live at https://adqm0001.github.io/lunar-window/. Remaining work is in [TASKS.md](TASKS.md): submission material, tests, performance, phone polish, science upgrades, extra features.
- **Hardware it was built on:** Windows 10, RTX 2060 Super, Chrome. Not yet tested elsewhere (see TASKS Act 2).

### Feature → code map

| Feature (UI) | Main files |
|---|---|
| 3D Moon, shadows, flight, WASD/R/F controls | `three/MoonScene.ts`, `three/lod.ts`, `three/shaders.ts` |
| 2D map (top-down) | `MoonScene.setMapMode`, `mapPan`, `bindMapInput` |
| Layers: Sun %, Earth %, Sun+DSN, Night, Slope | `gpu/engine.ts` (`compute`), `gpu/layers.ts`, `gpu/overlay.ts`, `gpu/useFieldMetrics.ts` |
| Layers: Temp, ❄ Ice | `gpu/thermal.ts`, `GpuEngine.computeThermal` |
| Whole-Moon versions of all layers | `gpu/globalLayers.ts`, `gpu/globalOverlay.ts`, LOD uniforms `uGOverlay*` |
| Site list, custom points | `components/SiteList.tsx`, `lib/points.ts`, `state/store.ts` (`customSites`) |
| Site panel (countdowns, contacts, temperature, skyline) | `components/SitePanel.tsx`, `lib/visibility.ts`, `lib/contacts.ts`, `lib/siteThermal.ts`, `components/SkylinePanel.tsx` |
| ★ Find landing spot | `components/FinderPanel.tsx`, `gpu/finder.ts` |
| ♥ Lander sim, survival map, Monte Carlo, 3D lander | `components/LanderPanel.tsx`, `lib/lander.ts`, `lib/montecarlo.ts`, `GpuEngine.computeSurvival`, `three/landerModel.ts` |
| ⛟ Rover route | `components/RoverPanel.tsx`, `lib/rover.ts`, `GpuEngine.visibilityBits` |
| ▦ Landing dates (porkchop) | `components/PorkchopPanel.tsx` |
| Compare | `components/ComparePanel.tsx`, `pinned` in store |
| 🏁 Artemis III report | `components/RegionReport.tsx`, `lib/regionReport.ts`, `data/artemis.ts` |
| Analyze this area (regional field) | `gpu/regions.ts`, `gpu/regionField.ts` |
| ✓ Validation | `components/ValidationPanel.tsx` |
| ▶ Tour, welcome card | `components/Tour.tsx` |
| Share view (URL state) | `state/share.ts` |
| ● Rec (video) | `lib/recorder.ts`, `components/Timeline.tsx` |
| Inside the Moon (cutaway) | `three/cutaway.ts` |
| Phone layout | `components/MobileNav.tsx`, `@media (max-width: 760px)` in `styles.css` |

### Key decisions (and why)

- **Precomputed horizons instead of shadow maps.** For each point, the elevation of the skyline in every direction is computed once (C++ offline for the pole, GPU in the browser for everything else). Sunlight at any hour is then a lookup: Sun elevation vs. skyline in the Sun's azimuth, with the 0.53° Sun disc partially visible. Exact for distant terrain, cheap for thousands of hours, and the 3D shadows use the same data, so pictures and numbers agree.
- **All time-series models on the GPU.** Each grid cell is independent, so a fragment shader per cell walking through the hours is massively parallel (a year for 100k cells in milliseconds). WebAssembly was considered and rejected: the work is GPU-shaped, and rendering is the bottleneck, not JS.
- **Render on demand.** Draw only when something changed (`dirty`), with an fps cap per quality setting, to keep laptop GPUs cool.
- **No backend.** Everything is static files plus client compute, so it can be hosted free on GitHub Pages and keeps working without a server.
- **Procedural detail is visual only.** Craters below the data resolution, rocks and soil roughness make close-ups believable but never feed any number. The Validation window says so.
- **Validation is a feature.** Every model has a check against an external source (JPL Horizons, Bussey et al. 2010, Diviner). Keep it that way when changing models.

## 1. Overview

Two halves:

1. **Offline pipeline** (`pipeline/`, Python + `engine/`, C++). Downloads NASA LOLA terrain and SPICE kernels, computes ephemerides and horizon fields, writes compact binary files to `web/public/data/`. Only needs rerunning when the data changes. Outputs are committed.
2. **Browser app** (`web/`, TypeScript + React + three.js + raw WebGL2). Loads those files and does everything else on the client: GPU time-series models, 3D rendering, planning tools. No backend.

Deployed by `.github/workflows/pages.yml` on every push to `main` (builds `web/`, publishes `web/dist` to GitHub Pages). Vite `base` is `"./"`, so every asset path is relative and must stay relative.

## 2. Coordinate systems and units

Getting these wrong is the most common source of bugs.

| Frame | Units | Definition | Where |
|---|---|---|---|
| **ME** (Moon body-fixed, `MOON_ME_DE421`) | km | Origin at Moon centre, +x toward mean Earth, +z north pole. Ephemeris vectors are in this frame. | `web/src/lib/astro.ts`, `ephem.bin` |
| **Lat/lon** | degrees | Planetocentric, lon east-positive in (−180, 180]. Unit vector `u = (cos lat cos lon, cos lat sin lon, sin lat)` in ME. | everywhere |
| **Polar map** (south polar stereographic) | metres | `k = 2R·tan(π/4 + lat/2)`, `x = k·sin(lon)`, `y = k·cos(lon)`, R = 1 737 400 m. +x toward lon 90°E, +y toward lon 0°. Grids store **row 0 = +y**. | `toMap` / `toLatLon` in `astro.ts`, all polar data files |
| **World** (three.js scene) | **km** | `world = (u.y, −u.z, −u.x)·(R_km + h_km) + MOON_CENTER`, with `MOON_CENTER = (0, −1737.4, 0)`. The **south pole is at the origin with +y up**. | `dirFromLatLon`, `worldFromLatLon`, `latLonFromWorld` in `web/src/three/globe.ts` |
| **Local horizon frame** | — | `up = u`, `east = (−sin lon, cos lon, 0)`, `north = up × east` (ME). Azimuth measured from north toward east. | `localFrame`, `altaz` in `astro.ts`; same formulas in every shader |

Rules:
- Heights in data files are **metres**; three.js positions are **km**. Divide by 1000 when placing things.
- To put a polar-map point in the scene, use `MoonScene.mapToWorld(x, y, hMetres)`. It goes through lat/lon onto the true sphere. Do not use `(x/1000, h, −y/1000)`: that shortcut is only valid within a few tens of km of the pole.
- Converting ME vectors to world directions: `meToWorld(v) = normalize(v.y, −v.z, −v.x)` (`MoonScene.ts`).

## 3. Data files (`web/public/data/`)

| File | Format |
|---|---|
| `ephem.json` + `ephem.bin` | float32 `[count][sunX, sunY, sunZ, earthX, earthY, earthZ]`, km, ME frame, hourly from `2026-01-01T00:00Z`, `count = 26304` (to 2029-01-01). Hour index `i` ↔ time `start + i h`. |
| `dsn.bin` | int8 `[count][3]`, elevation in degrees of the Moon seen from Goldstone, Madrid, Canberra (order in `ephem.json`). A pass counts when ≥ 10° (`DSN_MIN_ELEVATION_DEG`). |
| `sites.json` | `{ azimuthBins: 720, observerHeightM: 2, sites: Site[] }`. Each site has a 720-direction horizon (degrees) computed by the C++ engine. Some have `published` reference values. |
| `field_pole.json` + `field_pole.bin.gz` | **Horizon field**: uint8 `[azimuthBin][row][col]`, 180 bins × 320 × 320, 250 m cells, ±40 km around the pole. Decode `deg = v·0.1 − 8`. Stored as byte deltas between consecutive azimuth layers (mod 256), gzip. |
| `heights_pole.bin.gz` | int16 metres `[row][col]`, 1280², 62.5 m cells, same extent. |
| `slope_pole.bin.gz` | uint8 `[2][320][320]`: layer 0 = mean slope °×4, layer 1 = % of cell under 10°. |
| `globe.json` + `globe_16ppd.bin.gz` | int16 `[2880][5760]` global, 16 px/°, value × 5 m = height, row 0 = 90°N, col 0 = lon 0°E, deltas along rows, gzip. |
| `polar_240m.bin.gz` | int16 metres, 1666², 240 m, polar map (row 0 = +y), deltas along rows. |
| `polar_80m.bin.gz` | int16 metres, 6250², 80 m, ±250 km, `−32768` = missing, deltas along rows (wrapping). **Loaded in the background** after the globe (`loadPolar80`). |
| `tiles40/i_j.bin.gz` | 40 m polar tiles, 512² each, from `ldem_80s_40m` (`web/src/data/tiles.ts`). |
| `tiles64/tx_ty.bin.gz` | 64 px/° global tiles, 480² each, 48 × 24 tiles, deltas along rows (`web/src/data/globalTiles.ts`). |
| `moon_color_*.jpg` | Equirectangular colour, left edge = lon −180°. |

Loaders: `web/src/data/load.ts` (ephemeris, sites), `field.ts` (horizon field), `globe.ts` (globe, polar grids), `tiles.ts`, `globalTiles.ts`.

## 4. App structure (`web/src/`)

```
App.tsx              loads data once (module-level flags guard React StrictMode), mounts panels
state/store.ts       zustand store: the single source of truth (current hour, selected site, layer, open panels, results)
state/selectors.ts   useSites, useSelectedSite, useSiteState, useSeries
state/share.ts       URL hash <-> state (shareable links), registerScene/currentScene
data/                loaders (see §3), Artemis regions
lib/                 pure TS: astro math, visibility series, lander sim, Monte Carlo, rover A*, site thermal, contacts, region report, points, recorder
gpu/                 WebGL2 compute engines (own offscreen contexts, not three.js)
three/               MoonScene (scene, camera, render loop), LodTerrain, shaders, crater texture, lander model, cutaway
components/          React panels
```

### State
`useApp` (zustand). Important fields: `hour` (float, index into the ephemeris), `selectedId`, `layer` (`LayerId` in `gpu/layers.ts`), `rangeDays`, `view` (`"3d" | "2d"`), `field` (active horizon field), `poleField`, `globe`, `customSites`, panel flags (`finderOpen`, `landerOpen`, `roverOpen`, `reportOpen`, `validationOpen`, `tourStep`), results (`finder`, `survival`, `mc`, `rover`). In development, `window.__app` is the store and `window.__scene` the `MoonScene`.

### GPU engines (`gpu/`)
All are fullscreen-triangle fragment programs writing RGBA32F (or RGBA32UI) render targets, read back with `readPixels`. Ephemeris is uploaded as RGBA32F textures of width 4096 (`tc(i) = (i % 4096, i / 4096)`).

| Engine | Grid | Output per cell |
|---|---|---|
| `engine.ts` `GpuEngine.compute` | polar field (320²) | `(sunFrac, earthFrac, linkFrac, longestNightHours)` over a window |
| `GpuEngine.computeSurvival` | polar field | lander survival |
| `GpuEngine.computeThermal` | polar field | `(Tmax, Tmean, Tmin, iceDepth_m)`; shader in `gpu/thermal.ts` |
| `GpuEngine.visibilityBits` | polar field | Sun-up / link bitmasks, 32 h per uint32 (rover planner) |
| `globalLayers.ts` `GlobalLayers` | 1440×720 equirect + two 768² polar grids (±540 km) | light or thermal, same channels; horizons (32 dirs) computed once in the constructor |
| `globalHorizon.ts` | one point | 720-direction horizon for a clicked point anywhere |
| `regionField.ts` | 56 km area anywhere below 75°S | builds a full horizon field on the GPU ("Analyze this area") |

Long draws are split into scissored bands with `gl.flush()` between them so no single GPU job trips the Windows driver watchdog (~2 s). Keep that pattern for anything heavy.

### Rendering (`three/`)
- `MoonScene.ts`: owns renderer, camera, controls, composer (bloom + output). **Renders on demand**: set `this.dirty = true` when something changes; the loop skips frames otherwise and caps fps by the quality setting. Modes: orbit (controls target = Moon centre), surface (target on the ground, `camera.up` = local up), map (`setMapMode`, top-down, own pan/zoom).
- `lod.ts` `LodTerrain`: cube-sphere quadtree, 33×33 vertex tiles with skirts, built within a 7 ms/frame budget. Heights from `surfaceHeightM` (80 m polar → 64 px/° tiles → 16 px/° fallback) plus procedural craters (`lib/procedural.ts`, identical in TS and GLSL). Fragment shader: per-pixel horizon ray-march for shadows, crater texture, ground detail, overlays.
- `shaders.ts` `TERRAIN_FRAG`: the detailed **patch** (the active horizon field area). Shadows come from the precomputed horizon field. The LOD discards pixels under the patch (`uHole`).
- `craterTexture.ts`: a 1024² crater tile generated at startup (slopes, height, halo; hand-built mipmaps) sampled at several scales (`CRATER_TEX_GLSL`), plus `GROUND_GLSL` (rocks, rock shadows, close-range detail). Visual only, never used in any number.
- Labels are `CSS2DObject`s. When removing a group that contains labels, use `MoonScene.dropGroup`, because three.js does not remove child label elements from the DOM on its own.

## 5. Running and checking

```bash
cd web
npm install
npm run dev                # http://localhost:5173
npx tsc --noEmit -p .      # type check (strict, noUnusedLocals)
npm run build              # what CI runs; must pass before any PR
```

Useful in the dev console:
- `window.__app.getState()` / `.setState(...)` to inspect and drive the app.
- `window.__scene` for the scene (camera, `setView`, `lod`, `renderer`).
- GPU timing: `EXT_disjoint_timer_query_webgl2` around `__scene.composer.render()`.
- `POST /__shot/<name>` with a base64 JPEG body saves a screenshot to `notes/images/<name>.jpg` (dev server only).

### Checking changes visually (works even when the tab is hidden)

Paste in the browser console on `npm run dev`. It fixes the canvas size, steps the render loop manually (hidden tabs throttle `requestAnimationFrame`) and saves screenshots through the dev server:

```js
const s = window.__scene;
const step = () => { s.loop(); cancelAnimationFrame(s.raf); };
const run = async (ms) => { const e = performance.now() + ms; while (performance.now() < e) { step(); await new Promise(r => setTimeout(r, 16)); } };
s.adaptResolution = () => {};
s.host.style.width = '1600px'; s.host.style.height = '900px';
s.renderer.setPixelRatio(1); s.composer.setPixelRatio(1); s.dpr = 1; s.resize();
const shot = async (name) => { for (let i = 0; i < 8; i++) { s.dirty = true; s.lastRender = 0; step(); await new Promise(r => setTimeout(r, 150)); }
  await fetch('/__shot/' + name, { method: 'POST', body: s.renderer.domElement.toDataURL('image/jpeg', 0.85).split(',')[1] }); };
// examples
s.setView({ orbit: false, t: [-89.45, -140], c: [-89.0, -140, 6] }); await run(4000); await shot('pole');
window.__app.getState().setLayer('temp'); await run(1500); await shot('temp');
```

`setView({ orbit, t: [lat, lon] (target), c: [lat, lon, altitudeKm] (camera) })` jumps the camera without a flight. Screenshots land in `notes/images/`.

GPU time for one frame:

```js
const gl = s.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); s.composer.render(); gl.endQuery(ext.TIME_ELAPSED_EXT);
setTimeout(() => console.log(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6, 'ms'), 200);
```

Reference numbers (RTX 2060 Super, 1600×900): pole surface view ≈ 2.5 ms, low-Sun view away from the pole ≈ 6 ms, lander close-up ≈ 6 ms. A change that adds more than ~1 ms needs a reason.

## 6. Conventions

- TypeScript strict; no unused locals or parameters (the build fails on them).
- Keep files focused; put pure math in `lib/` (testable without WebGL), GPU work in `gpu/`, scene code in `three/`.
- Comments only where the *why* isn't obvious from the code (physics sources, gotchas).
- Commit messages: one short plain sentence saying what the commit does ("Add link budget to contact windows"). No prefixes, no sign-off lines.
- Any new physics needs a source in a comment and, if user-visible, a line in the Validation window (`components/ValidationPanel.tsx`) or its "What it leaves out" list.
- One task per branch and pull request. Don't mix refactors into feature PRs.
- Don't commit `notes/` (local-only, excluded in `.git/info/exclude`) or anything under `data/raw/`.
- Before opening a PR: `npx tsc --noEmit -p .` and `npm run build` pass, the app loads with no console errors, and for visual changes, before/after screenshots go in the PR description.
- When a task in TASKS.md is finished, tick its box in the same PR.

## 7. Known gotchas

- **React StrictMode** mounts effects twice in development. Data loading uses module-level flags in `App.tsx`; `MoonScene.setGlobe` replaces (not adds) the terrain. Keep effects idempotent.
- **Shader compile is async** (`KHR_parallel_shader_compile`): three.js skips drawing a mesh until its program is ready, so timings taken right after a reload can look too fast.
- **Hidden browser tabs** throttle `requestAnimationFrame` to ~1 fps; automated tests should step `__scene.loop()` manually.
- **Float precision**: world coordinates far from the pole are ~1700 km, so float32 resolves ~0.1 m. Per-pixel effects at sub-metre scale (rocks) use coordinates relative to the pole (`vWorld`), which is fine near the pole and coarse elsewhere.
- **Windows dev server**: Vite uses polling (`vite.config.ts`) because native file watching hit `EBUSY` locks.
- **Modals** render through `createPortal(…, document.body)`: panels use `backdrop-filter`, which would otherwise trap `position: fixed` children.
