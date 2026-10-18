# OpenTsiolkovsky [![CI](https://github.com/istellartech/OpenTsiolkovsky/workflows/ci/badge.svg)](https://github.com/istellartech/OpenTsiolkovsky/actions)

English | [日本語](README.ja.md)

![OpenTsiolkovsky](docs/OpenTsiolkovsky_Logo_small.png)

OpenTsiolkovsky is an open-source flight simulator for multi-stage rockets, from launch to impact. It runs as a command-line tool and as a web app that computes everything in the browser: **[open-tsiolkovsky.vercel.app](https://open-tsiolkovsky.vercel.app/)**.

## What it does

- Flies sounding rockets and orbital launchers as a point mass (3DoF) with a commanded attitude program, over a rotating WGS84 Earth with J2 gravity, the U.S. Standard Atmosphere 1976 and wind.
- Models stages, engines (thrust and Isp as constants or tables), per-stage aerodynamics, jettisoned parts, a launch rail and thrust trim.
- Reports flight events (liftoff, Mach 1, max-Q, burnout, separation, apogee, impact) with orbital elements, and the impact points of the vehicle, spent stages and fairings.
- Runs Monte Carlo dispersion analysis and draws 1σ / 95 % / 99 % impact ellipses.
- Web app: 3D globe, charts and playback; sample vehicles (MOMO, S-520, Epsilon, H-IIA, H3, Falcon 9, Saturn V, …) built from published data; share links; Japanese and English.
- Can be driven by AI agents through JSON output and an MCP server.

## Getting started

### Web app

Open [open-tsiolkovsky.vercel.app](https://open-tsiolkovsky.vercel.app/), pick a sample vehicle from the header and edit it. Results update as you type. The file menu saves and opens settings, exports CSV and KML, and copies a share link (the settings travel in the URL and are never sent to a server).

### Command line

Requires Rust (stable).

```bash
cargo build --release
B=./target/release/openTsiolkovsky-cli

$B run examples/momo.json -o out/momo            # trajectory.csv, summary.json, bodies/*.csv
$B monte-carlo examples/SS-520-4/ss520_4.json -n 500 -o out/ss520
$B validate my_rocket.json                       # check a configuration without flying it
```

A configuration is a JSON file. Keys end in their unit, and anything that varies can be a constant, a table or a CSV file:

```json
{
  "name": "minimal",
  "simulation": { "end_time_s": 300 },
  "launch": { "latitude_deg": 35, "longitude_deg": 139 },
  "attitude": { "azimuth_deg": 90, "elevation_deg": [[0, 90], [10, 90], [60, 70]] },
  "stages": [{
    "mass_initial_kg": 1000,
    "engine": { "thrust_vac_n": 30000, "isp_vac_s": 200, "burn_end_s": 20 },
    "aero": { "diameter_m": 0.5, "ca": 0.4 }
  }]
}
```

[`examples/`](examples/) holds the web app's sample vehicles as configuration files: `momo`, `s310`, `s520`, `ss520-5`, `epsilon`, `h2a202`, `h3-22s`, `falcon9`, `saturn-v`, `ariane5`, `soyuz-2.1a` and `long-march-3b` (`SS-520-4/` shows CSV tables). The web app reads and writes the same files.

### AI agents

```bash
$B run examples/momo.json --json      # one JSON document on stdout
$B schema                             # JSON Schema of the configuration
$B share examples/momo.json           # link that opens the vehicle in the web app
claude mcp add opentsiolkovsky -- "$PWD/target/release/openTsiolkovsky-cli" mcp
```

See [docs/ai.md](docs/ai.md) for the JSON format, exit codes and MCP tools.

## Documentation

The documents below are in Japanese.

- [Configuration](docs/configuration.md): every key, units and defaults
- [Output files](docs/output.md): `trajectory.csv`, `summary.json`, Monte Carlo files
- [Physics models and numerics](docs/physics.md)
- [AI agents](docs/ai.md): JSON output, MCP server, share links
- [Development](docs/development.md): building, testing, WASM, project layout
- [Web app internals](frontend/README.md)

The former C++ implementation is kept at the git tag [`cpp-v0.52`](https://github.com/istellartech/OpenTsiolkovsky/tree/cpp-v0.52/legacy_cpp).

## License

MIT
