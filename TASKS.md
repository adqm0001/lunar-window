# Tasks

Everything that's left, written so you can pick one up without asking anyone.

**How to take a task:** put your name in the **Owner** line in a quick pull request (or tell the team chat), make a branch named after the task (for example `t04-unit-tests`), and open a pull request when it's done. Read the [README](README.md) first for how to run the app.

**Sizes:** S = an hour or two · M = an afternoon · L = a day or more.

| # | Task | Area | Size | Owner |
|---|---|---|---|---|
| 1 | [Demo video](#1-demo-video) | Submission | M | |
| 2 | [Slides](#2-slides) | Submission | M | |
| 3 | [Test on other devices](#3-test-on-other-devices) | Submission | S | |
| 4 | [Unit tests](#4-unit-tests) | Engineering | M | |
| 5 | [Split the JavaScript bundle](#5-split-the-javascript-bundle) | Engineering | S | |
| 6 | [Move heavy work to a Web Worker](#6-move-heavy-work-to-a-web-worker) | Engineering | M | |
| 7 | [Smaller polar terrain file](#7-smaller-polar-terrain-file) | Engineering | M | |
| 8 | [Touch controls on phones](#8-touch-controls-on-phones) | Engineering | M | |
| 9 | [Accessibility pass](#9-accessibility-pass) | Engineering | M | |
| 10 | [Bounced light in the thermal model](#10-bounced-light-in-the-thermal-model) | Science | L | |
| 11 | [Extend the ephemeris past 2028](#11-extend-the-ephemeris-past-2028) | Science | S | |
| 12 | [Communications link budget](#12-communications-link-budget) | Science | M | |
| 13 | [Sharper horizons around key sites](#13-sharper-horizons-around-key-sites) | Science | L | |
| 14 | [North pole detail](#14-north-pole-detail) | Science | L | |
| 15 | [Lander shadow](#15-lander-shadow) | Features | M | |
| 16 | [Split-screen compare](#16-split-screen-compare) | Features | L | |
| 17 | [Replay a real landing](#17-replay-a-real-landing) | Features | M | |
| 18 | [VR mode](#18-vr-mode) | Features | L | |

---

## Submission

### 1. Demo video

**Why:** Judges often watch the video before they open the app. It has to show the problem and the most impressive parts in two to three minutes.

**How:**
1. Open the live app and press **● Rec** in the timeline. It records the 3D view (not the side panels) to a `.webm` file and starts time playing. Press it again to stop and save.
2. Suggested shots, in order:
   - Whole Moon slowly turning (drag), then fly to the south pole.
   - Shadows sweeping across the pole with time playing at 6 h/s.
   - **Sun %** layer over 1 year, then **❄ Ice**, then **Temp**.
   - **★ Find landing spot**: run a search, click the top result.
   - **⛟ Rover route**: plan Connecting ridge B → Shackleton ridge A, press Replay.
   - **♥ Lander sim** → "See the lander on the ground".
   - **🏁 Artemis III report** and the **✓ Validation** window (screen capture for these, since Rec only captures 3D).
3. Use a screen recorder (OBS, or Win+G on Windows) for the panel parts, then cut everything together with a voice-over. Keep it under 3 minutes.

**Done when:** a video under 3 minutes is uploaded and linked from the NASA project page.

### 2. Slides

**Why:** Needed for judging and any live presentation.

**How:** About 7 slides:
1. Problem: the polar Sun is 1.6° high, shadows move, landers freeze, Earth hides.
2. What Lunar Window is (one screenshot, one sentence).
3. Three feature screenshots (use `docs/`).
4. How it works (the diagram in the README).
5. Validation numbers (README table).
6. Who it helps: mission planners, students, the public.
7. Team and links.

**Done when:** slides are exported to PDF and linked from the project page.

### 3. Test on other devices

**Why:** Everything was built and tested on one Windows desktop with an RTX 2060 Super. Judges will use whatever they have.

**How:** Open https://adqm0001.github.io/lunar-window/ on each device you can find and go through this checklist:
- [ ] Laptop with integrated graphics (Intel or AMD): is it smooth? Try the **Saver** power setting.
- [ ] Mac with Safari
- [ ] Firefox
- [ ] Android phone and iPhone
- [ ] Slow Wi-Fi: how long until the Moon appears?
- [ ] The guided tour from start to finish
- [ ] Each layer, and each button in the layer bar

Write down the device, browser and anything broken or slow. Open a GitHub issue for each problem with a screenshot.

**Done when:** at least four device/browser combinations are checked and their problems are filed as issues.

---

## Engineering

### 4. Unit tests

**Why:** There are no automated tests. The math is validated by hand, and nothing stops a change from silently breaking it.

**Where:** `web/src/lib/astro.ts`, `web/src/lib/siteThermal.ts`, `web/src/lib/rover.ts`, `web/src/lib/visibility.ts`

**How:**
1. `cd web && npm install -D vitest`, then add `"test": "vitest run"` to `package.json` scripts.
2. Tests to write (in `web/src/lib/*.test.ts`):
   - `toMap` then `toLatLon` returns the original latitude and longitude (to 1e-6°) for several points near the pole.
   - `discFraction(0)` is 0.5, `discFraction(1)` is 1, `discFraction(-1)` is 0.
   - `horizonAt` interpolates between neighbouring directions and wraps at 360°.
   - `planRoute` on a tiny hand-made grid (5 × 5 cells, everything sunlit) finds the straight path; with a shadow wall it waits or goes around.
   - `siteThermal` at the Apollo 11 site gives a maximum between 370 and 400 K and a minimum between 80 and 100 K. Loading the ephemeris in a test needs a small helper that reads `public/data/ephem.bin` from disk.
3. Add a step running `npm test` to `.github/workflows/pages.yml` before the build, so broken math blocks the deploy.

**Done when:** `npm test` passes locally and in GitHub Actions.

### 5. Split the JavaScript bundle

**Why:** The app ships one 880 KB JavaScript file. Panels most people never open are downloaded up front.

**Where:** `web/src/App.tsx`, `web/src/components/LayerControls.tsx`, `web/vite.config.ts`

**How:**
1. Load rarely used panels with `React.lazy` and `Suspense`: `LanderPanel`, `FinderPanel`, `RoverPanel`, `PorkchopPanel`, `ComparePanel`, `RegionReport`, `ValidationPanel`, `SkylinePanel`.
2. In `vite.config.ts`, put three.js in its own chunk (`build.rollupOptions.output.manualChunks`) so it caches separately.
3. Run `npm run build` and compare the file sizes it prints.

**Done when:** the main chunk is under 500 KB and every panel still opens.

### 6. Move heavy work to a Web Worker

**Why:** Some calculations run on the main thread and freeze the page briefly on slower laptops: the per-site hourly series (`siteSeries`), the site thermal model (`siteThermal`), and the rover route search (`planRoute`).

**Where:** `web/src/lib/visibility.ts`, `web/src/lib/siteThermal.ts`, `web/src/lib/rover.ts`, and the components that call them (`SitePanel.tsx`, `RoverPanel.tsx`, `Timeline.tsx`)

**How:**
1. Create `web/src/workers/compute.worker.ts`. Vite supports `new Worker(new URL("./compute.worker.ts", import.meta.url), { type: "module" })`.
2. Send the ephemeris to the worker once, then send site requests (id, lat, lon, height, horizon) and get typed arrays back. Transfer buffers instead of copying them.
3. Make the callers async and show a small "computing…" state while waiting.
4. `planRoute` needs the visibility bits from the GPU. Compute those on the main thread (they come from WebGL), then transfer them to the worker for the search.

**Done when:** selecting a new site and planning a route don't drop frames while the 3D view is moving.

### 7. Smaller polar terrain file

**Why:** `web/public/data/polar_80m.bin.gz` is 25 MB. It now loads in the background, but on slow connections the pole stays blurry for a long time.

**Where:** `pipeline/build_globe.py` (writes it), `web/src/data/globe.ts` (`loadPolar80`)

**How:** Either:
- **Tile it:** split the 6250 × 6250 grid into 64 tiles of ~780 × 780 and load only the tiles near the camera, the same way `web/src/data/tiles.ts` handles the 40 m data; or
- **Encode it better:** store heights as 16-bit differences from the 240 m data (`polar_240m`) upsampled, which are small numbers that compress much better than raw heights.

**Done when:** the first sharp view of the pole needs under 8 MB of polar data and heights match the old file to within 1 m.

### 8. Touch controls on phones

**Why:** The phone layout exists (bottom tab bar, slide-up panels), but moving the camera relies on mouse drag and keyboard keys.

**Where:** `web/src/three/MoonScene.ts` (`configureControls`, `bindMovement`, `bindMapInput`), `web/src/components/MobileNav.tsx`

**How:**
1. OrbitControls already supports one-finger rotate and two-finger zoom. Check it works on a real phone, including in the 2D map mode, which has its own drag handler (`bindMapInput`); add pinch-zoom there.
2. Add on-screen buttons for up/down (the R and F keys) in the phone layout.
3. Make sure tapping the terrain still adds a point without fighting the drag.

**Done when:** you can fly from the whole Moon to the pole surface and back using only touch.

### 9. Accessibility pass

**Why:** Some people can't use a mouse, and some can't tell the map colors apart.

**Where:** `web/src/components/*`, `web/src/gpu/layers.ts` (color scales), `web/src/styles.css`

**How:**
1. Tab through the whole page: every button should be reachable and show a visible focus outline.
2. Modal windows should close with Escape and keep focus inside while open.
3. Add a color-blind-safe option for the map layers (for example a viridis-style scale) in `layers.ts`, switchable in the legend.
4. Check text contrast on the glass panels.

**Done when:** the app is usable with keyboard only, and every layer has a color-blind-safe option.

---

## Science

### 10. Bounced light in the thermal model

**Why:** The soil temperature model only uses direct sunlight. Inside permanently shadowed craters, the only heat comes from sunlight and infrared bounced off nearby sunlit slopes. Without it the darkest floors come out around 25 K, while NASA's Diviner measures 30–50 K. This matters because ice stability depends on exactly those temperatures.

**Where:** `web/src/gpu/thermal.ts` (GPU, whole polar field), `web/src/gpu/globalLayers.ts` (whole Moon), `web/src/lib/siteThermal.ts` (one site)

**How:**
1. For each cell, estimate the fraction of its sky taken up by terrain from the horizon data already loaded: the average over all directions of sin²(horizon elevation) is a good start.
2. Per time step, scattered sunlight into a cell ≈ that sky fraction × albedo × the average sunlight on the surrounding terrain. Simplest version: use the region's mean absorbed sunlight at that hour. Better: precompute per-cell view factors to a coarse grid.
3. Thermal infrared from surrounding warm terrain ≈ sky fraction × ε σ T⁴ of the surroundings.
4. Add both to `absorbed` in the surface energy balance.
5. Check against Diviner: Shackleton's floor should reach roughly 40–60 K at most, and the equator must stay at about 95–390 K.

**Reference:** Hayne et al. 2017; Paige et al. 2010 (Science), "Diviner Lunar Radiometer observations of cold traps in the Moon's south polar region".

**Done when:** Shackleton floor temperatures land in the measured range, the equator is unchanged, and the validation window shows the new numbers.

### 11. Extend the ephemeris past 2028

**Why:** Sun and Earth positions cover 2026–2028 only. Ice stability and long-term sunlight are better judged over longer periods.

**Where:** `pipeline/ephemeris.py` (lines with `datetime(2026, …)` and `datetime(2029, …)`), output `web/public/data/ephem.bin` and `dsn.bin`

**How:**
1. Change the end date (for example to 2036). DE421 covers it.
2. Rerun `python ephemeris.py`. The file grows by about 210 KB per year.
3. Check the web app still handles the larger count. The GPU texture layout in `web/src/gpu/engine.ts` and `globalLayers.ts` packs hours into rows of 4096, so it should just work. Test the 1-year layers and the timeline.
4. Update the "2026–2028" text in the UI and README.

**Done when:** the timeline runs through the new end year and all layers still compute.

### 12. Communications link budget

**Why:** The app shows when a DSN dish can see a site, but not how much data could get through.

**Where:** `web/src/lib/contacts.ts`, the "Contact with Earth" section of `web/src/components/SitePanel.tsx`

**How:**
1. Standard link budget: received power = transmit power + transmit antenna gain + receive antenna gain − free-space loss (20·log10(4π·distance/wavelength)), in dB.
2. Use typical small-lander values: X-band (8.4 GHz), 20 W, a 0.5 m dish, DSN 34 m antenna, system noise temperature about 30 K.
3. Data rate ≈ received power ÷ (k·T·required Eb/N0), with Eb/N0 around 2 dB plus a 3 dB margin.
4. The Earth–Moon distance comes from the Earth vector in the ephemeris.
5. Show "about N Mbps" per pass and total data per week.

**Done when:** each contact window shows an estimated data rate with the assumptions listed in a tooltip.

### 13. Sharper horizons around key sites

**Why:** The polar horizon field is 250 m per cell. Landing-miss simulations near ridge tops would be more accurate with 20 m cells around the main sites.

**Where:** `engine/horizon.cpp`, `pipeline/build_field.py`, `web/src/data/field.ts`

**How:**
1. Run the C++ engine on a 20 m grid in a 5 × 5 km box around each named site (250 × 250 points × 180 directions).
2. Save each as a small field file in the same format as `field_pole` (see `build_field.py`).
3. In the app, when the camera or analysis is inside one of these boxes, use the fine field for the site panel and the Monte Carlo.

**Done when:** the landing-miss simulation at Connecting ridge B uses 20 m horizons, with the result checked against the coarse field.

### 14. North pole detail

**Why:** Only the south pole has the 40 m terrain and the precomputed horizon field. The north pole uses the whole-Moon grid (about 1.4 km near the poles).

**Where:** `pipeline/fetch_data.py`, `pipeline/build_field.py`, `pipeline/build_tiles.py`

**How:** Download the north polar versions of the LOLA products used for the south (same PDS directory as in `fetch_data.py`) and run the same pipeline with the north polar projection. The app needs a way to switch which polar field is active, similar to how regional fields work (`web/src/gpu/regions.ts`).

**Done when:** the north pole has the same detailed maps and 3D quality as the south.

---

## Features

### 15. Lander shadow

**Why:** The 3D lander (`web/src/three/landerModel.ts`) doesn't cast a shadow, which looks wrong with the Sun 1.5° above the horizon. Its shadow should be tens of metres long.

**How:** The terrain uses custom shaders, so three.js shadow maps won't reach it. Easiest: in the terrain fragment shaders (`web/src/three/shaders.ts` and `web/src/three/lod.ts`), add a uniform with the lander's position, height and radius, and darken pixels inside its shadow cone. The same math as the rock shadows in `GROUND_GLSL` (`web/src/three/craterTexture.ts`, `rockShadow`).

**Done when:** the lander casts a long shadow that moves with the Sun as time plays.

### 16. Split-screen compare

**Why:** Comparing two sites or two dates side by side is clearer than switching back and forth.

**Where:** `web/src/components/Scene3D.tsx`, `web/src/three/MoonScene.ts`, `web/src/state/store.ts`

**How:** Render the scene twice with two cameras using `renderer.setScissor` and `setViewport`, each with its own time or site. Simplest first version: same time, two cameras, each following one pinned site from the Compare panel.

**Done when:** two pinned sites can be viewed side by side with time playing in both.

### 17. Replay a real landing

**Why:** Showing a real event makes the problem concrete. Intuitive Machines' IM-2 lander (Athena) landed near Mons Mouton in March 2025, tipped over and ran out of power. The app could show the lighting it actually faced.

**How:**
1. Add a short ephemeris for February–March 2025 (task 11 shows how).
2. Add the landing site and time to `pipeline/sites.py` (from NASA and Intuitive Machines public reports).
3. Add a "Replay" entry that jumps to that time and site with the lander model and the sunlight timeline.

**Done when:** you can watch the lighting at the IM-2 site around its landing.

### 18. VR mode

**Why:** Standing on a ridge and watching the Sun circle the horizon is the most memorable way to understand the pole.

**Where:** `web/src/three/MoonScene.ts`

**How:** three.js supports WebXR: `renderer.xr.enabled = true` and the `VRButton` helper. The custom render loop (`loop`) has to switch to `renderer.setAnimationLoop` in VR, and post-processing (bloom) should be skipped there. Place the camera at a site at standing height.

**Done when:** a Quest or similar headset can stand at a site with time playing.
