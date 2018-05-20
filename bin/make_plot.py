# -*- coding: utf-8 -*-
# Copyright (c) 2017 Interstellar Technologies Inc. All Rights Reserved.
# Authors : Takahiro Inagawa
#
# Lisence : MIT Lisence
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
# ==============================================================================

import sys
import platform

import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt
# import matplotlib.font_manager
from matplotlib.font_manager import FontProperties
from matplotlib.backends.backend_pdf import PdfPages
from math import sin, cos, acos, radians
import json
import csv
import os

if 'Windows' == platform.system():
    font_path = r'C:\WINDOWS\Fonts\MSGothic.ttf'
    font_prop = FontProperties(fname=font_path)
    mpl.rcParams['font.family'] = font_prop.get_name()
#
if 'Darwin' == platform.system(): # for Mac
    font_path = '/Library/Fonts/Osaka.ttf'
    if os.path.exists(font_path):
        font_prop = FontProperties(fname=font_path)
        mpl.rcParams['font.family'] = font_prop.get_name()

plt.close('all')
# plt.style.use('ggplot')
mpl.rcParams['axes.grid'] = True
mpl.rcParams['figure.autolayout'] = True
mpl.rcParams['pdf.fonttype'] = 42 # change font to TrueType in pdf

def detect_rise_fall_edge(tf):
    tf = np.array(tf)
    tf = np.insert(tf, [0, len(tf)], False) # insert False on the first and last
    zero_one = tf.astype(int)
    diff = np.diff(zero_one)
    rising_idx = np.where(diff == 1)[0]
    falling_idx = np.where(diff == -1)[0] -1
    return np.column_stack([rising_idx, falling_idx])

def plot_timespan(time, time_idx, facecolor, alpha):
    for e in time_idx:
        begin = time[e[0]]
        end = time[e[1]]
        plt.axvspan(begin, end, facecolor=facecolor, alpha=alpha)

argvs = sys.argv
argc = len(argvs)
if (argc != 1):
    file_name = argvs[1]
else:
	file_name = "param_sample.json"

f = open(file_name)
data = json.load(f)

# ==== Read JSON file ====
lift_file_exist = []
lift_file = []
lift_coef = []
drag_file_exist = []
drag_file = []
drag_coef = []
attitude_file_exist = []
attitude_file = []
elevation_const = []
azimth_const = []
following_stage_exist = []
rocket_name = data["name"]
calc_time_end = data["calculate condition"]["end time[s]"]

def load_rocket_json(stage):
    index = len(lift_file_exist) # number of stages
    stage_name = stage + " stage"
    lift_file_exist.append(data[stage_name]["aero"]["lift coefficient file exist"])
    lift_file.append(data[stage_name]["aero"]["lift coefficient file name"])
    lift_coef.append(data[stage_name]["aero"]["lift coefficient"])
    drag_file_exist.append(data[stage_name]["aero"]["drag coefficient file exist"])
    drag_file.append(data[stage_name]["aero"]["drag coefficient file name"])
    drag_coef.append(data[stage_name]["aero"]["drag coefficient"])
    attitude_file_exist.append(data[stage_name]["attitude"]["file exist"])
    attitude_file.append(data[stage_name]["attitude"]["file name"])
    elevation_const.append(data[stage_name]["attitude"]["initial elevation[deg]"])
    azimth_const.append(data[stage_name]["attitude"]["initial azimth[deg]"])
    following_stage_exist.append(data[stage_name]["stage"]["following stage exist"])

load_rocket_json("1st")
load_rocket_json("2nd")
load_rocket_json("3rd")
wind_file_exist = data["wind"]["file exist"]
wind_file = data["wind"]["file name"]
wind_const = 0  # Temporarily

# ==== Read each parameter files ====
stage_num = 1
if (following_stage_exist[0]):
    stage_num = 2
if (following_stage_exist[0] and following_stage_exist[1]):
    stage_num = 3
mach_CD   = [0 for i in range(stage_num)]
CD        = [0 for i in range(stage_num)]
mach_CL   = [0 for i in range(stage_num)]
CL        = [0 for i in range(stage_num)]
time_attitude = [0 for i in range(stage_num)]
azimth    = [0 for i in range(stage_num)]
elevation = [0 for i in range(stage_num)]
for index in range(stage_num):
    if (drag_file_exist[index]):
        (mach_CD_temp, CD_temp) = np.genfromtxt(drag_file[index], unpack=True,
                                  delimiter=",", skip_header = 1, usecols = (0,1))
        mach_CD[index] = mach_CD_temp
        CD[index] = CD_temp
    else:
        mach_CD[index] = [0, 5]
        CD[index] = [drag_coef[index], drag_coef[index]]
    if (lift_file_exist[index]):
        (mach_CL_temp, CL_temp) = np.genfromtxt(lift_file[index], unpack=True, delimiter=",",
                                  skip_header = 1, usecols = (0,1))
        mach_CL[index] = mach_CL_temp
        CL[index] = CL_temp
    else:
        mach_CL[index] = [0, 5]
        CL[index] = [lift_coef[index], lift_coef[index]]
    if (attitude_file_exist[index]):
        (time_attitude_temp, azimth_temp, elevation_temp) = np.genfromtxt(attitude_file[index],
                                  unpack=True, delimiter=",",skip_header = 1, usecols = (0,1,2))
        time_attitude[index] = time_attitude_temp
        azimth[index] = azimth_temp
        elevation[index] = elevation_temp
    else:
        time_attitude[index] = [0,1]
        azimth[index] = [azimth_const[index], azimth_const[index]]
        elevation[index] = [elevation_const[index], elevation_const[index]]

if (wind_file_exist):
    (altitude_wind, wind_speed, wind_direction) = np.genfromtxt(wind_file,
                                  unpack=True, delimiter=",",skip_header = 1, usecols = (0,1,2))
else:
    altitude_wind = [0, 10000]
    wind_speed = [wind_const, wind_const]
    wind_direction = [0, 0]

# ==== PLOT "input" JSON file ====
pdf = PdfPages('output/' + rocket_name + '_input.pdf')
plt.rc('figure', figsize=(11.69,8.27))
grid_size = (3, 2)
print("input data plotting...")
# plt.ion()
for index in range(stage_num):
    fig = plt.figure()
    plt.subplot2grid(grid_size, (0, 0), rowspan=1, colspan=1)
    plt.plot(mach_CD[index], CD[index])
    plt.xlabel("mach number (-)")
    plt.ylabel("CD (-)")
    plt.title("stage:%d" % (index+1))

    plt.subplot2grid(grid_size, (0, 1), rowspan=1, colspan=1)
    plt.plot(mach_CL[index], CL[index])
    plt.xlabel("mach number (-)")
    plt.ylabel("CL (-)")

    plt.subplot2grid(grid_size, (1, 0), rowspan=1, colspan=1)
    plt.plot(time_attitude[index], azimth[index])
    plt.xlabel("time (s)")
    plt.ylabel("azimth (deg)")

    plt.subplot2grid(grid_size, (1, 1), rowspan=1, colspan=1)
    plt.plot(time_attitude[index], elevation[index])
    plt.xlabel("time (s)")
    plt.ylabel("elevation (deg)")

    plt.subplot2grid(grid_size, (2, 0), rowspan=1, colspan=1)
    plt.plot(altitude_wind, wind_speed)
    plt.xlabel("altitude (m)")
    plt.ylabel("wind speed (m/s)")

    plt.subplot2grid(grid_size, (2, 1), rowspan=1, colspan=1)
    plt.plot(altitude_wind, wind_direction)
    plt.xlabel("altitude (m)")
    plt.ylabel("wind direction (deg)")

    pdf.savefig(fig)

pdf.close()

# ==== PLOT "output" CSV file ====
pdf = PdfPages('output/' + rocket_name + '_output.pdf')
plt.rc('figure', figsize=(11.69,8.27))
grid_size = (6, 4)
print(u"output data plotting...")
fig = [[0 for i in range(3)] for j in range(stage_num)]
for index in range(stage_num):
    if (index == 0):
        stage_str = "1st"
    elif (index == 1):
        stage_str = "2nd"
    elif (index == 2):
        stage_str = "3rd"
    file_name = "output/" + rocket_name + "_dynamics_" + stage_str + ".csv"
    (time, mass, thrust, lat, lon, altitude, pos_ECI_X, pos_ECI_Y,
     pos_ECI_Z, vel_ECI_X, vel_ECI_Y, vel_ECI_Z, vel_NED_X,
     vel_NED_Y, vel_NED_Z, acc_ECI_X, acc_ECI_Y, acc_ECI_Z,
     acc_BODY_X, acc_BODY_Y, acc_BODY_Z,
     Isp, mach, azimth, elevation, aoa_alpha, aoa_beta, all_aoa_gamma,
     dynamic_press, drag, lift,
     wind_speed, wind_direction, downrange) = np.genfromtxt(file_name,
                                                unpack=True, delimiter=",",
                                                skip_header = 1,
                                                usecols = (0,1,2,3,4,5,6,7,8,9,10,11,12,13,
    													   14,15,16,17,18,19,20,21,22,23,24,
    													   25,26,27,28,29,30,31,32,33))
    g = 9.80665
    acc = np.sqrt(acc_ECI_X ** 2 + acc_ECI_Y ** 2 + acc_ECI_Z ** 2)
    # Calculation of maximum altitude time and cut subsequent data
    time_index_apogee = np.where(altitude == max(altitude))[0][0]
    time_cut = time[0:time_index_apogee]
    dynamic_press = dynamic_press[0:time_index_apogee]
    aoa_alpha = aoa_alpha[0:time_index_apogee]
    aoa_beta = aoa_beta[0:time_index_apogee]
    all_aoa_gamma = all_aoa_gamma[0:time_index_apogee]
    azimth = azimth[0:time_index_apogee]
    elevation = elevation[0:time_index_apogee]
    mach = mach[0:time_index_apogee]
    drag = drag[0:time_index_apogee]
    lift = lift[0:time_index_apogee]

    # 燃焼中領域の算出
    # 最大推力の1%以上を燃焼中とみなす
    invalid_thrust_N = np.max(thrust) * 0.01
    powered_idx = detect_rise_fall_edge(thrust > invalid_thrust_N)
    powered_idx_cut = detect_rise_fall_edge(thrust[0:time_index_apogee] > invalid_thrust_N)


    fig[index][0] = plt.figure()
    plt.subplot2grid(grid_size, (0, 0), rowspan=2, colspan=2)
    plt.plot(time, mass)
    plot_timespan(time, powered_idx, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("mass (kg)")
    plt.title("stage:%d" % (index+1))

    plt.subplot2grid(grid_size, (0, 2), rowspan=2, colspan=2)
    plt.plot(time, thrust)
    plot_timespan(time, powered_idx, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("thrust (N)")

    plt.subplot2grid(grid_size, (2, 2), rowspan=2, colspan=2)
    plt.plot(time, Isp)
    plot_timespan(time, powered_idx, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("Isp(specific impulse) (s)")

    plt.subplot2grid(grid_size, (2, 0), rowspan=2, colspan=2)
    plt.plot(time, altitude)
    plot_timespan(time, powered_idx, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("altitude (m)")

    plt.subplot2grid(grid_size, (4, 0), rowspan=2, colspan=2)
    plt.plot(time, downrange)
    plot_timespan(time, powered_idx, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("downrange (m)")

    plt.subplot2grid(grid_size, (4, 2), rowspan=2, colspan=2)
    plt.plot(downrange, altitude)
    plt.xlabel("downrange (m)")
    plt.ylabel("altitude (m)")

    pdf.savefig(fig[index][0])
    fig[index][1] = plt.figure()

    plt.subplot2grid(grid_size, (0, 0), rowspan=2, colspan=2)
    plt.plot(time, vel_NED_X, label="North")
    plt.plot(time, vel_NED_Y, label="East")
    plot_timespan(time, powered_idx, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("velocity (m/s)")
    plt.legend(loc="best")

    plt.subplot2grid(grid_size, (0, 2), rowspan=2, colspan=2)
    plt.plot(time, -vel_NED_Z, label="Up")
    plot_timespan(time, powered_idx, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("velocity (m/s)")
    plt.legend()

    plt.subplot2grid(grid_size, (2, 0), rowspan=2, colspan=2)
    plt.plot(time_cut, dynamic_press/1000)
    plot_timespan(time_cut, powered_idx_cut, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("dynamic pressure (kPa)")

    plt.subplot2grid(grid_size, (2, 2), rowspan=2, colspan=2)
    plt.plot(time_cut, mach)
    plot_timespan(time_cut, powered_idx_cut, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("Mach number at the altitude (-)")

    plt.subplot2grid(grid_size, (4, 0), rowspan=2, colspan=2)
    plt.plot(time, acc/g)
    plot_timespan(time, powered_idx, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("acceleration (G)")

    plt.subplot2grid(grid_size, (4, 2), rowspan=2, colspan=2)
    plt.plot(time, acc_BODY_X/g, label="X_body")
    plt.plot(time, acc_BODY_Y/g, label="Y_body")
    plt.plot(time, acc_BODY_Z/g, label="Z_body")
    plot_timespan(time, powered_idx, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("acceleration (G)")
    plt.legend(loc="best")


    pdf.savefig(fig[index][1])
    fig[index][2] = plt.figure()

    plt.subplot2grid(grid_size, (0, 0), rowspan=2, colspan=2)
    plt.plot(time_cut, azimth, label="azimth")
    plot_timespan(time_cut, powered_idx_cut, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("attitude angle (deg)")
    plt.legend()

    plt.subplot2grid(grid_size, (0, 2), rowspan=2, colspan=2)
    plt.plot(time_cut, elevation, label="elevation")
    plot_timespan(time_cut, powered_idx_cut, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("attitude angle (deg)")
    plt.legend()

    plt.subplot2grid(grid_size, (2, 0), rowspan=2, colspan=2)
    plt.plot(time_cut, aoa_alpha, label="alpha")
    plt.plot(time_cut, all_aoa_gamma, label="all aoa")
    plot_timespan(time_cut, powered_idx_cut, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("attack of angle (deg)")
    plt.legend(loc="best")

    plt.subplot2grid(grid_size, (2, 2), rowspan=2, colspan=2)
    plt.plot(time_cut, aoa_beta, label="beta")
    plot_timespan(time_cut, powered_idx_cut, facecolor='r', alpha=0.3)
    plt.xlabel("time (sec)")
    plt.ylabel("attack of angle beta (deg)")
    plt.legend(loc="best")

    plt.subplot2grid(grid_size, (4, 0), rowspan=2, colspan=2)
    plt.plot(time_cut, drag, label="drag")
    plot_timespan(time_cut, powered_idx_cut, facecolor='r', alpha=0.3)
    plt.legend()
    plt.xlabel("time (sec)")
    plt.ylabel("drag force (N)")

    plt.subplot2grid(grid_size, (4, 2), rowspan=2, colspan=2)
    plt.plot(time_cut, lift, label="lift")
    plot_timespan(time_cut, powered_idx_cut, facecolor='r', alpha=0.3)
    plt.legend()
    plt.xlabel("time (sec)")
    plt.ylabel("lift force (N)")

    pdf.savefig(fig[index][2])

    del(time, mass, thrust, lat, lon, altitude, pos_ECI_X, pos_ECI_Y,
     pos_ECI_Z, vel_ECI_X, vel_ECI_Y, vel_ECI_Z, vel_NED_X,
     vel_NED_Y, vel_NED_Z, acc_ECI_X, acc_ECI_Y, acc_ECI_Z,
     Isp, mach, azimth, elevation, aoa_alpha, aoa_beta, all_aoa_gamma,
     dynamic_press, drag, lift, wind_speed, wind_direction)

pdf.close()
# plt.show()
print("Done")
