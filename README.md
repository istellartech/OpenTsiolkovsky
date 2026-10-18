# OpenTsiolkovsky   [![CI](https://github.com/istellartech/OpenTsiolkovsky/workflows/ci/badge.svg)](https://github.com/istellartech/OpenTsiolkovsky/actions)

![OpenTsiolkovsky](docs/OpenTsiolkovsky_Logo_small.png)

OpenTsiolkovsky is an open-source rocket flight simulator. The simulation core is written in Rust and runs both as a command-line tool and, compiled to WebAssembly, in a web app that needs no server. A legacy C++ implementation is kept for reference.

## Features

### Simulation core (Rust)
- Three-degree-of-freedom (point-mass) flight with a commanded attitude: constant elevation/azimuth/roll or a time-based attitude program, with mounting misalignment (yaw/pitch/roll offsets) and gyro bias drift
- Multi-stage vehicles with burn and separation times per stage; the burn ends when the propellant (initial minus dry mass) runs out
- Thrust and Isp as constants or time tables, with nozzle exit-pressure losses; optional thrust trim that balances the aerodynamic moment from CG/CP positions ("attitude neutrality")
- Launch pad hold until the thrust exceeds the weight, and an optional launcher rail
- Per-stage aerodynamics from constant, Mach or Mach x angle CA/CN tables (normal force at the total angle of attack); ballistic-coefficient descent
- U.S. Standard Atmosphere 1976 (geopotential altitude, tabulated to 1000 km) or the C++ version's atmosphere, seasonal or tabulated density variation, constant or altitude-dependent wind, Earth rotation, J2 gravity, WGS84 geodesy
- Free-flight modes as in the C++ version: aerodynamically stable, commanded attitude or ballistic; the flight mode is reported with every sample
- Flight events located by root finding: ignition, liftoff, rail exit, Mach 1, max-Q, burnout, separation, jettison, apogee and impact; orbital elements at burnout
- Instantaneous impact point (IIP) on the WGS84 ellipsoid at every sample
- Spent stages and jettisoned bodies (fairings, etc.) are flown to the ground after release, giving their impact points
- Monte Carlo dispersion analysis of impact points (thrust, Isp, mass, drag, CN, attitude, separation time, wind, air density; normal or uniform, per stage or vehicle-wide), with mean points and 1-sigma / 95 % / 99 % error ellipses per body
- RK4 or adaptive RK45 integration
- Covers sounding-rocket and low-Earth-orbit trajectories; checked against the legacy C++ simulator in the test suite ([physics and numerics](docs/physics.md))

### Configuration and output
- One JSON configuration for the CLI, the web app and the MCP server: snake_case keys with units (`thrust_vac_n`, `burn_end_s`), any curve as a constant, inline `[x, y]` rows or a CSV file — see [configuration](docs/configuration.md)
- `convert` turns the C++ simulator's `param_*.json` (with its CSV tables) into a configuration that reproduces its results
- Output directory with `trajectory.csv` (one column set, also used by the web app's CSV export), `summary.json` (maxima, flight events with orbital elements, impact points) and `bodies/<id>.csv` for every released body — see [output files](docs/output.md)
- `monte-carlo` runs a dispersion analysis on all CPU cores and writes `montecarlo_cases.csv` and `montecarlo_summary.json`

### For AI agents ([details and current status](docs/ai.md#対応状況v060-時点))
- `run --json` / `validate --json`: one JSON document on stdout; problems are reported with their JSON path; stable error kinds and exit status (3 = invalid configuration)
- `schema`: JSON Schema of the configuration (units, defaults) and of the dispersion file
- `mcp`: a Model Context Protocol server on stdio with tools to validate, fly, run Monte Carlo, convert legacy files and create web app links — for Claude Code, Claude Desktop and other MCP clients
- `share`: a link that opens a configuration, with its CSV tables, in the web app
- Not yet: remote (HTTP) MCP, and AI control of the web app itself — agents hand configurations to the web app only through links (`/llms.txt` on the site describes the format)

### Web app ([details](frontend/README.md))
- **Live:** results follow every input change. The solver runs in a Web Worker, so the page stays responsive.
- **Visual:** a 3D globe (CesiumJS, Esri basemaps), charts, an event table and telemetry, all on a shared playback timeline.
- **Impact analysis:** fall paths and impact points of spent stages and jettisoned parts, the IIP track, the flight mode, and a Monte Carlo "Dispersion" tab that draws impact scatter and 3-sigma ellipses on the globe.
- **Sample vehicles** built from published data: MOMO, S-310, S-520, SS-520-5, Epsilon, H-IIA, H3, Saturn V, Ariane 5, Falcon 9, Soyuz-2.1a and Long March 3B/E. Each comes with sources and modelling notes; the picker filters them by type and country and has a search box.
- **Files:**
  - Opens configuration files as the CLI reads them, and converts C++ `param_*.json` files dropped together with their CSV tables.
  - Exports the trajectory CSV (same columns as the CLI), KML for Google Earth, the configuration JSON and chart PNGs.
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
cargo build --release
B=./target/release/openTsiolkovsky-cli

$B run examples/sample_01.json -o out/sample
# -> out/sample/trajectory.csv, out/sample/summary.json (+ bodies/<id>.csv for released bodies)

# Monte Carlo dispersion of impact points (1-sigma values in examples/dispersion.json)
$B monte-carlo examples/SS-520-4/ss520_4.json -n 500 --dispersion examples/dispersion.json --seed 1 -o out/ss520
# -> out/ss520/montecarlo_cases.csv, out/ss520/montecarlo_summary.json

# A C++ simulator parameter file (its CSV tables are read and inlined)
$B convert legacy_cpp/bin/param_momo.json -o momo.json
```

More examples are in [`examples/`](examples/): `momo.json` and `SS-520-4/` (three stages with CSV tables).

### AI agents and scripts
```bash
$B schema > config.schema.json                     # JSON Schema of the configuration
$B validate examples/momo.json --json              # check without flying (exit 3 if invalid)
$B run examples/momo.json -o out/momo --json --trajectory-points 50
$B share examples/SS-520-4/ss520_4.json            # web app link with the CSV tables embedded

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
├── src/              # Rust core: config/ (input format), vehicle.rs, sim/ (solver), output.rs, montecarlo.rs,
│                     #   CLI (main.rs), agent/MCP interface (agent.rs, mcp.rs), WASM bindings (wasm.rs)
├── tests/            # Rust integration tests (incl. regression against the C++ output)
├── examples/         # Configuration files and CSV tables
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

Read more on the [Wiki](https://github.com/istellartech/OpenTsiolkovsky/wiki) (it describes the C++ version's `param_*.json` format, which `convert` reads).

## License
OpenTsiolkovsky is an open-source project licensed under the MIT License.
