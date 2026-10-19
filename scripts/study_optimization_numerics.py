#!/usr/bin/env python3
"""Matched-input PR3 experiments; never retry, relax a limit or select a winner.

Build the release optimize binary first. Full requests, results, stderr and
incremental summaries are retained, including failures. --filter supports globs.
Use study_optimization_numerics_wasm.ts on the resulting manifest for WASI.
"""
import argparse
import copy
import fnmatch
import hashlib
import json
import pathlib
import subprocess
import shutil
import platform
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
STRATEGIES = ['s0', 's1_bounds', 's1_guess', 's2', 's3']


def cases():
    result = []

    def add(label, request, strategy, hessian='limited_memory', kkt='upstream_default'):
        request = copy.deepcopy(request)
        name = f'{label}_{strategy}_{hessian}_{kkt}'
        request['run_id'] = name
        request['solver'].update(derivative_test=False, scaling=dict(strategy=strategy), hessian=hessian, kkt_scaling=kkt)
        fingerprint = hashlib.sha256(json.dumps(request['problem'], sort_keys=True).encode()).hexdigest()
        result.append(dict(name=name, input=request, problem_fingerprint=fingerprint))

    load = lambda name: json.loads((ROOT / f'examples/optimization/{name}.json').read_text())
    for strategy in STRATEGIES:
        for hessian in ['limited_memory', 'exact']:
            add('hs071', load('hs071'), strategy, hessian)
            for seed in [8, 12, 20]:
                for mesh, intervals, degree in [('coarse', 2, 3), ('base', 4, 4), ('fine', 6, 5)]:
                    request = load('double_integrator')
                    request['problem'].update(intervals=intervals, degree=degree)
                    request['problem']['duration_s']['initial'] = seed
                    add(f'double_{mesh}_{seed}', request, strategy, hessian)
        for kind, file, seeds in [('momo', 'momo_single_stage', [83, 85, 87]), ('multi', 'two_stage_500km_43deg', [98, 99, 100])]:
            for mesh in ['coarse', 'base']:
                for seed in seeds:
                    request = load(file + ('_coarse' if mesh == 'coarse' else ''))
                    if kind == 'momo':
                        request['problem']['initial_pitch_end_deg'] = seed
                    else:
                        request['problem']['initial_azimuth_deg'] = seed
                        for phase in request['problem']['phases']:
                            phase['initial_attitude_end_deg'][0] = seed
                    add(f'{kind}_{mesh}_{seed}', request, strategy)
    # KKT is a separate experiment axis, with on-demand disabled by the driver.
    for kkt in ['none', 'ruiz', 'slack_based']:
        add('hs071', load('hs071'), 's0', 'exact', kkt)
        add('double_base_12', load('double_integrator'), 's0', 'exact', kkt)
        for kind, file, seeds in [('momo', 'momo_single_stage', [83, 85, 87]), ('multi', 'two_stage_500km_43deg', [98, 99, 100])]:
            for seed in seeds:
                request = load(file)
                if kind == 'momo':
                    request['problem']['initial_pitch_end_deg'] = seed
                else:
                    request['problem']['initial_azimuth_deg'] = seed
                    for phase in request['problem']['phases']:
                        phase['initial_attitude_end_deg'][0] = seed
                add(f'{kind}_base_{seed}', request, 's0', kkt=kkt)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', type=pathlib.Path, default=ROOT / 'target/release/openTsiolkovsky-optimize')
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'out/optimization/pr3-numerics')
    parser.add_argument('--filter', default='*')
    parser.add_argument('--generate-only', action='store_true')
    parser.add_argument('--timeout', type=float, default=240)
    args = parser.parse_args()
    directory = args.output.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    selected = [c for c in cases() if fnmatch.fnmatch(c['name'], args.filter)]
    if not selected:
        parser.error('no matching cases')
    for case in selected:
        (directory / f'{case["name"]}.json').write_text(json.dumps(case['input'], indent=2) + '\n')
    (directory / 'manifest.json').write_text(json.dumps(selected, indent=2) + '\n')
    if args.generate_only:
        print(f'{len(selected)} inputs: {directory}')
        return
    # Freeze the artifact: subsequent builds/commits cannot change a study
    # halfway through, even when its process takes several minutes.
    frozen = directory / 'optimizer-native'
    shutil.copy2(args.binary.resolve(), frozen)
    environment = dict(platform=platform.platform(), python=platform.python_version(), binary_sha256=hashlib.sha256(frozen.read_bytes()).hexdigest(), case_count=len(selected), timeout_seconds=args.timeout)
    (directory / 'environment.json').write_text(json.dumps(environment, indent=2) + '\n')
    rows = []
    for case in selected:
        name = case['name']
        result_path = directory / f'{name}-result.json'
        result_path.unlink(missing_ok=True)
        start = time.monotonic()
        row = dict(name=name, problem_fingerprint=case['problem_fingerprint'])
        try:
            run = subprocess.run([str(frozen), '--config', str(directory / f'{name}.json'), '--output', str(result_path)], cwd=ROOT, text=True, capture_output=True, timeout=args.timeout)
            (directory / f'{name}.stderr.txt').write_text(run.stderr)
            row.update(exit_code=run.returncode, process_seconds=time.monotonic() - start)
            if result_path.exists():
                result = json.loads(result_path.read_text())
                validation = result.get('validation') or {}
                trajectory = validation.get('multi_stage') or validation.get('flight') or validation.get('trajectory') or {}
                row.update(code_revision=result['code_revision'], solver_status=result['solver_status'], converged=result['converged'], validation=validation.get('status'), iterations=len(result['iterations']), numerical_metrics=result['numerical_metrics'], physical_objective=(result.get('physical_solution') or {}).get('objective'), net_payload_kg=trajectory.get('net_payload_kg'), additional_payload_kg=trajectory.get('mass_ledger', {}).get('additional_payload_kg'), max_position_error_m=trajectory.get('max_position_error_m'), max_velocity_error_m_s=trajectory.get('max_velocity_error_m_s'), orbit=trajectory.get('orbit'), failed_checks=[c['id'] for c in trajectory.get('checks', []) if not c['passed']])
                assert run.returncode == (0 if result['converged'] and validation.get('status') == 'passed' else 1)
            else:
                row['error'] = run.stderr
        except subprocess.TimeoutExpired:
            row.update(error='process timeout; no retry', process_seconds=time.monotonic() - start)
        rows.append(row)
        (directory / 'summary.json').write_text(json.dumps(rows, indent=2) + '\n')
        print(f'{name}: {row.get("solver_status", row.get("error"))}, validation={row.get("validation")}, {row["process_seconds"]:.3f}s', flush=True)
    print(f'{len(rows)} cases recorded: {directory / "summary.json"}')


if __name__ == '__main__':
    main()
