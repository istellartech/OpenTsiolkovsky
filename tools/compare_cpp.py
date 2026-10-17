#!/usr/bin/env python3
"""Compare the Rust simulator against the legacy C++ simulator.

Runs both on a parameter JSON and reports the largest differences of the
vehicle trajectory (time-matched samples) plus apogee and impact point.

    python3 tools/compare_cpp.py examples/param_sample_01.json

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
COLUMNS = ["mass(kg)", "lat(deg)", "lon(deg)", "altitude(m)", "vel_NED_X(m/s)",
           "vel_NED_Y(m/s)", "vel_NED_Z(m/s)", "Mach number", "dynamic pressure(Pa)"]


def read_rows(path):
    with open(path, newline="") as f:
        reader = csv.reader(f)
        header = [h.strip() for h in next(reader)]
        rows = []
        for r in reader:
            try:
                rows.append({h: float(v) for h, v in zip(header, r) if v.strip() != ""})
            except ValueError:
                continue
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
        subprocess.run([str(RUST_BIN), "-c", config_path.name, "-o", "rust"], cwd=tmp,
                       check=True, stdout=subprocess.DEVNULL)
        cpp = cpp_vehicle(tmp / "output", name, config)
        rust = read_rows(tmp / "rust_dynamics_cpp.csv")

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
