#!/usr/bin/python3
# coding: utf-8
from __future__ import print_function
import json
import os
import sys
import numpy as np
import pandas as pd
from scipy import interpolate
import copy
from collections import OrderedDict

if __name__ == "__main__":
    if(len(sys.argv) < 4):
        print("usage: python", sys.argv[0], "TARGET_DIR", "T_MAX", "T_SPAN")
        exit(1)
    target_dir = sys.argv[1]
    t_max = float(sys.argv[2])
    t_span = float(sys.argv[3])

    base_dir = "{}/base".format(target_dir)
    cutoff_dir = "{}/cutoff".format(target_dir)

    is_aws = target_dir.startswith("s3://")

    temp_dir = "./_temp_"
    while os.path.exists(temp_dir):
        temp_dir += "_"
    os.system(r"mkdir {}".format(temp_dir))

    if is_aws:
        os.system(r"aws s3 cp {}/raw/inp {} --recursive --exclude '*' --include '*.json'".format(base_dir, temp_dir))
        os.system(r"aws s3 cp {}/raw/inp/output {}/output --recursive --exclude '*' --include '*_dynamics_1.csv'".format(base_dir, temp_dir))
    else:
        os.system(r"cp {}/raw/inp/*.json {}".format(base_dir, temp_dir))
        os.system(r"mkdir {}/output/".format(temp_dir))
        os.system(r"cp {}/raw/inp/output/*_dynamics_1.csv {}/output/".format(base_dir, temp_dir))

    with open("{}/mc.json".format(temp_dir)) as fp:
        mc = json.load(fp, object_pairs_hook=OrderedDict)
    nomfile = mc["nominalfile"]
    with open("{}/{}".format(temp_dir, nomfile)) as fp:
        nom = json.load(fp, object_pairs_hook=OrderedDict)
    name = nom["name(str)"]
    df = pd.read_csv("{}/output/{}_dynamics_1.csv".format(temp_dir, name), index_col=False)
    time_nom = df["time(s)"].values
    mass_nom = df["mass(kg)"].values
    mass_nom_at = interpolate.interp1d(time_nom, mass_nom)

    for t in np.arange(t_span, t_max + t_span, t_span):
        t_dir = "{}/{:06.2f}".format(cutoff_dir, t)
        print(t_dir)

        if is_aws:
            os.system(r"aws s3 cp {}/raw/inp {}/raw/inp --recursive".format(base_dir, t_dir))
            os.system(r"aws s3 cp {}/stat/inp {}/stat/inp --recursive".format(base_dir, t_dir))
        else:
            # os.system(r"mkdir -p {}/raw/inp".format(t_dir))
            os.system(r"mkdir -p {}/raw/output".format(t_dir))
            os.system(r"cp -r {}/raw/inp {}/raw/inp".format(base_dir, t_dir))
            # os.system(r"mkdir -p {}/stat/inp".format(t_dir))
            os.system(r"mkdir -p {}/stat/output".format(t_dir))
            os.system(r"cp -r {}/stat/inp {}/stat/inp".format(base_dir, t_dir))

        mc_t = copy.deepcopy(mc)
        nom_t = copy.deepcopy(nom)

        mc_t["suffix"] = mc_t["suffix"] + "_{:06.2f}".format(t)
        with open("{}/mc.json".format(temp_dir), "w") as fp:
            json.dump(mc_t, fp, indent=4)

        t_coff_nom = nom_t["stage1"]["thrust"]["forced cutoff time(time of each stage)[s]"]
        beta_nom = nom_t["stage1"]["aero"]["ballistic coefficient(ballistic flight mode)[kg/m2]"]
        t_coff_new = t
        beta_new = beta_nom * mass_nom_at(t_coff_new) / mass_nom_at(t_coff_nom)

        nom_t["stage1"]["thrust"]["forced cutoff time(time of each stage)[s]"] = t_coff_new
        nom_t["stage1"]["aero"]["ballistic coefficient(ballistic flight mode)[kg/m2]"] = beta_new
        with open("{}/{}".format(temp_dir, nomfile), "w") as fp:
            json.dump(nom_t, fp, indent=4)

        if is_aws:
            os.system(r"aws s3 mv {} {}/raw/inp --recursive --exclude '*' --include '*.json'".format(temp_dir, t_dir))
        else:
            os.system(r"mv {}/*.json {}/raw/inp".format(temp_dir, t_dir))

    os.system(r"rm -rf {}".format(temp_dir))
