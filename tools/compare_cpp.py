#!/usr/bin/env python3
"""Compare the Rust simulator against the legacy C++ simulator.

Runs the C++ binary on a legacy parameter file, converts the same file
(`openTsiolkovsky-cli convert`), runs the Rust CLI on the result and reports
the largest differences of the vehicle trajectory (time-matched samples)
plus apogee and impact point.

    python3 tools/compare_cpp.py legacy_cpp/bin/param_momo.json

Needs the release CLI (`cargo build --release`) and the C++ binary
(`cd legacy_cpp && make`, Boost from Homebrew on macOS).
"""

import csv
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUST_BIN = ROOT / "target" / "release" / "openTsiolkovsky-cli"
CPP_BIN = ROOT / "legacy_cpp" / "bin" / "OpenTsiolkovsky"
# C++ column -> Rust trajectory.csv column
COLUMNS = {
    "mass(kg)": "mass_kg",
    "lat(deg)": "latitude_deg",
    "lon(deg)": "longitude_deg",
    "altitude(m)": "altitude_m",
    "vel_NED_X(m/s)": "vel_north_mps",
    "vel_NED_Y(m/s)": "vel_east_mps",
    "vel_NED_Z(m/s)": "vel_down_mps",
    "Mach number": "mach",
    "dynamic pressure(Pa)": "dynamic_pressure_pa",
}


def read_rows(path):
    """Numeric columns of every row (text columns such as flight_mode are left out)."""
    def num(v):
        try:
            return float(v)
        except ValueError:
            return None

    with open(path, newline="") as f:
        reader = csv.reader(f)
        header = [h.strip() for h in next(reader)]
        rows = []
        for r in reader:
            row = {h: num(v) for h, v in zip(header, r) if v.strip() != ""}
            row = {h: v for h, v in row.items() if v is not None}
            if "time(s)" in row or "time_s" in row:
                rows.append(row)
        return rows


def cpp_vehicle(out_dir, name, config):
    """Vehicle trajectory: each stage file from its start until the next stage starts."""
    files = sorted(out_dir.glob(f"{name}_dynamics_[0-9].csv"))
    segments = [read_rows(f) for f in files]
    rows = []
    for k, seg in enumerate(segments):
        end = segments[k + 1][0]["time(s)"] if k + 1 < len(segments) else math.inf
        rows += [r for r in seg if r["time(s)"] < end - 1e-9 or k + 1 == len(segments)]
    return rows


def main():
    config_path = Path(sys.argv[1]).resolve()
    config = json.loads(config_path.read_text())
    name = config["name(str)"]
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for f in config_path.parent.iterdir():
            if f.is_file():
                shutil.copy(f, tmp)
        (tmp / "output").mkdir()
        subprocess.run([str(CPP_BIN), config_path.name], cwd=tmp, check=True,
                       stdout=subprocess.DEVNULL)
        subprocess.run([str(RUST_BIN), "convert", config_path.name, "-o", "converted.json"],
                       cwd=tmp, check=True, stderr=subprocess.DEVNULL)
        subprocess.run([str(RUST_BIN), "run", "converted.json", "-o", "rust"], cwd=tmp,
                       check=True, stdout=subprocess.DEVNULL)
        cpp = cpp_vehicle(tmp / "output", name, config)
        rust = [{c: r[k] for c, k in COLUMNS.items() if k in r} | {"time(s)": r["time_s"]}
                for r in read_rows(tmp / "rust" / "trajectory.csv")]

    by_time = {round(r["time(s)"], 6): r for r in rust}
    worst = {c: (0.0, None) for c in COLUMNS}
    matched = 0
    for c in cpp:
        r = by_time.get(round(c["time(s)"], 6))
        if r is None:
            continue
        matched += 1
        for col in COLUMNS:
            if col in c and col in r:
                d = abs(c[col] - r[col])
                if d > worst[col][0]:
                    worst[col] = (d, c["time(s)"])
    print(f"{config_path.name}: {matched} matched samples "
          f"(C++ {len(cpp)}, Rust {len(rust)})")
    for col, (d, t) in worst.items():
        print(f"  max |diff| {col:22s} {d:14.6g}  at t = {t}")
    for label, rows in (("C++ ", cpp), ("Rust", rust)):
        top = max(rows, key=lambda r: r["altitude(m)"])
        last = rows[-1]
        print(f"  {label} apogee {top['altitude(m)']:.1f} m at {top['time(s)']:.2f} s; "
              f"last t {last['time(s)']:.2f} s alt {last['altitude(m)']:.1f} m "
              f"lat {last['lat(deg)']:.5f} lon {last['lon(deg)']:.5f}")


if __name__ == "__main__":
    main()
