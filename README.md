# OpenTsiolkovsky   [![CI](https://github.com/istellartech/OpenTsiolkovsky/workflows/ci/badge.svg)](https://github.com/istellartech/OpenTsiolkovsky/actions)

![OpenTsiolkovsky](docs/OpenTsiolkovsky_Logo_small.png)

OpenTsiolkovsky is an open-source rocket flight simulator. The simulation core is written in Rust and runs both as a command-line tool and, compiled to WebAssembly, in a web app that needs no server. A legacy C++ implementation is kept for reference.

## Features

### Simulation core (Rust)
- Three-degree-of-freedom (point-mass) flight with a commanded attitude: constant elevation/azimuth/roll or a time-based attitude program, with mounting misalignment (yaw/pitch/roll offsets) and gyro bias drift
- Multi-stage vehicles with burn, forced cutoff, separation and coast times per stage; the burn ends when the propellant (initial minus dry mass) runs out
- Thrust and Isp as constants or time tables, with nozzle exit-pressure losses and the C++ thrust/Isp coefficients; optional thrust trim that balances the aerodynamic moment from CG/CP positions ("attitude neutrality")
- Launch pad hold until the thrust exceeds the weight, and an optional launcher rail
- Aerodynamics from constant or Mach x angle CA/CN tables (normal force at the total angle of attack), with optional per-stage diameter and coefficients; ballistic-coefficient descent
- Standard atmosphere as in the C++ version or the U.S. Standard Atmosphere 1976 (geopotential altitude, tabulated to 1000 km), density variation by ratio or table, constant or altitude-dependent wind, Earth rotation, J2 gravity, WGS84 geodesy
- Free-flight modes as in the C++ version: aerodynamically stable, commanded attitude or ballistic; the flight mode is reported with every sample
- Flight events located by root finding: ignition, liftoff, rail exit, Mach 1, max-Q, burnout, separation, dump, apogee and impact; orbital elements at burnout
- Instantaneous impact point (IIP) on the WGS84 ellipsoid at every sample
- Spent stages and dumping products (fairings, etc.) are flown to the ground after release, giving their impact points
- Monte Carlo dispersion analysis of impact points (thrust, Isp, mass, drag, CN, attitude, separation time, wind, air density; normal or uniform, per stage or vehicle-wide), with mean points and 1-sigma / 95 % / 99 % error ellipses per body
- RK4 or adaptive RK45 integration
- Covers sounding-rocket and low-Earth-orbit trajectories; checked against the legacy C++ simulator in the test suite ([physics and numerics](docs/physics.md))

### Command-line interface
- Reads the classic `param_*.json` files together with the CSV tables they reference (thrust, Isp, CN/CA, attitude, wind)
- Writes `<name>_trajectory.csv`, a `<name>_summary.json` (with flight events and orbital elements) and `<name>_dynamics_cpp.csv` (column-compatible with the legacy C++ output) — see [output files](docs/output.md)
- Writes `<name>_dynamics_cpp_<N>_fall.csv` / `<name>_dynamics_cpp_<N>_dump.csv` for each spent stage / dumping product and prints every impact point
- `--monte-carlo N` runs a dispersion analysis on all CPU cores (`--dispersion FILE`, `--seed S`) and writes `<name>_montecarlo.csv` and `<name>_montecarlo_summary.json`

### For AI agents ([details and current status](docs/ai.md#対応状況v050-時点))
- `run --json` / `validate --json`: one JSON document on stdout, stable error kinds and exit status (3 = invalid configuration)
- `schema`: JSON Schema of the parameter file (units, defaults) and of the dispersion file
- `mcp`: a Model Context Protocol server on stdio with tools to validate, fly, run Monte Carlo and create web app links — for Claude Code, Claude Desktop and other MCP clients
- `share`: a link that opens a parameter file, with its CSV tables, in the web app
- Not yet: remote (HTTP) MCP, and AI control of the web app itself — agents hand configurations to the web app only through links (`/llms.txt` on the site describes the format)

### Web app ([details](frontend/README.md))
- **Live:** results follow every input change. The solver runs in a Web Worker, so the page stays responsive.
- **Visual:** a 3D globe (CesiumJS, Esri basemaps), charts, an event table and telemetry, all on a shared playback timeline.
- **Impact analysis:** fall paths and impact points of spent stages and jettisoned parts, the IIP track, the flight mode, and a Monte Carlo "Dispersion" tab that draws impact scatter and 3-sigma ellipses on the globe.
- **Sample vehicles** built from published data: MOMO, S-310, S-520, SS-520-5, Epsilon, H-IIA, H3, Saturn V, Ariane 5, Falcon 9, Soyuz-2.1a and Long March 3B/E. Each comes with sources and modelling notes; the picker filters them by type and country and has a search box.
- **Files:**
  - Opens CLI `param_*.json` files together with their CSV tables; results match the CLI.
  - Exports trajectory CSV, KML for Google Earth, the settings JSON and chart PNGs.
- **Editing:**
  - Undo/redo.
  - Shareable links: the settings travel in the URL fragment and are never sent to a server.
  - "Pin to compare" overlays an earlier result and shows the differences.
- **Interface:** Japanese/English, light/dark theme, keyboard shortcuts (`?`).

## Quick Start

### Prerequisites
- Rust (stable) + Cargo
- For the web app:
  - [Bun](https://bun.sh/) v1+
  - Node.js 22.18+ (the [Vite+](https://viteplus.dev/) toolchain runs on it)
  - [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

### Command line
```bash
# Build and run the Rust CLI
cargo run --bin openTsiolkovsky-cli -- --config examples/param_sample_01.json --verbose

# Or build a release binary
cargo build --release
./target/release/openTsiolkovsky-cli --config examples/param_sample_01.json --output my_result
# -> my_result_trajectory.csv, my_result_summary.json, my_result_dynamics_cpp.csv
#    (+ my_result_dynamics_cpp_<N>_fall.csv / _<N>_dump.csv for spent stages / dumping products)

# Monte Carlo dispersion of impact points (1-sigma values in examples/dispersion_sample.json)
./target/release/openTsiolkovsky-cli --config examples/SS-520-4/param_SS520-4.json \
  --output ss520 --monte-carlo 500 --dispersion examples/dispersion_sample.json --seed 1
# -> ss520_montecarlo.csv (one row per case), ss520_montecarlo_summary.json (mean point and error ellipse per body)
```

More examples are in [`examples/`](examples/), e.g. `param_momo.json` and `SS-520-4/` (with CSV tables).

### AI agents and scripts
```bash
B=./target/release/openTsiolkovsky-cli
$B schema > param.schema.json                      # JSON Schema of param_*.json
$B validate -c examples/param_momo.json --json     # check without flying (exit 3 if invalid)
$B run -c examples/param_momo.json -o out/momo --json --trajectory-points 50
$B share -c examples/SS-520-4/param_SS520-4.json   # web app link with the CSV tables embedded

# MCP server for Claude Code (Claude Desktop: see docs/ai.md)
claude mcp add opentsiolkovsky -- "$PWD/target/release/openTsiolkovsky-cli" mcp
```

### Web app
```bash
cd frontend
bun install
bun run dev          # builds the WASM bundle first if frontend/src/wasm is missing
# open http://localhost:5173
```

Development commands (Vite+ — `vp` is installed in `frontend/node_modules`):
```bash
bunx vp check        # format check (Oxfmt), lint (Oxlint) and type check
bunx vp test run     # unit tests + every sample vehicle through the WASM solver
bun run build        # WASM build -> vp check -> production build in frontend/dist
```

### WASM only
```bash
bash scripts/wasm_build.sh   # outputs to frontend/src/wasm
```

## Project Structure
```
OpenTsiolkovsky/
├── src/              # Rust simulation core, CLI (main.rs), agent/MCP interface (agent.rs, mcp.rs) and WASM bindings (wasm.rs)
├── tests/            # Rust integration tests (incl. regression against the C++ output)
├── examples/         # CLI parameter files and CSV tables
├── frontend/         # Web app (React + TypeScript, Vite+, CesiumJS, Chart.js)
├── legacy_cpp/       # Legacy C++ implementation (reference)
├── scripts/          # Build scripts (WASM, Vercel)
├── tools/            # compare_cpp.py: run the Rust and C++ simulators side by side
└── docs/             # Documentation
```

## Documentation
- [Quick Start](docs/quick-start.md)
- [Development guide](docs/development.md)
- [Configuration file](docs/configuration.md)
- [Output files](docs/output.md)
- [AI agents: JSON output, MCP server, share links](docs/ai.md)
- [Physics models and numerics](docs/physics.md)
- [Web app](frontend/README.md)
- [WASM build](docs/wasm.md)
- [Legacy C++ implementation](legacy_cpp/)

Read more on the [Wiki](https://github.com/istellartech/OpenTsiolkovsky/wiki). The input file format is described in [input file format](https://github.com/istellartech/OpenTsiolkovsky/wiki/input_file).

## License
OpenTsiolkovsky is an open-source project licensed under the MIT License.
