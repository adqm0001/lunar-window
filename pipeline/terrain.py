from pathlib import Path

import numpy as np

R_MOON = 1737400.0
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"


def hemisphere_sign(hemisphere):
    if hemisphere not in ("north", "south"):
        raise ValueError("hemisphere must be 'north' or 'south'")
    return 1 if hemisphere == "north" else -1


def to_map(lat_deg, lon_deg, hemisphere="south"):
    pole = hemisphere_sign(hemisphere)
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    # LOLA polar stereographic convention: north has -y toward lon 0.
    # https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_85n_40m.lbl
    k = 2 * R_MOON * np.tan(np.pi / 4 - pole * lat / 2)
    return k * np.sin(lon), -pole * k * np.cos(lon)


def to_latlon(x, y, hemisphere="south"):
    pole = hemisphere_sign(hemisphere)
    rho = np.hypot(x, y)
    lat = pole * (np.pi / 2 - 2 * np.arctan(rho / (2 * R_MOON)))
    lon = np.arctan2(x, -pole * np.asarray(y))
    return np.degrees(lat), np.degrees(lon)


def to_cartesian(lat_deg, lon_deg, radius):
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    return np.stack(
        [
            radius * np.cos(lat) * np.cos(lon),
            radius * np.cos(lat) * np.sin(lon),
            radius * np.sin(lat),
        ],
        axis=-1,
    )


class PolarDem:
    def __init__(self, filename, size, scale_m):
        self.data = np.fromfile(RAW / filename, dtype="<i2").reshape(size, size)
        self.size = size
        self.scale = scale_m
        self.center = (size - 1) / 2
        self.valid_radius = 0.98 * self.center * scale_m

    def height(self, x, y):
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        col = self.center + x / self.scale
        row = self.center - y / self.scale
        c0 = np.floor(col).astype(np.int64)
        r0 = np.floor(row).astype(np.int64)
        inside = (np.hypot(x, y) < self.valid_radius) & (c0 >= 0) & (r0 >= 0) & (c0 < self.size - 1) & (r0 < self.size - 1)
        c0 = np.where(inside, c0, 0)
        r0 = np.where(inside, r0, 0)
        fc = col - c0
        fr = row - r0
        d = self.data
        h = (
            d[r0, c0] * (1 - fc) * (1 - fr)
            + d[r0, c0 + 1] * fc * (1 - fr)
            + d[r0 + 1, c0] * (1 - fc) * fr
            + d[r0 + 1, c0 + 1] * fc * fr
        ) * 0.5
        return np.where(inside, h, np.nan)


class Terrain:
    def __init__(self, hemisphere="south"):
        hemisphere_sign(hemisphere)
        self.hemisphere = hemisphere
        self.fine = PolarDem(f"ldem_85{hemisphere[0]}_40m.img", 7584, 40.0)
        self.coarse = PolarDem(f"ldem_75{hemisphere[0]}_240m.img", 3812, 240.0)

    def covers(self, lat_deg, lon_deg):
        x, y = to_map(lat_deg, lon_deg, self.hemisphere)
        return bool(np.hypot(x, y) < self.coarse.valid_radius)

    def height_xy(self, x, y):
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        h = self.fine.height(x, y)
        miss = np.isnan(h)
        if miss.any():
            h[miss] = self.coarse.height(x[miss], y[miss])
        return h

    def height(self, lat_deg, lon_deg):
        x, y = to_map(lat_deg, lon_deg, self.hemisphere)
        return self.height_xy(x, y)
