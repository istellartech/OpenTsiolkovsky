# -*- coding: utf-8 -*-

from pyIIP import IIP
import numpy as np
from scipy.optimize import minimize

if __name__ == '__main__':

    def f(velNED_, pos_init, pos_goal):
        _IIP = IIP(pos_init, velNED_)
        lat1 = _IIP.posLLH_IIP_deg[0]
        lon1 = _IIP.posLLH_IIP_deg[1]
        lat2 = pos_goal[0]
        lon2 = pos_goal[1]
        return (lat1 - lat2) ** 2 + (lon1 - lon2) ** 2

    velNED_0 = np.array([0, -100, -100])

    pos_Tokyo = np.array([35.67288, 139.74336, 0])
    pos_Osaka = np.array([34.68963, 135.53010, 0])

    ans = minimize(f, velNED_0, args=(pos_Tokyo, pos_Osaka))

    _IIP = IIP(pos_Tokyo, ans.x)
    a = 340.29  # 地上での音速 [m/s]
    print("必要な速度\n北方向 = %.1f [m/s], 東方向 = %.1f [m/s], 上方向 = %.1f [m/s]" % (ans.x[0], ans.x[1], -ans.x[2]))
    print("北方向 = %.1f [km/h], 東方向 = %.1f [km/h], 上方向 = %.1f [km/h]" % (ans.x[0]*3.6, ans.x[1]*3.6, -ans.x[2]*3.6))
    print("マッハ数 : %.2f " % (np.sqrt((ans.x[0]/a)**2 + (ans.x[1]/a)**2 + (ans.x[2]/a)**2)))
    # print(_IIP)
