# Tasks

Small, separate pieces of work. Each one should take an hour or two.

**To take one:** add your name at the end of the line (`— taken: yourname`) in a quick commit or pull request, so nobody doubles up. Work on a branch named after the number (for example `task-14`), then open a pull request. When it's merged, tick the box.

Status key: `[ ]` open · `[x]` done. See the [README](README.md) for how to run the app.

---

## Act 1: Submission

- [ ] 1. **Clip: whole Moon to pole.** On the live app press **● Rec** (timeline), drag the Moon around, then click "Connecting ridge B" to fly to the pole. Stop and save.
- [ ] 2. **Clip: moving shadows.** At the pole, set speed to 6 h/s and press Play while recording, about 15 seconds.
- [ ] 3. **Clip: data layers.** Record switching **Sun %** (1y) → **❄ Ice** → **Temp**, pausing a few seconds on each.
- [ ] 4. **Clip: landing finder.** Screen-record (OBS or Win+G) opening **★ Find landing spot**, searching, and clicking the top result.
- [ ] 5. **Clip: rover.** Screen-record **⛟ Rover route**: Connecting ridge B → Shackleton ridge A, Plan route, Replay.
- [ ] 6. **Clip: lander close-up.** Open **♥ Lander sim** → "See the lander on the ground", record a slow orbit around it.
- [ ] 7. **Clip: report and validation.** Screen-record **🏁 Artemis III report** and **✓ Validation**.
- [ ] 8. **Voice-over script.** Under 2:30: the problem (1.6° Sun, moving shadows, landers freeze), what the app does, how we know it's right.
- [ ] 9. **Edit the video.** Put clips 1–7 together with the voice-over, under 3 minutes. Upload (YouTube unlisted is fine).
- [ ] 10. **Slides: problem and solution.** Two slides. Screenshots are in `docs/`.
- [ ] 11. **Slides: features.** Three slides with screenshots: maps, finder/lander/rover, Artemis III report.
- [ ] 12. **Slides: how it works and validation.** Diagram and table from the README.
- [ ] 13. **Slides: impact and team.** Who it helps, team names, links. Export everything to PDF.
- [ ] 14. **NASA project page.** Description, live link, repo link, video, slides.

## Act 2: Testing

Open https://adqm0001.github.io/lunar-window/ and report what you find as GitHub issues (device, browser, screenshot).

- [ ] 15. **Laptop with integrated graphics.** Is it smooth? Try Saver / Balanced / High (top bar).
- [ ] 16. **Mac Safari.**
- [ ] 17. **Firefox.**
- [ ] 18. **Android phone.** Does the bottom tab bar work? Can you move the camera?
- [ ] 19. **iPhone.**
- [ ] 20. **Slow internet.** Chrome DevTools → Network → "Fast 4G", hard reload. How long until the Moon appears?
- [ ] 21. **Tour.** Press **▶ Tour** and go through all 9 steps. Note anything that looks wrong.
- [ ] 22. **Every button.** Click every layer and panel button with DevTools open (F12 → Console). Report any red errors.

## Act 3: Tests and code health

- [ ] 23. **Set up tests.** `cd web && npm install -D vitest`, add `"test": "vitest run"` to `package.json`.
- [ ] 24. **Test map projection.** `toMap` then `toLatLon` returns the same point (±1e-6°) for a few polar points. File: `web/src/lib/astro.ts`.
- [ ] 25. **Test Sun disc.** `discFraction(0) = 0.5`, `discFraction(1) = 1`, `discFraction(-1) = 0`. Same file.
- [ ] 26. **Test horizon lookup.** `horizonAt` interpolates between directions and wraps past 360°. Same file.
- [ ] 27. **Test rover search.** `planRoute` on a hand-made 5 × 5 grid: all sunlit gives a straight path; a shadow wall makes it wait or detour. File: `web/src/lib/rover.ts`.
- [ ] 28. **Test thermal model.** `siteThermal` at the Apollo 11 site: max 370–400 K, min 80–100 K. Needs a small helper to read `web/public/data/ephem.bin` from disk. File: `web/src/lib/siteThermal.ts`.
- [ ] 29. **Run tests on every push.** Add an `npm test` step before the build in `.github/workflows/pages.yml`.
- [ ] 30. **Lazy-load tool panels.** Wrap `LanderPanel`, `FinderPanel`, `RoverPanel`, `PorkchopPanel` in `React.lazy` + `Suspense`. File: `web/src/App.tsx`.
- [ ] 31. **Lazy-load windows.** Same for `RegionReport`, `ValidationPanel`, `SkylinePanel`.
- [ ] 32. **Separate three.js chunk.** `build.rollupOptions.output.manualChunks` in `web/vite.config.ts`. Check the sizes `npm run build` prints.
- [ ] 33. **Remove dead code.** `buildGlobe`, `buildSkirt`, `globeMaterial`, `polarTexture` and `setPolarUniforms` in `web/src/three/globe.ts` are no longer used anywhere. Delete them and anything only they use; `npm run build` must still pass.
- [ ] 34. **Worker skeleton.** Create `web/src/workers/compute.worker.ts` and send it the ephemeris once on startup.
- [ ] 35. **Site time series in the worker.** Move `siteSeries` (`web/src/lib/visibility.ts`) into the worker; callers become async.
- [ ] 36. **Site temperature in the worker.** Same for `siteThermal`.
- [ ] 37. **Rover search in the worker.** Compute the visibility bits on the main thread (GPU), transfer them, run `planRoute` in the worker.
- [ ] 38. **Tile the 80 m polar file.** In `pipeline/build_globe.py`, write `polar_80m` as 8 × 8 tiles instead of one 25 MB file.
- [ ] 39. **Load 80 m tiles on demand.** In `web/src/data/globe.ts` and `web/src/three/lod.ts`, fetch only the tiles near the camera.

## Act 4: Phones and accessibility

- [ ] 40. **Pinch zoom in the 2D map.** `bindMapInput` in `web/src/three/MoonScene.ts` only handles mouse wheel zoom.
- [ ] 41. **Up/down buttons on phones.** Phones have no R/F keys. Add two buttons in the phone layout (`web/src/components/MobileNav.tsx`).
- [ ] 42. **Tap to add a point on phones.** Make sure a tap adds a point but a drag doesn't (`bindPicking` in `MoonScene.ts`).
- [ ] 43. **Focus outlines.** Every button should show a visible outline when reached with Tab. File: `web/src/styles.css`.
- [ ] 44. **Modal keyboard handling.** Escape closes the Validation, Skyline and Report windows, and Tab stays inside them while open.
- [ ] 45. **Color-blind palette.** Add a viridis-style option for the map layers in `web/src/gpu/layers.ts` with a switch in the legend.

## Act 5: Science upgrades

- [ ] 46. **Sky fraction per cell.** From the horizon data, compute how much of each cell's sky is blocked by terrain (average of sin² of the horizon elevation over all directions). File: `web/src/gpu/thermal.ts`.
- [ ] 47. **Scattered sunlight.** Add sunlight reflected from surrounding terrain (sky fraction × albedo × average sunlit-terrain brightness) to the surface energy balance in `thermal.ts`.
- [ ] 48. **Infrared from surroundings.** Add heat radiated by warm surrounding terrain (sky fraction × εσT⁴) in `thermal.ts`.
- [ ] 49. **Same in the other two thermal models.** Copy 46–48 into `web/src/gpu/globalLayers.ts` and `web/src/lib/siteThermal.ts`.
- [ ] 50. **Recheck temperatures.** Shackleton floor max should land around 40–60 K and the equator stay at about 95–390 K. Update the numbers in `web/src/components/ValidationPanel.tsx`.
- [ ] 51. **Longer ephemeris.** Change the end date in `pipeline/ephemeris.py` (now 2029-01-01) to 2036, rerun it, check the timeline and 1-year layers still work.
- [ ] 52. **Update date text.** Replace "2026–2028" in the UI and README after 51.
- [ ] 53. **Link budget function.** In `web/src/lib/contacts.ts`, estimate data rate per pass: X-band, 20 W, 0.5 m lander dish, DSN 34 m, free-space loss from the Earth distance.
- [ ] 54. **Show data rates.** Add the rate per pass and data per week to the "Contact with Earth" section in `web/src/components/SitePanel.tsx`.
- [ ] 55. **20 m horizons at one site.** Run `engine/horizon.cpp` on a 20 m grid, 5 × 5 km around Connecting ridge B, saved like `field_pole` (see `pipeline/build_field.py`).
- [ ] 56. **Use the 20 m field.** Make the landing-miss Monte Carlo use it when the target is inside it.
- [ ] 57. **North pole data.** Add the north polar LOLA files to `pipeline/fetch_data.py` (same PDS directory as the south ones).
- [ ] 58. **North pole field.** Run `build_field.py` with the north polar projection.
- [ ] 59. **North pole in the app.** Let the app switch its active polar field to the north (similar to `web/src/gpu/regions.ts`).

## Act 6: New features

- [ ] 60. **Lander shadow.** Pass the lander position and size to the terrain shaders (`web/src/three/shaders.ts`, `lod.ts`) and darken pixels inside its shadow. The rock shadow math in `rockShadow` (`web/src/three/craterTexture.ts`) is the template.
- [ ] 61. **Split screen: rendering.** Draw the scene twice with two cameras using `setScissor` / `setViewport` in `MoonScene.ts`.
- [ ] 62. **Split screen: controls.** A toggle in the Compare panel, each half following one pinned site.
- [ ] 63. **IM-2 replay: ephemeris.** Generate Sun/Earth positions for February–March 2025 (see 51).
- [ ] 64. **IM-2 replay: time.** The IM-2 site is already in `pipeline/sites.py` (`im2-athena`). Add its landing time from public reports and a "Replay" button that jumps there with the lander shown.
- [ ] 65. **VR: enable.** Turn on WebXR in `MoonScene.ts` (`renderer.xr.enabled`, three.js `VRButton`).
- [ ] 66. **VR: render loop.** Use `renderer.setAnimationLoop` in VR, skip bloom, stand the camera at a site at human height.
