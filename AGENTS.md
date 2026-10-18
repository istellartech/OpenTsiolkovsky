# Repository Guidelines

> To *use* the simulator (fly vehicles, validate configs, run Monte Carlo, make web links) rather than develop it, read `docs/ai.md`: `openTsiolkovsky-cli run CONFIG --json`, `validate --json`, `schema`, `convert`, `share`, and the MCP server (`.mcp.json`). Claude Code also has the `rocket-sim` skill.

This guide helps contributors work effectively across the Rust core, legacy C++ reference, and frontend.

## Project Structure & Module Organization
- `src/` Main Rust simulator with CLI binary and WASM library for physics simulation.
  - `src/config/`: the JSON configuration (types, tables, validation, conversion of legacy C++ `param_*.json`); `src/vehicle.rs`: loaded vehicle model; `src/sim/`: solver; `src/output.rs`: result files; `src/montecarlo.rs`.
  - `src/agent.rs` / `src/mcp.rs`: machine-readable interface for AI agents (`--json`, `schema`, `share`, MCP server); spec and current status in `docs/ai.md`.
- `tests/` Rust integration tests.
- `examples/` Configuration files and sample data (e.g., `sample_01.json`, `momo.json`, `SS-520-4/`).
- `frontend/` Vite + React + TypeScript UI for the web API.
- `legacy_cpp/` Legacy C++ simulator (C++14, Eigen/Boost headers) kept for reference.
  - `legacy_cpp/src/` C++ source. Builds to `legacy_cpp/bin/OpenTsiolkovsky`.
  - `legacy_cpp/bin/` Python utilities and compiled C++ binary.
  - `legacy_cpp/test/` Small C++ math tests and a Python flight script.
- `scripts/` Build helpers (e.g., WASM tooling).
- `docs/` Reference materials and documentation.

## Build, Test, and Development Commands
- Rust: `cargo build` or `cargo build --release`.
  - CLI: `cargo run --bin openTsiolkovsky-cli -- run examples/sample_01.json -o out`.
  - WASM: `wasm-pack build --target web --features wasm` or `./scripts/wasm_build.sh`.
- Frontend: `cd frontend && bun install && bun run dev` (build: `bun run build`).
- Agent/script interface (`src/agent.rs`, `src/mcp.rs`; see `docs/ai.md`): `openTsiolkovsky-cli run CONFIG --json`, `monte-carlo`, `validate --json`, `schema [config|dispersion]`, `convert`, `share`, `mcp` (stdio MCP server, also in `.mcp.json`). Keep the JSON keys, error kinds and exit codes (0 ok, 1 failure, 2 usage, 3 invalid config) stable; document changes in `docs/ai.md`.
- Legacy C++ build: `cd legacy_cpp && make` (outputs `legacy_cpp/bin/OpenTsiolkovsky`), clean: `make clean`.
- Legacy C++ run: `cd legacy_cpp/bin && ./OpenTsiolkovsky param_sample_01.json`.
- Flight script: `python legacy_cpp/test/test_flight.py` (expects built C++ binary).

## Lint and Type Check Commands
- Rust: `cargo fmt && cargo clippy --all-targets -- -D warnings`.
- Frontend: `cd frontend && bunx vp check` (format, lint, type check) and `bunx vp test run`.

## Coding Style & Naming Conventions
- Rust: Idiomatic snake_case for items; keep modules tidy and formatted with `cargo fmt`.
- Frontend: TypeScript strict; React components in PascalCase (e.g., `TrajectoryViewer.tsx`).
- Legacy C++: C++14, 4-space indent, `.hpp/.cpp`. Follow adjacent naming; typically snake_case for functions/vars, UpperCamelCase for types. Avoid introducing `using namespace` in new headers. Keep includes relative to `lib/` and `boost/`.

## Testing Guidelines
- Rust: `cargo test` (unit tests live alongside modules). Prefer numeric assertions with tolerances (e.g., `approx`).
- Legacy C++: lightweight manual tests in `legacy_cpp/test/` (e.g., `cd legacy_cpp && g++ -std=gnu++14 -I lib -I boost test/test_quat.cpp -o build/test_quat && ./build/test_quat`).
- CSV/JSON outputs: preserve column order and field names; include before/after samples when changing.

## Commit & Pull Request Guidelines
- Commits: imperative mood, concise; optional scope tags like `cpp:`, `rust:`, `web:`.
- PRs: include purpose, changes, run/bench steps, and linked issues. For output format changes, attach sample `trajectory.csv` and `summary.json` diffs or files.

## Agent-Specific Instructions
- Scope: applies to the entire repo. Match existing patterns; keep changes minimal and focused.
- When altering CLI/web flags or output schema, update README/docs and examples. Ensure C++ and Rust outputs remain comparable.
