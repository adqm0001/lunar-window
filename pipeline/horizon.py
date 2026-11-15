import numpy as np

from terrain import R_MOON, hemisphere_sign

SUN_RADIUS_DEG = 0.2665


def local_frame(lat_deg, lon_deg):
    lat = np.radians(np.asarray(lat_deg, dtype=np.float64))
    lon = np.radians(np.asarray(lon_deg, dtype=np.float64))
    up = np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)
    east = np.stack([-np.sin(lon), np.cos(lon), np.zeros_like(lon)], axis=-1)
    north = np.cross(up, east)
    return up, east, north


def ray_distances(max_m=250_000.0, first_m=40.0, growth=0.035):
    d = [first_m]
    while d[-1] < max_m:
        d.append(d[-1] + max(first_m, d[-1] * growth))
    return np.array(d)


def horizon(terrain, lat_deg, lon_deg, n_az, observer_height_m=2.0, chunk=48, progress=None):
    pole = hemisphere_sign(getattr(terrain, "hemisphere", "south"))
    lat_deg = np.atleast_1d(np.asarray(lat_deg, dtype=np.float64))
    lon_deg = np.atleast_1d(np.asarray(lon_deg, dtype=np.float64))
    n = lat_deg.size
    az = np.radians(np.arange(n_az) * 360.0 / n_az)
    dist = ray_distances()
    delta = dist / R_MOON
    cd = np.cos(delta)
    sd = np.sin(delta)
    up, east, north = local_frame(lat_deg, lon_deg)
    h0 = terrain.height(lat_deg, lon_deg)
    r0_all = R_MOON + np.nan_to_num(h0) + observer_height_m
    out = np.empty((n, n_az), dtype=np.float32)
    ca = np.cos(az)[None, :, None]
    sa = np.sin(az)[None, :, None]
    for i in range(0, n, chunk):
        s = slice(i, min(i + chunk, n))
        u = up[s][:, None, :]
        t = ca * north[s][:, None, :] + sa * east[s][:, None, :]
        d = cd[None, None, :, None] * u[:, :, None, :] + sd[None, None, :, None] * t[:, :, None, :]
        k = 2 * R_MOON / (1 + pole * d[..., 2])
        h = terrain.height_xy(k * d[..., 1], -pole * k * d[..., 0])
        r = R_MOON + h
        r0 = r0_all[s][:, None, None]
        num = r * cd - r0
        den = np.sqrt(r * r + r0 * r0 - 2 * r * r0 * cd)
        el = np.degrees(np.arcsin(np.clip(num / den, -1, 1)))
        el = np.where(np.isnan(el), -90.0, el)
        out[s] = el.max(axis=2)
        if progress:
            progress(min(i + chunk, n), n)
    return out


def flat_horizon(n_az, observer_height_m=2.0):
    dip = -np.degrees(np.arccos(R_MOON / (R_MOON + observer_height_m)))
    return np.full(n_az, dip, dtype=np.float32)


def horizon_at(h, az_deg):
    n = h.shape[-1]
    f = (np.asarray(az_deg) % 360.0) / 360.0 * n
    i0 = np.floor(f).astype(np.int64) % n
    i1 = (i0 + 1) % n
    w = f - np.floor(f)
    return h[..., i0] * (1 - w) + h[..., i1] * w


def disc_fraction(center_above_deg, radius_deg=SUN_RADIUS_DEG):
    d = np.clip(np.asarray(center_above_deg) / radius_deg, -1, 1)
    return (np.arccos(-d) + d * np.sqrt(1 - d * d)) / np.pi


def altaz(vectors_km, lat_deg, lon_deg, height_m=0.0):
    up, east, north = local_frame(lat_deg, lon_deg)
    site = up * (R_MOON + height_m) / 1000.0
    v = vectors_km - site
    v = v / np.linalg.norm(v, axis=-1, keepdims=True)
    el = np.degrees(np.arcsin(v @ up))
    az = np.degrees(np.arctan2(v @ east, v @ north)) % 360.0
    return az, el
