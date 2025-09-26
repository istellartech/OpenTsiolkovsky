# -*- coding: utf-8 -*-
import sys
reload(sys)
import platform
# デフォルトの文字コードを変更する．
sys.setdefaultencoding('utf-8')

import os
import numpy as np
from scipy import optimize
import subprocess
import json

# JSONファイルを読み込んで、変更Wordの数字だけを変えるスクリプト
def make_param_json(json_file, change_key1="name", change_key2=None,
 					change_key3=None, change_value="test"):
	f = open(json_file)
	data = json.load(f)
	# キー1があればキー1のバリューに書き換え、キー2があればキー2
	try:
		if (data.has_key(change_key1)):
			value1 = data[change_key1]
			if (change_key2 == None):
				data[change_key1] = change_value
			elif (value1.has_key(change_key2)):
				value2 = value1[change_key2]
				if (change_key3 == None):
					value1[change_key2] = change_value
				elif (value2.has_key(change_key3)):
					value2[change_key3] = change_value
	except:
		print("json structure error")
	return data

# 最適化の目的関数 ファイルを作って、実行して、目的関数を読み込む
def test_opt(burn_time):
	if (isinstance(burn_time,np.ndarray)):
		burn_time = burn_time[0]
	data = make_param_json("param_momo0.json",
	 					   "1st stage", "thrust", "burn end time[s]", burn_time)
	temp_file = "temp.json"
	f = open(temp_file, "w")
	json.dump(data, f, indent=4)
	f.close()
	if 'Windows' == platform.system():
		execute = 'OpenTsiolkovsky.exe'
	else:
		execute = './OpenTsiolkovsky'
	cmd = execute + ' ' + temp_file
	p = subprocess.Popen([cmd], shell = True, stdout=subprocess.PIPE)
	output = p.communicate()[0]
	outputlist = output.split()
	max_alt_index = outputlist.index("altitude[m]:")
	max_alt_index = max_alt_index+1
	max_alt = float(outputlist[max_alt_index])
	f.close()
	os.remove(temp_file)
	print("burn time = %.2f\tdistance = %.1f" % (burn_time, abs(100000 - max_alt)))
	return abs(100000 - max_alt)

if __name__ == '__main__':
	x0 = 80
	res = optimize.minimize(test_opt, x0, method='Nelder-Mead', tol=1e-3)
	print res
