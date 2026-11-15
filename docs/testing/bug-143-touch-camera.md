# Touch camera frame pacing

Candidate fix for [issue #143](https://github.com/adqm0001/lunar-window/issues/143). The original iPhone Safari report still needs a real-device recheck of this change.

## Reproduced behavior

The installed OrbitControls advances damping inside pointer handlers as well as in the animation loop. In a Node input-surface regression test, a 200-pixel touch drag delivered in one event and the same drag delivered in 20 events produce different camera positions at the next animation frame. Both regression assertions fail with the original controls.

`FrameOrbitControls` retains the input deltas until the animation loop applies them. Damping decay uses elapsed time, preserving the existing 0.07 factor at 60 Hz and giving equivalent settling at 30, 60 and 120 Hz. Both split-screen views use the same control class. Input does not add GPU work or change the 2D map's separate pointer handling.

This confirms an event-delivery-dependent camera behavior; it does not prove that it is the only cause of the reported iPhone lag or jumps. Site-loading delays are not addressed by this change.

## Verification

- `npx tsc --noEmit -p .`: passed.
- `npm test`: 88 tests passed, including seven camera input regressions covering burst delivery, elapsed-time damping, pinch/pan, cancellation, mouse drag/wheel, independent cameras and input-listener disposal.
- `npm run build`: passed, with the existing three.js chunk-size warning.
- Desktop Chromium smoke test on the development build: loaded terrain, dragged the 3D camera, switched sites, entered 2D, panned and returned to 3D, then dragged the left and right split views independently. No console warnings or errors were captured.

![Desktop camera smoke check; not an iPhone capture](bug-143-camera-desktop.png)

![Each split-view camera remains independently draggable](bug-143-camera-split.png)

## Required iPhone recheck

Open the candidate build in Safari and wait for terrain loading to finish. In 3D, drag slowly, drag quickly in both directions, lift and drag again, then pinch. Compare with the deployed upstream app. Check that movement follows the gesture without the reported jumps, and that 2D pan/pinch, site selection and panels still work. Record any remaining lag or jumps before treating the original issue as resolved.

Status: awaiting the tester's result. Desktop testing and Node input events do not substitute for Safari on a real iPhone.

[Candidate preview](https://raw.githack.com/hanoudee/lunar-window/e6a28b9cb96ee61624849ba9de8dfb98f1d89a30/index.html), built from source commit `71323f0`, loads the Moon and terrain in Chromium. The isolated preview branch adds anonymous CORS requests for CDN-hosted images in its HTML only; its compiled app assets match the tested production build. The preview's hosting adjustment is not part of the application change in this PR.
