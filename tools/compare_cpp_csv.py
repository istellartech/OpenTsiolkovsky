#!/usr/bin/env python3
"""
Compare C++-style CSVs from C++ and Rust runs.

Usage:
  python tools/compare_cpp_csv.py bin/output/sample_01_dynamics_1.csv rust/run_cppcsv_dynamics_cpp.csv

Reports per-column RMSE and key metric deltas (max altitude, apogee time).
"""
import csv
import sys
from math import sqrt

KEYS = {
    'time': 'time(s)',
    'alt': 'altitude(m)',
    'lat': 'lat(deg)',
    'lon': 'lon(deg)',
    'posx': 'pos_ECI_X(m)', 'posy': 'pos_ECI_Y(m)', 'posz': 'pos_ECI_Z(m)',
    'velx': 'vel_ECI_X(m/s)', 'vely': 'vel_ECI_Y(m/s)', 'velz': 'vel_ECI_Z(m/s)',
    'vnedx':'vel_NED_X(m/s)', 'vtedy':'vel_NED_Y(m/s)', 'vnedz':'vel_NED_Z(m/s)',
    'q':'dynamic pressure(Pa)', 'mach':'Mach number',
}

def read_csv(path):
    with open(path, newline='') as f:
        r = csv.DictReader(f)
        rows = list(r)
    return rows

def index_by_time(rows):
    idx = {}
    for row in rows:
        try:
            t = float(row[KEYS['time']])
        except Exception:
            continue
        idx[round(t, 3)] = row
    return idx

def rmse(xs):
    if not xs: return 0.0
    return sqrt(sum(x*x for x in xs)/len(xs))

def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    rows_cpp = read_csv(sys.argv[1])
    rows_rs  = read_csv(sys.argv[2])
    idx_cpp = index_by_time(rows_cpp)
    idx_rs  = index_by_time(rows_rs)
    common_ts = sorted(set(idx_cpp.keys()) & set(idx_rs.keys()))
    if not common_ts:
        print('No common time stamps')
        sys.exit(2)
    diffs = {k: [] for k in ['alt','lat','lon','posx','posy','posz','velx','vely','velz','vnedx','vtedy','vnedz','q','mach']}
    for t in common_ts:
        c = idx_cpp[t]; r = idx_rs[t]
        for k in diffs.keys():
            try:
                cval = float(c[KEYS[k]])
                rval = float(r[KEYS[k]])
                diffs[k].append(rval - cval)
            except Exception:
                pass
    print('Samples compared:', len(common_ts))
    for k, arr in diffs.items():
        print(f'RMSE {k}: {rmse(arr):.6g}')

    # Max altitude comparison
    def max_alt(rows):
        m = -1e99; tm = None
        for row in rows:
            try:
                alt = float(row[KEYS['alt']])
                t = float(row[KEYS['time']])
            except Exception:
                continue
            if alt > m:
                m = alt; tm = t
        return m, tm
    cmax, ct = max_alt(rows_cpp)
    rmax, rt = max_alt(rows_rs)
    print('Max alt C++:', cmax, '@', ct)
    print('Max alt Rust:', rmax, '@', rt)
    if cmax != 0:
        print('Diff %:', 100.0*(rmax-cmax)/cmax)

if __name__ == '__main__':
    main()

