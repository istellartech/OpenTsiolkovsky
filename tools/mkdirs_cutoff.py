#!/usr/bin/python
# coding: utf-8
from __future__ import print_function, division, unicode_literals, absolute_import
import json
import os, sys
import numpy as np

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
    os.system("mkdir {}".format(temp_dir))

    for t in np.arange(t_span, t_max+t_span, t_span) :
        t_dir = "{0}/{1:.2f}".format(cutoff_dir, t)

        if not is_aws :
            os.system("mkdir -p {}/raw/inp".format(t_dir))
            os.system("mkdir -p {}/raw/output".format(t_dir))
        os.system("{0}cp {1}/raw/inp {2}/raw/inp -r".format(prefix, base_dir, t_dir))

        os.system("{0}cp {1}/raw/inp/*.json {2}".format(prefix, t_dir, temp_dir))
        with open("{0}/mc.json".format(temp_dir)) as fp :
            mc = json.load(fp)

        mc["suffix"] = mc["suffix"] + "_{:.2f}".format(t)
        with open("{0}/mc.json".format(temp_dir), "w") as fp :
            json.dump(mc, fp, indent=4)

        nomfile = mc["nominalfile"]
        with open("{0}/{1}".format(temp_dir, nomfile)) as fp:
            nom = json.load(fp)
        
        nom["stage1"]["thrust"]["forced cutoff time(time of each stage)[s]"] = t
        with open("{0}/{1}".format(temp_dir, nomfile), "w") as fp:
            json.dump(nom, fp, indent=4)

        os.system("{0}mv {1}/*.json {2}/raw/inp".format(prefix, temp_dir, t_dir))

    os.system("rm -rf {}".format(temp_dir))

