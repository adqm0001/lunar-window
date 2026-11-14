from datetime import datetime, timezone

import numpy as np

from ephemeris import Ephemeris
import engine
from horizon import altaz, disc_fraction, horizon_at
from sites import SITES
from terrain import Terrain


def sunlit_stats(terrain, sun_km, site, observer_height_m):
    h = engine.horizon(site["lat"], site["lon"], 720, observer_height_m)[0]
    ground = float(terrain.height(site["lat"], site["lon"]))
    az, el = altaz(sun_km, site["lat"], site["lon"], ground + observer_height_m)
    frac = disc_fraction(el - horizon_at(h, az))
    return 100 * (frac > 0).mean(), 100 * (frac >= 0.5).mean(), 100 * frac.mean()


def main():
    e = Ephemeris()
    start = datetime(2020, 1, 1, tzinfo=timezone.utc)
    t = e.hourly(start, 366 * 24)
    sun, _ = e.moon_fixed(t)
    terrain = Terrain()
    rows = [s for s in SITES if "published" in s]
    print("Sunlit % over 2020 at LOLA-registered peaks vs Bussey et al. 2010 (Kaguya terrain)")
    print(f"{'site':26s} {'published':>9s} | {'any sun':>8s} {'half disc':>9s} {'mean':>6s}   (observer 2 m) | {'any sun @10 m':>13s}")
    errors = []
    for s in rows:
        any2, half2, mean2 = sunlit_stats(terrain, sun, s, 2.0)
        any10, _, _ = sunlit_stats(terrain, sun, s, 10.0)
        errors.append(half2 - s["published"]["sunlit_pct"])
        print(f"{s['name']:26s} {s['published']['sunlit_pct']:8d}% | {any2:7.1f}% {half2:8.1f}% {mean2:5.1f}%                 | {any10:12.1f}%")
    print(f"mean difference (half disc vs published): {np.mean(errors):+.1f} points, mean abs {np.mean(np.abs(errors)):.1f}")


if __name__ == "__main__":
    main()
