# -*- coding: utf-8 -*-
# OpenTsiolkovskyから出力される.csvファイルからアンテナ関係の値を出力
#
# outputフォルダの中にあるCSVファイルを読み込んで、
# _rfprop.csv としてCSV出力 (元のCSVファイルの内容にカラムが追加される)
# _output_rfprop.pdf としてPDFにCSV内容を作図
#
# ＊＊＊＊使い方＊＊＊＊
# make_rfprop.py (input_json_file) (アンテナ緯度[deg]) (アンテナ経度[deg]) (アンテナ標高[m])
#

import sys
import platform
import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt
import matplotlib.font_manager
from matplotlib.font_manager import FontProperties
from matplotlib.backends.backend_pdf import PdfPages
import pandas as pd
import json
from pyproj import Geod
from collections import namedtuple
from numpy import sin, cos, sqrt, arctan2, arcsin, pi
from math import atan, atan2, acos, asin

plt.close('all')
mpl.rcParams['axes.grid'] = True

##################################################################
# ECEF系機体位置および射点系クォータニオンおよび                 #
# 地上局位置から                                                 #
# RAEτtτrを算出する。                                          #
##################################################################

# Python/pandasのデータ処理で再帰代入撲滅委員会
# https://qiita.com/piroyoung/items/dd209801ca60a0b00c11
#
# pandas.DataFrameのforループ処理（イテレーション）
# https://note.nkmk.me/python-pandas-dataframe-for-iteration/
#
# 自由空間伝搬損失
# http://t-sato.in.coocan.jp/terms/free-space-propagation-loss.html

class WGS84:#{{{
    def __init__(self):
        self.f = 1/298.257223563    #扁平率[-]
        self.a =  6378137           #赤道半径[m]
        self.b = self.a*(1-self.f)  #極半径[m]
        self.e = sqrt(2*self.f-self.f**2) #離心率[-]
        self.ed = sqrt(self.e**2/(1-self.e**2))
        self.x = None # ECEF系x座標[m]
        self.y = None # ECEF系y座標[m]
        self.z = None # ECEF系z座標[m]
        self.phi = None # 緯度[rad]
        self.lmbd = None # 経路[rad]
        self.h = None # 高度[m]
        self.qECEF2L = None # ECEF系からL系へのクォータニオン

    def set_ECEF(self,x,y,z):
        self.x = x
        self.y = y
        self.z = z
        p = sqrt(x**2+y**2)
        theta = atan(z * self.a / (p * self.b))
        self.phi = atan((z+self.ed**2*self.b*sin(theta)**3)/(p-self.e**2 *self.a*cos(theta)**3))
        self.lmbd = atan2(y,x)
        N = self.a/sqrt(1-self.e**2*sin(self.phi)**2)
        self.h = p/cos(self.phi)-N
        self.qECEF2L = None

    def set_phi_lambda_h(self,phi,lmbd,h):
        self.phi = phi
        self.lmbd = lmbd
        self.h = h
        N = self.a/sqrt(1-self.e**2*sin(phi)**2)
        self.x = (N+h)*cos(phi)*cos(lmbd)
        self.y = (N+h)*cos(phi)*sin(lmbd)
        self.z = (N*(1-self.e**2)+h)*sin(phi)
        self.qECEF2L = None

    def get_ECEF(self):
        return np.array([self.x, self.y, self.z])

    def get_phi_lambda_h(self):
        return np.array([self.phi,self.lmbd,self.h])

    def get_qECEF2L(self):
        if self.qECEF2L == None:
            q1 = np.zeros(4)
            q1[0] = cos((self.lmbd+pi/2)/2)
            q1[3] = sin((self.lmbd+pi/2)/2)
            q2    = np.zeros(4)
            q2[0] = cos((pi/2-self.phi)/2)
            q2[1] = sin((pi/2-self.phi)/2)
            self.qECEF2L = q_mul(q1,q2)
        return self.qECEF2L
#}}}

#クォータニオン積{{{
def q_mul(q,p):
    q_mul=np.zeros(4)
    q_mul[0]=q[0]*p[0]-q[1]*p[1]-q[2]*p[2]-q[3]*p[3]
    q_mul[1]=q[1]*p[0]+q[0]*p[1]-q[3]*p[2]+q[2]*p[3]
    q_mul[2]=q[2]*p[0]+q[3]*p[1]+q[0]*p[2]-q[1]*p[3]
    q_mul[3]=q[3]*p[0]-q[2]*p[1]+q[1]*p[2]+q[0]*p[3]
    return q_mul
#}}}

#クォータニオンから座標軸ベクトルへの変換{{{
def q2x(q):
    att = np.zeros(3)
    att[0]=q[0]**2+q[1]**2-q[2]**2-q[3]**2
    att[1]=2*(q[1]*q[2]+q[0]*q[3])
    att[2]=2*(q[1]*q[3]-q[0]*q[2])
    return att
def q2y(q):
    att = np.zeros(3)
    att[0]=2*(q[1]*q[2]-q[0]*q[3])
    att[1]=q[0]**2-q[1]**2+q[2]**2-q[3]**2
    att[2]=2*(q[2]*q[3]+q[0]*q[1])
    return att
def q2z(q):
    att = np.zeros(3)
    att[0]=2*(q[1]*q[3]+q[0]*q[2])
    att[1]=2*(q[2]*q[3]-q[0]*q[1])
    att[2]=q[0]**2-q[1]**2-q[2]**2+q[3]**2
    return att
#}}}

def calc_look_angle(vehicle,sta,q_ini,q_sta,q):#{{{
    # name:
    #   RF系諸元計算関数
    #
    # inputs:
    #   vehicle:  ECEF系機体位置[m, m, m]
    #   sta:      ECEF系地上局位置[m, m, m]
    #   q_ini:    ECEF系からL系へのクォータニオン
    #   q_sta:    ECEF系から地上局系へのクォータニオン
    #   q:        射場固定系クォータニオン
    #
    # outputs: [norm_v_look, tau_t, tau_r, EL, AZ]
    #   norm_v_look:    スラントレンジ[m]
    #   tau_t:          トータル・ルック・アングル[rad]
    #   tau_r:          ロール・ルック・アングル[rad]
    #   EL:             地上局上下角[rad]
    #   AZ:             地上局方位角[rad]
    #
    # functions to use:
    #   q2x, q2y, q2z, q_mul

    v_look = vehicle-sta
    norm_v_look = np.linalg.norm(v_look) #視線ベクトル
    q = q_mul(q_ini,q)   # ECEI系
    att = q2z(q)
    tau_t = acos(np.dot(v_look,att)/norm_v_look)
    v_roll_look = v_look-np.dot(v_look,att)*att #視線ベクトル機体固定座標系xy平面射影
    v_roll_look = v_roll_look/np.linalg.norm(v_roll_look) #正規化
    att_x = q2x(q)
    att_y = q2y(q)
    tau_r = atan2(\
                np.dot(-v_roll_look,att_y),\
                np.dot(-v_roll_look,att_x))

    z_sta = q2z(q_sta)
    EL = asin(np.dot(z_sta,v_look)/norm_v_look)
    v_azi_look = v_look - np.dot(v_look,z_sta)*z_sta #視線ベクトル地上局座標系xy平面射影
    v_azi_look = v_azi_look/np.linalg.norm(v_azi_look) #正規化
    x_sta = q2x(q_sta)
    y_sta = q2y(q_sta)
    AZ = atan2(
                np.dot(v_azi_look,x_sta),
                np.dot(v_azi_look,y_sta))

    return [norm_v_look, tau_t, tau_r, EL, AZ]
#}}}

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

if __name__ == '__main__':
    if (len(sys.argv) != 5):
        print("Usage: python make_rfprop.py param.json antenna_lat antenna_lon antenna_alt")
        print("example: python make_rfprop.py param_sample.json 42.5 143.4 15.0")
        exit(-1)

    # ==== USER INPUT ====
    file_name = sys.argv[1]
    antenna_lat = float(sys.argv[2]) # 42.5038639 # 地上局位置　緯度 (deg)
    antenna_lon = float(sys.argv[3]) # 143.449639 # 地上局位置　経度 (deg)
    antenna_alt = float(sys.argv[4]) # 15.0 # 地上局　高度 (m)
    invalid_angle_deg = 3.0 # 可視範囲計算のための可視仰角の下限値 (deg)
    location_str = "Lat:%.6f° Lon:%.6f° Alt:%.0fm" % (antenna_lat, antenna_lon, antenna_alt)
    # ==== USER INPUT ====

    sta = WGS84()
    sta.set_phi_lambda_h(np.deg2rad(antenna_lat),np.deg2rad(antenna_lon),antenna_alt)
    q_sta = sta.get_qECEF2L() # ECEF系から地上局系へのクォータニオン
    sta = sta.get_ECEF() # ECEF系地上局位置[m, m, m]

    # 入力の確認
    print(u"==== INPUT PARAMETER ===")
    print(u"input JSON file : " + file_name)
    print(u"viewer latitude  (deg) : %.6f" % antenna_lat)
    print(u"viewer longitude (deg) : %.6f" % antenna_lon)
    print(u"viewer altitude  (m)   : %.1f" % antenna_alt)
    print(u"visible range invalid angle (deg) : %.1f" % invalid_angle_deg)
    print(u"==== PROCESSING ====")


    # JSON設定ファイル読み込み
    f = open(file_name)
    data = json.load(f)
    following_stage_exist = []
    rocket_name = data["name(str)"]
    following_stage_exist.append(True)
    if ("stage2" in data):
        following_stage_exist.append(data["stage2"]["stage"]["following stage exist(bool)"])
    if ("stage3" in data):
        following_stage_exist.append(data["stage3"]["stage"]["following stage exist(bool)"])

    # 射点位置 (JSON設定ファイルより)
    launch_llh = data['launch']['position LLH[deg,deg,m]']
    launch_pos = WGS84()
    launch_pos.set_phi_lambda_h(np.deg2rad(launch_llh[0]),np.deg2rad(launch_llh[1]),launch_llh[2])
    q_ini = launch_pos.get_qECEF2L() # ECEF系からL系へのクォータニオン

    # PDF出力設定
    pdf = PdfPages('output/' + rocket_name + '_output_rfprop.pdf')
    plt.rc('figure', figsize=(11,8))
    grid_size = (6, 4)
    print(u"output data plotting...")

    # データ作り
    stage_index = 1
    for stage_exist in following_stage_exist:
        if (stage_index == 1): stage_index_str = "1st"
        if (stage_index == 2): stage_index_str = "2nd"
        if (stage_index == 3): stage_index_str = "3rd"
        print("Now processing " + stage_index_str + " stage csv file ...")
        file_name = "output/" + rocket_name + "_dynamics_" + str(stage_index) + ".csv"

        # OpenTsiolkovsky出力のCSVを読み込む
        df = pd.read_csv(file_name, index_col=False)

        # 機体座標(ECEF)と機体姿勢(射場固定系クォータニオン)の算出
        pos_ECEF_x = []
        pos_ECEF_y = []
        pos_ECEF_z = []
        for key, row in df.iterrows():
            vehicle_pos = WGS84()
            vehicle_pos.set_phi_lambda_h(
                np.deg2rad(row['lat(deg)']),
                np.deg2rad(row['lon(deg)']),
                row['altitude(m)'])
            ecef = vehicle_pos.get_ECEF()
            pos_ECEF_x.append(ecef[0])
            pos_ECEF_y.append(ecef[1])
            pos_ECEF_z.append(ecef[2])

        attitude_el_rad = np.pi / 2 - df["attitude_elevation(deg)"] * np.pi / 180
        attitude_az_rad = df["attitude_azimth(deg)"] * np.pi / 180
        vx = cos(attitude_az_rad)
        vy = sin(-attitude_az_rad)
        vz = 0
        df["q0"] = cos(attitude_el_rad / 2)
        df["q1"] = vx * sin(attitude_el_rad / 2)
        df["q2"] = vy * sin(attitude_el_rad / 2)
        df["q3"] = vz * sin(attitude_el_rad / 2)
        df["ECEF_x"] = pos_ECEF_x
        df["ECEF_y"] = pos_ECEF_y
        df["ECEF_z"] = pos_ECEF_z

        # 機体座標(ECEF)と機体姿勢(射場固定系クォータニオン)からRF系諸元計算
        q = np.zeros(4)
        vehicle = np.zeros(3)
        for index, row in df.iterrows():
            q[0] = row['q0']
            q[1] = row['q1']
            q[2] = row['q2']
            q[3] = row['q3']
            vehicle[0] = row["ECEF_x"]
            vehicle[1] = row["ECEF_y"]
            vehicle[2] = row["ECEF_z"]

            [slantrange, taut, taur, EL, AZ] = calc_look_angle(vehicle,sta,q_ini,q_sta,q)

            df.at[index,'slant range(m)'] = slantrange
            df.at[index,'tau_t(deg)'] = taut*180./pi
            df.at[index,'tau_r(deg)'] = taur*180./pi
            df.at[index,'elevation(deg)'] = EL*180./pi
            df.at[index,'azimuth(deg)'] = AZ*180./pi

        # CSVファイル出力
        df.to_csv("output/" + rocket_name + "_dynamics_" + str(stage_index) + "_rfprop.csv", index=False)

        # 燃焼中領域の算出
        # 最大推力の1%以上を燃焼中とみなす
        invalid_thrust_N = np.max(df['thrust(N)']) * 0.01
        powered_idx = detect_rise_fall_edge(df['thrust(N)'] > invalid_thrust_N)

        # 可視範囲
        valid_elv_idx = detect_rise_fall_edge(df['elevation(deg)'] > invalid_angle_deg)

        # 作図
        figure = plt.figure()

        plt.subplot2grid(grid_size, (0, 0), rowspan=2, colspan=2)
        plt.plot(df['time(s)'], df['altitude(m)']/1000.0)
        plot_timespan(df['time(s)'], powered_idx, facecolor='r', alpha=0.3)
        plot_timespan(df['time(s)'], valid_elv_idx, facecolor='yellow', alpha=0.1)
        plt.xlabel("time (sec)")
        plt.ylabel("altitude (km)")

        plt.subplot2grid(grid_size, (0, 2), rowspan=2, colspan=2)
        plt.plot(df['time(s)'], df['slant range(m)']/1000.0)
        plot_timespan(df['time(s)'], powered_idx, facecolor='r', alpha=0.3)
        plot_timespan(df['time(s)'], valid_elv_idx, facecolor='yellow', alpha=0.1)
        plt.xlabel("time (sec)")
        plt.ylabel("slant range(km)")

        plt.subplot2grid(grid_size, (2, 0), rowspan=2, colspan=2)
        plt.plot(df['time(s)'], df['elevation(deg)'])
        plot_timespan(df['time(s)'], powered_idx, facecolor='r', alpha=0.3)
        plot_timespan(df['time(s)'], valid_elv_idx, facecolor='yellow', alpha=0.1)
        plt.xlabel("time (sec)")
        plt.ylabel("elevation(deg)")

        plt.subplot2grid(grid_size, (2, 2), rowspan=2, colspan=2)
        plt.plot(df['time(s)'], df['azimuth(deg)'])
        plot_timespan(df['time(s)'], powered_idx, facecolor='r', alpha=0.3)
        plot_timespan(df['time(s)'], valid_elv_idx, facecolor='yellow', alpha=0.1)
        plt.xlabel("time (sec)")
        plt.ylabel("azimuth(deg)")

        plt.subplot2grid(grid_size, (4, 0), rowspan=2, colspan=2)
        plt.plot(df['time(s)'], df['tau_t(deg)'])
        plot_timespan(df['time(s)'], powered_idx, facecolor='r', alpha=0.3)
        plot_timespan(df['time(s)'], valid_elv_idx, facecolor='yellow', alpha=0.1)
        plt.xlabel("time (sec)")
        plt.ylabel("tau_t(deg)")

        plt.subplot2grid(grid_size, (4, 2), rowspan=2, colspan=2)
        plt.plot(df['time(s)'], df['tau_r(deg)'])
        plot_timespan(df['time(s)'], powered_idx, facecolor='r', alpha=0.3)
        plot_timespan(df['time(s)'], valid_elv_idx, facecolor='yellow', alpha=0.1)
        plt.xlabel("time (sec)")
        plt.ylabel("tau_r(deg)")

        plt.tight_layout()
        figure.suptitle("Stage:%d %s" % (stage_index, location_str), fontsize=20)
        plt.subplots_adjust(top=0.9)
        pdf.savefig(figure)

        stage_index += 1

        if (stage_exist == False): break

    pdf.close()
