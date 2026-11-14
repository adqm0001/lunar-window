import numpy as np

from terrain import R_MOON


def destination(lat_deg, lon_deg, azimuth_deg, distance_m):
    p1 = np.radians(lat_deg)
    l1 = np.radians(lon_deg)
    th = np.radians(azimuth_deg)
    dd = np.asarray(distance_m) / R_MOON
    p2 = np.arcsin(np.sin(p1) * np.cos(dd) + np.cos(p1) * np.sin(dd) * np.cos(th))
    l2 = l1 + np.arctan2(np.sin(th) * np.sin(dd) * np.cos(p1), np.cos(dd) - np.sin(p1) * np.sin(p2))
    return np.degrees(p2), np.degrees((l2 + np.pi) % (2 * np.pi) - np.pi)
