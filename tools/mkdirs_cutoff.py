#!/usr/bin/python
# coding: utf-8
from __future__ import print_function, division, unicode_literals, absolute_import
import json
import os, sys
import numpy as np
import pandas as pd
from scipy import interpolate

if __name__=="__main__":
    if(len(sys.argv) < 4) :
        print("usage: python", sys.argv[0], "TARGET_DIR", "T_MAX", "T_SPAN")
        exit(1)
    target_dir = sys.argv[1]
    t_max = float(sys.argv[2])
    t_span = float(sys.argv[3])

    base_dir = "{}/base".format(target_dir)
    cutoff_dir = "{}/cutoff".format(target_dir)

    is_aws = target_dir.startswith("s3://")
    if is_aws:
        prefix = "aws s3 "
    else :
        prefix = ""

    temp_dir = "./my_temp_dir_999"
    if not os.path.exists(temp_dir) : os.system(r"mkdir {}".format(temp_dir))

    if is_aws :
        os.system(r"{0}cp {1}/raw/inp {2} --recursive".format(prefix, t_dir, temp_dir))
    else :
        os.system(r"{0}cp {1}/raw/inp/* {2}".format(prefix, t_dir, temp_dir))
    
    with open("{0}/mc.json".format(temp_dir)) as fp :
        mc = json.load(fp)
    nomfile = mc["nominalfile"]
    with open("{0}/{1}".format(temp_dir, nomfile)) as fp:
        nom = json.load(fp)
    df = pd.read_csv("{0}/output/{1}_dynamics_1.csv".format(temp_dir, nom["name(str)"]))
    time_nom = df["time(s)"].values
    mass_nom = df["mass(kg)"].values
    mass_nom_at = interpolate.interp1d(time_nom, mass_nom)

    for t in np.arange(t_span, t_max+t_span, t_span) :
        t_dir = "{0}/{1:06.2f}".format(cutoff_dir, t)
        print(t_dir)

        if is_aws :
            os.system(r"{0}cp {1}/raw/inp {2}/raw/inp --recursive".format(prefix, base_dir, t_dir))
        else :
            os.system(r"mkdir -p {}/raw/inp".format(t_dir))
            os.system(r"mkdir -p {}/raw/output".format(t_dir))
            os.system(r"{0}cp -r {1}/raw/inp {2}/raw/inp".format(prefix, base_dir, t_dir))

        if is_aws :
            os.system(r"{0}cp {1}/raw/inp {2} --recursive --exclude '*' --include '*.json'".format(prefix, t_dir, temp_dir))
        else :
            os.system(r"{0}cp {1}/raw/inp/*.json {2}".format(prefix, t_dir, temp_dir))

        with open("{0}/mc.json".format(temp_dir)) as fp :
            mc = json.load(fp)

        mc["suffix"] = mc["suffix"] + "_{:06.2f}".format(t)
        with open("{0}/mc.json".format(temp_dir), "w") as fp :
            json.dump(mc, fp, indent=4)

        nomfile = mc["nominalfile"]
        with open("{0}/{1}".format(temp_dir, nomfile)) as fp:
            nom = json.load(fp)
        
        t_coff_nom = nom["stage1"]["thrust"]["forced cutoff time(time of each stage)[s]"]
        beta_nom = nom["stage1"]["aero"]["ballistic coefficient(ballistic flight mode)[kg/m2]"]
        t_coff_new = t
        beta_new = beta_nom * mass_nom_at(t_coff_new) / mass_nom_at(t_coff_nom)

        nom["stage1"]["thrust"]["forced cutoff time(time of each stage)[s]"] = t_coff_new
        nom["stage1"]["aero"]["ballistic coefficient(ballistic flight mode)[kg/m2]"] = beta_new
        with open("{0}/{1}".format(temp_dir, nomfile), "w") as fp:
            json.dump(nom, fp, indent=4)

        if is_aws :
          os.system(r"{0}mv {1} {2}/raw/inp --recursive".format(prefix, temp_dir, t_dir))
        else :
          os.system(r"{0}mv {1}/* {2}/raw/inp".format(prefix, temp_dir, t_dir))

    os.system(r"rm -rf {}".format(temp_dir))

