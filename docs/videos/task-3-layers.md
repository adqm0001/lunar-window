# Sunlight, ice and temperature layers

Submission clip for [Task 3 / issue #28](https://github.com/adqm0001/lunar-window/issues/28).

[Download or play the WebM](task-3-layers.webm)

![Sunlight, ice stability and maximum temperature, in clip order](task-3-layers.jpg)

## Sequence

| Time | Layer | Range |
|---|---|---|
| 0–5 s | Sun %: fraction of time the Sun is visible | 1 year |
| 5–10 s | Ice: modelled water-ice stability | Full annual thermal model |
| 10–15 s | Temp: maximum surface temperature, kelvin | 1 year |

The clip is **15.000 seconds**, VP9/WebM, 1280 × 720, constant 30 FPS (450 frames), without audio. Each section includes a caption naming the layer. The preview shows frames at 2.5, 7.5 and 12.5 seconds.

## Capture

The original Sun take was recorded on 2026-11-15 from the [live app](https://adqm0001.github.io/lunar-window/) and preserved frame for frame. The Ice and Temp takes were recorded on the same date with the built-in **● Rec** code from main at [3fc03ff](https://github.com/adqm0001/lunar-window/commit/3fc03ff3969dbfe7cc32825d09192a7303618ca4), after the single-bounce crater heating change in [#72](https://github.com/adqm0001/lunar-window/pull/72).

All three sections use the annual window 2026-01-02 → 2027-01-02, the default palette and the same fixed polar camera. The target is −89.8°, −140° and the camera is at −89.65°, −140°, 60 km up. Playback was set to 1 h/s. The recorder captures the WebGL canvas, including the direction rays. The replacement takes use Saver quality with the canvas locked to 1280 × 720.

The first five seconds of the new Ice and Temp takes were normalized to 30 FPS, captioned and joined to the original Sun footage. The thermal-model limitations documented in the app still apply.

## Verification

- Confirmed the original Sun footage's 1y range from the initial capture and checked that all 150 Sun frames in the final export match it.
- Confirmed the annual interval and completed detailed-pole and whole-Moon heat calculations for both Ice and Temp before recording on an RTX 2060 SUPER.
- Fully decoded the export with FFmpeg with error checking enabled. It contains 450 frames at 1280 × 720 and 30 FPS, for 15.000 seconds.
- Inspected frames at 2.5, 7.5 and 12.5 seconds for the layer order, captions and framing. Confirmed playback to the end and seeking into Ice and Temp in Chromium.
- Ran the TypeScript check, all 66 tests and the production build from the web directory.

Only Task 3's clip, preview, documentation and checkbox are included. Original takes, temporary fonts/tools and the local verification page remain excluded under `notes/`.
