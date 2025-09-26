# Claude Code Guidelines

This guide helps Claude Code work effectively with the OpenTsiolkovsky project, now with Rust as the primary implementation.

## Project Structure & Module Organization
- `src/` Main Rust simulator with CLI binary and WASM library for physics simulation.
- `tests/` Rust integration tests.
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
- Frontend: `cd frontend && bun install && bun run dev` (build: `bun run build`).
- Legacy C++ build: `cd legacy_cpp && make` (outputs `legacy_cpp/bin/OpenTsiolkovsky`), clean: `make clean`.
- Legacy C++ run: `./legacy_cpp/bin/OpenTsiolkovsky examples/param_sample_01.json`.
- Flight script: `python legacy_cpp/test/test_flight.py` (expects built C++ binary).

## Lint and Type Check Commands
- Rust: `cargo fmt && cargo clippy -D warnings`
- TypeScript: `cd frontend && bunx tsc --noEmit`
- Frontend lint: ESLint not configured (consider adding to package.json scripts)

## Testing Guidelines
- Rust: `cargo test` (unit tests live alongside modules). Prefer numeric assertions with tolerances (e.g., `approx`).
- Legacy C++: lightweight manual tests in `legacy_cpp/test/` (e.g., `cd legacy_cpp && g++ -std=gnu++14 -I lib -I boost test/test_quat.cpp -o build/test_quat && ./build/test_quat`).
- CSV/JSON outputs: preserve column order and field names; include before/after samples when changing.

## Coding Style & Naming Conventions
- Rust: Use `cargo fmt` and `cargo clippy -D warnings`. Idiomatic snake_case for items.
- Frontend: TypeScript strict; React components in PascalCase (e.g., `TrajectoryViewer.tsx`).
- Legacy C++: C++14, 4‑space indent, `.hpp/.cpp`. Follow adjacent naming; typically snake_case for functions/vars, UpperCamelCase for types. Prefer avoiding `using namespace` in new headers. Keep includes relative to `lib/` and `boost/`.

## Claude Code Specific Instructions
- Always run appropriate lint and type check commands after making changes
- When making changes to Rust code, run `cargo test` to ensure tests pass
- For frontend changes, run type checking with `bunx tsc --noEmit`
- When altering CLI flags or output schema, update README/docs and examples
- Ensure C++ and Rust outputs remain comparable when making changes
- Keep changes minimal and focused; match existing patterns
- Preserve column order and field names in CSV/JSON outputs
- Include sample output files when changing data formats

## Common Task Patterns
- For Rust development: Build → Test → Lint → Type check
- For frontend development: Install (bun install) → Build → Type check
- For legacy C++ development: `cd legacy_cpp` → Build → Test manually
- Always verify outputs after changes to simulation logic