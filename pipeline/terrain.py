from pathlib import Path

import numpy as np

R_MOON = 1737400.0
RAW = Path(__file__).resolve().parent.parent / "data" / "raw"


def to_map(lat_deg, lon_deg):
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    k = 2 * R_MOON * np.tan(np.pi / 4 + lat / 2)
    return k * np.sin(lon), k * np.cos(lon)


def to_latlon(x, y):
    rho = np.hypot(x, y)
    lat = -(np.pi / 2 - 2 * np.arctan(rho / (2 * R_MOON)))
    lon = np.arctan2(x, y)
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
    def __init__(self):
        self.fine = PolarDem("ldem_85s_40m.img", 7584, 40.0)
        self.coarse = PolarDem("ldem_75s_240m.img", 3812, 240.0)

    def covers(self, lat_deg, lon_deg):
        x, y = to_map(lat_deg, lon_deg)
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
        x, y = to_map(lat_deg, lon_deg)
        return self.height_xy(x, y)
