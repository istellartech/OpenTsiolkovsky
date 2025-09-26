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

stage_literal = ["", "M", "S", "T", "F"]  # ex. MECO SECO etc...
kml = simplekml.Kml(open=1)

def make_kml(name, div, stage, is_dump=False):
    """
    Args:
        name (str) : ロケット名(jsonファイルのname)
        div (int) : 間引き数
        stage (int) : 現在のステージ
        is_dump (bool) : 出力するKMLが投棄物かどうか？
    """
    dump_name = "_dump" if is_dump else ""
    csv_file = "output/" + name + "_dynamics_" + str(stage) + dump_name + ".csv"
    try:
        df = pd.read_csv(csv_file, index_col=False)
        time = df["time(s)"]
        lat = df["lat(deg)"]
        lon = df["lon(deg)"]
        altitude = df["altitude(m)"]
        lat_IIP = df["IIP_lat(deg)"]
        lon_IIP = df["IIP_lon(deg)"]
        is_powered = df["is_powered(1=powered 0=free)"]
        is_separated = df["is_separated(1=already 0=still)"]
        # イベント毎に点を打つために前の値からの変化を監視して変化していればcoord_pointに追加
        is_powered_prev = is_powered[0]
        is_separated_prev = is_separated[0]
        for i in range(len(time)):
            if (is_powered_prev == 1 and is_powered[i] == 0):
                pnt = kml.newpoint(name=stage_literal[stage] + "ECO")
                pnt.coords = [(lon.iloc[i], lat.iloc[i], altitude.iloc[i])]
                pnt.description = "T+" + str(time.iloc[i]) + "[sec]"
                pnt.style.iconstyle.icon.href = "http://earth.google.com/images/kml-icons/track-directional/track-none.png"
                pnt.altitudemode = simplekml.AltitudeMode.absolute
            if (is_powered_prev == 0 and is_powered[i] == 1):
                pnt = kml.newpoint(name=stage_literal[stage] + "EIG")
                pnt.coords = [(lon.iloc[i], lat.iloc[i], altitude.iloc[i])]
                pnt.description = "T+" + str(time.iloc[i]) + "[sec]"
                pnt.style.iconstyle.icon.href = "http://earth.google.com/images/kml-icons/track-directional/track-none.png"
                pnt.altitudemode = simplekml.AltitudeMode.absolute
            if (is_separated_prev == 0 and is_separated[i] == 1):
                pnt = kml.newpoint(name=stage_literal[stage] + "SEP")
                pnt.coords = [(lon.iloc[i], lat.iloc[i], altitude.iloc[i])]
                pnt.description = "T+" + str(time.iloc[i]) + "[sec]"
                pnt.style.iconstyle.icon.href = "http://earth.google.com/images/kml-icons/track-directional/track-none.png"
                pnt.altitudemode = simplekml.AltitudeMode.absolute
            is_powered_prev = is_powered[i]
            is_separated_prev = is_separated[i]
        # 間引いた時点ごとに線を引く
        coord_line = []
        for i in range(len(time)//div):
            index = i * div
            coord_line.append((lon.iloc[index], lat.iloc[index], altitude.iloc[index]))
        coord_line.append((lon.iloc[-1], lat.iloc[-1], altitude.iloc[-1]))
        ls = kml.newlinestring(name="%d stage" % (stage))
        ls.style.linestyle.width = 8
        ls.extrude = 1  # 高度方向の線を無くしたいときはここを変更
        ls.altitudemode = simplekml.AltitudeMode.absolute
        ls.coords = coord_line
        ls.style.linestyle.color = simplekml.Color.white
        ls.style.linestyle.colormode = simplekml.ColorMode.random
        ls.lookat.latitude = lat.iloc[0]
        ls.lookat.longitude = lon.iloc[0]
        ls.lookat.range = 200000
        # IIP線を引く
        coord_IIP = []
        for i in range(len(time)//div):
            index = i * div
            coord_IIP.append((lon_IIP.iloc[index], lat_IIP.iloc[index]))
        coord_line.append((lon.iloc[-1], lat.iloc[-1]))
        ls_IIP = kml.newlinestring(name="%d stage IIP" % (stage))
        ls_IIP.style.linestyle.width = 8
        ls_IIP.coords = coord_IIP
        ls_IIP.style.linestyle.colormode = simplekml.ColorMode.random
        ls_IIP.style.linestyle.color = simplekml.Color.changealphaint(150, simplekml.Color.white)
        print("created kml file:" + str(stage) + " stage" + dump_name)
    except:
        print("Error: %d stage %s CANNNOT be maked kml." % (stage, dump_name))

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

    kml.save("output/" + name + "_GoogleEarth.kml")
    print("Done...")
