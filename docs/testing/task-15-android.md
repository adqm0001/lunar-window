# Task 15: Android phone

User-assisted test on 2026-11-15 for [issue #40](https://github.com/adqm0001/lunar-window/issues/40), using a real Android phone and Chrome on the [live app](https://adqm0001.github.io/lunar-window/).

The Moon and terrain loaded, and the tester reported the bottom tabs, playback, panels and phone rotation working. Initial loading felt slow and jumpy; 3D dragging remained laggy after loading. The performance finding remains open in [bug #146](https://github.com/adqm0001/lunar-window/issues/146).

## Procedure and results

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

## Scope and evidence limits

- These are qualitative observations from the tester. The agent did not remotely control the Android phone.
- Device model, Android and Chrome versions, viewport, network conditions, graphics setting, loading time and FPS were not collected.
- No screenshot, screen recording, console capture or performance trace was provided. Console errors were not inspected; this report does not claim an error-free console.
- The phone's exact loaded asset version was not independently confirmed. The latest successful deployment at setup was `13d45a9`; by report preparation it was `0471f24`, whose intervening changes only add the Task 4/5 videos, notes and task ticks.
- [Bug #88](https://github.com/adqm0001/lunar-window/issues/88) and [bug #143](https://github.com/adqm0001/lunar-window/issues/143) describe related startup and iPhone symptoms. Their causes have not been linked to this Android observation. The candidate camera change in [PR #145](https://github.com/adqm0001/lunar-window/pull/145) was not used for this live-site test.

## Repository checks

Local source for the final checks: `193f66feeaae9a2651b512a69928a825a00f7c8f`.

- `npx --no-install tsc --noEmit -p .`: passed.
- `npm test`: all 84 tests in 8 files passed.
- `npm run build`: passed, with the existing three.js chunk-size warning.

These repository checks do not measure Android performance. The testing task records the observed controls and the open performance finding; no performance fix was implemented as part of this report.
