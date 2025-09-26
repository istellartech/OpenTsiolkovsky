# Repository Guidelines

This guide helps contributors work effectively across the Rust core, legacy C++ reference, and frontend.

## Project Structure & Module Organization
- `src/` Main Rust simulator with CLI binary and WASM library for physics simulation.
- `tests/` Rust integration tests.
- `examples/` Configuration files and sample data (e.g., `param_sample_01.json`, `SS-520-4/`).
- `frontend/` Vite + React + TypeScript UI for the web API.
- `legacy_cpp/` Legacy C++ simulator (C++14, Eigen/Boost headers) kept for reference.
  - `legacy_cpp/src/` C++ source. Builds to `legacy_cpp/bin/OpenTsiolkovsky`.
  - `legacy_cpp/bin/` Python utilities and compiled C++ binary.
  - `legacy_cpp/test/` Small C++ math tests and a Python flight script.
- `scripts/` Build helpers (e.g., WASM tooling).
- `docs/` Reference materials and documentation.

## Build, Test, and Development Commands
- Rust: `cargo build` or `cargo build --release`.
  - CLI: `cargo run --bin openTsiolkovsky-cli -- --config examples/param_sample_01.json --verbose`.
  - WASM: `wasm-pack build --target web --features wasm` or `./scripts/wasm_build.sh`.
- Frontend: `cd frontend && bun install && bun run dev` (build: `bun run build`).
- Legacy C++ build: `cd legacy_cpp && make` (outputs `legacy_cpp/bin/OpenTsiolkovsky`), clean: `make clean`.
- Legacy C++ run: `./legacy_cpp/bin/OpenTsiolkovsky examples/param_sample_01.json`.
- Flight script: `python legacy_cpp/test/test_flight.py` (expects built C++ binary).

## Lint and Type Check Commands
- Rust: `cargo fmt && cargo clippy -D warnings`.
- TypeScript: `cd frontend && bunx tsc --noEmit`.
- Frontend lint: ESLint is not configured; add checks manually if needed.

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
- PRs: include purpose, changes, run/bench steps, and linked issues. For output format changes, attach sample `*_trajectory.csv` and `*_summary.json` diffs or files.

## Agent-Specific Instructions
- Scope: applies to the entire repo. Match existing patterns; keep changes minimal and focused.
- When altering CLI/web flags or output schema, update README/docs and examples. Ensure C++ and Rust outputs remain comparable.
