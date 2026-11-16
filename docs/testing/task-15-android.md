# Task 15: Android phone

User-assisted test on 2026-11-15 for [issue #40](https://github.com/adqm0001/lunar-window/issues/40), using a real Android phone and Chrome on the [live app](https://adqm0001.github.io/lunar-window/).

The initial test found slow, jumpy loading and persistent lag while dragging in 3D, recorded in [bug #146](https://github.com/adqm0001/lunar-window/issues/146). A later retest of the updated live site found 3D dragging smooth. The observations and their limits are recorded separately below.

## Initial procedure and results

| Check | User-reported result |
|---|---|
| Open the live app in Chrome and wait for Moon and terrain | Both appeared normally. The tester subsequently reported that loading took a while and the view was very jumpy at first. No duration was measured. |
| Sites, Site and Time bottom tabs; site selection requested with the tabs | Other controls were reported working; site-selection timing was not measured or reported separately. |
| Start and pause playback | Reported working. |
| Slow/fast dragging in the 3D Moon view | Still laggy after the Moon and terrain finished loading. Continued jumping after loading was not separately confirmed. |
| Open and close Find landing spot and Validation | Reported working. |
| Rotate to landscape and back | Reported working. |
| Pinch zoom and 2D pan/pinch, returning to 3D | Requested in the checklist; no separate result was captured. |

The follow-up specifically asked whether 3D dragging stayed laggy after terrain loading and whether the other tab, playback, panel and rotation checks worked. The response was: "Still laggy after loading; other controls worked."

## Retest on the updated live site

On 2026-11-15, after several performance updates had merged, the tester was asked to reload the live app in Chrome on the Android phone, wait for the Moon and terrain, and repeat slow and fast dragging in 3D. The response was: **"Dragging is smooth now."** The previously reported post-loading lag was not reproduced in this retest.

The latest successful Pages deployment when the result was recorded was [`e103f29`](https://github.com/adqm0001/lunar-window/commit/e103f294168659c5b09050e4a6f588c75045eb3d), from [this deployment run](https://github.com/adqm0001/lunar-window/actions/runs/43783128555). The phone's loaded asset fingerprint was not captured, so this does not prove which merged change resolved the behavior. No loading duration, FPS, console output, screenshot or performance trace was collected, and the other controls were not individually retested in this follow-up.

The unmerged camera-input candidate in [PR #145](https://github.com/adqm0001/lunar-window/pull/145) was not used. This Android result does not verify the separate iPhone Safari report in [#143](https://github.com/adqm0001/lunar-window/issues/143).

## Scope and evidence limits

- These are qualitative observations from the tester. The agent did not remotely control the Android phone.
- Device model, Android and Chrome versions, viewport, network conditions, graphics setting, loading time and FPS were not collected.
- No screenshot, screen recording, console capture or performance trace was provided. Console errors were not inspected; this report does not claim an error-free console.
- The phone's exact loaded asset version was not independently confirmed. The latest successful deployment at setup was `13d45a9`; by report preparation it was `0471f24`, whose intervening changes only add the Task 4/5 videos, notes and task ticks.
- [Bug #88](https://github.com/adqm0001/lunar-window/issues/88) and [bug #143](https://github.com/adqm0001/lunar-window/issues/143) describe related startup and iPhone symptoms. Their causes have not been linked to this Android observation. The candidate camera change in [PR #145](https://github.com/adqm0001/lunar-window/pull/145) was not used for this live-site test.

## Initial repository checks

Local source for the final checks: `193f66feeaae9a2651b512a69928a825a00f7c8f`.

- `npx --no-install tsc --noEmit -p .`: passed.
- `npm test`: all 84 tests in 8 files passed.
- `npm run build`: passed, with the existing three.js chunk-size warning.

These repository checks do not measure Android performance. No performance fix was implemented as part of the testing report or its retest update.

## Retest repository checks

On source `e103f294168659c5b09050e4a6f588c75045eb3d`, TypeScript, all 308 tests in 36 files, and the production build passed. The existing three.js chunk-size warning remains. These checks validate the report branch; the Android responsiveness result comes from the tester's live-site observation above.
