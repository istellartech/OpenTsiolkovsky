# -*- coding: utf-8 -*-
# データ削減 csvファイルを第1引数、データ間引き量を第2引数
# python data_reduce.py (csv_file) ([int]間引き量)
# 例えば
# python data_reduce.py param_test_dynamics_1st.csv 10
#
# Copyright (c) 2016 Interstellar Technologies Inc. Takahiro Inagawa
# Released under the MIT license
import sys
import pandas as pd

argvs = sys.argv  # コマンドライン引数を格納したリストの取得
argc = len(argvs) # 引数の個数
if (argc == 2):
    file_name = argvs[1]
    reduce_num = 10
elif (argc == 3):
    file_name = argvs[1]
    reduce_num = int(argvs[2])
else:
    print("argument error!")
    print("1st argument: csv file path")
    print("2nd argument: Thinning amount")
    sys.exit()

try:
    df = pd.read_csv(file_name)
    df_new = df.ix[0::reduce_num,:]
    df_new.to_csv(file_name[0:-4] + "_reduce.csv", index=False)
except IOError as e:
    print "I/O error({0}): {1}".format(e.errno, e.strerror)
