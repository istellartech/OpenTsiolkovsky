#!/usr/bin/python3
import pandas as pd
import numpy as np
import os
import json
import sys
import multiprocessing as mp
import math
from collections import OrderedDict
import time as pytime

def read_data_points(arg):
    [id_proc, Nproc, input_directory, input_file_template, number_of_sample, Nfetch, sample_points] = arg

    time0 = pytime.time()

    shou  = int(number_of_sample/Nproc)
    amari = number_of_sample - shou * Nproc
    start_index = shou *  id_proc      + min(amari, id_proc)
    end_index   = shou * (id_proc + 1) + min(amari, id_proc + 1)

    key_variable_names_all = ["time(s)"]
    for sample_point in sample_points:
        key_variable_names_all.extend(sample_points[sample_point])        
    key_variable_names_all = sorted(set(key_variable_names_all),key=key_variable_names_all.index)

    dfs = OrderedDict({k:pd.DataFrame() for k in key_variable_names_all})

    for i in range(start_index, end_index):
        caseNo = i+1
        filename = input_file_template.format(caseNo)

        os.system("aws s3 cp "+input_directory+filename+" . > /dev/null")
        if id_proc == 0: 
            print("{0:}/{1:}".format(caseNo, end_index))
        #os.system("cp data/"+filename+" .") ######## FOR DEBUG##################

        # format csv file to proper form
        try :
          fp = open(filename)
        except :
          continue
        ft = open("tmp_{}.csv".format(id_proc),"w")
        for line in fp:
            ft.write(line.replace(",\n","\n"))
        fp.close()
        ft.close()
        #if id_proc == 0: 
        #    print("DOWNLOADED  ID#{:2d} CASE#{:5d} : {:f}seconds".format(id_proc,caseNo,pytime.time() - time0)) #for benchmark

        # fetch data
        df = pd.read_csv("tmp_{}.csv".format(id_proc),usecols=key_variable_names_all)
        

        for key_variable_name in key_variable_names_all:

            if dfs[key_variable_name].empty:
                dfs[key_variable_name] = df.loc[:,key_variable_name]
            else:
                dfs[key_variable_name] = pd.concat([dfs[key_variable_name], df.loc[:,key_variable_name]], axis=1, join="outer")

        # remove temporary csv
        os.system("rm "+filename)
        os.system("rm tmp_{}.csv".format(id_proc))

    return dfs

def fetch_stat(src, fetch_mode, number_of_sample, Nfetch, probability):
    src2 = sorted(src.dropna())
    Nsample = len(src2)
    ret = [0,0]
    if fetch_mode == "constant":
        if Nsample < Nfetch:
            ret[0] = np.nan
            ret[1] = np.nan
        else:
            Nfetch_tmp = Nfetch -1
            high_index = - Nfetch_tmp - 1
            low_index  =   Nfetch_tmp
            ret[0] = src2[high_index]
            ret[1] = src2[low_index]
    elif fetch_mode == "constant high":
        if Nsample < Nfetch:
            ret[0] = np.nan
            ret[1] = np.nan
        else:
            Nfetch_tmp = Nfetch -1
            high_index = - Nfetch_tmp - 1
            low_index  =   Nfetch_tmp - (number_of_sample - Nsample)
            ret[0] = src2[high_index]
            if low_index < 0:
                ret[1] = np.nan
            else:
                ret[1] = src2[low_index]
    else: #variable
        Nfetch_tmp = math.ceil(Nsample * probability)
        Nfetch_tmp = int((Nsample - Nfetch_tmp)/2.0)
        high_index = - Nfetch_tmp - 1
        low_index  =   Nfetch_tmp
        ret[0] = src2[high_index]
        ret[1] = src2[low_index]       
        
    return ret

if __name__ == "__main__":
    #Nproc = 2
    start_time = pytime.time()
    Nproc = mp.cpu_count()-1
    
    stat_input = "covariance.json"
    
    print("IST COVARIANCE MAKER")
    print("libraries load done.")


    argv = sys.argv
    if len(argv) > 1:
        otmc_mission_name = argv[1]
    else:
        print( "PLEASE INPUT mission_name as the command line argument.")
        exit()

    os.system("aws s3 cp s3://otmc/{0:s}/raw/inp/mc.json .".format(otmc_mission_name))
    
    fp = open("mc.json")
    data = json.load(fp)
    fp.close()

    number_of_sample    = data["Ntask"]
    input_directory     = "s3://otmc/" + otmc_mission_name + "/raw/output/"
    input_file_template = "case{0:05d}"+"_{0:s}_dynamics_1.csv".format(data["suffix"])


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
        print ("ERROR: fetch mode must be 'constant', 'constant high' or 'variable'")
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

    print('loading complete. time: {:f} second'.format(pytime.time()-start_time))
    
    # join them
    key_variable_names_all = ["time(s)"]
    for sample_point in sample_points:
        key_variable_names_all.extend(sample_points[sample_point])        
    key_variable_names_all = sorted(set(key_variable_names_all),key=key_variable_names_all.index)

    dfs = OrderedDict({k:pd.DataFrame() for k in key_variable_names_all})

    time0 = pytime.time()
    for key_variable_name in dfs.keys():
        dfs[key_variable_name] = pd.concat(list(map(lambda x:x[key_variable_name], callback)), axis=1, join="outer")

    time_m = pytime.time() - time0
    #print("MERGE: {:f} seconds".format(time_m)) #for benchmark

    for key_sample_point in sample_points.keys():

        df_out = pd.DataFrame()
        key_variable_names = sample_points[key_sample_point]

        for key_variable_name in key_variable_names:
            
            time0 = pytime.time()
            
            if key_sample_point == "all":
                df_src = dfs[key_variable_name].T
                df_stat = df_src.apply(lambda x:fetch_stat(x, fetch_mode, number_of_sample, Nfetch, probability)).T
            elif key_sample_point == "landing_time":
                df_src = dfs[key_variable_name].fillna(method='ffill').T.iloc[:,-1]
                df_stat = pd.DataFrame(fetch_stat(df_src, fetch_mode, number_of_sample, Nfetch, probability),columns=[key_sample_point]).T
            else:
                df_src = dfs[key_variable_name].T.iloc[:,int(key_sample_point)]
                df_stat = pd.DataFrame(fetch_stat(df_src, fetch_mode, number_of_sample, Nfetch, probability),columns=[int(key_sample_point)]).T

            df_stat.columns = [key_variable_name+"_high", key_variable_name+"_low"]
            

            if df_out.empty:
                df_out = df_stat
            else:
                df_out = df_out.join(df_stat,how="outer")

           
            #print("STAT : {}, {:f} seconds".format(key_variable_name,pytime.time()-time0)) #for benchmark
            
        df_out.dropna(axis=0,how="all").to_csv("output/covariance_{}.csv".format(key_sample_point))

    os.system("aws s3 cp output s3://otmc/{0:s}/stat/output/ --exclude '*' --include 'covariance_*.csv' --recursive".format(otmc_mission_name))

    print('calculation complete. total time: {:f} second'.format(pytime.time()-start_time))
