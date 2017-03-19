# -*- coding: utf-8 -*-
import sys
import os
import simplekml
import numpy as np
import json


# コマンドライン引数にロケットの名前を入れて、そのファイルが多段式ならそれぞれのKMLにファイルを出力
# デフォルト引数は"S310"

argvs = sys.argv  # コマンドライン引数を格納したリストの取得
argc = len(argvs) # 引数の個数
if (argc != 1):
	file_name = argvs[1]
else:
	file_name = "param.json"
	# file_name = u"param_epsilon.json"
try:
	f = open(file_name)
	data = json.load(f)
	name = data["name"]
except:
	print("JSON file can not be read...finish")
	sys.exit()

def make_kml(name, div, stage):
	# name : ロケット名(string)、div : 間引き数(int)，
	# stage : 現在のステージ(int)
	if (stage == 1):
		csv_file = "output/" + name + "_dynamics_1st.csv"
	elif (stage == 2):
		csv_file = "output/" + name + "_dynamics_2nd.csv"
	elif (stage == 3):
		csv_file = "output/" + name + "_dynamics_3rd.csv"
	(time, lat, lon, altitude) = np.genfromtxt(csv_file,
                                            unpack=True, delimiter=",",
                                            skip_header = 1,
                                            usecols = (0,3,4,5))
	kml = simplekml.Kml(open=1)
	cood = []
	for i in range(len(time)//div):
		index = i * div
		cood.append((lon[index], lat[index], altitude[index]))
	cood.append((lon[-1], lat[-1], altitude[-1]))
	# print cood
	ls = kml.newlinestring(name="name")
	ls.style.linestyle.width = 8
	if (stage == 1):
		ls.style.linestyle.color = simplekml.Color.blue
	elif (stage == 2):
		ls.style.linestyle.color = simplekml.Color.red
	elif (stage == 3):
		ls.style.linestyle.color = simplekml.Color.white
	ls.extrude = 1
	ls.altitudemode = simplekml.AltitudeMode.absolute
	ls.coords = cood
	ls.style.linestyle.color = simplekml.Color.white
	ls.style.linestyle.colormode = simplekml.ColorMode.random
	ls.lookat.latitude = lat[0]
	ls.lookat.longitude = lon[0]
	ls.lookat.range = 200000
	kml.save("output/" + name + str(stage) + ".kml")

try:
	print("INPUT FILE: %s" % (file_name))
	make_kml(name, 20, 1)
	print("create kml file:1st stage")
	make_kml(name, 50, 2)
	print("create kml file:2nd stage")
	make_kml(name, 50, 3)
	print("create kml file:3rd stage")
	print("Done...")
except:
	print("Done...")
