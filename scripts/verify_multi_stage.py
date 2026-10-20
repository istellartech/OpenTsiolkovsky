#!/usr/bin/env python3
"""Reproduce the assumed two-stage orbital study (standard library only).

Build: cargo build --release --features optimization --bin openTsiolkovsky-optimize
Run: python3 scripts/verify_multi_stage.py [binary] [output-dir] [case ...]
No automatic retry or physical constraint relaxation. Full inputs and results
are retained even for failed solves/independent validation.
"""
import copy
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
BINARY = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "target/release/openTsiolkovsky-optimize").resolve()
OUTPUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else ROOT / "out/optimization/multi-stage-verification").resolve()
OUTPUT.mkdir(parents=True, exist_ok=True)
BASE = json.loads((ROOT / "examples/optimization/two_stage_500km_43deg.json").read_text())
CASES = ["fixed_mass_time", "coarse", "baseline", "refined", "seed98", "seed100", "tighter_kkt"]
SELECTED = sys.argv[3:] or CASES
assert set(SELECTED) <= set(CASES)
rows = []
for name in SELECTED:
    request = copy.deepcopy(BASE)
    p = request["problem"]
    expected_converged = None if name in ["coarse", "tighter_kkt"] else True
    expected_valid = name != "coarse"
    if name == "fixed_mass_time":
        p["net_payload_kg"] = dict(initial=2000., lower=2000., upper=2000.)
        for phase, time in [(4, 240.), (5, 251.4), (6, 60.)]:
            p["phases"][phase]["duration_s"] = dict(initial=time, lower=time, upper=time)
    elif name == "coarse":
        request = json.loads((ROOT / "examples/optimization/two_stage_500km_43deg_coarse.json").read_text())
    elif name == "refined":
        for phase in p["phases"]:
            phase["intervals"] = min(16, phase["intervals"] * 2)
    elif name.startswith("seed"):
        p["initial_azimuth_deg"] = float(name[4:])
        for phase in p["phases"]:
            phase["initial_attitude_end_deg"][0] = p["initial_azimuth_deg"]
    elif name == "tighter_kkt":
        request["solver"]["tolerance"] = 1e-8
    request["run_id"] = "multi-stage-verification-" + name
    path, result_path = OUTPUT / (name + ".json"), OUTPUT / (name + "-result.json")
    path.write_text(json.dumps(request, indent=2) + "\n")
    result_path.unlink(missing_ok=True)
    process = subprocess.run([str(BINARY), "--config", str(path), "--output", str(result_path)],
                             cwd=ROOT, capture_output=True, text=True, timeout=240)
    result = json.loads(result_path.read_text())
    assert process.returncode == (0 if result["converged"] and expected_valid else 1), (name, process.stderr)
    if expected_converged is not None:
        assert result["converged"] == expected_converged, (name, result["solver_status"])
    report = result["validation"]
    assert (report["status"] == "passed") == expected_valid, (name, report["error"])
    flight = report["multi_stage"]
    assert flight is not None, report["error"]
    assert flight["unevaluated_constraints"], "Unassessed mission conditions must remain visible"
    assert [s["ignition_count"] for s in flight["stage_ledgers"]] == [1, 2]
    assert [e["kind"] for e in flight["events"]] == ["separate_stage", "jettison_fairing", "deploy_payload"]
    consumed = sum(s["propellant_consumed_kg"] for s in flight["stage_ledgers"])
    removed = sum(e["removed_mass_kg"] for e in flight["events"])
    balance = flight["initial_total_mass_kg"] - consumed - removed - flight["deployed_state_eci"][0]
    assert abs(balance) < 1e-5, (name, balance)
    assert abs(flight["deployed_state_eci"][0] - flight["net_payload_kg"]) < 1e-5
    for event in flight["events"]:
        assert event["before_eci"][1:] == event["after_eci"][1:]
        assert event["position_jump_m"] == event["velocity_jump_m_s"] == 0.
        assert abs(event["before_eci"][0] - event["after_eci"][0] - event["removed_mass_kg"]) < 1e-7
        assert event["program_mass_difference_kg"] < 1e-6
    row = dict(case=name, code_revision=result["code_revision"], solver_status=result["solver_status"],
               iterations=len(result["iterations"]), validation=report["status"],
               mesh=[phase["intervals"] for phase in request["problem"]["phases"]],
               degree=request["problem"]["degree"], kkt_tolerance=request["solver"]["tolerance"],
               net_payload_kg=flight["net_payload_kg"], orbit=flight["orbit"],
               max_position_error_m=flight["max_position_error_m"],
               max_velocity_error_m_s=flight["max_velocity_error_m_s"], max_mass_error_kg=flight["max_mass_error_kg"],
               tighter_rk_position_difference_m=flight["tighter_rk_position_difference_m"],
               stage_ledgers=flight["stage_ledgers"], global_mass_balance_error_kg=balance,
               failed_checks=[c["id"] for c in flight["checks"] if not c["passed"]])
    rows.append(row)
    print(f'{name}: {result["solver_status"]}, validation={report["status"]}, '
          f'payload={row["net_payload_kg"]:.8f} kg, position={row["max_position_error_m"]:.6f} m', flush=True)

by_name = {row["case"]: row for row in rows}
payloads = [by_name[name]["net_payload_kg"] for name in ["baseline", "seed98", "seed100", "refined"] if name in by_name]
if len(payloads) > 1:
    assert max(payloads) - min(payloads) < .02, "Initial trajectory / mesh sensitivity exceeds .02 kg"
(OUTPUT / "summary.json").write_text(json.dumps(rows, indent=2) + "\n")
print(f"Verified requested cases; results: {OUTPUT / 'summary.json'}")
