#!/usr/bin/python
# coding: utf-8
from __future__ import print_function, division, unicode_literals, absolute_import
import os, sys
import subprocess as sp

if __name__=="__main__":
    if(len(sys.argv) == 1) :
        print("usage: python", sys.argv[0], "TAGET_DIR", "[N_ARRAY]")
        exit(1)

    parent_dir = sys.argv[1]
    if(len(sys.argv) > 2) :
        n_array = int(sys.argv[2])
        i_array = int(os.getenv("AWS_BATCH_JOB_ARRAY_INDEX"))
    else :
        n_array = 1
        i_array = 0

    is_aws = parent_dir.startswith("s3://")
    if is_aws:
        prefix = "aws s3 "
    else :
        prefix = ""
        parent_dir = os.path.abspath(parent_dir)

    curr_dir = os.path.abspath(".")
    path_tsio = os.getenv("PATH_OPENTSIO", "/usr/local/OpenTsiolkovsky/bin")    # default path
    os.chdir(path_tsio)

    child_dirs = sp.check_output("{0}ls -F {1} | grep / | sed 's/\///g'".format(prefix, parent_dir), shell=True).decode("utf-8").strip().split("\n")

    for j in range(i_array, len(child_dirs), n_array):
        ch_fullpath = "{0}/{1}".format(parent_dir, child_dirs[j])
        try :
            ret = os.system("{0}ls {1}/raw/inp/mc.json".format(prefix, ch_fullpath))
            if ret == 0: # mc.json is exist
                os.system("python ./monte_carlo.py {0}".format(ch_fullpath))
        except :
            pass

    os.chdir(curr_dir)

