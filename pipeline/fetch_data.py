import sys
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"

PDS = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img"
NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"

FILES = {
    "ldem_85s_40m.img": (f"{PDS}/ldem_85s_40m.img", 115034112),
    "ldem_75s_240m.img": (f"{PDS}/ldem_75s_240m.img", 29062688),
    "ldem_85n_40m.img": (f"{PDS}/ldem_85n_40m.img", 115034112),
    "ldem_75n_240m.img": (f"{PDS}/ldem_75n_240m.img", 29062688),
    "de421.bsp": (f"{NAIF}/spk/planets/a_old_versions/de421.bsp", 16790528),
    "moon_pa_de421_1900-2050.bpc": (f"{NAIF}/pck/moon_pa_de421_1900-2050.bpc", 1770496),
    "moon_080317.tf": (f"{NAIF}/fk/satellites/moon_080317.tf", None),
    "naif0012.tls": (f"{NAIF}/lsk/naif0012.tls", None),
}


def fetch(name, url, size):
    dest = RAW / name
    if dest.exists() and (size is None or dest.stat().st_size == size):
        print(f"ok        {name}")
        return
    print(f"download  {name}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url) as resp, open(tmp, "wb") as out:
        while chunk := resp.read(1 << 20):
            out.write(chunk)
    if size is not None and tmp.stat().st_size != size:
        tmp.unlink()
        sys.exit(f"size mismatch for {name}")
    tmp.replace(dest)


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    for name, (url, size) in FILES.items():
        fetch(name, url, size)


if __name__ == "__main__":
    main()
