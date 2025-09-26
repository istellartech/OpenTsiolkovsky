#!/usr/bin/python
import numpy as np
import pandas as pd
import os
import json
import sys
import multiprocessing as mp

def apply_extend(arg):
    [id_proc, Nproc, input_directory, input_file_template, output_file_template, number_of_sample, nominalfile, suffix] = arg

    shou  = int((number_of_sample + 1) / Nproc)
    amari = number_of_sample + 1 - shou * Nproc
    start_index = shou *  id_proc      + min(amari, id_proc)
    end_index   = shou * (id_proc + 1) + min(amari, id_proc + 1)

    for i in range(start_index, end_index):
        caseNo = i
        if id_proc == 0: print("{0:}/{1:}".format(caseNo, end_index))

        # make filename
        input_file  = input_file_template.format(caseNo)
        output_file = output_file_template.format(caseNo)
        os.system("aws s3 cp "+ input_directory + input_file + " output/ > /dev/null")
        #os.system("cp data/"+filename+" .") ######## FOR DEBUG########################

        # load nominal json
        fp = open(nominalfile)
        data = json.load(fp)
        fp.close()

        # modify json
        data["name(str)"] = "case{0:05d}_{1:s}".format(caseNo, suffix)

        # writeout json
        tmpjson = "tmp_{}.json".format(id_proc)
        fo = open(tmpjson, "w")
        json.dump(data, fo, indent=4)
        fo.close()

        os.system("python make_extend_output_mc.py {} > /dev/null".format(tmpjson))

        os.system("aws s3 cp output/" + output_file + " " + input_directory + "  > /dev/null")

      
        # remove temporary csv
        os.system("rm {}".format(tmpjson))
        os.system("rm output/{}".format(input_file))
        os.system("rm output/{}".format(output_file))

if __name__ == "__main__":
    #Nproc = 1
    Nproc = mp.cpu_count()-1

    print("IST EXTEND APPLYER")
    print("libraries load done.")

    argv = sys.argv
    if len(argv) > 1:
        otmc_mission_name = argv[1]
    else:
        print "PLEASE INPUT mission_name as the command line argument."
        exit()

    os.system("aws s3 cp s3://otmc/{0:s}/raw/inp/mc.json .".format(otmc_mission_name))

    fp = open("mc.json")
    data = json.load(fp)
    fp.close()

    number_of_sample     = data["Ntask"]
    nominalfile          = data["nominalfile"]
    suffix               = data["suffix"]
    input_directory      = "s3://otmc/" + otmc_mission_name + "/raw/output/"
    input_file_template  = "case{0:05d}"+"_{0:s}_dynamics_1.csv".format(suffix)
    output_file_template = "case{0:05d}"+"_{0:s}_dynamics_1_extend.csv".format(suffix)

    os.system("aws s3 cp s3://otmc/{0:s}/raw/inp/".format(otmc_mission_name) + nominalfile + " .")

    # parallel processing 
    pool = mp.Pool(Nproc)
    callback = pool.map(apply_extend, [(id_proc, Nproc, input_directory, input_file_template, output_file_template, number_of_sample, nominalfile, suffix) for id_proc in range(Nproc)])
    pool.terminate()
    pool.close()
