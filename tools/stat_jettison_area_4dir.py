#!/usr/bin/python3
# coding: utf-8
import math
import numpy as np
import sys
import os
import simplekml
import re

inputfile  = "datapoint_landing_time.csv"  # default file name
outputfile = inputfile.replace(".csv", ".dat")
outputkml = inputfile.replace(".csv", ".kml")
output4dir_fmt = inputfile.replace(".csv", "_4dir_{}deg.csv")

argv = sys.argv
if len(argv) > 1:
    target_dir = argv[1]
    is_aws = target_dir.startswith("s3://")
else:
    print("Usage:  {0} TARGET_DIRECTORY [FLIGHT_DIRECTION]".format(argv[0]))
    exit(1)

if len(argv) > 2:
    str_drc_flight = argv[2]
    output4dir = output4dir_fmt.format(str_drc_flight)

output_dir_is_exist = os.path.isdir("./output/")
if not output_dir_is_exist:
    os.mkdir("./output")

temp_dir = re.sub('[^a-zA-Z_0-9\.]', '', target_dir)
while os.path.isdir("./output/{0}".format(temp_dir)):
    temp_dir = temp_dir + '0'
os.mkdir("./output/{0}".format(temp_dir))

if is_aws:
    os.system("aws s3 cp {0:s}/stat/output/{1:s} ./output/{2}/".format(target_dir, inputfile, temp_dir))
else:
    os.system("cp {0:s}/stat/output/{1:s} ./output/{2}/".format(target_dir, inputfile, temp_dir))

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
fp = open("./output/{0}/{1}".format(temp_dir, inputfile))
for line_number, line in enumerate(fp):
    if line_number == 0:
        arr = line.split(",")
        for i, v in enumerate(arr):
            if "lat(deg)" == v.strip():
                index_lat = i
            elif "lon(deg)" == v.strip():
                index_lon = i
        if index_lat is None or index_lon is None:
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
sigma_x2 = x2 / N - x_ave**2
sigma_y2 = y2 / N - y_ave**2
sigma_xy = xy / N - x_ave * y_ave
sign = (sigma_x2 - sigma_y2) / abs(sigma_x2 - sigma_y2)

# Consider meter/degree ratio
ratio_x = math.cos(y_ave / 180. * math.pi)
sigma_X2 = sigma_x2 * ratio_x**2
sigma_Y2 = sigma_y2
sigma_XY = sigma_xy * ratio_x

# long-axis and short-axis of ellipse
# alpha = math.sqrt((sigma_x2 + sigma_y2 + sign * math.sqrt(4 * sigma_xy ** 2 + (sigma_x2 - sigma_y2) ** 2)) / 2)
# beta  = math.sqrt((sigma_x2 + sigma_y2 - sign * math.sqrt(4 * sigma_xy ** 2 + (sigma_x2 - sigma_y2) ** 2)) / 2)
# theta = 0.5 * math.atan(2 * sigma_xy / (sigma_x2 - sigma_y2))
# v1 = np.array([  alpha * math.cos(theta), alpha * math.sin(theta)])
# v2 = np.array([- beta  * math.sin(theta), beta  * math.cos(theta)])
Alpha2 = ((sigma_X2 + sigma_Y2 + sign * math.sqrt(4 * sigma_XY ** 2 + (sigma_X2 - sigma_Y2) ** 2)) / 2)
Beta2  = ((sigma_X2 + sigma_Y2 - sign * math.sqrt(4 * sigma_XY ** 2 + (sigma_X2 - sigma_Y2) ** 2)) / 2)
Alpha = math.sqrt(max(Alpha2, 0.))
Beta  = math.sqrt(max(Beta2, 0.))
Theta = 0.5 * math.atan(2 * sigma_XY / (sigma_X2 - sigma_Y2))
V1 = np.array([  Alpha * math.cos(Theta), Alpha * math.sin(Theta)])
V2 = np.array([- Beta  * math.sin(Theta), Beta  * math.cos(Theta)])
v1 = V1 * np.array([1. / ratio_x, 1.])
v2 = V2 * np.array([1. / ratio_x, 1.])

# boundary points
p1 =  3 * v1 + 3 * v2 + ave
p2 = -3 * v1 + 3 * v2 + ave
p3 = -3 * v1 - 3 * v2 + ave
p4 =  3 * v1 - 3 * v2 + ave

# 3-sigma points tangent to the rectangle of the flight direction
if len(argv) > 2:
    drc_flight = float(str_drc_flight) * math.pi / 180.0
    drc_flight_elli_coords = - (drc_flight - math.pi * 0.5) - Theta + np.array([0., 0.5, 1., 1.5]) * math.pi
    flight_vecs = np.array([np.cos(drc_flight_elli_coords), np.sin(drc_flight_elli_coords)])
    ms = np.tan(drc_flight_elli_coords + math.pi * 0.5)
    Dxs = np.array([ms * Alpha**2 / np.sqrt(Beta**2 + (Alpha * ms)**2),
                    - Beta**2 / np.sqrt(Beta**2 + (Alpha * ms)**2)])
    signs = np.sign((Dxs * flight_vecs).sum(axis=0))
    Dxs *= signs
    coord_conv_mat = np.array([[np.cos(Theta), -np.sin(Theta)],
                               [np.sin(Theta), np.cos(Theta)]])
    V_errs = np.matmul(coord_conv_mat, Dxs)
    v_errs = V_errs * np.array([[1. / ratio_x, 1.]]).T
    p_tangents = 3 * v_errs.T + ave

# output
fp = open("./output/{0}/{1}".format(temp_dir, outputfile), "w")
fp.write("IST JETTISON AREA MAKER\n\n")
fp.write("INPUTFILE: {0:}\n".format(inputfile))
fp.write("AVERAGE POINT (lon, lat)[deg]:\n")
fp.write("\t{0:}, {1:}\n".format(ave[0], ave[1]))
fp.write("JETTISON AREA (lon, lat)[deg]:\n")
fp.write("\t{0:}, {1:}\n".format(p1[0], p1[1]))
fp.write("\t{0:}, {1:}\n".format(p2[0], p2[1]))
fp.write("\t{0:}, {1:}\n".format(p3[0], p3[1]))
fp.write("\t{0:}, {1:}\n".format(p4[0], p4[1]))
fp.write("\t{0:}, {1:}\n".format(p1[0], p1[1]))
fp.write("JETTISON ELLIPSE (3 SIGMA) (lon, lat)[deg]:\n")
for i in range(37):
    angle = np.pi / 180 * i * 10
    p_tmp = 3 * v1 * math.cos(angle) + 3 * v2 * math.sin(angle) + ave
    fp.write("\t{0:}, {1:}\n".format(p_tmp[0], p_tmp[1]))
fp.close()

# output _4dir.csv
if len(argv) > 2:
    with open("./output/{0}/{1}".format(temp_dir, output4dir), "w") as fp:
        suffixes = ["ave", "h", "l", "t", "r"]
        str_fmts = ["lon_{}(deg)", "lat_{}(deg)"]
        fp.write(",".join([st.format(suf) for suf in suffixes for st in str_fmts]))
        fp.write("\n")
        p_outputs = np.vstack([[ave], p_tangents]).flatten()
        fp.write(",".join(map(str, p_outputs)))
        fp.write("\n")

# output kml
kml = simplekml.Kml(open=1)

kml.newpoint(name="Average LandIn Point", coords=[(ave[0], ave[1])])

inc_area = kml.newlinestring(name="LandIn Inclusion Area")
inc_area.coords = [(p1[0], p1[1]),
                   (p2[0], p2[1]),
                   (p3[0], p3[1]),
                   (p4[0], p4[1]),
                   (p1[0], p1[1])]
inc_area.style.linestyle.color = simplekml.Color.red

linestring = kml.newlinestring(name="LandIn Elliposoid Area")
arr_coords = []
for i in range(37):
    angle = np.pi / 180 * i * 10
    p_tmp = 3 * v1 * math.cos(angle) + 3 * v2 * math.sin(angle) + ave
    arr_coords.append((p_tmp[0], p_tmp[1]))
linestring.coords = arr_coords

if len(argv) > 2:
    fol = kml.newfolder(name="Points Tangent to Rectangle {}[deg]".format(str_drc_flight))
    names = ["Head", "Left", "Tail", "Right"]
    for p, n in zip(p_tangents, names):
        fol.newpoint(name=n, coords=[p])

kml.save("./output/{0}/{1}".format(temp_dir, outputkml))

os.system("rm ./output/{1}/{0}".format(inputfile, temp_dir))

if is_aws:
    os.system("aws s3 mv ./output/{1}/ {0:s}/stat/output/ --recursive".format(target_dir, temp_dir))
else:
    os.system("mv ./output/{1}/* {0:s}/stat/output/ ".format(target_dir, temp_dir))

os.system("rm -r ./output/{}".format(temp_dir))

if not output_dir_is_exist:
    os.rmdir("./output")
