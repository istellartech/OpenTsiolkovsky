# -*- coding: utf-8 -*-
import sys
# reload(sys)
import platform
# # デフォルトの文字コードを変更する．
# sys.setdefaultencoding('utf-8')
import make_param_json
import numpy as np
from scipy import optimize
import subprocess
import json
import simplekml

# パラメータを変えた時に落下地点がどこになるかの関数を作り、回していく

# 正規分布の則った分散を作り、Tsiolkovskyして出力を貯めて出力する。
def flight_simulator(json_file = "param_sample_01.json",
                     change_key1 = "name(str)",
                     change_key2 = None,
                     change_key3 = None,
                     change_value = "test"):
    data = make_param_json.make_param_json(json_file,
                                           change_key1 = change_key1,
                                           change_key2 = change_key2,
                                           change_key3 = change_key3,
                                           change_value = change_value);
    # print(json.dumps(data, sort_keys = True, indent = 4))
    temp_file = "temp.json"
    f = open(temp_file, "w")
    json.dump(data, f, indent=4)
    f.close()
    cmd = './OpenTsiolkovsky ' + temp_file
    p = subprocess.Popen([cmd], shell = True, stdout=subprocess.PIPE)
    output = p.communicate()[0]
    outputlist = output.split()
    # import pdb; pdb.set_trace()
    impact_point_index =  outputlist.index(b'impact')
    impact_point_lat_index = impact_point_index + 3
    impact_point_lon_index = impact_point_index + 4
    impact_point_lat = float(outputlist[impact_point_lat_index])
    impact_point_lon = float(outputlist[impact_point_lon_index])
    return impact_point_lat, impact_point_lon

def create_kml(lat_array, lon_array, file_name = "monte_carlo"):
    # 緯度経度の列を入力にして、それに対応する点を打つKMLファイルを作る
    kml = simplekml.Kml(open=1)
    for i in range(len(lat_array)):
        pnt = kml.newpoint(coords = [(lon_array[i],lat_array[i])])
    kml.save("output/" + file_name + ".kml")

if __name__ == '__main__':
    num = 10
    lat_a = np.zeros(num)
    lon_a = np.zeros(num)
    elevation = np.random.normal(86.0,0.2,num)
    for i, deg in enumerate(elevation):
        lat_a[i], lon_a[i] = flight_simulator(json_file = "temp.json",
                                    change_key1 = "stage1",
                                    change_key2 = "attitude",
                                    change_key3 = "const elevation[deg]",
                                    change_value = deg)
        print("lat:\t%.6f\tlon:\t%.6f" % (lat_a[i],lon_a[i]))
    create_kml(lat_a,lon_a)
