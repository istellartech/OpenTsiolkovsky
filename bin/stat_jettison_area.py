#!/usr/bin/python
import math
import numpy as np
import sys
import os
import simplekml

inputfile  = "output/datapoint_landing_time.csv" # default file name
outputfile = inputfile.replace(".csv", ".dat")
outputkml = inputfile.replace(".csv", ".kml")

argv = sys.argv
if len(argv) > 1:
    otmc_mission_name = argv[1]
else:
    print "PLEASE INPUT mission_name as the command line argument."
    exit()

os.system("aws s3 cp s3://otmc/{0:s}/stat/{1:s} .".format(otmc_mission_name,inputfile))

# initialize
N  = 0
x  = 0
y  = 0
x2 = 0
y2 = 0
xy = 0

# inputfile load
###### CAUTION ###################
# WE DO NOT USE PANDAS           #
# 'CAUSE IT REQUIRES             #
# TOO HUGE MEMORIES !!!!!!       #
##################################
index_lat = None
index_lon = None
fp = open(inputfile)
for line_number,line in enumerate(fp):
    if line_number == 0:
        arr = line.split(",")
        for i, v in enumerate(arr):
            if "lat(deg)" == v.strip():
                index_lat = i
            elif "lon(deg)" == v.strip():
                index_lon = i
        if index_lat == None or index_lon == None:
                print("ERROR: THERE IS NO LAT-LON DATA!!")
                exit(1)
        continue

    arr = line.split(",")
    lat = float(arr[index_lat])
    lon = float(arr[index_lon])

    N  += 1
    x  += lon
    y  += lat
    x2 += lon ** 2
    y2 += lat ** 2
    xy += lon * lat
fp.close()

# statistical parameters
x_ave = x / N
y_ave = y / N
ave = np.array([x_ave, y_ave])
sigma_x2 = x2/N - x_ave**2
sigma_y2 = y2/N - y_ave**2
sigma_xy = xy/N - x_ave * y_ave
sign = (sigma_x2-sigma_y2)/abs(sigma_x2-sigma_y2)

# long-axis and short-axis of ellipse
alpha = math.sqrt((sigma_x2 + sigma_y2 + sign * math.sqrt(4 * sigma_xy ** 2 + (sigma_x2 - sigma_y2) ** 2)) / 2)
beta  = math.sqrt((sigma_x2 + sigma_y2 - sign * math.sqrt(4 * sigma_xy ** 2 + (sigma_x2 - sigma_y2) ** 2)) / 2)
theta = 0.5 * math.atan(2 * sigma_xy / (sigma_x2 - sigma_y2))
v1 = np.array([  alpha * math.cos(theta), alpha * math.sin(theta)])
v2 = np.array([- beta  * math.sin(theta), beta  * math.cos(theta)])

# boundary points
p1 =  3 * v1 + 3 * v2 + ave
p2 = -3 * v1 + 3 * v2 + ave
p3 = -3 * v1 - 3 * v2 + ave
p4 =  3 * v1 - 3 * v2 + ave

# output
fp = open(outputfile,"w")
fp.write("IST JETTISON AREA MAKER\n\n")
fp.write("INPUTFIE: {0:}\n".format(inputfile))
fp.write("AVERAGE POINT (lon, lat)[deg]:\n")
fp.write("\t{0:}, {1:}\n".format(ave[0],ave[1]))
fp.write("JETTISON AREA (lon, lat)[deg]:\n")
fp.write("\t{0:}, {1:}\n".format(p1[0],p1[1]))
fp.write("\t{0:}, {1:}\n".format(p2[0],p2[1]))
fp.write("\t{0:}, {1:}\n".format(p3[0],p3[1]))
fp.write("\t{0:}, {1:}\n".format(p4[0],p4[1]))
fp.write("\t{0:}, {1:}\n".format(p1[0],p1[1]))
fp.write("JETTISON ELLIPSE (3 SIGMA) (lon, lat)[deg]:\n")
for i in range(37):
    angle = np.pi / 180 * i * 10
    p_tmp = 3 * v1 * math.cos(angle) + 3 * v2 * math.sin(angle) + ave
    fp.write("\t{0:}, {1:}\n".format(p_tmp[0],p_tmp[1]))
fp.close()
os.system("aws s3 cp {1:s} s3://otmc/{0:s}/stat/output/ ".format(otmc_mission_name, outputfile))

kml = simplekml.Kml(open=1)

kml.newpoint(name="Average LandIn Point", coords = [(ave[0], ave[1])])

inc_area = kml.newlinestring(name="LandIn Inclusion Area")
inc_area.coords = [(p1[0],p1[1]),\
                     (p2[0],p2[1]),\
                     (p3[0],p3[1]),\
                     (p4[0],p4[1]),\
                     (p1[0],p1[1])]
inc_area.style.linestyle.color = simplekml.Color.red

linestring = kml.newlinestring(name="LandIn Elliposoid Area")
arr_coords = []
for i in range(37):
    angle = np.pi / 180 * i * 10
    p_tmp = 3 * v1 * math.cos(angle) + 3 * v2 * math.sin(angle) + ave
    arr_coords.append((p_tmp[0], p_tmp[1]))
linestring.coords = arr_coords
kml.save(outputkml)
os.system("aws s3 cp {1:s} s3://otmc/{0:s}/stat/output/ ".format(otmc_mission_name, outputkml))
