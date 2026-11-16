# Task 16: iPhone test

User-assisted real-device testing for [issue #41](https://github.com/adqm0001/lunar-window/issues/41), performed on 2026-11-15.

## Environment and method

- Platform: a real iPhone, operated by the tester.
- The detailed device model and operating-system version are omitted from this public report.
- Browser: Safari, as requested in the test instructions.
- Target: [deployed Lunar Window app](https://adqm0001.github.io/lunar-window/).

The tester operated the actual phone and reported the results in chat. The agent prepared the checks and repository report; it did not remotely operate the phone or substitute desktop device emulation. The exact deployed commit loaded by the phone was not fingerprinted.

## Observations

| Check | User-reported result |
|---|---|
| Initial Moon and terrain loading | Loaded successfully |
| 3D one-finger drag and pinch/zoom | Dragging feels laggy; fast movement can make the camera jump around |
| Behavior after terrain finishes loading | 3D lag/jumping still occurs |
| 2D map pan/pinch and return to 3D | No equivalent jumping problem reported; the tester confirmed the other checks worked |
| Bottom tabs, site selection and details | Worked; changing sites can take longer to load, without a measured duration |
| Time sheet and play/pause | Worked |
| Find landing spot and Validation panels | Worked |
| Portrait → landscape → portrait | Worked |

The follow-up question explicitly distinguished the 3D view from the 2D map and initial loading. The tester identified **3D after terrain loading** and confirmed the other requested checks worked. This is qualitative feedback; no FPS, frame-time or site-switch timing was measured.

## Finding for bug triage

**3D touch dragging lags and the camera jumps during fast input, even after terrain has loaded.**

Reproduction steps:

1. Open the deployed app in iPhone Safari and allow the Moon and terrain to finish loading.
2. Use the 3D Moon view.
3. Drag quickly with a finger and observe delayed movement or camera jumps.

Expected: continuous, predictable camera movement after touch input. The cause has not been isolated. [Bug #143](https://github.com/adqm0001/lunar-window/issues/143) records the finding for reproduction and profiling. The testing task does not include implementing its fix.

## Evidence limits

No screenshot, screen recording, Safari console output or performance trace was captured. Console errors cannot be ruled out. Functional outcomes are user-reported. The results document this test and do not establish behavior across other iPhone models or iOS versions.

## Repository verification

On branch base `13d45a98f0d927e605ae681a225c04070c553667`, the following passed locally:

```text
cd web
npx tsc --noEmit -p .
npm test                 # 7 files, 81 tests passed
npm run build
```

Vite emitted the existing warning about the three.js chunk size. This report completes the user-assisted functional test and records its open bug and evidence limits. There are no application or dependency changes in this report.
