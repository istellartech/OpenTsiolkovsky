#!/usr/bin/python3
# coding: utf-8
import json
import copy
from numpy import random
from numpy.random import normal, rand
import os
import sys
import multiprocessing
import subprocess
from collections import OrderedDict


def error_loader(data, route):
    result = []
    for k, v in data.items():
        if k == "multiply_statistically" or \
                k == "add_statistically" or \
                k == "from_error_files"  or \
                k == "from_error_directory":
            result.append([[k, v], route])
            return result
        tmp_route = copy.deepcopy(route)
        tmp_route.append(["dict", k])
        if isinstance(v, dict):
            child_result = error_loader(v, tmp_route)
            result.extend(child_result)
    return result


def error_applyer(value, route, data):
    key = route.pop(0)
    key = key[1]
    if len(route) == 0:
        if   value[0] == "multiply_statistically":
            random_number = normal(0, value[1] / 3)
            data[key] *= 1 + random_number
        elif value[0] == "add_statistically":
            random_number = normal(0, value[1] / 3)
            data[key] += random_number
        elif value[0] == "from_error_files":
            random_number = rand() * len(value[1])
            data[key] = value[1][int(random_number)]
        elif value[0] == "from_error_directory":
            path = value[1]
            files = [f for f in os.listdir(path) if not f.startswith('.')]
            files_file = sorted([f for f in files if os.path.isfile(os.path.join(path, f))])
            random_number = rand() * len(files_file)
            data[key] = os.path.join(path, files_file[int(random_number)])
    else:
        error_applyer(value, route, data[key])


def error_input_maker(errorfile, nominalfile, inpfile, outfile, error_seed):
    random.seed(error_seed)

    # load gosa
    fp = open(errorfile)
    data = json.load(fp, object_pairs_hook=OrderedDict)
    fp.close()
    data_gosa = error_loader(data, [])

    # load nominal json
    fp = open(nominalfile)
    fo = open(inpfile, "w")
    data = json.load(fp, object_pairs_hook=OrderedDict)
    data["name(str)"] = outfile

    # apply gosa
    if error_seed > 0:
        for gosa in data_gosa:
            error_applyer(gosa[0], gosa[1], data)

    # save json w/ gosa
    json.dump(data, fo, indent=4)
    fo.close()
    fp.close()


def wrapper_opentsio(i, suffix, nominalfile, gosafile, missionpath):
    inputfile  = "case{0:05d}_{1:s}.json".format(i, suffix)
    outputfile = "case{0:05d}_{1:s}".format(i, suffix)
    stdoutfile = "case{0:05d}_{1:s}.stdout.dat".format(i, suffix)

    error_input_maker(gosafile, nominalfile, inputfile, outputfile, i)

    for i in range(5):  # retry 5 times
        proc = subprocess.Popen("./OpenTsiolkovsky "+inputfile+" > "+stdoutfile, shell=True)
        try:
            rc = proc.wait(timeout=60)  # timeout: 60[s]
            if rc == 0:                 # success
                break
        except subprocess.TimeoutExpired:
            proc.kill()

    is_aws = missionpath.startswith("s3://")
    if is_aws:
        os.system("aws s3 cp " + inputfile  + " " + missionpath + "/raw/output/")
        os.system("aws s3 cp " + stdoutfile + " " + missionpath + "/raw/output/")
        os.system('aws s3 cp ./output/ ' + missionpath + '/raw/output/ --exclude "*" --include "'+outputfile+'_dynamics_?.csv" --recursive')
    else:
        os.system("cp " + inputfile  + " " + missionpath + "/raw/output/")
        os.system("cp " + stdoutfile + " " + missionpath + "/raw/output/")
        os.system("cp ./output/"+outputfile+"_dynamics_?.csv " + missionpath + "/raw/output/")

    os.system("rm " + inputfile)
    os.system("rm " + stdoutfile)
    os.system("rm ./output/"+outputfile+"_dynamics_?.csv")


if __name__ == "__main__":
    Nproc = max(multiprocessing.cpu_count() - 3, 1)    # number of processor

    if len(sys.argv) >= 2:
        missionpath = sys.argv[1]
    else:
        missionname = os.getenv("otmc_mission_name")
        missionpath = "s3://otmc/" + missionname

    is_aws = missionpath.startswith("s3://")
    if is_aws:
        os.system("aws s3 cp " + missionpath + "/raw/inp . --recursive")
    else:
        os.system("cp -r " + missionpath + "/raw/inp/* .")

    with open("mc.json") as fp:
        data = json.load(fp, object_pairs_hook=OrderedDict)

    Ntask       = data["Ntask"]
    suffix      = data["suffix"]
    nominalfile = data["nominalfile"]
    gosafile    = data["gosafile"]

    if "NLoop" in data.keys():
        NLoop       = data["NLoop"]
        i = int(os.getenv("AWS_BATCH_JOB_ARRAY_INDEX"))

        for loop_index in range(NLoop):
            array_p = []
            for j in range(Nproc):
                id_task = (NLoop * i + loop_index) * Nproc + j
                if id_task > Ntask:
                    continue
                p = multiprocessing.Process(target=wrapper_opentsio, args=(id_task, suffix, nominalfile, gosafile, missionpath))
                array_p.append(p)
                p.start()

            for p in array_p:
                p.join()
    else:
        pool = multiprocessing.Pool(Nproc)

        for id_task in range(Ntask + 1):
            pool.apply_async(wrapper_opentsio, (id_task, suffix, nominalfile, gosafile, missionpath))

        pool.close()
        pool.join()
