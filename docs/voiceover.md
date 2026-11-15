# Voice-over script

For the submission video (task 9). About 310 spoken words: 2:13 at 140 words per minute, 2:23 at a slower 130, so it stays under 2:30 even with short pauses between sections. Numbers are written the way they should be said. Each section names the clip from tasks 1–7 that plays under it. Every number comes from the README's validation table or the app itself (sources below).

## The problem

*Clip 1: whole Moon to pole*

Artemis is heading for the Moon's south pole, where permanently shadowed craters hold water ice: drinking water, oxygen and rocket fuel. It's also the hardest place on the Moon to land.

*Clip 2: moving shadows*

Here the Sun never climbs more than one point six degrees above the horizon. Hills cast shadows tens of kilometres long that sweep around every twenty-nine and a half days. A solar lander that sets down in the wrong place, or at the wrong time, freezes. Earth dips behind the hills too, cutting off radio contact.

Planners need to know where there's light, Earth contact and safe ground, and when.

## What Lunar Window does

*Clip 3: layers*

Lunar Window answers both, in the browser. It combines NASA terrain with the real Sun and Earth, hour by hour, and runs the physics on your GPU. In milliseconds it maps how often each spot sees the Sun, sees Earth and reaches the Deep Space Network. A soil heat-flow model shows where it's cold enough for ice.

*Clip 4: landing finder*

Pick a date and mission length; the finder scores over a hundred thousand spots and ranks the top ten.

*Clip 5: rover*

The rover planner keeps a rover in sunlight as shadows move, waiting out the dark when it must.

*Clip 6: lander*

The lander simulator tracks power hour by hour and tests four thousand random touchdowns for the odds of survival.

## How we know it's right

*Clip 7: report and validation*

The Artemis Three report card covers NASA's nine candidate regions for your dates. Sun and Earth positions match JPL Horizons to better than a ten-thousandth of a degree. Sunlight at the polar peaks matches published research to three point seven percentage points on average. At the Apollo Eleven site, the model gives eighty-six to three hundred eighty-five kelvin; NASA's Diviner measured about ninety-five to three hundred ninety. Shackleton crater's floor stays below a hundred and ten kelvin all year: a cold trap for ice.

Lunar Window: where, and when, to land at the Moon's south pole.

## Sources for each claim

| Line | Source |
|---|---|
| Ice in permanently shadowed craters; Sun ≤ 1.6°; shadows tens of km; 29.5-day sweep; landers freeze; Earth hidden | README, "The problem" |
| Sun, Earth, DSN maps; heat-flow model | README, "What it does"; `src/gpu/engine.ts`, `src/gpu/thermal.ts` |
| 102,400 spots, top 10 | README; `src/components/FinderPanel.tsx`, tour step 6 |
| 4,000 touchdowns | `src/lib/montecarlo.ts` (`n = 4000`), shown in `src/components/LanderPanel.tsx` |
| Nine Artemis III regions | `src/data/artemis.ts` |
| 0.00003° (better than 1/10,000°), 3.7-point average difference, 86–385 K vs ≈95–390 K, Shackleton < 110 K | README, "How we know it's right"; `src/components/ValidationPanel.tsx` |
