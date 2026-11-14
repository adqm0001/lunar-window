import json
import struct
import zlib
from pathlib import Path

import numpy as np

from terrain import Terrain

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
EXTENT_M = 180000.0
SIZE = 1500


def write_png(path, gray):
    h, w = gray.shape
    raw = b"".join(b"\x00" + gray[r].tobytes() for r in range(h))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def hillshade(z, cell, azimuth_deg=315.0, altitude_deg=35.0):
    dzdrow, dzdx = np.gradient(z, cell)
    slope = np.arctan(np.hypot(dzdx, dzdrow))
    aspect = np.arctan2(dzdrow, -dzdx)
    az = np.radians(360.0 - azimuth_deg + 90.0)
    alt = np.radians(altitude_deg)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0, 1)


def main():
    terrain = Terrain()
    cell = 2 * EXTENT_M / SIZE
    coords = (np.arange(SIZE) + 0.5) * cell - EXTENT_M
    x, y = np.meshgrid(coords, -coords)
    z = terrain.height_xy(x, y)
    z = np.where(np.isnan(z), np.nanmin(z), z)
    shade = hillshade(z, cell)
    zn = (z - z.min()) / (z.max() - z.min())
    gray = np.clip(255 * (0.75 * shade + 0.25 * zn), 0, 255).astype(np.uint8)
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / "basemap.png", gray)
    meta = {"extentMeters": EXTENT_M, "sizePx": SIZE, "projection": "south polar stereographic, R=1737.4 km, lon 0 up"}
    (OUT / "basemap.json").write_text(json.dumps(meta, indent=2))
    print(f"wrote {OUT / 'basemap.png'}")


if __name__ == "__main__":
    main()
