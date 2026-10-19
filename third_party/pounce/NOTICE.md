# POUNCE 0.12.0

This distribution includes POUNCE (unmodified crates.io dependencies),
Copyright John Kitchin and contributors, under Eclipse Public License 2.0.
The license is included in EPL-2.0.txt. OpenTsiolkovsky's own code is MIT licensed.

Source and license: https://github.com/jkitchin/pounce
Exact published sources, including their dependency manifests:

- https://crates.io/crates/pounce-algorithm/0.12.0
- https://crates.io/crates/pounce-nlp/0.12.0
- https://crates.io/crates/pounce-restoration/0.12.0

All transitive POUNCE crates are locked to 0.12.0 in Cargo.lock.
Rebuild: rustup target add wasm32-wasip1; bash scripts/optimization_wasm_build.sh

The flight physics also uses unmodified num-dual 0.15.0 (Gernot Bauer,
Philipp Rehner and contributors), licensed MIT OR Apache-2.0:
https://crates.io/crates/num-dual/0.15.0
https://github.com/itt-ustutt/num-dual
