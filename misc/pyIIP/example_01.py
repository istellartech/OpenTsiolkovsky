# -*- coding: utf-8 -*-

from pyIIP import IIP
import numpy as np
import pandas as pd
import simplekml

if __name__ == '__main__':

    posLLH_ = np.array([40, 140, 100])
    velNED_ = np.array([10, 0, 0])

    _IIP = IIP(posLLH_, velNED_)
    # print(_IIP)

    kml_points = [["satrt", posLLH_[0], posLLH_[1], posLLH_[2]],
                  ["IIP", _IIP.posLLH_IIP_deg[0], _IIP.posLLH_IIP_deg[1], 0]]
    kml = simplekml.Kml()
    for point in kml_points:
        p = kml.newpoint(name=point[0], coords=[(point[2], point[1], point[3])])
        p.altitudemode = simplekml.AltitudeMode.absolute
        p.lookat.latitude = point[1]
        p.lookat.longitude = point[2]

    kml.save("test.kml")
    print("output kml file")

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
