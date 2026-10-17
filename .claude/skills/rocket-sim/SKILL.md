---
name: rocket-sim
description: Design, simulate and analyse rocket flights with this repository's OpenTsiolkovsky CLI (param_*.json files, trajectories, apogee, max Q, orbits, impact points, Monte Carlo dispersion, web app links). Use when asked to fly or tune a vehicle, compare cases, or explain a simulation result.
---

# Flying vehicles with OpenTsiolkovsky

Use the CLI's machine-readable interface (full reference: `docs/ai.md`).

```bash
cargo build --release
B=./target/release/openTsiolkovsky-cli
```

1. **Know the format.** `$B schema` prints the JSON Schema of `param_*.json` (units, defaults, descriptions). Human docs: `docs/configuration.md`. Start from `examples/param_sample_01.json` (single stage), `examples/param_momo.json` or `examples/SS-520-4/` (three stages with CSV tables).
2. **Write the file**, keeping key names literal (they include units). Pitfalls:
   - stage times (burn start/end, separation) are relative to that stage's start; attitude-program times are from launch;
   - `mass initial[kg]` is the stage alone, without upper stages;
   - CA/CN/attitude tables are vehicle-wide and read from stage 1;
   - a missing CSV is not an error: constants are used and `validate` lists it in `missing_files`.
3. **Validate**: `$B validate -c FILE --json` (exit status 3 when invalid). Fix every error; read the warnings.
4. **Fly**: `$B run -c FILE -o out/NAME --json --trajectory-points 50`. Read `summary` (`max_altitude_m`, `max_dynamic_pressure_pa`, `burnout.orbit`, `impact_point`, `events`, `fall_bodies`). Full time series: `files.trajectory` (CSV; columns in `docs/output.md`).
5. **Dispersion** (when impact areas matter): add `--monte-carlo 500 --seed 1` and optionally `--dispersion FILE` (`$B schema dispersion`). Read `monte_carlo.statistics` (mean point and 99 % ellipse per body).
6. **Show the user**: `$B share -c FILE` prints a link that opens the vehicle, with its CSV tables, in the web app (3D globe, charts). Nothing is uploaded; the configuration travels in the URL fragment.

Report results with units, and say which settings you assumed. When comparing cases, change one thing at a time and keep the output prefixes distinct.

The same operations are available as MCP tools (`$B mcp`, registered in `.mcp.json`).
