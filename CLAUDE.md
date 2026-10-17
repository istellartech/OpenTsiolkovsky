# Claude Code Guidelines

> To *use* the simulator (fly vehicles, validate configs, run Monte Carlo, make web links) rather than develop it, read `docs/ai.md`: `openTsiolkovsky-cli run --json`, `validate --json`, `schema`, `share`, and the MCP server (`.mcp.json`). Claude Code also has the `rocket-sim` skill.

This guide helps Claude Code work effectively with the OpenTsiolkovsky project, now with Rust as the primary implementation.

## Project Structure & Module Organization
- `src/` Main Rust simulator with CLI binary and WASM library for physics simulation.
  - `src/agent.rs` / `src/mcp.rs`: machine-readable interface for AI agents (`--json`, `schema`, `share`, MCP server); spec and current status in `docs/ai.md`.
- `tests/` Rust integration tests (`cpp_reference.rs` compares against stored legacy C++ output; `conservation.rs` checks energy/angular momentum).
- `tools/compare_cpp.py` Runs the Rust CLI and the C++ binary on one parameter file and reports the largest differences.
- `examples/` Configuration files and sample data (e.g., `param_sample_01.json`, `SS-520-4/`).
- `frontend/` Vite + React + TS UI for the web API.
- `legacy_cpp/` Legacy C++ simulator (C++14, Eigen/Boost headers) for reference.
  - `legacy_cpp/src/` C++ source code. Builds to `legacy_cpp/bin/OpenTsiolkovsky`.
  - `legacy_cpp/bin/` Python utilities and compiled C++ binary.
  - `legacy_cpp/test/` Small C++ math tests and a Python flight script.
- `docs/` Reference materials and documentation.

## Build, Test, and Development Commands
- Rust: `cargo build` or `cargo build --release`.
  - CLI: `cargo run --bin openTsiolkovsky-cli -- --config examples/param_sample_01.json --verbose`.
  - WASM: `wasm-pack build --target web --features wasm`.
- Frontend (Vite+ toolchain, `vp` from `frontend/node_modules/.bin`): `cd frontend && bun install && bun run dev` (build: `bun run build`; frontend only: `bunx vp build`).
- Agent/script interface (`src/agent.rs`, `src/mcp.rs`; see `docs/ai.md`): `openTsiolkovsky-cli run --json`, `validate --json`, `schema [param|dispersion]`, `share`, `mcp` (stdio MCP server, also in `.mcp.json`). Keep the JSON keys, error kinds and exit codes (0 ok, 1 failure, 2 usage, 3 invalid config) stable; document changes in `docs/ai.md`.
- Legacy C++ build: `cd legacy_cpp && make` (needs Boost: `brew install boost` on macOS; outputs `legacy_cpp/bin/OpenTsiolkovsky`), clean: `make clean`.
- Rust vs C++: `cargo build --release && python3 tools/compare_cpp.py examples/param_momo.json`.
- Legacy C++ run: `./legacy_cpp/bin/OpenTsiolkovsky examples/param_sample_01.json`.
- Flight script: `python legacy_cpp/test/test_flight.py` (expects built C++ binary).

## Lint and Type Check Commands
- Rust: `cargo fmt && cargo clippy --all-targets -- -D warnings` (WASM: add `--target wasm32-unknown-unknown --features wasm --no-default-features`)
- Frontend: `cd frontend && bunx vp check` (Oxfmt format check + Oxlint + type check; `bunx vp check --fix` to format)

## Testing Guidelines
- Rust: `cargo test` (unit tests live alongside modules). Prefer numeric assertions with tolerances (e.g., `approx`).
- Legacy C++: lightweight manual tests in `legacy_cpp/test/` (e.g., `cd legacy_cpp && g++ -std=gnu++14 -I lib -I boost test/test_quat.cpp -o build/test_quat && ./build/test_quat`).
- CSV/JSON outputs: preserve column order and field names; include before/after samples when changing.

## Coding Style & Naming Conventions
- Rust: Use `cargo fmt` and `cargo clippy -- -D warnings`. Idiomatic snake_case for items.
- Frontend: TypeScript strict; React components in PascalCase (e.g., `TrajectoryViewer.tsx`).
- Legacy C++: C++14, 4‑space indent, `.hpp/.cpp`. Follow adjacent naming; typically snake_case for functions/vars, UpperCamelCase for types. Prefer avoiding `using namespace` in new headers. Keep includes relative to `lib/` and `boost/`.

## Claude Code Specific Instructions
- Always run appropriate lint and type check commands after making changes
- When making changes to Rust code, run `cargo test` to ensure tests pass
- For frontend changes, run `bunx vp check` and `bunx vp test run` in `frontend/`
- When altering CLI flags or output schema, update README/docs and examples
- Ensure C++ and Rust outputs remain comparable when making changes (`tests/cpp_reference.rs`, `tools/compare_cpp.py`; intended differences are listed in `docs/physics.md`)
- Keep changes minimal and focused; match existing patterns
- Preserve column order and field names in CSV/JSON outputs
- Include sample output files when changing data formats

## Common Task Patterns
- For Rust development: Build → Test → Lint → Type check
- For frontend development: Install (bun install) → `vp check` → `vp test run` → `vp build`
- For legacy C++ development: `cd legacy_cpp` → Build → Test manually
- Always verify outputs after changes to simulation logic