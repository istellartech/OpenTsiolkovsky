# Repository Guidelines

> To *use* the simulator (fly vehicles, validate configs, run Monte Carlo, make web links) rather than develop it, read `docs/ai.md`: `openTsiolkovsky-cli run CONFIG --json`, `validate --json`, `schema`, `convert`, `share`, and the MCP server (`.mcp.json`). Claude Code also has the `rocket-sim` skill.

## Project Structure
- `src/` Rust simulator: library, CLI binary (`main.rs`) and WASM bindings (`wasm.rs`).
  - `config/`: the JSON configuration (types, tables, validation, conversion of legacy C++ `param_*.json`).
  - `vehicle.rs`: loaded vehicle model; `sim/`: solver (integration, forces, events, released bodies, output samples); `output.rs`: result files; `montecarlo.rs`; `physics/`, `math/`.
  - `agent.rs` / `mcp.rs`: machine-readable interface for AI agents; spec and status in `docs/ai.md`.
- `tests/` Integration tests: `cpp_reference.rs` converts legacy parameter files and compares against stored C++ output; `conservation.rs` checks energy and angular momentum.
- `examples/` Configuration files (`sample_01.json`, `momo.json`, `SS-520-4/` with CSV tables, `dispersion.json`).
- `frontend/` Web app (Vite+ / React / TypeScript); its config types in `frontend/src/lib/config.ts` mirror `src/config/mod.rs`.
- `scripts/` WASM and Vercel build scripts. `docs/` Documentation.
- The former C++ simulator and `tools/compare_cpp.py` are kept at the git tag `cpp-v0.52`.

## Commands
- Rust: `cargo build --release`, `cargo test`, `cargo fmt && cargo clippy --all-targets -- -D warnings` (WASM: add `--target wasm32-unknown-unknown --features wasm --no-default-features`).
- CLI: `cargo run --bin openTsiolkovsky-cli -- run examples/sample_01.json -o out`; also `monte-carlo`, `validate`, `schema [config|dispersion]`, `convert`, `share`, `mcp`.
- WASM: `bash scripts/wasm_build.sh` (outputs to `frontend/src/wasm`).
- Frontend (`vp` from `frontend/node_modules/.bin`): `cd frontend && bun install && bun run dev`; check `bunx vp check` (`--fix` to format); test `bunx vp test run`; build `bun run build`.

## Rules for Changes
- After Rust changes run `cargo test`, fmt and clippy (native and WASM); after frontend changes run `bunx vp check` and `bunx vp test run`.
- Configuration format: keep `src/config/mod.rs`, `frontend/src/lib/config.ts`, `frontend/src/lib/validation.ts`, the docs (`docs/configuration.md`) and `examples/` in step. Unknown keys are rejected by the solver.
- Output format: `trajectory.csv` columns are the `Sample` fields (`src/sim/sample.rs`); keep column order and names stable and update `docs/output.md` with sample output when changing them.
- Agent interface: keep JSON keys, error kinds and exit codes (0 ok, 1 failure, 2 usage, 3 invalid config) stable; document changes in `docs/ai.md`.
- Physics: `tests/cpp_reference.rs` must keep passing; intended differences from the C++ version are listed in `docs/physics.md`.
- Keep changes minimal and focused; match existing patterns.

## Style
- Rust: idiomatic snake_case, `cargo fmt`, numeric test assertions with tolerances (`approx`).
- Frontend: TypeScript strict; components in PascalCase; UI strings through `tr('日本語', 'English')`.
- Commits: imperative mood, concise; optional scope (`rust:`, `web:`, `docs:`).
