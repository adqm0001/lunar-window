import { useMemo } from "react";
import { createPortal } from "react-dom";
import { percentOn } from "../lib/visibility";
import { siteThermal } from "../lib/siteThermal";
import { getSeries, useSeriesVersion } from "../state/seriesCache";
import { useApp } from "../state/store";

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
      const series = site && getSeries(data.ephem, site);
      return site && series ? siteThermal(data.ephem, site, 0, 24 * 365, series) : null;
    };
    return { a: at("apollo-11"), b: at("shackleton-floor") };
  }, [data, seriesVersion]);

  const meanAbs = peaks.length ? peaks.reduce((s, p) => s + Math.abs(p.y2020 - p.published), 0) / peaks.length : 0;

  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="glass modal validation" onClick={(e) => e.stopPropagation()}>
        <div className="finder-head">
          <div>
            <div className="finder-title">How do we know it's right?</div>
            <div className="finder-sub">Every number in Lunar Window is checked against NASA tools or published measurements</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <section>
          <h3>
            <span className="ok">✓</span> Sun and Earth positions
          </h3>
          <p>
            Our positions (JPL DE421 ephemeris, Moon body-fixed frame) were compared with NASA JPL's Horizons service for 3 sites, every day of a year, for both
            the Sun and Earth. Largest difference: <b>0.00003°</b>, about 1/20,000 of the Sun's width.
          </p>
        </section>

        <section>
          <h3>
            <span className="ok">✓</span> Sunlight at the famous "peaks of light"
          </h3>
          <p>
            Share of the year with at least half the Sun's disc above the real terrain horizon, compared with Bussey et al. 2010 (Icarus), which used Japan's
            Kaguya terrain. Average difference for the same year: <b>{meanAbs.toFixed(1)} percentage points</b>.
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
            Lesson learned: the paper's coordinates land 50–160 m below each summit on NASA's LOLA map (the two spacecraft maps are offset), where the hill
            itself blocks the Sun. Using the LOLA summits fixed it. The remaining gap comes from different terrain data and resolution.
          </p>
        </section>

        <section>
          <h3>
            <span className="ok">✓</span> Ground temperature
          </h3>
          <p>Our soil heat-flow model against NASA's Diviner thermal instrument on the Lunar Reconnaissance Orbiter:</p>
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
                    {Math.round(thermal.b.max)} K max · ice {thermal.b.iceDepth === 0 ? "stable at the surface" : thermal.b.iceDepth > 0 ? "stable below" : "unstable"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="muted">
            Sources: Williams et al. 2017 (Icarus) for global Diviner temperatures; Paige et al. 2010 (Science) for polar cold traps; soil properties from Hayne
            et al. 2017. Both are a full year of hourly heat flow, run in your browser.
          </p>
        </section>

        <section>
          <h3>
            <span className="ok">✓</span> Engines agree with each other
          </h3>
          <p>
            The C++ horizon engine (6 billion terrain lookups on 8 cores) builds the horizon data. The browser's GPU engine reproduces the reference sunlight
            maps computed from it to 4 decimal places, and the 3D shadows use that same horizon data, so what you see is what is computed. Terrain tiles were checked against the original NASA
            files (Shackleton floor: −2788 m vs −2789 m).
          </p>
        </section>

        <section>
          <h3>
            <span className="warn">!</span> What it leaves out
          </h3>
          <ul>
            <li>Terrain is NASA LOLA: 40 m near the pole, 80 m to 85°S, 474 m elsewhere. Rocks smaller than that are not in the data.</li>
            <li>Small craters you see up close are generated for looks only; they never affect any number.</li>
            <li>Temperatures ignore light and heat bounced from nearby slopes, so the darkest floors come out colder than measured (≈25 K vs 30–50 K).</li>
            <li>Sun and Earth positions cover 2026–2028.</li>
          </ul>
        </section>
      </div>
    </div>,
    document.body,
  );
}

function Diff({ d }: { d: number }) {
  return <span className={Math.abs(d) <= 5 ? "diff good" : "diff"}>{d >= 0 ? "+" : ""}{d.toFixed(1)}</span>;
}
