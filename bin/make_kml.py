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

# コマンドライン引数にロケットの名前を入れて、そのファイルが多段式ならそれぞれのKMLにファイルを出力

if (len(sys.argv) != 1):
	file_name = sys.argv[1]
else:
	file_name = "param.json"
try:
	data = json.load(open(file_name))
	name = data["name"]
except:
	print("JSON file can not be read...finish")
	sys.exit()

def make_kml(name, div, stage):
	"""
	Args:
		name (str) : ロケット名(jsonファイルのname)
		div (int) : 間引き数
		stage (int) : 現在のステージ
	"""
	if (stage == 1):
		csv_file = "output/" + name + "_dynamics_1st.csv"
	elif (stage == 2):
		csv_file = "output/" + name + "_dynamics_2nd.csv"
	elif (stage == 3):
		csv_file = "output/" + name + "_dynamics_3rd.csv"
	df = pd.read_csv(csv_file)
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
	ls.lookat.latitude = lat.iloc[0]
	ls.lookat.longitude = lon.iloc[0]
	ls.lookat.range = 200000
	kml.save("output/" + name + "_" + str(stage) + ".kml")

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
