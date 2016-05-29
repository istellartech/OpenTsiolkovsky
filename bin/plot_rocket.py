# -*- coding: utf-8 -*-
# パラメータファイルを読み取り、推力などのファイルを読み取る。
# 出力済みであれば、それを数枚のグラフにする
# 引数はパラメータjsonファイル(ex.param.json)
# 改良案：段によって色を変えるなど見やすく。

import sys
reload(sys)
import platform
# デフォルトの文字コードを変更する．
sys.setdefaultencoding('utf-8')

import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt
import matplotlib.font_manager
from matplotlib.font_manager import FontProperties
from matplotlib.backends.backend_pdf import PdfPages
from math import sin, cos, acos, radians
import json
import csv

if 'Windows' == platform.system():
	fp = FontProperties(fname=r'C:\WINDOWS\Fonts\MSGothic.ttf')

if 'Darwin' == platform.system(): # for Mac
	font_path = '/Library/Fonts/Osaka.ttf'
	font_prop = FontProperties(fname=font_path)
	mpl.rcParams['font.family'] = font_prop.get_name()

plt.close('all')
plt.style.use('ggplot')
mpl.rcParams['axes.grid'] = True
mpl.rcParams['figure.autolayout'] = True
# pdfのフォントをTrueTypeに変更
mpl.rcParams['pdf.fonttype'] = 42
# defaultのdpi=100から変更
mpl.rcParams['savefig.dpi'] = 300
# 数式（Latex)のフォントを変更
mpl.rcParams['mathtext.default'] = 'regular'

argvs = sys.argv  # コマンドライン引数を格納したリストの取得
argc = len(argvs) # 引数の個数
if (argc != 1):
	file_name = argvs[1]
else:
	file_name = u"param.json"
	# file_name = u"param_epsilon.json"

f = open(file_name)
data = json.load(f)

# ==== JSON読み込み ====
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
    index = len(lift_file_exist) # ステージ数
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
wind_const = 0 ## 取り敢えず

# ==== 各パラメータファイル読み取り ====
stage_num = 1
if (following_stage_exist[0]):
    stage_num = 2
if (following_stage_exist[0] and following_stage_exist[1]):
    stage_num = 3
mach_CD = [0 for i in range(stage_num)]
CD = [0 for i in range(stage_num)]
mach_CL = [0 for i in range(stage_num)]
CL = [0 for i in range(stage_num)]
time_attitude = [0 for i in range(stage_num)]
azimth = [0 for i in range(stage_num)]
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

# ==== 入力JSONファイルのPLOT ====
pdf = PdfPages('output/' + rocket_name + '_input.pdf')
plt.rc('figure', figsize=(11.69,8.27))
grid_size = (3, 2)
print(u"input data plotting...")
# plt.ion()
for index in range(stage_num):
    fig = plt.figure()
    plt.subplot2grid(grid_size, (0, 0), rowspan=1, colspan=1)
    plt.plot(mach_CD[index], CD[index])
    plt.xlabel(u"mach number (-)")
    plt.ylabel(u"CD (-)")
    plt.title("stage:%d" % (index+1))
    # plt.grid()

    plt.subplot2grid(grid_size, (0, 1), rowspan=1, colspan=1)
    plt.plot(mach_CL[index], CL[index])
    plt.xlabel(u"mach number (-)")
    plt.ylabel(u"CL (-)")
    # plt.grid()

    plt.subplot2grid(grid_size, (1, 0), rowspan=1, colspan=1)
    plt.plot(time_attitude[index], azimth[index])
    plt.xlabel(u"time (s)")
    plt.ylabel(u"azimth (deg)")
    # plt.grid()

    plt.subplot2grid(grid_size, (1, 1), rowspan=1, colspan=1)
    plt.plot(time_attitude[index], elevation[index])
    plt.xlabel(u"time (s)")
    plt.ylabel(u"elevation (deg)")
    # plt.grid()

    plt.subplot2grid(grid_size, (2, 0), rowspan=1, colspan=1)
    plt.plot(altitude_wind, wind_speed)
    plt.xlabel(u"altitude (m)")
    plt.ylabel(u"wind speed (m/s)")
    # plt.grid()

    plt.subplot2grid(grid_size, (2, 1), rowspan=1, colspan=1)
    plt.plot(altitude_wind, wind_direction)
    plt.xlabel(u"altitude (m)")
    plt.ylabel(u"wind direction (deg)")
    # plt.grid()

    # plt.tight_layout()
    pdf.savefig(fig)

pdf.close()

# ==== 出力CSVファイルPLOT ====
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
     Isp, mach, azimth, elevation, aoa_alpha, aoa_beta,
     dynamic_press, drag, lift,
	 wind_speed, wind_direction, downrange) = np.genfromtxt(file_name,
                                                unpack=True, delimiter=",",
                                                skip_header = 1,
                                                usecols = (0,1,2,3,4,5,6,7,8,9,10,11,12,13,
    													   14,15,16,17,18,19,20,21,22,23,24,
    													   25,26,27,28,29,30,31,32))
    g = 9.80665
    acc = np.sqrt(acc_ECI_X ** 2 + acc_ECI_Y ** 2 + acc_ECI_Z ** 2)
    # 最大高度の時間の算出とそれ以降のデータカット
    time_index_apogee = np.where(altitude == max(altitude))[0][0]
    time_cut = time[0:time_index_apogee]
    dynamic_press = dynamic_press[0:time_index_apogee]
    aoa_alpha = aoa_alpha[0:time_index_apogee]
    aoa_beta = aoa_beta[0:time_index_apogee]
    azimth = azimth[0:time_index_apogee]
    elevation = elevation[0:time_index_apogee]
    mach = mach[0:time_index_apogee]
    drag = drag[0:time_index_apogee]
    lift = lift[0:time_index_apogee]

    fig[index][0] = plt.figure()
    plt.subplot2grid(grid_size, (0, 0), rowspan=2, colspan=2)
    plt.plot(time, mass)
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"質量 (kg)")
    plt.title("stage:%d" % (index+1))
    # plt.grid()

    plt.subplot2grid(grid_size, (0, 2), rowspan=2, colspan=2)
    plt.plot(time, thrust)
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"推力 (N)")
    # plt.grid()

    plt.subplot2grid(grid_size, (2, 2), rowspan=2, colspan=2)
    plt.plot(time, Isp)
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"比推力 (s)")
    # plt.grid()

    plt.subplot2grid(grid_size, (2, 0), rowspan=2, colspan=2)
    plt.plot(time, altitude)
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"高度 (m)")
    # plt.grid()

    plt.subplot2grid(grid_size, (4, 0), rowspan=2, colspan=2)
    # plt.plot(time, lat)
    plt.plot(time, downrange)
    plt.xlabel(u"時刻 (sec)")
    # plt.ylabel(u"緯度 (deg)")
    plt.ylabel(u"ダウンレンジ (m)")
    # plt.grid()

    plt.subplot2grid(grid_size, (4, 2), rowspan=2, colspan=2)
    # plt.plot(time, lon)
    plt.plot(downrange, altitude)
    plt.xlabel(u"ダウンレンジ (m)")
    # plt.ylabel(u"経度 (deg)")
    plt.ylabel(u"高度 (m)")
    # plt.grid()

    # plt.tight_layout()
    pdf.savefig(fig[index][0])
    fig[index][1] = plt.figure()

    plt.subplot2grid(grid_size, (0, 0), rowspan=2, colspan=2)
    plt.plot(time, vel_NED_X, label="North")
    plt.plot(time, vel_NED_Y, label="East")
    plt.ylabel(u"速度 (m/s)")
    # plt.grid()
    plt.legend()

    plt.subplot2grid(grid_size, (0, 2), rowspan=2, colspan=2)
    plt.plot(time, -vel_NED_Z, label="Up")
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"速度 (m/s)")
    # plt.grid()
    plt.legend()

    plt.subplot2grid(grid_size, (2, 0), rowspan=2, colspan=2)
    plt.plot(time_cut, dynamic_press/1000)
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"動圧 (kPa)")
    # plt.grid()

    plt.subplot2grid(grid_size, (2, 2), rowspan=2, colspan=2)
    plt.plot(time_cut, mach)
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"機体高度でのマッハ数 (-)")
    # plt.grid()

    plt.subplot2grid(grid_size, (4, 0), rowspan=2, colspan=2)
    plt.plot(time, acc/g)
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"加速度 (G)")
    # plt.grid()

    plt.subplot2grid(grid_size, (4, 2), rowspan=2, colspan=2)
    plt.plot(time, acc_BODY_X/g)
    plt.plot(time, acc_BODY_Y/g)
    plt.plot(time, acc_BODY_Z/g)
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"加速度 (G)")
    # plt.grid()

    # plt.tight_layout()
    pdf.savefig(fig[index][1])
    fig[index][2] = plt.figure()

    plt.subplot2grid(grid_size, (0, 0), rowspan=2, colspan=2)
    plt.plot(time_cut, azimth, label="azimth")
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"姿勢 (deg)")
    # plt.grid()
    plt.legend()

    plt.subplot2grid(grid_size, (0, 2), rowspan=2, colspan=2)
    plt.plot(time_cut, elevation, label="elevation")
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"姿勢 (deg)")
    plt.legend()
    # plt.grid()

    plt.subplot2grid(grid_size, (2, 0), rowspan=2, colspan=2)
    plt.plot(time_cut, aoa_alpha, label="alpha")
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"迎角 alpha (deg)")
    plt.legend(loc="best")
    # plt.grid()

    plt.subplot2grid(grid_size, (2, 2), rowspan=2, colspan=2)
    plt.plot(time_cut, aoa_beta, label="beta")
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"迎角 beta (deg)")
    plt.legend(loc="best")
    # plt.grid()

    plt.subplot2grid(grid_size, (4, 0), rowspan=2, colspan=2)
    plt.plot(time_cut, drag, label="drag")
    plt.grid()
    plt.legend()
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"抗力 (N)")

    plt.subplot2grid(grid_size, (4, 2), rowspan=2, colspan=2)
    plt.plot(time_cut, lift, label="lift")
    # plt.grid()
    plt.legend()
    plt.xlabel(u"時刻 (sec)")
    plt.ylabel(u"揚力 (N)")

    # plt.tight_layout()
    pdf.savefig(fig[index][2])

    del(time, mass, thrust, lat, lon, altitude, pos_ECI_X, pos_ECI_Y,
     pos_ECI_Z, vel_ECI_X, vel_ECI_Y, vel_ECI_Z, vel_NED_X,
     vel_NED_Y, vel_NED_Z, acc_ECI_X, acc_ECI_Y, acc_ECI_Z,
     Isp, mach, azimth, elevation, aoa_alpha, aoa_beta,
     dynamic_press, drag, lift, wind_speed, wind_direction)

pdf.close()
# plt.show()
print(u"Done")
