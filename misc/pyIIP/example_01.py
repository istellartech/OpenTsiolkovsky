# -*- coding: utf-8 -*-
""" Google Earth file output example

required simplekml module.
if you didn't install simplekml, execute the following command.
> pip install simplekml
"""

from OpenVerne import IIP
import numpy as np
import pandas as pd
import simplekml
import warnings
warnings.filterwarnings('ignore')

if __name__ == '__main__':

    posLLH_ = np.array([35.0, 140.0, 100])
    velNED_ = np.array([10, 0, 0])

    _IIP = IIP(posLLH_, velNED_)
    # print(_IIP)
    _IIP.disp()

    kml_points = [["satrt", posLLH_[0], posLLH_[1], posLLH_[2]],
                  ["IIP", _IIP.posLLH_IIP_deg[0], _IIP.posLLH_IIP_deg[1], 0]]
    kml = simplekml.Kml()
    for point in kml_points:
        p = kml.newpoint(name=point[0], coords=[(point[2], point[1], point[3])])
        p.altitudemode = simplekml.AltitudeMode.absolute
        p.lookat.latitude = point[1]
        p.lookat.longitude = point[2]

    kml.save("test.kml")
    print("kml file outputted.")
