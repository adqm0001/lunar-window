import Icon from "./Icon";
import { useMemo } from "react";
import Modal from "./Modal";
import { percentOn } from "../lib/visibility";
import { getSeries, getThermal, useSeriesVersion } from "../state/seriesCache";
import { useApp } from "../state/store";
import { ephemYears } from "../lib/years";
import { iceVerdictPossible } from "../gpu/thermal";
import { thermalSpanLabel } from "../lib/siteThermal";

// Results of the offline pipeline run for 2020 (pipeline/validate_illumination.py), same year as
// the published study. The 2026 column is recomputed live in the browser.
const OURS_2020: Record<string, number> = {
  "shackleton-a": 86.3,
  "connecting-ridge-b": 89.2,
  "de-gerlache-c": 83.8,
  "shackleton-peak-d": 85.1,
  "malapert-m1": 77.7,
};

export default function ValidationPanel({ onClose }: { onClose: () => void }) {
  const data = useApp((s) => s.data)!;
  const seriesVersion = useSeriesVersion();

  // Live values stay null until the compute worker has the site's series.
  const peaks = useMemo(() => {
    const year = Math.min(24 * 365, data.ephem.count);
    return data.sites
      .filter((s) => s.published)
      .map((s) => {
        const series = getSeries(data.ephem, s);
        const live = series && percentOn(series.sun, 0, year, (v) => v >= 128);
        return { site: s, published: s.published!.sunlit_pct, y2020: OURS_2020[s.id], y2026: live };
      });
  }, [data, seriesVersion]);

  const thermal = useMemo(() => {
    const at = (id: string) => {
      const site = data.sites.find((s) => s.id === id);
      return site ? getThermal(data.ephem, site, 0, 24 * 365) : null;
    };
    return { a: at("apollo-11"), b: at("shackleton-floor") };
  }, [data, seriesVersion]);

  const meanAbs = peaks.length ? peaks.reduce((s, p) => s + Math.abs(p.y2020 - p.published), 0) / peaks.length : 0;

  return (
    <Modal className="validation" title="How do we know it's right?"
      subtitle="How our estimates compare with NASA tools and published measurements" onClose={onClose}>

        <section>
          <h3>
            <span className="ok"><Icon name="check" /></span> Sun and Earth positions
          </h3>
          <p>
            We checked the Sun and Earth's positions against JPL Horizons daily for one year at three sites. The largest difference in elevation
            was <b>0.00003°</b>, about 1/20,000 of the Sun's width.
          </p>
        </section>

        <section>
          <h3>
            <span className="ok"><Icon name="check" /></span> Sunlight at five polar peaks
          </h3>
          <p>
            We count an hour as sunlit when at least half the Sun's disc clears the terrain. Across five peaks in 2020, our yearly estimates
            differed from those of Bussey et al. (2010), based on Japan's Kaguya terrain, by <b>{meanAbs.toFixed(1)} percentage points</b> on average.
          </p>
          <table className="vtable">
            <thead>
              <tr>
                <th>Peak</th>
                <th>Published</th>
                <th>Ours, 2020</th>
                <th>Ours, 2026 (live)</th>
              </tr>
            </thead>
            <tbody>
              {peaks.map((p) => (
                <tr key={p.site.id}>
                  <td>{p.site.name}</td>
                  <td>{p.published}%</td>
                  <td>
                    {p.y2020?.toFixed(1)}% <Diff d={p.y2020 - p.published} />
                  </td>
                  <td>{p.y2026 === null ? "…" : `${p.y2026.toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            The published coordinates fall 50 to 160 m below the corresponding summits on the LOLA map. At those points, the hill itself can block
            the Sun, so we used the LOLA summit locations for the comparison. The two elevation datasets differ in detail and resolution.
          </p>
        </section>

        <section>
          <h3>
            <span className="ok"><Icon name="check" /></span> Ground temperature
          </h3>
          <p>We compare the temperatures from our soil model with published measurements from Diviner on NASA's Lunar Reconnaissance Orbiter.</p>
          <table className="vtable">
            <thead>
              <tr>
                <th>Place</th>
                <th>Measured by Diviner</th>
                <th>Our model (2026, live)</th>
              </tr>
            </thead>
            <tbody>
              {thermal.a && (
                <tr>
                  <td>Equator (Apollo 11 site)</td>
                  <td>≈ 95 K at night, ≈ 390 K at noon</td>
                  <td>
                    {Math.round(thermal.a.min)} K / {Math.round(thermal.a.max)} K
                  </td>
                </tr>
              )}
              {thermal.b && (
                <tr>
                  <td>Shackleton crater floor (never sunlit)</td>
                  <td>below 110 K all year: a cold trap</td>
                  <td>
                    {Math.round(thermal.b.min)}–{Math.round(thermal.b.max)} K ·{" "}
                    {iceVerdictPossible(thermal.b.hours)
                      ? `ice ${thermal.b.iceDepth === 0 ? "stable at the surface" : thermal.b.iceDepth > 0 ? "stable below" : "unstable"}`
                      : `over ${thermalSpanLabel(thermal.b.hours)} only: no full-year ice verdict`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="muted">
            Sources: Williams et al. 2017 (Icarus) for global Diviner temperatures; Paige et al. 2010 (Science) for polar cold traps; soil properties from Hayne
            et al. 2017; light and heat bounced off crater walls from Ingersoll et al. 1992 (Icarus).{" "}
            {thermal.b && !iceVerdictPossible(thermal.b.hours)
              ? `Both are hourly heat flow over the ${thermalSpanLabel(thermal.b.hours)} of data available, run in your browser.`
              : "Both are a full year of hourly heat flow, run in your browser."}
          </p>
            <p className="muted">
              The temperature and ice maps warm the soil model for up to four lunar days before the displayed period and include every sampled step in
              that period. Where earlier data is missing, the maps use conditions from twelve lunar days later if available. The site estimates above
              use a different warm-up, so short-period site and map temperatures can differ.
            </p>
        </section>

        <section>
          <h3>
            <span className="ok"><Icon name="check" /></span> Terrain and sunlight maps
          </h3>
          <p>
            The browser's sunlight maps match the reference maps from our C++ terrain model to four decimal places. The polar view uses the same
            skyline data to draw shadows. We also checked the terrain tiles against the NASA files. The Shackleton floor is −2788 m in the tile and −2789 m in the source.
          </p>
        </section>

        <section>
          <h3>
            <span className="warn">!</span> What it leaves out
          </h3>
          <ul>
            <li>Terrain is NASA LOLA: 40 m near the pole, 80 m to 85°S, 474 m elsewhere. Rocks smaller than that are not in the data.</li>
            <li>Small craters you see up close are generated for looks only; they never affect any number.</li>
            <li>Light and heat bounced off surrounding slopes use a single-bounce crater approximation: multiple reflections and walls cooling after sunset are left out.</li>
            <li>Sun and Earth positions cover {ephemYears(data.ephem).label}.</li>
          </ul>
        </section>
    </Modal>
  );
}

function Diff({ d }: { d: number }) {
  return <span className={Math.abs(d) <= 5 ? "diff good" : "diff"}>{d >= 0 ? "+" : ""}{d.toFixed(1)}</span>;
}
