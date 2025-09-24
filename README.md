# OpenTsiolkovsky   [![Build Status](https://travis-ci.org/istellartech/OpenTsiolkovsky.svg?branch=master)](https://travis-ci.org/istellartech/OpenTsiolkovsky)

![OpenTsiolkovsky](doc/OpenTsiolkovsky_Logo_small.png)

OpenTsiolkovsky is a modern rocket flight simulator with both command-line and web interfaces.

## Key Features

* **Rocket Simulation**: Three-degree-of-freedom and six-degree-of-freedom flight simulation with attitude control (TVC)
* **Multi-Platform**:
  - Rust-based core simulation engine
  - Command-line interface (CLI)
  - Web API server for integration
  - Modern React/TypeScript web frontend
  - WASM support for browser-based simulation
* **Multi-Stage Support**: Supports up to three rocket stages
* **Trajectory Analysis**: Sub-orbital and low Earth orbit trajectories
* **Data Export**: KML export for visualization in mapping tools
* **Real-time Visualization**: Interactive 3D trajectory viewer and performance graphs

## Quick Start

### Prerequisites
- Rust (stable) + Cargo
- Bun v1+ (https://bun.sh/)
- Optional: wasm-pack for WASM builds

### Running the Web Interface
1. Build and start the API server:
   ```bash
   cargo run -p openTsiolkovsky-web
   ```

2. Start the frontend (in a new terminal):
   ```bash
   cd frontend
   bun install
   bun run dev
   ```

3. Open http://localhost:5173 in your browser

### Command Line Usage
```bash
cargo run -p openTsiolkovsky-cli -- --config bin/param_sample_01.json --verbose
```

## Documentation
- [Complete Setup Guide](docs/README.md)
- [Frontend Development](docs/README.rust_frontend.md)
- [Web API Reference](docs/api/web_api.md)
- [WASM Build Guide](docs/wasm_build.md)

Read more about it on the [Wiki](https://github.com/istellartech/OpenTsiolkovsky/wiki)

Input file format is following [input file format](https://github.com/istellartech/OpenTsiolkovsky/wiki/input_file)

## License
OpenTsiolkovsky is an Open Source project licensed under the MIT License
