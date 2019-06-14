#!/usr/bin/python
import numpy as np
import pandas as pd
import os
import json
import sys
import multiprocessing as mp

def read_data_points(arg):
    [id_proc, Nproc, input_directory, input_file_template, number_of_sample, sample_points] = arg

    fo_buff = ["" for i in range(len(sample_points.keys()))]

    shou  = int(number_of_sample/Nproc)
    amari = number_of_sample - shou * Nproc
    start_index = shou *  id_proc      + min(amari, id_proc)
    end_index   = shou * (id_proc + 1) + min(amari, id_proc + 1)

    for i in range(start_index, end_index):
        caseNo = i+1
        filename = input_file_template.format(caseNo)
        os.system("aws s3 cp "+input_directory+filename+" . > /dev/null")
        if id_proc == 0: print("{0:}/{1:}".format(caseNo, end_index))
        #os.system("cp data/"+filename+" .") ######## FOR DEBUG########################
        
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
        
        # fetch data
        df = pd.read_csv("tmp_{}.csv".format(id_proc))
        for i, k in enumerate(sample_points.keys()):
            if k == "landing_time":
                fo_buff[i] += str(caseNo)
                for v in sample_points[k]:
                    fo_buff[i] += "," + str(df.iloc[-1][v])
                fo_buff[i] += "\n"
            else:
                fo_buff[i] += str(caseNo)
                for v in sample_points[k]:
                    fo_buff[i] += "," + str(df.pipe(lambda df: df[df["time(s)"] == float(k)]).iloc[0][v])
                fo_buff[i] += "\n"
    
        # remove temporary csv
        os.system("rm "+filename)
        os.system("rm tmp_{}.csv".format(id_proc))

    return fo_buff

if __name__ == "__main__":
    #Nproc = 1
    Nproc = mp.cpu_count()-1

    stat_input = "datapoint.json"
    
    print("IST DATAPOINT MAKER")
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


    os.system("aws s3 cp s3://otmc/{0:s}/stat/inp/datapoint.json .".format(otmc_mission_name))

    fp = open(stat_input)
    stat = json.load(fp)
    fp.close()
    sample_points       = stat["sample points"]
  
    # parallel processing 
    pool = mp.Pool(Nproc)
    callback = pool.map(read_data_points, [(id_proc, Nproc, input_directory, input_file_template, number_of_sample, sample_points) for id_proc in range(Nproc)])
    pool.terminate()
    pool.close()

#    # debug
#    id_proc = 0
#    callback = [read_data_points((id_proc, Nproc, input_directory, input_file_template, number_of_sample, sample_points))]


    # join them
    fo_buff = ["" for i in range(len(sample_points.keys()))]
    for i in range(Nproc):
        for j in range(len(sample_points.keys())):
            fo_buff[j] += callback[i][j]

    # write out datapoint_*.csv
    os.system("rm output/datapoint_*.csv")
    for i, k in enumerate(sample_points.keys()):
        fo = open("output/datapoint_"+k+".csv","w")
        fo.write("caseNo,"+",".join(sample_points[k])+"\n") # title
        fo.write(fo_buff[i])
        fo.close()

    os.system("aws s3 cp output s3://otmc/{0:s}/stat/output/ --exclude '*' --include 'datapoint_*.csv' --recursive".format(otmc_mission_name))
