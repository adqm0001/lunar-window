# Space Apps project-page copy

Prepared for Task 11. The text below follows the form fields supplied by the team. **This file is not a submitted NASA project page.** The team owner must confirm the disclosures, publish the selected demo, paste the fields into the official form and choose Submit for Judging.

## Project Name

Lunar Window

## High-Level Project Summary

Lunar Window is a browser-based tool for comparing where and when to land at the Moon’s south pole. It combines NASA lunar terrain with hourly Sun and Earth positions to show how the local skyline affects solar power and communication. Users can rank sites for a mission, compare candidates on a shared timeline and explore landing dates with a battery model. A 3D terrain view and guided tour make the results accessible to educators and the public. The prototype helps explain the tradeoffs behind a landing decision, while showing the assumptions and limits of its calculations.

## Link to Project Demo

Use the **seven-slide PDF** as the official demo. It already includes the project, challenge, team names, NASA data, working interface and limitations.

Public PDF link, verified without signing in:

https://raw.githubusercontent.com/adqm0001/lunar-window/f97e42d19ecf7965310431623e6ab6250e84f077/docs/slides.pdf

This link pins the checked demo revision, so it works before the documentation PR merges and does not depend on the review branch remaining open. The editable source is `docs/slides.pptx`; `docs/slides.html` is a local browser preview.

An alternative [29-second captioned video](demo/lunar-window-29s.mp4) combines opening slides with actual site ranking, comparison and landing-date selection. It has no audio. Choose its public link instead if you prefer video. The [optional narration script](voiceover.md) fits within the time limit when read at the stated pace. The older long raw clips are source material, not the submitted short demo.

Public video link, verified without signing in:

https://raw.githubusercontent.com/adqm0001/lunar-window/f97e42d19ecf7965310431623e6ab6250e84f077/docs/demo/lunar-window-29s.mp4

## Link to Final Project

https://adqm0001.github.io/lunar-window/

Source and documentation: https://github.com/adqm0001/lunar-window

The deployed planner is public and has no account or application sign-in requirement.

## Detailed Project Description

### What it does

Lunar Window addresses the Lunar Landing Site Navigator challenge by putting a site’s terrain, Sun/Earth horizon and time-dependent mission conditions in the same interface. At the lunar south pole, terrain can block sunlight or the view of Earth. A change of location or landing time can therefore change a mission’s power and communication opportunities.

Users select a named site or add coordinates, inspect the local skyline and follow separate Sun, Earth and Deep Space Network signals. Find best site ranks the loaded analysis area using the UTC landing date, mission duration, night tolerance, flat-ground requirement and chosen priorities. Site comparison keeps candidates on the same timeline, while Landing dates estimates how long a chosen lander’s battery remains above its reserve for different start times.

Additional tools simulate solar generation and battery loads, evaluate landing dispersion with 4,000 modeled touchdowns, plan rover routes through changing light, and map terrain slope, temperature and conditional ice stability. A regional report uses NASA’s dated October 2024 nine-region candidate catalog. A nine-step tour introduces the main workflow on desktop and mobile.

### How it works

NASA LRO LOLA elevation data supplies the terrain. A C++/OpenMP engine calculates terrain skylines for the polar field and named locations. A Python pipeline uses JPL DE421 ephemerides and lunar frame kernels to calculate hourly Sun/Earth positions and DSN station geometry. The main packaged dataset covers 2026–2036.

The browser compares celestial elevations with each terrain skyline and uses WebGL2 to calculate area maps. React and TypeScript provide the controls and mission models, and three.js renders the Moon. The app runs from static files on GitHub Pages without an application backend.

The default polar field evaluates 102,400 grid locations at 250 m analysis spacing. Source terrain reaches 40 m near the pole. These resolutions describe different parts of the calculation and do not imply knowledge of every landing hazard.

### Evidence and limitations

The project records a largest elevation difference of 0.00003 degrees against JPL Horizons in daily checks at three sites through 2027. Its five-peak illumination comparison differs from the published 2020 reference values by about 3.7 percentage points on average after registering locations to LOLA summits. The validation panel also compares site thermal estimates with published Diviner measurements.

These checks support specific parts of the model. They do not certify a mission. DSN results describe geometric opportunities, not an allocated network link or a full RF budget. Battery endurance depends on the chosen lander settings. Ice stability is a thermal estimate, not evidence of ice abundance. Small visual rocks and craters do not affect calculations. Displayed region circles approximate named features rather than official landing boundaries.

### Benefits and next steps

The prototype makes early site/date tradeoffs visible and explainable without specialist software installation. Educators can demonstrate how terrain and time affect exploration, and users can share the same view with a URL. Future work could add uncertainty estimates, more detailed hazard data and a fuller communication link budget. These extensions are goals rather than current capabilities.

## Use of Super Intelligence (SI)

Yes. OpenAI Codex/ChatGPT and Anthropic Claude assisted with coding, debugging, tests, reviews, UI exploration and documentation. Codex also assisted the writing and layout of the refreshed README, project-page copy and seven-slide presentation. Earlier interface concept images used SI image generation, but those concepts are not included as visuals in this demo.

The demo visuals are screenshots of the working application, which renders NASA-derived terrain and computed model results. We do not present them as spacecraft photographs. Source NASA observations are not SI-generated. The processed terrain and ephemerides are outputs of the project’s computational pipeline. The README and machine-readable SI disclosure acknowledge assistance with code and data-processing code. The deck visibly acknowledges SI assistance and its speaker notes include sources.

Before submission, every team member should confirm whether additional tools or generated media need disclosure. If the team adds SI-generated images or video, include the required visible indicator. If it adds synthetic narration, acknowledge that in the description and media metadata. Do not create or alter NASA branding with SI.

## NASA Data

We use NASA Lunar Reconnaissance Orbiter LOLA elevation products, distributed through the PDS Geosciences Node, to build the terrain, terrain skylines and slope estimates:
https://pds-geosciences.wustl.edu/missions/lro/lola.htm

We use NASA/JPL DE421 ephemerides and NAIF Moon orientation/frame kernels to derive hourly Sun/Earth positions in a Moon-fixed frame:
https://naif.jpl.nasa.gov/pub/naif/generic_kernels/

We check computed positions against NASA/JPL Horizons:
https://ssd.jpl.nasa.gov/horizons/

We use NASA Deep Space Network station geometry for Goldstone, Madrid and Canberra:
https://www.nasa.gov/communicating-with-missions/dsn/

The lunar color texture comes from the NASA SVS CGI Moon Kit, created from LRO Camera and LOLA products:
https://svs.gsfc.nasa.gov/4720/

The regional report uses the dated candidate names in NASA’s October 28, 2024 announcement, rather than asserting a current mission landing selection:
https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/

Published LRO Diviner results provide thermal-model comparison values. They are not a live data stream.

## Space Agency Partner Data and Other References

Our comparison with Bussey et al. (2010) uses published illumination values derived from JAXA Kaguya topography. The app’s terrain calculations use NASA LOLA, so this is an indirect JAXA reference rather than direct ingestion of a second terrain dataset.

Additional references include Hayne et al. (2017) for regolith properties, Williams et al. (2017) and Paige et al. (2010) for Diviner thermal/cold-trap context, Ingersoll et al. (1992) for approximate crater heating, Weber et al. (2011) for the educational cutaway, and IAU/USGS feature locations.

Software: C++/OpenMP, Python, NumPy, Skyfield, Pillow, TypeScript, React, three.js, Zustand, WebGL2, Vite and Vitest. Geist is bundled under the SIL Open Font License. The optional Viridis palette derives from the BIDS CC0 colormap collection. The presentation uses Segoe UI. SI and screenshot tooling are disclosed above.

Full publications, URLs, media credits and license notes:
https://github.com/adqm0001/lunar-window/blob/f97e42d19ecf7965310431623e6ab6250e84f077/docs/sources.md

## Team credits

- Adam Benmoussa
- Sazid Malik
- Achraf Benchoubane
- Mohammad Al-Qedra
- Mohanad Abdelaal

The slides identify Lunar Window as the project/team label. Confirm the registered team name and local event in the official form.

## Final handoff

- Confirm the team name, membership and local-event registration in the Space Apps account.
- Confirm the SI disclosure and rights to any additional media.
- Open the live planner and the refreshed demo in a signed-out/private window. They must work without a password, permission request or registration.
- If using video, confirm its measured duration is 30 seconds or less. If using slides, keep all seven slides, including the title and team.
- Use English throughout. Any non-English spoken video needs English subtitles.
- Exclude likenesses of people under 18 from the demo and final project.
- Complete every required form field and choose **Submit for Judging** by November 15 at 11:59 p.m. in the applicable event time zone, as specified in the team-supplied guide.
- Keep Task 11 unchecked until the actual submission and its public links have been verified.
