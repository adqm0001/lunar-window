# Sources, credits and usage notes

This inventory distinguishes source observations, reference publications, software and project-created media. It accompanies the README and Space Apps project-page fields.

## NASA data and resources

| Resource | Use and provenance |
| --- | --- |
| [LRO LOLA / PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) | Terrain measurements. The pipeline downloads polar DEMs including `ldem_85s_40m.img` and `ldem_75s_240m.img`. Global and streamed elevation products appear in `web/public/data`. See `pipeline/fetch_data.py`, `build_globe.py`, `build_tiles.py` and `build_global_tiles.py`. |
| [NAIF generic kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/) | `de421.bsp`, `moon_pa_de421_1900-2050.bpc`, `moon_080317.tf` and `naif0012.tls`. The Python pipeline derives hourly Moon-fixed Sun/Earth positions and DSN geometry. |
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | Independent positional reference queried by `pipeline/validate_horizons.py`. Not a live dependency of the browser app. |
| [Deep Space Network](https://www.nasa.gov/communicating-with-missions/dsn/) | Goldstone, Madrid and Canberra station locations for geometric contact estimates. Their coordinates are recorded in `web/public/data/ephem.json`. Visibility does not imply a booked or operational link. |
| [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) | LRO LROC surface color. Credit: NASA’s Scientific Visualization Studio, LRO Camera and LOLA instrument teams. |
| [October 28, 2024 region announcement](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/) | The nine historical Artemis III candidate-region names. The app retains this dated catalog. It does not assert that these are current mission selections. |
| [Diviner Lunar Radiometer Experiment](https://www.diviner.ucla.edu/) | Published temperature ranges used as thermal-model reference checks, rather than a downloaded global Diviner temperature dataset. |

## Partner resources and scientific references

- **Bussey, D. B. J., et al. (2010).** “Illumination conditions of the south pole of the Moon derived using Kaguya topography.” *Icarus* 208, 558–564. [DOI](https://doi.org/10.1016/j.icarus.2010.03.028). The project compares five reference illumination values derived from JAXA’s Kaguya terrain. It uses LOLA terrain for its own calculations, so this is an indirect partner-data reference, not direct ingestion of Kaguya observations.
- **Hayne, P. O., et al. (2017).** “Global Regolith Thermophysical Properties of the Moon From the Diviner Lunar Radiometer Experiment.” *Journal of Geophysical Research: Planets*. [DOI](https://doi.org/10.1002/2017JE005387). Regolith heat-flow model properties.
- **Williams, J.-P., et al. (2017).** “The global surface temperatures of the Moon as measured by the Diviner Lunar Radiometer Experiment.” *Icarus* 283, 300–325. [DOI](https://doi.org/10.1016/j.icarus.2016.08.012). Thermal reference ranges.
- **Paige, D. A., et al. (2010).** “Diviner Lunar Radiometer Observations of Cold Traps in the Moon’s South Polar Region.” *Science* 330, 479–482. [DOI](https://doi.org/10.1126/science.1187726). Cold-trap context.
- **Ingersoll, A. P., et al. (1992).** “Stability of polar frosts in spherical bowl-shaped craters on the Moon, Mercury, and Mars.” *Icarus* 100, 40–47. [DOI](https://doi.org/10.1016/0019-1035(92)90016-Z). Approximate crater radiative heating.
- **Weber, R. C., et al. (2011).** “Seismic Detection of the Lunar Core.” *Science*. [DOI](https://doi.org/10.1126/science.1199375). Reference for the educational Moon cutaway.
- **IAU Working Group for Planetary System Nomenclature / USGS.** [Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/). Named-feature centers and dimensions. The region circles use these approximate feature extents, not official landing polygons.
- **BIDS colormap collection.** [Viridis source](https://github.com/BIDS/colormap/blob/master/colormaps.py), CC0. Optional map palette.

## Software and fonts

Application and build dependencies are pinned in `web/package-lock.json`. Direct tools include [React](https://react.dev/), [three.js](https://threejs.org/), [Zustand](https://github.com/pmndrs/zustand), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/) and [Vitest](https://vitest.dev/). The offline pipeline uses [Python](https://www.python.org/), [NumPy](https://numpy.org/), [Skyfield](https://rhodesmill.org/skyfield/), [Pillow](https://python-pillow.org/) and C++/OpenMP.

The application bundles **Geist** under the SIL Open Font License. Its notice is in [Geist-OFL.txt](../web/src/fonts/Geist-OFL.txt). Slides use Segoe UI as editable presentation text. PowerPoint or another presentation viewer may substitute a font if Segoe UI is unavailable.

Codex/ChatGPT and Claude assisted development. The refreshed presentation uses OpenAI’s presentation authoring tooling. Browser screenshots use Chromium/Playwright. See [SI disclosure metadata](si-disclosure.json).

## Screenshot and presentation credits

The images in `docs/demo/` capture Lunar Window running locally from main commit `e103f29`, with the simulated time set to November 15, 2026, 17:00 UTC. They show the application’s computed rendering from the sources above. They are not spacecraft photographs or SI image generations. Map colors describe modeled values. Crops in the deck retain the relevant interface content.

Slide text, layout, README and submission copy are SI-assisted. The deck visibly acknowledges that assistance and includes sources and presentation notes. The 29-second video combines slides with a real Chromium page recording and editorial captions, with no audio. It carries the same visible acknowledgment and an SI-assistance description in its MP4 metadata. FFmpeg performs encoding and full-file decoding checks. No generated NASA logos or mission emblems appear in the new materials. Earlier concept mockups are not included in the demo.

## License status

No repository-wide license has been declared for the team’s original code or documentation. The team must choose a license before describing the project as open source. This work does not add a license on behalf of all contributors.

NASA-hosted material, partner publications, fonts and software have their own credits and conditions. Follow the specific source’s terms rather than treating all linked material as public domain. See [NASA image and media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) and the [NASA brand guidelines](https://www.nasa.gov/nasa-brand-center/brand-guidelines/). No endorsement is implied.

## Submission guidance

The official [challenge](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/), [project submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) and [judging guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/) identify the task and evaluation context. The project-page instructions supplied by the team for this revision specify **up to seven English slides or a video of 30 seconds or less**. Direct retrieval of the guide pages was unavailable during this revision, so no unverified 2026 scoring weights are asserted.

