# -*- coding: utf-8 -*-
# Copyright (c) 2017 Interstellar Technologies Inc. All Rights Reserved.
# Authors : Takahiro Inagawa
# ==============================================================================
import sys
import os
import simplekml
import numpy as np
import json
import pandas as pd

def make_kml(name, div, stage, is_dump=False):
    """
    Args:
        name (str) : ロケット名(jsonファイルのname)
        div (int) : 間引き数
        stage (int) : 現在のステージ
        is_dump (bool) : 出力するKMLが投棄物かどうか？
    """
    dump_name = "_dump" if is_dump else ""
    try:
        csv_file = "output/" + name + "_dynamics_" + str(stage) + dump_name + ".csv"
        df = pd.read_csv(csv_file, index_col=False)
    except:
        print("Error: " + str(stage) + " stage kml passed")
        return
    time = df["time(s)"]
    lat = df["lat(deg)"]
    lon = df["lon(deg)"]
    altitude = df["altitude(m)"]
    kml = simplekml.Kml(open=1)
    cood = []
    for i in range(len(time)//div):
        index = i * div
        cood.append((lon.iloc[index], lat.iloc[index], altitude.iloc[index]))
    cood.append((lon.iloc[-1], lat.iloc[-1], altitude.iloc[-1]))
    # print(cood)
    ls = kml.newlinestring(name="name")
    ls.style.linestyle.width = 8
    ls.extrude = 1
    ls.altitudemode = simplekml.AltitudeMode.absolute
    ls.coords = cood
    ls.style.linestyle.color = simplekml.Color.white
    ls.style.linestyle.colormode = simplekml.ColorMode.random
    ls.lookat.latitude = lat.iloc[0]
    ls.lookat.longitude = lon.iloc[0]
    ls.lookat.range = 200000
    kml.save("output/" + name + "_" + str(stage) + dump_name + ".kml")

if __name__ == '__main__':
    if (len(sys.argv) != 1):
        file_name = sys.argv[1]
    else:
        file_name = "param_sample_01.json"
    try:
        data = json.load(open(file_name))
        name = data["name(str)"]
    except:
        print("JSON file can not be read...finish")
        sys.exit()

    time_step_output = 10  # KML出力の時間ステップ[sec]
    time_step = data["calculate condition"]["time step for output[s]"]
    reduce_interval = int(time_step_output // time_step)

    print("INPUT FILE: %s" % (file_name))
    for i in range(1,10):
        if ("stage" + str(i) in data):
            make_kml(name, reduce_interval, i)
            make_kml(name, reduce_interval, i, is_dump=True)
            print("create kml file:" + str(i) + " stage")
    print("Done...")
