---
name: rocket-sim
description: Design, simulate and analyse rocket flights with this repository's OpenTsiolkovsky CLI (JSON configurations, trajectories, apogee, max Q, orbits, impact points, Monte Carlo dispersion, web app links). Use when asked to fly or tune a vehicle, compare cases, or explain a simulation result.
---

# Flying vehicles with OpenTsiolkovsky

Use the CLI's machine-readable interface (full reference: `docs/ai.md`).

```bash
cargo build --release
B=./target/release/openTsiolkovsky-cli
```

1. **Know the format.** `$B schema` prints the JSON Schema of the configuration (units, defaults, descriptions). Human docs: `docs/configuration.md`. Start from `examples/sample_01.json` (single stage), `examples/momo.json` or `examples/SS-520-4/ss520_4.json` (three stages with CSV tables). A C++ simulator `param_*.json` must first be converted: `$B convert param.json -o config.json`.
2. **Write the file.** Keys are snake_case with units (`thrust_vac_n`, `burn_end_s`); any curve is a constant, `[[x, y], ...]` rows or `{"file": "name.csv"}`. Pitfalls:
   - stage times (burn start/end, separation, table times) are relative to that stage's start; attitude times are from launch;
   - `mass_initial_kg` is the stage alone, without upper stages;
   - every stage but the last needs `separation_time_s`;
   - aerodynamics (`aero`) are per stage.
3. **Validate**: `$B validate FILE --json` (exit status 3 when invalid). Every error and warning names its JSON path; fix the errors, read the warnings.
4. **Fly**: `$B run FILE -o out/NAME --json --trajectory-points 50`. Read `summary` (`maxima.altitude_m`, `maxima.dynamic_pressure_pa`, `events` with the burnout `orbit`, `impact`, `bodies`). Full time series: `files.trajectory` (CSV; columns in `docs/output.md`).
5. **Dispersion** (when impact areas matter): `$B monte-carlo FILE -n 500 --seed 1 -o out/NAME --json`, optionally `--dispersion FILE` (`$B schema dispersion`). Read `statistics` (mean point and 99 % ellipse per body).
6. **Show the user**: `$B share FILE` prints a link that opens the vehicle, with its CSV tables, in the web app (3D globe, charts). Nothing is uploaded; the configuration travels in the URL fragment.

Report results with units, and say which settings you assumed. When comparing cases, change one thing at a time and keep the output directories distinct.

The same operations are available as MCP tools (`$B mcp`, registered in `.mcp.json`).
