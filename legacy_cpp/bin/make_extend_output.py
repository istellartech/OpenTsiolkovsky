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
from numpy import sin, cos, sqrt, arctan2, arcsin, pi

plt.ion()

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

if __name__ == '__main__':
    # ==== USER INPUT ====
    # 源泉: MOMO 地上局アンテナゲイン UHF
    antenna_lat =  42.5039248 # 地上局位置　緯度 (deg)
    antenna_lon = 143.44954216 # 地上局位置　経度 (deg)
    antenna_alt = 25.0 # 地上局　高度 (m)
    cutoff_time = 2.0 # IIP分散算出のためのエンジンカットオフ時間
    invalid_angle_deg = 3.0 # 可視範囲計算のための可視仰角の下限値 (deg)
    # ==== USER INPUT ====


    argvs = sys.argv  # コマンドライン引数を格納したリストの取得
    argc = len(argvs) # 引数の個数
    if (argc != 1):
    	file_name = argvs[1]
    else:
    	file_name = "param_sample_01.json"

    # 入力の確認
    print("==== INPUT PARAMETER ===")
    print("input JSON file : " + file_name)
    print("viewer latitude  (deg) : %.6f" % antenna_lat)
    print("viewer longitude (deg) : %.6f" % antenna_lon)
    print("viewer altitude  (m)   : %.1f" % antenna_alt)
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

    # データ作り
    stage_index = 1
    for stage_exist in following_stage_exist:
        print("Now processing " + str(stage_index) + " stage csv file ...")
        file_name = "output/" + rocket_name + "_dynamics_" + str(stage_index) + ".csv"
        df = pd.read_csv(file_name, index_col=False)
        posLLH_antenna = np.array([antenna_lat, antenna_lon, antenna_alt])
        # posLLH_antenna = np.array([df[" lat(deg)"][0], df[" lon(deg)"][0], df[" altitude(m)"][0]])

        dis2_a = []
        dis3_a = []
        az_a = []
        el_a = []
        radius_IIP_a = []
        radius_visible_a = []

        for key, row in df.iterrows():
            time = row[0]
            mass = row[1]
            thrust = row[2]
            posLLH_ = np.array([row[3], row[4], row[5]])
            posECI_ = np.array([row[6], row[7], row[8]])
            vel_ECEF_NEDframe = np.array([row[12], row[13], row[14]])
            dis2, dis3, az, el = antenna_param(posLLH_antenna, posLLH_)
            radius_IIP_ = radius_IIP(time, posECI_, vel_ECEF_NEDframe, cutoff_time, thrust, mass)
            radius_visible_ = radius_visible(posLLH_[2], invalid_angle_deg)
            dis2_a.append(dis2)
            dis3_a.append(dis3)
            az_a.append(az)
            el_a.append(el)
            radius_IIP_a.append(radius_IIP_)
            radius_visible_a.append(radius_visible_)

        df["distance 2d(m)"] = dis2_a
        df["distance 3d(m)"] = dis3_a
        df["antenna lat(deg)"] = antenna_lat
        df["antenna lon(deg)"] = antenna_lon
        df["antenna azimuth(deg)"] = az_a
        df["antenna elevation(deg)"] = el_a
        df["antenna body difference(deg)"] =  df["attitude_elevation(deg)"] - df["antenna elevation(deg)"]
        df["IIP radius(m)"] = radius_IIP_a

        # ファイル出力
        df.to_csv("output/" + rocket_name + "_dynamics_" + str(stage_index) + "_extend.csv", index=False)
        stage_index += 1

        # PLOT
        plt.figure()
        plt.plot(df["time(s)"], dis2_a, label="distance 2d")
        plt.plot(df["time(s)"], dis3_a, label="distance 3d")
        plt.title(rocket_name + " " + str(stage_index) + " stage distance")
        plt.xlabel("time (s)")
        plt.ylabel("distance (m)")
        plt.legend(loc="best")
        plt.grid()

        plt.figure()
        plt.plot(df["time(s)"], az_a, label="azimuth")
        plt.plot(df["time(s)"], el_a, label="elevation")
        plt.title(rocket_name + " " + str(stage_index) + " stage antenna angle")
        plt.xlabel("time (s)")
        plt.ylabel("angle (deg)")
        plt.legend(loc="best")
        plt.grid()

        plt.figure()
        plt.plot(df["time(s)"], radius_IIP_a, label="IIP radius\ncut-off time = %.1f sec" % (cutoff_time))
        plt.title(rocket_name + " " + str(stage_index) + " stage IIP radius")
        plt.xlabel("time (s)")
        plt.ylabel("radius (m)")
        plt.legend(loc="best")
        plt.grid()

        # plt.show()

        if (stage_exist == False): break
