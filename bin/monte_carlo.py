#!/usr/bin/python
import json
import copy
from numpy import random
from numpy.random import normal,rand
from datetime import datetime
import os
import multiprocessing

def error_loader(data,route):
    result = []
    for k,v in data.items():
        if k == "multiply_statistically" or \
           k == "add_statistically" or \
           k == "from_error_files" :
            result.append([[k,v],route])
            return result
        tmp_route=copy.deepcopy(route)
        tmp_route.append(["dict",k])
        if isinstance(v,dict):
            child_result = error_loader(v,tmp_route)
            result.extend(child_result)
    return result

def error_applyer(value,route,data):
    key = route.pop(0)
    key = key[1]
    if len(route)==0:
        if   value[0] == "multiply_statistically":
            random_number = normal(0,value[1]/3)
            data[key] *= 1+random_number
        elif value[0] == "add_statistically":
            random_number = normal(0,value[1]/3)
            data[key] += random_number
        elif value[0] == "from_error_files":
            random_number = rand()*len(value[1])
            data[key]=value[1][int(random_number)]
    else:
        error_applyer(value,route,data[key])

def error_input_maker(errorfile,nominalfile,inpfile,outfile,error_seed):
    random.seed(error_seed)

    # load gosa
    fp = open(errorfile)
    data = json.load(fp)
    fp.close()
    data_gosa = error_loader(data,[])
   
    # load nominal json 
    fp = open(nominalfile)
    fo = open(inpfile,"w")
    data = json.load(fp)
    data["name(str)"]=outfile

    # apply gosa
    if error_seed > 0:
        for gosa in data_gosa:
            error_applyer(gosa[0],gosa[1],data)
 
    # save json w/ gosa
    json.dump(data,fo,indent=4)
    fo.close()
    fp.close()

def wrapper_opentsio(i, suffix, nominalfile, gosafile, missionname):
    inputfile  = "case{0:05d}_{1:s}.json".format(i, suffix)
    outputfile = "case{0:05d}_{1:s}".format(i, suffix)
    stdoutfile = "case{0:05d}_{1:s}.stdout.dat".format(i, suffix)

    error_input_maker(gosafile, nominalfile, inputfile, outputfile,i)
        
    os.system("./OpenTsiolkovsky "+inputfile+" > "+stdoutfile)

    os.system("aws s3 cp " + inputfile  + " s3://otmc/" + missionname + "/raw/output/")
    os.system("aws s3 cp " + stdoutfile + " s3://otmc/" + missionname + "/raw/output/")
    os.system("aws s3 cp output/"+outputfile+"_dynamics_1.csv s3://otmc/" + missionname + "/raw/output/")
    os.system("rm " + inputfile)
    os.system("rm " + stdoutfile)
    os.system("rm output/"+outputfile+"_dynamics_1.csv")


if __name__=="__main__":
    Nproc = multiprocessing.cpu_count() - 3    # number of processor

    missionname = os.getenv("otmc_mission_name")
    i = int(os.getenv("AWS_BATCH_JOB_ARRAY_INDEX"))

    os.system("aws s3 cp s3://otmc/" + missionname + "/raw/inp . --recursive")

    fp = open("mc.json")
    data = json.load(fp)
    fp.close()
 
    Ntask       = data["Ntask"]
    suffix      = data["suffix"]
    nominalfile = data["nominalfile"]
    gosafile    = data["gosafile"]
    NLoop       = data["NLoop"]

    for loop_index in range(NLoop):
        array_p = []
        for j in range(Nproc):
            id_task = (NLoop * i + loop_index) * Nproc + j
            if id_task > Ntask:
                continue
            p = multiprocessing.Process(target=wrapper_opentsio,args=(id_task, suffix, nominalfile, gosafile, missionname))
            array_p.append(p)
            p.start()
    
        for p in array_p:
            p.join()

