#!/usr/bin/python
import numpy as np
import pandas as pd
import os
import json
import sys
import multiprocessing as mp
import math
from collections import OrderedDict

def read_data_points(arg):
    [id_proc, Nproc, input_directory, input_file_template, number_of_sample, Nfetch, sample_points] = arg

    fo_buff    = {k:OrderedDict() for k in sample_points.keys()}
    fo_counter = {k:OrderedDict() for k in sample_points.keys()}
    
    shou  = int(number_of_sample/Nproc)
    amari = number_of_sample - shou * Nproc
    start_index = shou *  id_proc      + min(amari, id_proc)
    end_index   = shou * (id_proc + 1) + min(amari, id_proc + 1)

    for i in range(start_index, end_index):
        caseNo = i+1
        filename = input_file_template.format(caseNo)
        os.system("aws s3 cp "+input_directory+filename+" . > /dev/null")
        if id_proc == 0: print("{0:}/{1:}".format(caseNo, end_index))
        #os.system("cp data/"+filename+" .") ######## FOR DEBUG##################
        
        # format csv file to proper form
        fp = open(filename)
        ft = open("tmp_{}.csv".format(id_proc),"w")
        for line in fp:
            ft.write(line.replace(",\n","\n"))
        fp.close()
        ft.close()
        
        # fetch data
        df = pd.read_csv("tmp_{}.csv".format(id_proc))
        for key_sample_point in sample_points.keys():
            indicies    = OrderedDict()
            key_samples = []
            if key_sample_point == "all":
                for time in df["time(s)"]:
                    key_formatted = str(time)
                    indicies[key_formatted] = time
                    key_samples.append(key_formatted)
            else:
                if key_sample_point == "landing_time":
                    indicies[key_sample_point] = -1
                else:
                    indicies[key_sample_point] = int(key_sample_point)
                key_samples = [key_sample_point]

            for key_sample in key_samples:
                if not key_sample in fo_buff[key_sample_point]:
                    fo_buff[key_sample_point][key_sample] = {"high":OrderedDict(), "low":OrderedDict()}
                    for key_variable_name in sample_points[key_sample_point]:
                        fo_buff[key_sample_point][key_sample]["high"][key_variable_name] = []
                        fo_buff[key_sample_point][key_sample]["low"][key_variable_name] = []
                    fo_counter[key_sample_point][key_sample] = 0
                fo_counter[key_sample_point][key_sample] += 1
                       
                index = indicies[key_sample]
                for key_variable_name in sample_points[key_sample_point]:
                    if len(fo_buff[key_sample_point][key_sample]["high"][key_variable_name]) > Nfetch:
                        fo_buff[key_sample_point][key_sample]["high"][key_variable_name][0] = df.pipe(lambda df: df[df["time(s)"] == index]).iloc[0][key_variable_name]
                    else:
                        fo_buff[key_sample_point][key_sample]["high"][key_variable_name].append(df.pipe(lambda df: df[df["time(s)"] == index]).iloc[0][key_variable_name])
                    fo_buff[key_sample_point][key_sample]["high"][key_variable_name].sort()

                    if len(fo_buff[key_sample_point][key_sample]["low"][key_variable_name]) > Nfetch:
                        fo_buff[key_sample_point][key_sample]["low"][key_variable_name][Nfetch] = df.pipe(lambda df: df[df["time(s)"] == index]).iloc[0][key_variable_name]
                    else:
                        fo_buff[key_sample_point][key_sample]["low"][key_variable_name].append(df.pipe(lambda df: df[df["time(s)"] == index]).iloc[0][key_variable_name])
                    fo_buff[key_sample_point][key_sample]["low"][key_variable_name].sort()
    
        # remove temporary csv
        os.system("rm "+filename)
        os.system("rm tmp_{}.csv".format(id_proc))

    return [fo_buff, fo_counter]

if __name__ == "__main__":
    #Nproc = 2
    Nproc = mp.cpu_count()-1
    
    stat_input = "covariance.json"
    
    print("IST COVARIANCE MAKER")
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

    number_of_sample    = data["Ntask"]
    input_directory     = "s3://otmc/" + otmc_mission_name + "/raw/output/"
    input_file_template = "case{0:05d}"+"_{0:s}_dynamics_1_extend.csv".format(data["suffix"])


    os.system("aws s3 cp s3://otmc/{0:s}/stat/inp/covariance.json .".format(otmc_mission_name))

    fp = open(stat_input)
    stat = json.load(fp)
    fp.close()

    fetch_mode          = stat["fetch mode"]
    sample_points       = stat["sample points"]
    probability         = stat["probability(%)"]
    if "N/A substitute" in stat:
        NA_substitute   = stat["N/A substitute"]
    else:
        NA_substitute   = "N/A"

    ### INITIALIZE AND SANITARIZE ##############################################
    number_of_sample = int(number_of_sample )
    probability = float(probability ) * 1e-2
    if      fetch_mode != "constant" \
        and fetch_mode != "constant high" \
        and fetch_mode != "variable":
        print "ERROR: fetch mode must be 'constant', 'constant high' or 'variable'"
        exit(1)
    Nfetch = math.ceil(number_of_sample * probability)
    Nfetch = int((number_of_sample - Nfetch)/2.0) + 1
  
    # parallel processing 
    pool = mp.Pool(Nproc)
    args = [(id_proc, Nproc, input_directory, input_file_template, number_of_sample, Nfetch, sample_points) for id_proc in range(Nproc)]
    callback = pool.map(read_data_points, args)
    pool.terminate()
    pool.close()

#    # debug
#    read_data_points(args[0])
#    exit()

#    # debug
#    id_proc = 0
#    callback = [read_data_points((id_proc, Nproc, input_directory, input_file_template, number_of_sample, Nfetch, sample_points))]

    # join them
    fo_buff    = {k:OrderedDict() for k in sample_points.keys()}
    fo_counter = {k:OrderedDict() for k in sample_points.keys()}
    for id_proc in range(Nproc):
        fo_buff_sub    = callback[id_proc][0]
        fo_counter_sub = callback[id_proc][1]
        for key_sample_point in sample_points.keys():
            for key_sample in fo_buff_sub[key_sample_point].keys():
                if not key_sample in fo_counter[key_sample_point]:
                    fo_counter[key_sample_point][key_sample] = 0
                    fo_buff[key_sample_point][key_sample] = {"high":OrderedDict(), "low":OrderedDict()}
                    for key_variable_name in sample_points[key_sample_point]:
                        fo_buff[key_sample_point][key_sample]["high"][key_variable_name] = []
                        fo_buff[key_sample_point][key_sample]["low"][key_variable_name] = []

                fo_counter[key_sample_point][key_sample] += fo_counter_sub[key_sample_point][key_sample]


                for key_variable_name in fo_buff_sub[key_sample_point][key_sample]["low"].keys():
                    fo_buff[key_sample_point][key_sample]["high"][key_variable_name].extend(\
                            fo_buff_sub[key_sample_point][key_sample]["high"][key_variable_name])
                    fo_buff[key_sample_point][key_sample]["low" ][key_variable_name].extend(\
                            fo_buff_sub[key_sample_point][key_sample]["low" ][key_variable_name])

                    fo_buff[key_sample_point][key_sample]["high"][key_variable_name].sort()
                    fo_buff[key_sample_point][key_sample]["low" ][key_variable_name].sort()

    ########### WRITE OUT covariance_*.csv ########################################################
    for key_sample_point in sample_points.keys():
        fo = open("output/covariance_" + key_sample_point + ".csv","w")

        # title
        fo.write("sample point")
        for key_variable_name in sample_points[key_sample_point]:
            fo.write("," + key_variable_name + "_high")
            fo.write("," + key_variable_name + "_low")
        fo.write("\n")

        # main content 
        key_samples = fo_buff[key_sample_point].keys()
        if len(key_samples) > 1:
            key_samples = sorted(key_samples, key=lambda x: float(x))
            
        for key_sample in key_samples:
            if fetch_mode == "constant":
                Nsample = fo_counter[key_sample_point][key_sample]
                if Nsample < Nfetch:
                    continue
                Nfetch_tmp = Nfetch -1
                high_index = - Nfetch_tmp - 1
                low_index  =   Nfetch_tmp

                fo.write(key_sample)
                for key_variable_name in fo_buff[key_sample_point][key_sample]["low"].keys():
                    fo.write("," + str(fo_buff[key_sample_point][key_sample]["high"][key_variable_name][high_index]))
                    fo.write("," + str(fo_buff[key_sample_point][key_sample]["low" ][key_variable_name][low_index]))
                fo.write("\n")
            elif fetch_mode == "constant high":
                Nsample = fo_counter[key_sample_point][key_sample]
                if Nsample < Nfetch:
                    continue
                Nfetch_tmp = Nfetch -1
                high_index = - Nfetch_tmp - 1
                low_index  =   Nfetch_tmp - (number_of_sample - Nsample)

                fo.write(key_sample)
                if low_index < 0:
                    for key_variable_name in fo_buff[key_sample_point][key_sample]["low"].keys():
                        fo.write("," + str(fo_buff[key_sample_point][key_sample]["high"][key_variable_name][high_index]))
                        fo.write("," + str(NA_substitute))
                else:
                    for key_variable_name in fo_buff[key_sample_point][key_sample]["low"].keys():
                        fo.write("," + str(fo_buff[key_sample_point][key_sample]["high"][key_variable_name][high_index]))
                        fo.write("," + str(fo_buff[key_sample_point][key_sample]["low" ][key_variable_name][low_index]))
                fo.write("\n")
            else: # variable
                Nsample = fo_counter[key_sample_point][key_sample]
                Nfetch_tmp = math.ceil(Nsample * probability)
                Nfetch_tmp = int((Nsample - Nfetch_tmp)/2.0)
                high_index = - Nfetch_tmp - 1
                low_index  =   Nfetch_tmp

                fo.write(key_sample)
                for key_variable_name in fo_buff[key_sample_point][key_sample]["low"].keys():
                    fo.write("," + str(fo_buff[key_sample_point][key_sample]["high"][key_variable_name][high_index]))
                    fo.write("," + str(fo_buff[key_sample_point][key_sample]["low" ][key_variable_name][low_index]))
                fo.write("\n")

        fo.close()

    os.system("aws s3 cp output s3://otmc/{0:s}/stat/output/ --exclude '*' --include 'covariance_*.csv' --recursive".format(otmc_mission_name))
