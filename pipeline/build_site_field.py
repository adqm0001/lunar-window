"""Build the 5 km Connecting ridge B field: python pipeline/build_site_field.py."""

import gzip
import json
from pathlib import Path

import numpy as np

import engine
from build_field import (
    N_AZ, OBSERVER_M, Q_OFFSET, Q_STEP, SAFE_SLOPE_DEG, grid_centers,
)
from sites import SITES
from terrain import Terrain, to_latlon, to_map

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
EXTENT_M = 2500.0
CELL_M = 20.0
MESH_CELL_M = 5.0
SLOPE_SAMPLE_M = 5.0
SITE = next(site for site in SITES if site["id"] == "connecting-ridge-b")


def field_center():
    x, y = to_map(SITE["lat"], SITE["lon"])
    # Pole cell centres are 125 + 250*k metres. A centre at 5 mod 10
    # gives exact shared centres every 500 m with this even-sized 20 m grid.
    return tuple(float(np.round((v - 5) / 10) * 10 + 5) for v in (x, y))


def site_grid(cell):
    n, x, y = grid_centers(EXTENT_M, cell)
    cx, cy = field_center()
    return n, x + cx, y + cy


def encode_horizons(h, n):
    if h.shape != (n * n, N_AZ) or not np.isfinite(h).all():
        raise ValueError("Expected finite [point][azimuth] horizons")
    # Preserve the pole field's byte range, including its 17.5 degree ceiling.
    q = np.clip(np.round((h - Q_OFFSET) / Q_STEP), 0, 255).astype(np.uint8)
    layers = q.reshape(n, n, N_AZ).transpose(2, 0, 1).astype(np.int16)
    return np.diff(layers, axis=0, prepend=0).astype(np.uint8).tobytes()


def slope_layers(z):
    dzr, dzc = np.gradient(z, SLOPE_SAMPLE_M)
    slope = np.degrees(np.arctan(np.hypot(dzr, dzc)))
    b = int(CELL_M / SLOPE_SAMPLE_M)
    n = z.shape[0] // b
    blocks = slope.reshape(n, b, n, b)
    mean = blocks.mean(axis=(1, 3))
    safe = (blocks < SAFE_SLOPE_DEG).mean(axis=(1, 3))
    return np.stack([
        np.clip(np.round(mean * 4), 0, 255), np.round(safe * 100),
    ]).astype(np.uint8)


def save_gz(name, data):
    (OUT / name).write_bytes(gzip.compress(data, compresslevel=9, mtime=0))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    terrain = Terrain()
    n, x, y = site_grid(CELL_M)
    lat, lon = to_latlon(x.ravel(), y.ravel())
    h = engine.horizon(lat, lon, N_AZ, OBSERVER_M)
    save_gz("field_ridge_b.bin.gz", encode_horizons(h, n))

    mesh_n, mx, my = site_grid(MESH_CELL_M)
    z = terrain.height_xy(mx, my)
    if not np.isfinite(z).all():
        raise ValueError("The site field lies outside terrain coverage")
    save_gz("heights_ridge_b.bin.gz", np.round(z).astype("<i2").tobytes())
    # Same 5 m grid as the mesh; slopes still use the measured 40 m DEM,
    # bilinearly interpolated, with no procedural terrain added.
    slope = slope_layers(z)
    save_gz("slope_ridge_b.bin.gz", slope.tobytes())

    cx, cy = field_center()
    meta = {
        "extentMeters": EXTENT_M,
        "centerX": cx, "centerY": cy, "label": SITE["name"],
        "source": "LOLA 40 m south polar DEM (240 m distant terrain); 20 m sampling, not 20 m native terrain resolution",
        "projection": "south polar stereographic, R=1737.4 km, x east, y toward lon 0, row 0 = +y",
        "horizon": {
            "file": "field_ridge_b.bin.gz",
            "encoding": "gzip; byte deltas between consecutive azimuth layers (mod 256); elevations clamped to -8..17.5 deg as in field_pole",
            "size": n, "cellMeters": CELL_M, "azimuthBins": N_AZ,
            "observerHeightM": OBSERVER_M,
            "layout": "uint8 [azimuthBin][row][col], azimuth from local north toward east",
            "decode": {"offsetDeg": Q_OFFSET, "stepDeg": Q_STEP},
        },
        "heights": {
            "file": "heights_ridge_b.bin.gz", "size": mesh_n,
            "cellMeters": MESH_CELL_M, "layout": "int16 meters [row][col]",
            "min": float(z.min()), "max": float(z.max()),
        },
        "slope": {
            "file": "slope_ridge_b.bin.gz", "size": n, "cellMeters": CELL_M,
            "layout": "uint8 [layer][row][col]; layer 0 = mean slope deg * 4, layer 1 = % of cell under 10 deg",
        },
    }
    (OUT / "field_ridge_b.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"{SITE['name']}: horizon {n}x{n}x{N_AZ}, {h.min():.1f}..{h.max():.1f} deg; "
          f"heights {mesh_n}x{mesh_n}, {z.min():.0f}..{z.max():.0f} m; "
          f"centre ({cx}, {cy}) m")


if __name__ == "__main__":
    main()
