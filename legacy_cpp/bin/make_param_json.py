# -*- coding: utf-8 -*-
import sys
import platform

import json

# JSONファイルを読み込んで、変更Wordの数字だけを変えるスクリプト
def make_param_json(json_file, change_key1="name(str)", change_key2=None,
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
		# print("json structure error")
		pass
	return data

if __name__ == '__main__':
	argvs = sys.argv  # コマンドライン引数を格納したリストの取得
	argc = len(argvs) # 引数の個数
	if (argc == 3):
		json_file = argvs[1]
		change_key = argvs[2]
		change_value = argvs[3]
	else:
		print("argment error")
		print("===test mode===")
		json_file = "param_sample_01.json"
		change_key = "name(str)"
		change_value = "test"

	data = make_param_json(json_file, change_key, change_value);
	print(json.dumps(data, sort_keys = True, indent = 4))
	pass
