import argparse
import gzip
import json
from pathlib import Path

import numpy as np

import engine
from terrain import Terrain, hemisphere_sign, to_latlon

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"

EXTENT_M = 40000.0
CELL_M = 250.0
N_AZ = 180
OBSERVER_M = 2.0
Q_OFFSET = -8.0
Q_STEP = 0.1
MESH_CELL_M = 62.5
SLOPE_SAMPLE_M = 25.0
SAFE_SLOPE_DEG = 10.0


def save_gz(name, data: bytes):
    (OUT / name).write_bytes(gzip.compress(data, 9, mtime=0))
    for old in (OUT / name.removesuffix(".gz"),):
        if old.exists():
            old.unlink()


def grid_centers(extent, cell):
    n = int(round(2 * extent / cell))
    c = (np.arange(n) + 0.5) * cell - extent
    x, y = np.meshgrid(c, -c)
    return n, x, y


def field_suffix(hemisphere):
    hemisphere_sign(hemisphere)
    return "north" if hemisphere == "north" else "pole"


def build_horizon_field(hemisphere="south"):
    suffix = field_suffix(hemisphere)
    n, x, y = grid_centers(EXTENT_M, CELL_M)
    lat, lon = to_latlon(x.ravel(), y.ravel(), hemisphere)
    h = engine.horizon(lat, lon, N_AZ, OBSERVER_M, hemisphere=hemisphere)
    q = np.clip(np.round((h - Q_OFFSET) / Q_STEP), 0, 255).astype(np.uint8)
    layers = q.reshape(n, n, N_AZ).transpose(2, 0, 1).astype(np.int16)
    delta = np.diff(layers, axis=0, prepend=0).astype(np.uint8)
    save_gz(f"field_{suffix}.bin.gz", delta.tobytes())
    return n, h


def build_heights(terrain):
    suffix = field_suffix(terrain.hemisphere)
    n, x, y = grid_centers(EXTENT_M, MESH_CELL_M)
    z = terrain.height_xy(x, y)
    save_gz(f"heights_{suffix}.bin.gz", np.round(z).astype("<i2").tobytes())
    return n, float(np.nanmin(z)), float(np.nanmax(z))


def build_slope(terrain):
    suffix = field_suffix(terrain.hemisphere)
    n, x, y = grid_centers(EXTENT_M, SLOPE_SAMPLE_M)
    z = terrain.height_xy(x, y)
    dzr, dzc = np.gradient(z, SLOPE_SAMPLE_M)
    slope = np.degrees(np.arctan(np.hypot(dzr, dzc)))
    b = int(round(CELL_M / SLOPE_SAMPLE_M))
    m = n // b
    blocks = slope[: m * b, : m * b].reshape(m, b, m, b)
    mean = blocks.mean(axis=(1, 3))
    safe = (blocks < SAFE_SLOPE_DEG).mean(axis=(1, 3))
    out = np.stack([np.clip(np.round(mean * 4), 0, 255), np.round(safe * 100)]).astype(np.uint8)
    save_gz(f"slope_{suffix}.bin.gz", out.tobytes())
    return m


def main(hemisphere="south"):
    suffix = field_suffix(hemisphere)
    OUT.mkdir(parents=True, exist_ok=True)
    terrain = Terrain(hemisphere)
    n, h = build_horizon_field(hemisphere)
    mesh_n, zmin, zmax = build_heights(terrain)
    slope_n = build_slope(terrain)
    meta = {
        "extentMeters": EXTENT_M,
        "projection": f"{hemisphere} polar stereographic, R=1737.4 km, x east, y {'away from' if hemisphere == 'north' else 'toward'} lon 0, row 0 = +y",
        "horizon": {
            "file": f"field_{suffix}.bin.gz",
            "encoding": "gzip; byte deltas between consecutive azimuth layers (mod 256)",
            "size": n,
            "cellMeters": CELL_M,
            "azimuthBins": N_AZ,
            "observerHeightM": OBSERVER_M,
            "layout": "uint8 [azimuthBin][row][col], azimuth from local north toward east",
            "decode": {"offsetDeg": Q_OFFSET, "stepDeg": Q_STEP},
        },
        "heights": {"file": f"heights_{suffix}.bin.gz", "size": mesh_n, "cellMeters": MESH_CELL_M, "layout": "int16 meters [row][col]", "min": zmin, "max": zmax},
        "slope": {
            "file": f"slope_{suffix}.bin.gz",
            "size": slope_n,
            "cellMeters": CELL_M,
            "layout": "uint8 [layer][row][col]; layer 0 = mean slope deg * 4, layer 1 = % of cell under 10 deg",
        },
    }
    if hemisphere == "north":
        meta["hemisphere"] = "north"
    (OUT / f"field_{suffix}.json").write_bytes(json.dumps(meta, indent=2).encode("utf-8"))
    print(f"horizon field {n}x{n}x{N_AZ}, range {h.min():.1f} to {h.max():.1f} deg; heights {mesh_n}x{mesh_n} {zmin:.0f}..{zmax:.0f} m; slope {slope_n}x{slope_n}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build a LOLA polar horizon, height and slope field")
    parser.add_argument("--hemisphere", choices=("south", "north"), default="south")
    main(parser.parse_args().hemisphere)
