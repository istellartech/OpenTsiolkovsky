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


"""
pyIIP.IIP - rocket Instantaneous Impact Point(IIP) calcuration

IIPの緯度経度高度＋NED速度→落下位置の緯度経度、フライト時間の算出

cf.
Jaemyung Ahn and Woong-Rae Roh.  "Noniterative Instantaneous Impact Point Prediction Algorithm for Launch Operations",
Journal of Guidance, Control, and Dynamics, Vol. 35, No. 2 (2012), pp. 645-648.
https://doi.org/10.2514/1.56395

memo:
2018年6月17日現在バグが残っており、IIP位置が不正確。
地球の扁平に起因するバグと推定される。
"""

import numpy as np
from numpy import cos, sin, tan, arcsin, arctan2, arccos
from numpy import sqrt, deg2rad, rad2deg, pi
import pandas as pd
import matplotlib.pyplot as plt

class WGS84():
    def __init__(self):
        self.re_a = 6378137.0  # [m] WGS84の長軸
        self.eccen1 = 8.1819190842622e-2  # First Eccentricity
        self.eccen1sqr = 6.69437999014e-3  # First Eccentricity squared
        self.one_f = 298.257223563  # 扁平率fの1/f（平滑度）
        self.re_b = 6356752.314245 # [m] WGS84の短軸
        self.e2 = 6.6943799901414e-3  # 第一離心率eの2乗
        self.ed2 = 6.739496742276486e-3  # 第二離心率e'の2乗

wgs84 = WGS84()
omega_earth = 7.2921159e-5; # 地球の自転角速度[rad/s]

def posECEF_from_LLH(posLLH_):
    """
    Args:
        posLLH_ (np.array 3x1) : position in LLH coordinate [deg, deg, m]
    Return:
        (np.array 3x1) : position in ECEF coordinate [m, m, m]
    """
    lat = deg2rad(posLLH_[0])
    lon = deg2rad(posLLH_[1])
    alt = posLLH_[2]
    W = sqrt(1.0 - wgs84.e2 * sin(lat) * sin(lat))
    N = wgs84.re_a / W
    pos0 = (N + alt) * cos(lat) * cos(lon)
    pos1 = (N + alt) * cos(lat) * sin(lon)
    pos2 = (N * (1 - wgs84.e2) + alt) * sin(lat)
    return np.array([pos0, pos1, pos2])

def dcmECI2ECEF(second):
    """
    Args:
        second (double) : time from refarence time[s]
    Return:
        dcm (np.array 3x3) : DCM from ECI to ECEF
    """
    theta = omega_earth * second
    dcm = np.array([[cos(theta),  sin(theta), 0.0],
                    [-sin(theta), cos(theta), 0.0],
                    [0.0,         0.0,        1.0]])
    return dcm

def posECI(posECEF_, second):
    """
    Args:
        posECEF_ (np.array 3x1) : position in ECEF coordinate [m, m, m]
        second (double) : time from refarence time [s]
    Return:
        (np.array 3x1) : position in ECI coordinate [m, m, m]
    """
    dcmECI2ECEF_ = dcmECI2ECEF(second)
    dcmECEF2ECI_ = dcmECI2ECEF_.T
    return dcmECEF2ECI_.dot(posECEF_)

def dcmECEF2NED(posLLH_):
    """
    Args:
        posLLH_ (np.array 3x1) : [deg, deg, m]
    Return:
        dcm (np.array 3x3) : DCM from ECEF to NED
    """
    lat = deg2rad(posLLH_[0])
    lon = deg2rad(posLLH_[1])
    dcm = np.array([[-sin(lat)*cos(lon), -sin(lat)*sin(lon), cos(lat)],
                    [sin(lon),           cos(lon),          0],
                    [-cos(lat)*cos(lon), -cos(lat)*sin(lon), -sin(lat)]])
    return dcm

def dcmECI2NED(dcmECEF2NED_, dcmECI2ECEF_):
    return dcmECEF2NED_.dot(dcmECI2ECEF_)

def n_posECEF2LLH(phi_n_deg):
    return wgs84.re_a / sqrt(1.0 - wgs84.e2 * sin(deg2rad(phi_n_deg)) * sin(deg2rad(phi_n_deg)))

def posLLH(posECEF_):
    """
    Args:
        posECEF_ (np.array 3x1) : [deg, deg, m]
    Return:
        (np.array 3x1) : position in LLH coordinate [deg, deg, m]
    """
    p = sqrt(posECEF_[0] **2 + posECEF_[1] **2)
    theta = arctan2(posECEF_[2] * wgs84.re_a, p * wgs84.re_b) # rad
    lat = rad2deg(arctan2(posECEF_[2] + wgs84.ed2 * wgs84.re_b * pow(sin(theta), 3), p - wgs84.e2 * wgs84.re_a * pow(cos(theta),3)))
    lon = rad2deg(arctan2(posECEF_[1], posECEF_[0]))
    alt = p / cos(deg2rad(lat)) - n_posECEF2LLH(lat)
    return np.array([lat, lon, alt])


def lat_from_radius(radius):
    """ Return latitude[deg] from earth radius
    Args:
        radius (double) : earth radius[m]
    Return:
        (double) : latitude [deg]
    """
    lat_rad =  arcsin(sqrt(1/wgs84.e2 * (1 - (radius**2) / (wgs84.re_a**2))))
    return rad2deg(lat_rad)

class IIP:
    def __init__(self, posLLH_, velNED_):
        """ calcurate IIP from current position(LLH) & current velocity(NED)
        Args:
            posLLH_ (np.array 3x1) : position at current point(LLH) [deg, deg, m]
            velNED_ (np.array 3x1) : velocity at current point(NED frame) [m/s, m/s, m/s]
        Attributes:
            posLLH_IIP_deg (np.array 2x1) : IIP position (LLH coordinate) [deg, deg]
            posLLH_IIP_rad (np.array 2x1) : IIP position (LLH coordinate) [rad, rad]
            distance_ECEF (double) : earth surface distance from current point to IIP [m]
            tf (double) : time of flight from current point to IIP [s]
        Usage:
            > _IIP = IIP(posLLH_, velNED_)
            > print(_IIP)
        """
        earth_radius = wgs84.re_a # 地球半径 [m]
        mu = 3.986004418 * 10**(14)  # 地球重力定数 m3s-2

        # 初期位置・速度のECI座標系への変換
        self.posLLH_ = posLLH_
        self.velNED_ = velNED_
        posECI_init_ = posECI(posECEF_from_LLH(posLLH_), 0)
        dcmECI2NED_ = dcmECI2NED(dcmECEF2NED(posLLH_), dcmECI2ECEF(0))
        omegaECI2ECEF_ = np.array([[0.0,         -omega_earth, 0.0],
                                   [omega_earth, 0.0,          0.0],
                                   [0.0,         0.0,          0.0]])  # 角速度テンソル
        velECI_init_ = np.dot(dcmECI2NED_.transpose(), velNED_) + omegaECI2ECEF_.dot(posECI_init_)

        # 計算に必要なr0, v0の絶対値と単位ベクトル、初期のγ:flight-path angleの計算
        # self.r0 = earth_radius + posLLH_[2]  # 地球半径を高度から出すかECI座標から出すか
        self.r0 = np.linalg.norm(posECI_init_)
        self.v0 = np.linalg.norm(velECI_init_)
        self.ir0 = posECI_init_ / np.linalg.norm(posECI_init_)  # 位置の単位ベクトル
        self.iv0 = velECI_init_ / np.linalg.norm(velECI_init_)  # 速度の単位ベクトル
        gamma0 = arcsin(np.dot(self.ir0, self.iv0))  # [rad]
        self.gamma0 = gamma0  # gammaを外から見るためにメンバ変数に

        lam = self.v0**2 / (mu / self.r0)  # lambda
        self.lam = lam

        def rp_calc(rp_temp):
            """ 関数内関数 収束計算のためにrp入力して計算される緯度(lat)から計算されるrpの差分を出力
            Args:
                rp_temp (double) : その緯度での地球半径 [m]
            Return:
                (doubel) : 計算されるrpと入力rpの差分
            """
            # phi:flight angle of a rocket の計算
            c1 = - tan(gamma0)
            c2 = 1 - 1/(lam * cos(gamma0)**2)
            c3 = self.r0 / rp_temp - 1 / (lam * cos(gamma0)**2)
            c12 = c1 ** 2
            c22 = c2 ** 2
            c32 = c3 ** 2
            phi = arcsin((c1*c3 + sqrt(c12*c32 - (c12+c22)*(c32-c22))) / (c12 + c22))

            # IIPの位置の単位ベクトルとそこから計算されるECI座標系でのIIP緯度経度 参考：eq.(13)~(15)
            self.ip = cos(gamma0 + phi)/cos(gamma0) * self.ir0 + sin(phi) / cos(gamma0) * self.iv0  # IIP単位ベクトル(ECI)
            self.ip = self.ip / np.linalg.norm(self.ip)

            # 論文の緯度経度の出し方は下記２行だが、実際にはipからECI座標を出した方が正確？
            # lat_ECI_IIP_rad = arcsin(self.ip[2])
            # lon_ECI_IIP_rad = arctan2(self.ip[1], self.ip[0])  # ここまでイテレーション

            IIP_LLH_deg = posLLH(self.ip * rp_temp)
            lat_ECI_IIP_rad = deg2rad(IIP_LLH_deg[0])
            lon_ECI_IIP_rad = deg2rad(IIP_LLH_deg[1])

            # print("phi = %3f [deg], lat IIP %.3f [deg]" % (rad2deg(phi),rad2deg(lat_ECI_IIP_rad)))
            rp_new = wgs84.re_a * sqrt(1 - wgs84.e2 * sin(lat_ECI_IIP_rad)**2)
            return rp_temp - rp_new

        rp1 = wgs84.re_b  # 収束計算のための二分法の下区間 地球短半径
        rp2 = wgs84.re_a  # 上区間 地球長半径
        epsilon = 1e-3  # 収束計算の収束誤差

        while True:
            rpM = (rp1 + rp2) / 2
            hantei_rp1 = rp_calc(rp1)  # 正か負かnan
            hantei_rp2 = rp_calc(rp2)  # 正か負かnan
            hantei_rpM = rp_calc(rpM)
            print("rpM = %.1f, 1:%.5f, 2:%.5f, M:%.5f" % (rpM, hantei_rp1, hantei_rp2, hantei_rpM))
            if(hantei_rpM < 0):
                rp1 = rpM
            else:
                rp2 = rpM
            if (abs(hantei_rpM) < epsilon):
                break

        # 収束したrpの値をrpとして設定
        rp = rpM

        # phi:flight angle of a rocket の計算
        c1 = - tan(gamma0)
        c2 = 1 - 1/(lam * cos(gamma0)**2)
        c3 = self.r0 / rp - 1 / (lam * cos(gamma0)**2)
        c12 = c1 ** 2
        c22 = c2 ** 2
        c32 = c3 ** 2
        phi = arcsin((c1*c3 + sqrt(c12*c32 - (c12+c22)*(c32-c22))) / (c12 + c22))
        self.phi = phi

        # IIPの位置の単位ベクトルとそこから計算されるECI座標系でのIIP緯度経度 参考：eq.(13)~(15)
        self.ip = cos(gamma0 + phi)/cos(gamma0) * self.ir0 + sin(phi) / cos(gamma0) * self.iv0  # IIP単位ベクトル(ECI)
        self.ip = self.ip / np.linalg.norm(self.ip)

        # lat_ECI_IIP_rad = arcsin(self.ip[2])
        # lon_ECI_IIP_rad = arctan2(self.ip[1], self.ip[0])  # ここまでイテレーション

        IIP_LLH_deg = posLLH(self.ip * rp)
        lat_ECI_IIP_rad = deg2rad(IIP_LLH_deg[0])
        lon_ECI_IIP_rad = deg2rad(IIP_LLH_deg[1])

        posLLH_ECI_IIP_rad = np.array([lat_ECI_IIP_rad, lon_ECI_IIP_rad, 0])
        posLLH_init_rad = np.zeros(3)
        posLLH_init_rad[0] = deg2rad(posLLH_[0])
        posLLH_init_rad[1] = deg2rad(posLLH_[1])

        # 初期位置からIIPまでの地球表面距離
        # cf. https://keisan.casio.jp/exec/system/1257670779
        self.distance_ECI = earth_radius * arccos(sin(posLLH_init_rad[0])*sin(posLLH_ECI_IIP_rad[0]) + cos(posLLH_init_rad[0])*cos(posLLH_ECI_IIP_rad[0])*cos(posLLH_ECI_IIP_rad[1]-posLLH_init_rad[1]))

        # 飛翔時間の計算　参考:eq.(19)
        t1 = self.r0 / self.v0 / cos(gamma0)
        t2 = tan(gamma0) * (1 - cos(phi)) + (1 - lam) * sin(phi)
        t3 = (2 - lam) * ((1 - cos(phi)) / (lam * cos(gamma0)**2))
        t4 = (2 - lam) * (cos(gamma0 + phi) / cos(gamma0))
        t5 = 2 * cos(gamma0) / (lam * (2 / lam - 1)**1.5)
        t6u = sqrt(2 / lam - 1)
        t6l = cos(gamma0) * tan(pi/2 - phi/2) - sin(gamma0)
        self.tf = t1 * ((t2 / (t3 + t4)) + t5 * arctan2(t6u, t6l))

        # 飛翔時間より、地球自転を考慮し、落下位置の緯度経度算出 参考：eq(14),(15)
        lat_ECEF_IIP_rad = lat_ECI_IIP_rad
        lon_ECEF_IIP_rad = lon_ECI_IIP_rad - omega_earth * self.tf
        self.posLLH_IIP_rad = np.array([lat_ECEF_IIP_rad, lon_ECEF_IIP_rad])
        self.posLLH_IIP_deg = np.array([rad2deg(lat_ECEF_IIP_rad), rad2deg(lon_ECEF_IIP_rad)])

        # 初期位置からIIPまでの地球表面距離
        self.distance_ECEF = earth_radius * arccos(sin(posLLH_init_rad[0])*sin(self.posLLH_IIP_rad[0]) + cos(posLLH_init_rad[0])*cos(self.posLLH_IIP_rad[0])*cos(self.posLLH_IIP_rad[1]-posLLH_init_rad[1]))

    def __repr__(self):
        print("==== current point ====")
        print("lat = %.6f [deg], lon = %.6f [deg]" % (self.posLLH_[0], self.posLLH_[1]))
        print("altitude = %.1f" %(self.posLLH_[2]))
        print("velocity(NED) = %.1f [m/s], %.1f [m/s], %.1f [m/s]" % (self.velNED_[0], self.velNED_[1], self.velNED_[2]))
        print("r0(ECI) = %.1f [m]" % (self.r0))
        print("v0(ECI) = %.1f [m/s]" % (self.v0))
        print("unit vector of r0 (ECI) = [%.6f, %.6f, %.6f]" % (self.ir0[0], self.ir0[1], self.ir0[2]))
        print("unit vector of v0 (ECI) = [%.6f, %.6f, %.6f]" % (self.iv0[0], self.iv0[1], self.iv0[2]))
        print("gamma0 = %.4f [deg]" % (rad2deg(self.gamma0)))
        print("==== IIP (Instantaneous Impact Point) ====")
        print("lat = %.6f [deg], lon = %.6f [deg]" % (self.posLLH_IIP_deg[0], self.posLLH_IIP_deg[1]))
        print("distance of earth surface ECEF = %.1f [m]" % (self.distance_ECEF))
        print("time of flight = %.2f [s]" % (self.tf))
        print("distance of earth surface ECI  = %.1f [m]" % (self.distance_ECI))
        print("flight angle of a rocket = %.6f [deg]" % (rad2deg(self.phi)))
        print("unit vector of IIP(ECI) = [%.6f, %.6f, %.6f]" % (self.ip[0], self.ip[1], self.ip[2]))
        return ""

if __name__ == '__main__':
    posLLH_ = np.array([40, 140, 100])
    velNED_ = np.array([0, 10, -10])

    _IIP = IIP(posLLH_, velNED_)
    print(_IIP)

    # simplekmlモジュールをインストールしていない場合は下記を実行
    # > pip install simplekml
    import simplekml

    print(_IIP.posLLH_IIP_deg)
    kml_points = [["satrt", posLLH_[0], posLLH_[1], posLLH_[2]],
                  ["IIP", _IIP.posLLH_IIP_deg[0], _IIP.posLLH_IIP_deg[1], 0]]
    kml = simplekml.Kml()
    for point in kml_points:
        p = kml.newpoint(name=point[0], coords=[(point[2], point[1], point[3])])
        p.altitudemode = simplekml.AltitudeMode.absolute
        p.lookat.latitude = point[1]
        p.lookat.longitude = point[2]

    kml.save("test.kml")

    # # file_name = "sample_01_dynamics_1.csv"
    # file_name = "ZERO_Phase5_dynamics_1.csv"
    # df = pd.read_csv(file_name, index_col=False)
    # lat_IIP = []
    # lon_IIP = []
    # for index, row in df.iterrows():
    #     posLLH_ = row["lat(deg)"], row["lon(deg)"], row["altitude(m)"]
    #     velNED_ = row["vel_NED_X(m/s)"], row["vel_NED_Y(m/s)"], row["vel_NED_Z(m/s)"]
    #     _IIP = IIP(posLLH_, velNED_)
    #     lat_IIP.append(_IIP.posLLH_IIP_deg[0])
    #     lon_IIP.append(_IIP.posLLH_IIP_deg[1])
    #
    # df["IIP_lat(deg)"] = lat_IIP
    # df["IIP_lon(deg)"] = lon_IIP
    # df.to_csv(file_name[:-4]+"_new.csv", index=False)
