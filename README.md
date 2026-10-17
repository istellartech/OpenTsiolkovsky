# OpenTsiolkovsky   [![CI](https://github.com/istellartech/OpenTsiolkovsky/workflows/ci/badge.svg)](https://github.com/istellartech/OpenTsiolkovsky/actions)

![OpenTsiolkovsky](docs/OpenTsiolkovsky_Logo_small.png)

OpenTsiolkovsky is an open-source rocket flight simulator. The simulation core is written in Rust and runs both as a command-line tool and, compiled to WebAssembly, in a web app that needs no server. A legacy C++ implementation is kept for reference.

## Features

### Simulation core (Rust)
- Three-degree-of-freedom (point-mass) flight with a commanded attitude: constant elevation/azimuth or a time-based attitude (pitch) program, with pitch/yaw/roll offsets
- Multi-stage vehicles with burn, forced cutoff, separation and coast times per stage
- Thrust and Isp as constants or time tables, with nozzle exit-pressure losses
- Aerodynamics from constant or Mach-dependent CA/CN tables, with optional per-stage diameter and coefficients; ballistic-coefficient descent
- Standard atmosphere, constant or altitude-dependent wind, Earth rotation, WGS84 geodesy
- RK4 or adaptive RK45 integration
- Covers sounding-rocket and low-Earth-orbit trajectories

### Command-line interface
- Reads the classic `param_*.json` files together with the CSV tables they reference (thrust, Isp, CN/CA, attitude, wind)
- Writes `<name>_trajectory.csv`, a `<name>_summary.json` and `<name>_dynamics_cpp.csv` (column-compatible with the legacy C++ output)

### Web app ([details](frontend/README.md))
- **Live:** results follow every input change. The solver runs in a Web Worker, so the page stays responsive.
- **Visual:** a 3D globe (CesiumJS, Esri basemaps), charts, an event table and telemetry, all on a shared playback timeline.
- **Sample vehicles** built from published data: MOMO, S-310, S-520, SS-520-5, Epsilon, H-IIA, H3, Saturn V and Ariane 5. Each comes with sources and modelling notes.
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
```

More examples are in [`examples/`](examples/), e.g. `param_momo.json` and `SS-520-4/` (with CSV tables).

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
├── src/              # Rust simulation core, CLI (main.rs) and WASM bindings (wasm.rs)
├── tests/            # Rust integration tests
├── examples/         # CLI parameter files and CSV tables
├── frontend/         # Web app (React + TypeScript, Vite+, CesiumJS, Chart.js)
├── legacy_cpp/       # Legacy C++ implementation (reference)
├── scripts/          # Build scripts (WASM, Vercel)
└── docs/             # Documentation
```

## Documentation
- [Quick Start](docs/quick-start.md)
- [Development guide](docs/development.md)
- [Configuration file](docs/configuration.md)
- [Web app](frontend/README.md)
- [WASM build](docs/wasm.md)
- [Legacy C++ implementation](legacy_cpp/)

Read more on the [Wiki](https://github.com/istellartech/OpenTsiolkovsky/wiki). The input file format is described in [input file format](https://github.com/istellartech/OpenTsiolkovsky/wiki/input_file).

## License
OpenTsiolkovsky is an open-source project licensed under the MIT License.
