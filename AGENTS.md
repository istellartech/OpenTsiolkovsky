# Repository Guidelines

This guide helps contributors work effectively across the C++ core, Rust workspace, and frontend.

## Project Structure & Module Organization
- `src/` C++ simulator (C++14, Eigen/Boost headers). Builds to `bin/OpenTsiolkovsky`.
- `rust/` Rust package with CLI binary and WASM library for physics simulation.
- `frontend/` Vite + React + TS UI for the web API.
- `bin/` Python utilities and sample inputs (e.g., `param_sample_01.json`).
- `test/` Small C++ math tests and a Python flight script.
- `docs/` and `doc/` reference materials.

## Build, Test, and Development Commands
- C++ build: `make` (outputs `bin/OpenTsiolkovsky`), clean: `make clean`.
- C++ run: `./bin/OpenTsiolkovsky bin/param_sample_01.json`.
- Rust: `cd rust && cargo build` or `cargo build --release`.
  - CLI: `cargo run --bin openTsiolkovsky-cli -- --config ../bin/param_sample_01.json --verbose`.
  - WASM: `wasm-pack build --target web --features wasm`.
- Frontend: `cd frontend && bun install && bun run dev` (build: `bun run build`).
- Flight script: `python test/test_flight.py` (expects built C++ binary).

## Coding Style & Naming Conventions
- C++: C++14, 4‑space indent, `.hpp/.cpp`. Follow adjacent naming; typically snake_case for functions/vars, UpperCamelCase for types. Prefer avoiding `using namespace` in new headers. Keep includes relative to `lib/` and `boost/`.
- Rust: Use `cargo fmt` and `cargo clippy -D warnings`. Idiomatic snake_case for items.
- Frontend: TypeScript strict; React components in PascalCase (e.g., `TrajectoryViewer.tsx`).

## Testing Guidelines
- Rust: `cargo test` in `rust/` (unit tests live alongside modules). Prefer numeric assertions with tolerances (e.g., `approx`).
- C++: lightweight manual tests in `test/` (e.g., `g++ -std=gnu++14 -I lib -I boost test/test_quat.cpp -o build/test_quat && ./build/test_quat`).
- CSV/JSON outputs: preserve column order and field names; include before/after samples when changing.

## Commit & Pull Request Guidelines
- Commits: imperative mood, concise; optional scope tags like `cpp:`, `rust:`, `web:`.
- PRs: include purpose, changes, run/bench steps, and linked issues. For output format changes, attach sample `*_trajectory.csv` and `*_summary.json` diffs or files.

## Agent‑Specific Instructions
- Scope: applies to entire repo. Match existing patterns; keep changes minimal and focused.
- When altering CLI/web flags or output schema, update README/docs and examples. Ensure C++ and Rust outputs remain comparable.
