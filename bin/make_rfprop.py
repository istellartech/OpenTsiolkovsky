# -*- coding: utf-8 -*-
# OpenTsiolkovskyから出力される.csvファイルに情報を追加する
# 特にIIPやアンテナ関係の値を出力
# outputフォルダの中にあるcsvファイルを読み込んで、extend.csvとして出力
# ＊＊＊＊使い方＊＊＊＊
# python extend_output.py (input_json_file)
#
# IIPの分散円の半径は、その時点でのロケットが推力をもって真横に加速された
# として、カットオフ時間までに増速される量を加算してIIPの移動距離から算出。
#
# ライブラリにpyprojを用いているために先にpyprojをインストールのこと。
# conda insatall pyproj
# pip install pyproj
#
# Copyright (c) 2016 Interstellar Technologies Inc. Takahiro Inagawa
# Released under the MIT license
import sys
import platform
import numpy as np
# import matplotlib as mpl
import matplotlib.pyplot as plt
# import matplotlib.font_manager
# from matplotlib.font_manager import FontProperties
# from matplotlib.backends.backend_pdf import PdfPages
import pandas as pd
import json
from pyproj import Geod
from collections import namedtuple
from numpy import sin, cos, sqrt, arctan2, arcsin, pi, arccos, log, log10

#plt.ion()

# 定数の設定
g = Geod(ellps='WGS84')
WGS84 = namedtuple('WGS84', ['re_a',  # [m] WGS84の長軸
                             'eccen1',  # First Eccentricity
                             'eccen1sqr',  # First Eccentricity squared
                             'one_f',  # 扁平率fの1/f（平滑度）
                             're_b',  # [m] WGS84の短軸
                             'e2',  # 第一離心率eの2乗
                             'ed2'  # 第二離心率e'の2乗
                             ])
wgs84 = WGS84(6378137.0, 8.1819190842622e-2, 6.69437999014e-3, 298.257223563,
              6356752.314245, 6.6943799901414e-3, 6.739496742276486e-3)
Earth = namedtuple('Earth', ['omega']) # 地球の自転角速度 [rad/s])
earth = Earth(7.2921159e-5)

deg2rad = lambda deg: deg * np.pi / 180.0
rad2deg = lambda rad: rad * 180.0 / np.pi

def dcmECI2ECEF(second):
    theta = earth.omega * second
    dcm = np.array([[cos(theta),  sin(theta), 0.0],
    				[-sin(theta), cos(theta), 0.0],
    				[0.0,         0.0,        1.0]])
    return dcm

def n_posECEF2LLH(phi_n_deg):
    return wgs84.re_a / sqrt(1.0 - wgs84.e2 * sin(deg2rad(phi_n_deg)) * sin(deg2rad(phi_n_deg)))

def posLLH(posECEF_):
    # deg返し
    p = sqrt(posECEF_[0] **2 + posECEF_[1] **2)
    theta = arctan2(posECEF_[2] * wgs84.re_a, p * wgs84.re_b) # rad
    lat = rad2deg(arctan2(posECEF_[2] + wgs84.ed2 * wgs84.re_b * pow(sin(theta), 3), p - wgs84.e2 * wgs84.re_a * pow(cos(theta),3)))
    lon = rad2deg(arctan2(posECEF_[1], posECEF_[0]))
    alt = p / cos(deg2rad(lat)) - n_posECEF2LLH(lat)
    return np.array([lat, lon, alt])

def dcmECEF2NED(posLLH_):
    lat = deg2rad(posLLH_[0])
    lon = deg2rad(posLLH_[1])
    dcm = np.array([[-sin(lat)*cos(lon), -sin(lat)*sin(lon), cos(lat)],
    				[-sin(lon),           cos(lon),          0],
    				[-cos(lat)*cos(lon), -cos(lat)*sin(lon), -sin(lat)]])
    return dcm

def dcmECI2NED(dcmECEF2NED, dcmECI2ECEF):
    return dcmECEF2NED.dot(dcmECI2ECEF)

def posECEF(dcmECI2ECEF, posECI_):
    return  dcmECI2ECEF.dot(posECI_)

def posECEF_from_LLH(posLLH_):
    lat = deg2rad(posLLH_[0])
    lon = deg2rad(posLLH_[1])
    alt = posLLH_[2]
    W = sqrt(1.0 - wgs84.e2 * sin(lat) * sin(lat))
    N = wgs84.re_a / W
    pos0 = (N + alt) * cos(lat) * cos(lon)
    pos1 = (N + alt) * cos(lat) * sin(lon)
    pos2 = (N * (1 - wgs84.e2) + alt) * sin(lat)
    return np.array([pos0, pos1, pos2])

def posLLH_IIP(t, posECI_, vel_ECEF_NEDframe_):
    g0 = 9.80665
    dcmECI2ECEF_ = dcmECI2ECEF(t)
    posLLH_ = posLLH(posECEF(dcmECI2ECEF_, posECI_))
    dcmNED2ECI_ = dcmECI2NED(dcmECEF2NED(posLLH_), dcmECI2ECEF_).T
    vel_north_ = vel_ECEF_NEDframe_[0]
    vel_east_ = vel_ECEF_NEDframe_[1]
    vel_up_ = - vel_ECEF_NEDframe_[2]
    h = posLLH_[2]
    tau = 1.0/g0 * (vel_up_ + sqrt(vel_up_**2 + 2 * h * g0))
    dist_IIP_from_now_NED = np.array([vel_north_ * tau, vel_east_ * tau, -h])
    posECI_IIP_ = posECI_ + dcmNED2ECI_.dot(dist_IIP_from_now_NED)
    posECEF_IIP_ = posECEF(dcmECI2ECEF(t), posECI_IIP_)
    return posLLH(posECEF_IIP_)

def distance_surface(pos0_LLH_, pos1_LLH_):
    earth_radius = 6378137 # 地球半径 m
    pos0_ECEF_ = posECEF_from_LLH(pos0_LLH_)
    pos1_ECEF_ = posECEF_from_LLH(pos1_LLH_)
    theta = np.arccos(np.dot(pos0_ECEF_, pos1_ECEF_) / np.linalg.norm(pos0_ECEF_) / np.linalg.norm(pos1_ECEF_)) # radius
    return earth_radius * theta

def radius_IIP(t, posECI_, vel_ECEF_NEDframe_, cutoff_time, thrust, weight):
    delta_vel = thrust / weight * cutoff_time
    point_IIP = posLLH_IIP(t, posECI_, vel_ECEF_NEDframe_)
    delta_IIP = posLLH_IIP(t, posECI_, vel_ECEF_NEDframe_ + delta_vel * np.array([1,1,0]))
    _a, _b, distance_2d = g.inv(point_IIP[1], point_IIP[0], delta_IIP[1], delta_IIP[0])
    return distance_2d

def antenna_param(antenna_LLH_, rocket_LLH_):
    # g = Geod(ellps='WGS84')
    azimuth, back_azimuth, distance_2d = g.inv(antenna_LLH_[1], antenna_LLH_[0], rocket_LLH_[1], rocket_LLH_[0])
    elevation = np.rad2deg(np.arctan2(rocket_LLH_[2], distance_2d))
    distance_3d = np.hypot(distance_2d, rocket_LLH_[2])
    return distance_2d, distance_3d, azimuth, elevation

def radius_visible(altitude, invalid_angle_deg = 3):
    # ロケットの高度と無効角度を入力して可視範囲の半径を計算
    # 可視半径 m
    re = 6378137 # 地球半径 m
    epsilon = np.deg2rad(invalid_angle_deg)
    phi = np.arccos(re/(re+altitude) * np.cos(epsilon)) - epsilon
    return phi * re

class DATA_2D:
    def __init__(self, fn):
        fp = open(fn) 
        self.y    = []
        self.data = []
        for i, line in enumerate(fp):
            if i == 0:
                continue
            elif i == 1:
                arr = line.split(",")
                arr.pop(0)
                self.x = list(map(float,arr))
            else:
                arr = line.split(",")
                arr = list(map(float,arr))
                self.y.append(arr.pop(0))
                self.data.append(arr)
        fp.close()

    def func(self, x, y):
        for i, val in enumerate(self.x):
            if x < val:
                ind_x = i
                break
        a = self.x[ind_x - 1]
        b = self.x[ind_x]
        ratio_x = (x - a) / (b - a)

        for i, val in enumerate(self.y):
            if y < val:
                ind_y = i
                break
        a = self.y[ind_y - 1]
        b = self.y[ind_y]
        ratio_y = (y - a) / (b - a)

        y1 = self.data[ind_y - 1][ind_x -1] * (1 - ratio_x) + self.data[ind_y - 1][ind_x] * ratio_x
        y2 = self.data[ind_y    ][ind_x -1] * (1 - ratio_x) + self.data[ind_y    ][ind_x] * ratio_x

        return y1 * (1 - ratio_y) + y2 * ratio_y

def ElAzRoll2D(el, az, roll):
    # the unit of all inputs is deg.
    rot_z = lambda x : np.matrix([[ cos(x), -sin(x), 0.],\
                                  [ sin(x),  cos(x), 0.],\
                                  [     0.,      0., 1.]])
    
    rot_y = lambda x : np.matrix([[ cos(x), 0.,  sin(x)],\
                                  [     0., 1.,      0.],\
                                  [-sin(x), 0.,  cos(x)]])
    theta_az   = pi / 2 - az * pi / 180
    theta_el   = pi / 2 - el * pi / 180
    theta_roll = roll * pi / 180
    D = rot_z(theta_az) * rot_y(theta_el) * rot_z(-theta_az) * rot_z(theta_roll)
#    D = rot_z(theta_az) * rot_y(theta_el) * rot_z(theta_roll)
#    print("el, az, roll")
#    print(el, az, roll)
#    print("D")
#    print(D)
    return D[:, 0], D[:, 1], D[:, 2]

def tautr(gaze_el, gaze_az, att_el, att_az, att_roll, grnd_el, grnd_az):
#    print("gaze_el, gaze_az, att_el, att_az, att_roll, grnd_el, grnd_az")
#    print(gaze_el, gaze_az, att_el, att_az, att_roll, grnd_el, grnd_az)
    dummy0, dummy1, gaze_z = ElAzRoll2D(gaze_el, gaze_az, 0)
    att_x, att_y, att_z    = ElAzRoll2D(att_el,  att_az,  att_roll)
    dummy0, dummy1, grnd_z = ElAzRoll2D(grnd_el, grnd_az, 0)
    idot_x = np.dot(gaze_z.T, att_x)
    idot_y = np.dot(gaze_z.T, att_y)
    idot_z = np.dot(gaze_z.T, att_z)
    idot_x = idot_x[0, 0]
    idot_y = idot_y[0, 0]
    idot_z = idot_z[0, 0]
    att_tau_t = arccos(idot_z) * 180 / pi
    att_tau_r = arctan2(idot_y, idot_x) * 180 / pi + 180

    idot_z = np.dot(gaze_z.T, grnd_z)
    idot_z = idot_z[0, 0]
    grnd_tau_t = arccos(idot_z) * 180 / pi
    
#    print("att_taut_t", att_tau_t)
#    print("att_taut_r", att_tau_r)
#    print("grnd_taut_t", grnd_tau_t)
#    exit()
    return att_tau_t, att_tau_r, grnd_tau_t

def recv_power(antenna_freq, loss, power, slant_range, gain_vhcl, att_tau_t, att_tau_r, gain_grnd, grnd_tau_t):
    flag = False
    S = 0
    dS =  power
    if flag: print(dS,end=",")
    S += dS
    dS =  gain_vhcl.func( att_tau_t, att_tau_r)
    if flag: print(dS,end=",")
    S += dS
    dS =  gain_grnd.func(grnd_tau_t, 0)
    if flag: print(dS,end=",")
    S += dS
    dS =  20 * log10(299792458 / antenna_freq)
    if flag: print(dS,end=",")
    S += dS
    dS = -20 * log10(4 * pi * slant_range)
    if flag: print(dS,end=",")
    S += dS
    dS = -loss
    if flag: print(dS)
    S += dS

    return S

if __name__ == '__main__':
    # ==== USER INPUT ====
    cutoff_time = 1.0 # IIP分散算出のためのエンジンカットオフ時間
    invalid_angle_deg = 3.0 # 可視範囲計算のための可視仰角の下限値 (deg)
    # ==== USER INPUT ====


    argvs = sys.argv  # コマンドライン引数を格納したリストの取得
    argc = len(argvs) # 引数の個数
    if (argc > 1):
    	file_name = argvs[1]
    else:
    	file_name = "param_sample_01.json"
    if (argc > 2):
        file_name_rf = argvs[2]
    else:
        print("NO RFPROP INPUT")
        exit(1)


    # 入力の確認
    print("==== INPUT PARAMETER ===")
    print("input JSON file : " + file_name)
    print("rf input JSON file : " + file_name_rf)
    print("IIP cut-off time (sec) : %.1f" % cutoff_time)
    print("visible range invalid angle (deg) : %.1f" % invalid_angle_deg)
    print("==== PROCESSING ====")

    # ファイル読み込み
    f = open(file_name)
    data = json.load(f)
    following_stage_exist = []
    rocket_name = data["name(str)"]
    following_stage_exist.append(data["stage1"]["stage"]["following stage exist?(bool)"])
    if ("stage2" in data):
        following_stage_exist.append(data["stage2"]["stage"]["following stage exist?(bool)"])
    if ("stage3" in data):
        following_stage_exist.append(data["stage3"]["stage"]["following stage exist?(bool)"])

    f = open(file_name_rf)
    data = json.load(f)
    for dat in data:
        rf_name = dat["name(str)"]
        antenna_lat = dat["antenna_lat(deg)"]
        antenna_lon = dat["antenna_lon(deg)"]
        antenna_alt = dat["antenna_alt(m)"]
        antenna_elv = dat["antenna_elv(deg)"]
        antenna_azi = dat["antenna_azi(deg)"]
        gain_grnd = DATA_2D(dat["gain_grnd(str)"])
        gain_vhcl = DATA_2D(dat["gain_vhcl(str)"])
        freq = dat["freq(Hz)"]
        loss = dat["loss(dB)"]
        power = dat["power(dBm)"]
        print("Now processing " + rf_name + " RF property ...")

        # データ作り
        stage_index = 1
        for stage_exist in following_stage_exist:
            print("\tNow processing " + str(stage_index) + " stage csv file ...")
            file_name = "output/" + rocket_name + "_dynamics_" + str(stage_index) + ".csv"
            df = pd.read_csv(file_name, index_col=False)
            df_rf = pd.DataFrame()
            posLLH_antenna = np.array([antenna_lat, antenna_lon, antenna_alt])

            dis3_a = []
            az_a = []
            el_a = []
            att_tau_t_array = []
            att_tau_r_array = []
            grnd_tau_t_array = []
            recv_power_array = []

            for key, row in df.iterrows():
                time = row[0]
                mass = row[1]
                thrust = row[2]
                posLLH_ = np.array([row[3], row[4], row[5]])
                posECI_ = np.array([row[6], row[7], row[8]])
                att_az, att_el = np.array([row[23], row[24]])
                dis2, dis3, az, el = antenna_param(posLLH_antenna, posLLH_)
                att_tau_t, att_tau_r, grnd_tau_t = tautr(el, az, att_el, att_az, 0, antenna_elv, antenna_azi)
                recv_power_ = recv_power(freq, loss, power, dis3, gain_vhcl, att_tau_t, att_tau_r, gain_grnd, grnd_tau_t)

                dis3_a.append(dis3)
                az_a.append(az)
                el_a.append(el)
                att_tau_t_array.append(att_tau_t)
                att_tau_r_array.append(att_tau_r)
                grnd_tau_t_array.append(grnd_tau_t)
                recv_power_array.append(recv_power_)

            df_rf["time(s)"] = df["time(s)"]
            df_rf["lat(deg)"]    = df["lat(deg)"]   
            df_rf["lon(deg)"]    = df["lon(deg)"]   
            df_rf["altitude(m)"] = df["altitude(m)"]
            df_rf["distance 3d(m)"] = dis3_a
            df_rf["distance 3d(m)"] = dis3_a
            df_rf["antenna lat(deg)"] = antenna_lat
            df_rf["antenna lon(deg)"] = antenna_lon
            df_rf["antenna azimuth(deg)"] = az_a
            df_rf["antenna elevation(deg)"] = el_a
            df_rf["vehicle tau_t(deg)"] = att_tau_t_array
            df_rf["vehicle tau_r(deg)"] = att_tau_r_array
            df_rf["ground tau_t(deg)"] = grnd_tau_t_array
            df_rf["received power(dB)"] = recv_power_array

            # ファイル出力
            df_rf.to_csv("output/" + rocket_name + "_dynamics_" + str(stage_index) + "_" + rf_name + ".csv", index=False)

            # PLOT
            plt.figure()
            plt.plot(df["time(s)"], az_a, label="azimuth")
            plt.plot(df["time(s)"], el_a, label="elevation")
            plt.plot(df["time(s)"], att_tau_t_array, label="vehicle tau_t(deg)")
            plt.plot(df["time(s)"], att_tau_r_array, label="vehicle tau_r(deg)")
            plt.plot(df["time(s)"], grnd_tau_t_array, label="ground tau_t(deg)")
            plt.title(rocket_name + " " + str(stage_index) + " stage antenna angle")
            plt.xlabel("time (s)")
            plt.ylabel("angle (deg)")
            plt.yticks(range(0,361,30))
            plt.legend(loc="best")
            plt.grid()

            plt.figure()
            plt.plot(df["time(s)"], recv_power_array, label="received power[dBm]")
            plt.title(rocket_name + " " + str(stage_index) + " stage receivced power")
            plt.xlabel("time (s)")
            plt.ylabel("received power(dBm)")
            plt.legend(loc="best")
            plt.grid()

#            plt.show()

            if (stage_exist == False): break
            stage_index += 1
