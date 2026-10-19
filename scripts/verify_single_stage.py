#!/usr/bin/env python3
"""Reproduce the single-stage numerical study using only the standard library.

Build first: cargo build --release --features optimization --bin openTsiolkovsky-optimize
Run: python3 scripts/verify_single_stage.py [native-binary] [output-directory]
All cases preserve the physical limits and validation tolerances unless the case
explicitly tests an infeasible load. No solver retry or constraint relaxation.
"""
import copy
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
BINARY = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "target/release/openTsiolkovsky-optimize").resolve()
OUTPUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else ROOT / "out/optimization/verification").resolve()
OUTPUT.mkdir(parents=True, exist_ok=True)
BASE = json.loads((ROOT / "examples/optimization/momo_single_stage.json").read_text())
CASES = [
    ("fixed_mass_time", {"additional_payload_kg": {"initial": 10., "lower": 10., "upper": 10.},
                         "coast_duration_s": {"initial": 118.16, "lower": 118.16, "upper": 118.16}}, True, True),
    ("coarse", {"burn_intervals": 8, "coast_intervals": 4, "degree": 4}, True, False),
    ("refined", {}, True, True),
    ("degree8", {"degree": 8}, True, True),
    ("seed83", {"initial_pitch_end_deg": 83.}, True, True),
    ("seed87", {"initial_pitch_end_deg": 87.}, True, True),
    ("infeasible_load", {"max_specific_force_m_s2": 35.}, False, False),
]
rows = []
for name, changes, expected_converged, expected_valid in CASES:
    request = copy.deepcopy(BASE)
    request["run_id"] = "verification-" + name
    request["problem"].update(changes)
    input_path, result_path = OUTPUT / (name + ".json"), OUTPUT / (name + "-result.json")
    input_path.write_text(json.dumps(request, ensure_ascii=False, indent=2) + "\n")
    result_path.unlink(missing_ok=True)
    process = subprocess.run([str(BINARY), "--config", str(input_path), "--output", str(result_path)],
                             cwd=ROOT, capture_output=True, text=True, timeout=180)
    assert process.returncode == (0 if expected_valid else 1), (name, process.stderr)
    result = json.loads(result_path.read_text())
    assert result["converged"] == expected_converged, (name, result["solver_status"])
    report = result["validation"]
    assert (report["status"] == "passed") == expected_valid, (name, report["error"])
    flight = report["flight"]
    assert flight is not None, (name, report["error"])
    row = dict(case=name, code_revision=result["code_revision"], solver_status=result["solver_status"],
               iterations=len(result["iterations"]), validation=report["status"],
               mesh=[request["problem"][k] for k in ["burn_intervals", "coast_intervals", "degree"]],
               additional_payload_kg=flight["mass_ledger"]["additional_payload_kg"],
               max_position_error_m=flight["max_position_error_m"],
               max_velocity_error_m_s=flight["max_velocity_error_m_s"],
               tighter_rk_position_difference_m=flight["tighter_rk_position_difference_m"],
               failed_checks=[c["id"] for c in flight["checks"] if not c["passed"]])
    rows.append(row)
    print(f'{name}: {result["solver_status"]}, validation={report["status"]}, '
          f'payload={row["additional_payload_kg"]:.8f} kg, '
          f'position={row["max_position_error_m"]:.6f} m', flush=True)

by_name = {row["case"]: row for row in rows}
payloads = [by_name[name]["additional_payload_kg"] for name in ["refined", "seed83", "seed87"]]
assert max(payloads) - min(payloads) < 1e-5, "Different initial trajectories reached different designs"
assert abs(by_name["degree8"]["additional_payload_kg"] - payloads[0]) < .02, "Mesh-dependent payload has not stabilized"
(OUTPUT / "summary.json").write_text(json.dumps(rows, indent=2) + "\n")
print(f"Verified all cases; results: {OUTPUT / 'summary.json'}")
