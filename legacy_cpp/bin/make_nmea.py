# -*- coding: utf-8 -*-
# Copyright (c) 2017 Interstellar Technologies Inc. All Rights Reserved.
# Authors : Takahiro Inagawa
# ==============================================================================
import sys
import os
import numpy as np
import json
import pandas as pd
import datetime
from pytz import timezone

# コマンドライン引数にロケットの名前を入れて、そのファイルが多段式ならそれぞれのKMLにファイルを出力

def make_checksum_of_NMEA(msg):
    """
    Args:
        msg (str) : チェックサム以前の文字列 ex.'$GPGGA,~~,0000*'
    Returns:
        checksum (str)
    Summery:
        NMEA0183センテンスのチェックサム作成
        '$GPGGA,‾‾‾,M,,0000*'までの文字列を読み込んでチェックサム(8bitの16進数表記0x**)出力
        “$”、”!”、”*”を含まないセンテンス中の全ての文字 の8ビットの排他的論理和。","は含むので注意
        ex. $GPGGA,125044.001,3536.1985,N,13941.0743,E,2,09,1.0,12.5,M,36.1,M,,0000*6A
    """
    checksum = 0
    for s in msg:
        if (s != '$') and (s != '!') and (s != '*'):
            checksum ^= ord(s)
    return "%02X" % (checksum)

def make_nmea(name, div, stage):
    """
    Args:
        name (str) : ロケット名(jsonファイルのname)
        div (int) : 間引き数
        stage (int) : 現在のステージ
    """
    csv_file = "output/" + name + "_dynamics_" + str(stage) + ".csv"
    df = pd.read_csv(csv_file, index_col=False)
    time = df["time(s)"]
    lat = df["lat(deg)"]
    lon = df["lon(deg)"]
    altitude = df["altitude(m)"]
    lat_IIP = df["IIP_lat(deg)"]
    lon_IIP = df["IIP_lon(deg)"]
	# フライトの線をNMEA出力
    with open("output/" + name + "_" + str(stage) + "_flight.nmea", "w") as f:
        for i, t in enumerate(time):
            dt_temp = d + datetime.timedelta(seconds=float(t))
            dt_UTC = dt_temp.astimezone(timezone('UTC'))
            lat_ = lat.iloc[i]
            lon_ = lon.iloc[i]
            alt_ = altitude.iloc[i]
            north_or_south = 'N' if (lat_ >= 0) else 'S'
            east_or_west = 'E' if (lon_ >= 0) else 'W'
            sentence_GPGGA = '$GPGGA,' + dt_UTC.strftime('%H%M%S.%f')[0:9] + \
                             ',%.6f,%s' % (int(lat_) * 100 + (lat_ - int(lat_)) * 60, north_or_south) + \
                             ',%.6f,%s' % (int(lon_) * 100 + (lon_ - int(lon_)) * 60, east_or_west)+ \
                             ',1,08,1.0,%.2f,M,35.9,M,,0000*' % (alt_)
            sentence_GPGGA = sentence_GPGGA + make_checksum_of_NMEA(sentence_GPGGA)
            sentence_GPZDA = '$GPZDA,' + dt_UTC.strftime('%H%M%S.%f')[0:9] + \
                             ',' + dt_UTC.strftime('%d,%m,%Y') + ',00,00*'
            sentence_GPZDA = sentence_GPZDA + make_checksum_of_NMEA(sentence_GPZDA)
            f.write(sentence_GPGGA + '\n')
            f.write(sentence_GPZDA + '\n')
    # IIP線をNMEAで出力
    with open("output/" + name + "_" + str(stage) + "_IIP.nmea", "w") as f:
        for i, t in enumerate(time):
            dt_temp = d + datetime.timedelta(seconds=float(t))
            dt_UTC = dt_temp.astimezone(timezone('UTC'))
            lat_ = lat_IIP.iloc[i]
            lon_ = lon_IIP.iloc[i]
            alt_ = 0.0
            north_or_south = 'N' if (lat_ >= 0) else 'S'
            east_or_west = 'E' if (lon_ >= 0) else 'W'
            sentence_GPGGA = '$GPGGA,' + dt_UTC.strftime('%H%M%S.%f')[0:9] + \
                             ',%.6f,%s' % (int(lat_) * 100 + (lat_ - int(lat_)) * 60, north_or_south) + \
                             ',%.6f,%s' % (int(lon_) * 100 + (lon_ - int(lon_)) * 60, east_or_west)+ \
                             ',1,08,1.0,%.2f,M,35.9,M,,0000*' % (alt_)
            sentence_GPGGA = sentence_GPGGA + make_checksum_of_NMEA(sentence_GPGGA)
            sentence_GPZDA = '$GPZDA,' + dt_UTC.strftime('%H%M%S.%f')[0:9] + \
                             ',' + dt_UTC.strftime('%d,%m,%Y') + ',00,00*'
            sentence_GPZDA = sentence_GPZDA + make_checksum_of_NMEA(sentence_GPZDA)
            f.write(sentence_GPGGA + '\n')
            f.write(sentence_GPZDA + '\n')
    print("created nmea file:" + str(stage) + " stage")

if __name__ == '__main__':
    if (len(sys.argv) != 1):
        file_name = sys.argv[1]
    else:
        file_name = "param_sample_01.json"
    try:
        data = json.load(open(file_name))
        name = data["name(str)"]
        t = data["launch"]["time(UTC)[y,m,d,h,min,sec]"]
        d = datetime.datetime(t[0], t[1], t[2],t[3],t[4], t[5], tzinfo=timezone('Asia/Tokyo'))
    except:
        print("JSON file can not be read...finish")
        sys.exit()

    for i in range(1,10):
        if ("stage" + str(i) in data):
            make_nmea(name, 20 * i, i)
    print("Done...")
