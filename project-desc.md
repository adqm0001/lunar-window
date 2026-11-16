# Lunar Window | NASA Space Apps 2026

Copy each section into its matching form field. For a complete demo you can submit now, use the seven-slide PDF. If the team records the voice tracks before the deadline, it can use the finished video link instead.

## Project Name

Lunar Window: A South Pole Landing Planner

## Summary

At the Moon's south pole, a ridge can get sunlight while the crater next to it stays dark. The same terrain can block a spacecraft's view of Earth. We built Lunar Window so anyone can pick a landing site, move the clock and see how those conditions change over a mission. It combines NASA elevation maps with hourly Sun and Earth positions. In the browser, you can rank sites for your mission, compare their sunlight and radio windows, and use a battery model to compare arrival dates. The prototype helps mission teams screen options early and gives educators a way to show students why a small change in location or arrival time can matter.

## Project Demonstration

Use this public PDF URL in the form.

https://raw.githubusercontent.com/adqm0001/lunar-window/d675c926e6d4be2fe72df78f7fd5fd0d2d84840c/docs/slides.pdf

The PDF has seven slides, including the title and team. The [29.8-second silent edit](https://raw.githubusercontent.com/adqm0001/lunar-window/d675c926e6d4be2fe72df78f7fd5fd0d2d84840c/docs/demo/lunar-window-30s.mp4) and [three-speaker narration script](docs/voiceover.md) are available for the team's video mix.

## Project

https://adqm0001.github.io/lunar-window/

Source and documentation: https://github.com/adqm0001/lunar-window

## Project Details

We built a browser planner for the Lunar Landing Site Navigator challenge. Start with a named site or enter your own coordinates. The horizon chart plots the Sun and Earth against the terrain. The timeline separately shows sunlight, Earth visibility and Deep Space Network contact. These readings change with the site and the UTC time. With Find best site, choose the mission length, longest acceptable night and flat-ground requirement. Compare candidates together, then use Landing dates to estimate how long a lander battery stays above its reserve for different arrival times.

NASA LRO LOLA supplies the terrain. Our C++/OpenMP pipeline precomputes the skyline in 180 directions at each of 102,400 locations in the default polar grid. A Python pipeline uses Skyfield, JPL DE421 and SPICE kernels to calculate hourly Sun and Earth positions from 2026 through 2036. The browser compares each position with the skyline and checks whether a DSN station can see the Moon. It uses WebGL2 to calculate area maps. The same polar horizon data drives the shadows you see on the map. The 3D view streams finer terrain tiles as you approach an area. React, TypeScript, Zustand, three.js and Vite provide the interface, rendering and build. GitHub Pages serves the files. We used desktop Chromium for browser checks and collected user-assisted checks in Android Chrome and iPhone Safari.

That shared skyline is the main design choice. A dark patch in the 3D view is something the user can investigate in the chart, rather than a separate illustration. The same app lets someone explore battery endurance, rover routes through changing light, and where temperatures could allow ice to persist. A guided tour walks through a site without requiring a login or specialist software. It is designed for early screening and teaching.

We recorded a largest elevation difference of 0.00003° against JPL Horizons in daily checks at three sites over a year. For the 2020 sunlight comparison, the mean absolute difference was about 3.7 percentage points across five polar peaks after registering the locations to LOLA summits. The app also compares modeled soil temperatures at Apollo 11 and the Shackleton floor with published Diviner values. The base terrain can reach 40 m resolution near the pole, while the default horizon grid samples every 250 m. Small hazards need finer measurements. A DSN window describes geometry and a mission still needs a link budget and station availability. The battery estimate depends on the lander settings, and ice stability estimates do not establish ice abundance.

Our team originated Lunar Window, chose how to address the challenge, and made the scientific and design decisions. We chose the datasets, the sunlight, Earth visibility, DSN contact and temperature models, and the validation checks. Codex/ChatGPT and Claude helped implement those decisions, test, debug, review and document the project. Codex also helped prepare the slides and video materials.

**Team:** Adam Benmoussa, Sazid Malik, Achraf Benchoubane, Mohammad Al-Qedra, Mohanad Abdelaal.

## Use of Super Intelligence (SI)

Select the following options that reflect the work we recorded.

- **Research or Information Gathering** — helped locate and check references for the documentation.
- **Coding, Debugging, or Troubleshooting** — helped implement the team's decisions, review code, diagnose bugs and run tests.
- **Writing, Editing, or Translation** — helped draft and edit documentation, the README, form copy and narration.
- **Visual Design or Image Creation** — helped explore the interface and lay out the slides.
- **Presentation, Video, or Audio** — helped with the deck, editing the screen recording and timing the script. The team records its own voices.

Our team came up with the idea, chose the challenge approach, and made the scientific and design decisions. The app runs physics and geometry models. Source NASA observations come from the cited missions, and the processed products come from our data pipeline. The demo footage and screenshots show the real app. README and `docs/si-disclosure.json` document the AI assistance.

We used SI image generation for earlier interface concepts that are absent from the submission.

## NASA Data

| Link Text | Link URL |
| --- | --- |
| LRO LOLA Polar Elevation Maps (LDEM 40 m and 240 m) | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ |
| LRO LOLA Global Elevation Maps (LDEM_64 and LDEM_16) | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ |
| JPL DE421 Planetary Ephemeris | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/a_old_versions/de421.bsp |
| NASA NAIF SPICE Generic Kernels (Moon frame and orientation) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ |
| NASA JPL Horizons System | https://ssd.jpl.nasa.gov/horizons/ |
| NASA SVS CGI Moon Kit | https://www.nasa.gov/missions/nasa-goddard-creates-cgi-moon-kit-as-a-form-of-visual-storytelling/ |
| NASA Deep Space Network | https://www.nasa.gov/communicating-with-missions/dsn/ |
| NASA Artemis III Moon Landing Regions (October 2024 reference catalog) | https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ |
| LRO Diviner Lunar Radiometer Experiment (published temperature benchmarks) | https://www.diviner.ucla.edu/ |

## Space Agency Partner & Other Data

| Link Text | Link URL |
| --- | --- |
| Bussey et al. (2010), published illumination from JAXA Kaguya topography, used as a comparison reference | https://doi.org/10.1016/j.icarus.2010.03.028 |
| Hayne et al. (2017), lunar regolith thermal properties | https://arxiv.org/abs/1711.00977 |
| Williams et al. (2017), Diviner surface temperatures | https://doi.org/10.1016/j.icarus.2016.08.012 |
| Paige et al. (2010), Diviner observations of south polar cold traps | https://geoweb.rsl.wustl.edu/community/applications/core/interface/file/attachment.php?id=505 |
| Ingersoll et al. (1992), polar frost stability and crater radiative heating | https://ntrs.nasa.gov/citations/19930034907 |
| Weber et al. (2011), seismic model used for the Moon cutaway | https://asu.elsevierpure.com/en/publications/seismic-detection-of-the-lunar-core/ |
| IAU/USGS Gazetteer of Planetary Nomenclature (crater and region centers) | https://planetarynames.wr.usgs.gov/ |
| IM-2 Athena touchdown confirmation from NASA and Intuitive Machines (replay time) | https://www.nasa.gov/blogs/missions/2025/03/06/intuitive-machines-mission-lands-near-south-pole-carrying-nasa-science/ |
| Geist typeface and SIL Open Font License | https://github.com/vercel/geist-font |
| Viridis color palette | https://github.com/BIDS/colormap/blob/master/colormaps.py |
| React | https://react.dev/ |
| three.js | https://threejs.org/ |
| Zustand | https://github.com/pmndrs/zustand |
| TypeScript | https://www.typescriptlang.org/ |
| Vite | https://vite.dev/ |
| Vitest | https://vitest.dev/ |
| Python | https://www.python.org/ |
| NumPy | https://numpy.org/ |
| Skyfield | https://rhodesmill.org/skyfield/ |
| Pillow | https://python-pillow.org/ |
| OpenMP | https://www.openmp.org/ |
| GitHub Pages | https://pages.github.com/ |
| Playwright for screenshot and live-app recording automation | https://playwright.dev/ |
| FFmpeg for encoding and checking the demo | https://ffmpeg.org/ |
| OpenAI Codex and ChatGPT | https://openai.com/codex/ |
| Anthropic Claude | https://www.anthropic.com/claude |

The full source notes and the exact package versions are in the repository. JAXA Kaguya topography enters the work through the published comparison values. The app uses NASA LOLA as its terrain input.

## Project Submission Verification

The team owner should review the prefilled information, confirm the SI selections and source list, and personally complete **Agree to Terms and Conditions** and **Confirm All Work is Original** after reviewing them. Open the final project and selected demo links while signed out. Click **Submit for Judging** before the 11:59 p.m. local deadline and confirm the submission notification.
