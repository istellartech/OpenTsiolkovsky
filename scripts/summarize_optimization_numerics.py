#!/usr/bin/env python3
"""Export reviewable PR3 records, including unsuccessful cases, from a study.

Usage: python3 scripts/summarize_optimization_numerics.py STUDY_DIR OUTPUT_DIR
The per-case full JSON remains in STUDY_DIR; these CSVs are compact evidence.
"""
import argparse
import csv
import json
import pathlib


def records(directory):
    summary_path = directory / 'summary.json'
    if not summary_path.exists():
        return []
    rows = []
    normalized_problems = {}
    for summary in json.loads(summary_path.read_text()):
        row = {k: summary.get(k) for k in ['name', 'solver_status', 'converged', 'validation', 'iterations', 'process_seconds', 'memory_bytes', 'error']}
        result_path = directory / (summary['name'] + '-result.json')
        if result_path.exists():
            result = json.loads(result_path.read_text())
            # serde expands the vehicle integrator defaults. Compare normalized
            # physical requests across methods, with identical solve budgets.
            fingerprint = summary['problem_fingerprint']
            normalized = (result['input']['problem'], result['input']['solver']['max_iterations'], result['input']['solver']['tolerance'])
            if normalized_problems.setdefault(fingerprint, normalized) != normalized:
                raise ValueError(f"physical problem/budget changed: {summary['name']}")
            row['iterations'] = max((i['iteration'] for i in result.get('iterations', [])), default=0)
            row['iteration_records'] = len(result.get('iterations', []))
            v = result.get('validation') or {}
            flight = v.get('multi_stage') or v.get('flight') or v.get('trajectory') or {}
            row.update(revision=result.get('code_revision'), problem_fingerprint=summary['problem_fingerprint'], physical_objective=(result.get('physical_solution') or {}).get('objective'), max_position_error_m=flight.get('max_position_error_m'), max_velocity_error_m_s=flight.get('max_velocity_error_m_s'), max_mass_error_kg=flight.get('max_mass_error_kg'))
            row.update(result.get('numerical_metrics') or {})
            scaling = result.get('scaling_report') or {}
            for key in ['variable_gain', 'row_gain', 'pounce_row_gain']:
                values = scaling.get(key) or []
                if values:
                    row[key + '_min'] = min(values)
                    row[key + '_max'] = max(values)
            row['pounce_objective_gain'] = scaling.get('pounce_objective_gain')
            row['pounce_nonidentity_rows'] = sum(v != 1 for v in scaling.get('pounce_row_gain', []))
            checks = flight.get('checks') or []
            if checks:
                worst = max(checks, key=lambda c: c['violation'] / max(c['tolerance'], 1e-300))
                row.update(worst_check=worst['id'], worst_check_unit=worst['unit'], worst_check_violation=worst['violation'], worst_check_tolerance=worst['tolerance'], failed_checks=';'.join(c['id'] for c in checks if not c['passed']))
            if directory.name == 'wasi':
                native_path = directory.parent / result_path.name
                if native_path.exists():
                    native = json.loads(native_path.read_text())
                    row.update(native_status_matches=native['solver_status'] == result['solver_status'], native_validation_matches=(native.get('validation') or {}).get('status') == v.get('status'))
                    if native.get('physical_solution') and result.get('physical_solution'):
                        row['native_objective_absolute_difference'] = abs(native['physical_solution']['objective'] - result['physical_solution']['objective'])
                        differences = {}
                        for i, coord in enumerate(result['scaling_report']['physical_coordinates']['variables']):
                            differences[coord['unit']] = max(differences.get(coord['unit'], 0), abs(native['physical_solution']['x'][i] - result['physical_solution']['x'][i]))
                        row['native_primal_absolute_differences_by_unit'] = json.dumps(differences, sort_keys=True)
        rows.append(row)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('study', type=pathlib.Path)
    parser.add_argument('output', type=pathlib.Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for kind, directory in [('native', args.study), ('wasi', args.study / 'wasi')]:
        rows = records(directory)
        if not rows:
            continue
        environment_path = directory / 'environment.json'
        if environment_path.exists():
            environment = json.loads(environment_path.read_text())
            expected = environment.get('case_count', len(environment.get('cases', [])))
            if len(rows) != expected:
                raise ValueError(f'incomplete {kind} study: {len(rows)} of {expected} cases')
        columns = list(dict.fromkeys(k for row in rows for k in row))
        path = args.output / f'pr3-{kind}.csv'
        with path.open('w', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=columns, lineterminator='\n')
            writer.writeheader()
            writer.writerows(rows)
        print(f'{path}: {len(rows)} cases')
    environment = {}
    for kind, directory in [('native', args.study), ('wasi', args.study / 'wasi')]:
        path = directory / 'environment.json'
        if path.exists():
            environment[kind] = json.loads(path.read_text())
    (args.output / 'pr3-environment.json').write_text(json.dumps(environment, indent=2) + '\n')


if __name__ == '__main__':
    main()
