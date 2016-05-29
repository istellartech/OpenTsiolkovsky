# -*- coding: utf-8 -*-
import sys
reload(sys)
import platform
# デフォルトの文字コードを変更する．
sys.setdefaultencoding('utf-8')

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.font_manager
from matplotlib.font_manager import FontProperties
from matplotlib.backends.backend_pdf import PdfPages
from math import sin, cos, acos, radians
# from mpl_toolkits.basemap import Basemap
# Basemap 未インストールの場合は $ conda install basemapでインストール

if 'Windows' == platform.system():
	font_path = r'C:\WINDOWS\Fonts\MSGothic.ttf'

if 'Darwin' == platform.system(): # for Mac
	font_path = '/Library/Fonts/Osaka.ttf'

font_prop = FontProperties(fname=font_path)
mpl.rcParams['font.family'] = font_prop.get_name()
plt.close('all')
plt.style.use('ggplot')
mpl.rcParams['axes.grid'] = True
mpl.rcParams['figure.autolayout'] = True
mpl.rcParams['pdf.fonttype'] = 42 # pdfのフォントをTrueTypeに変更
mpl.rcParams['savefig.dpi'] = 300 # defaultのdpi=100から変更
mpl.rcParams['mathtext.default'] = 'regular' # 数式（Latex)のフォントを変更


argvs = sys.argv  # コマンドライン引数を格納したリストの取得
argc = len(argvs) # 引数の個数
if (argc != 1):
	file_name = u"output/" + argvs[1]
else:
	file_name = u"../bin/output/test_dynamics_1st.csv"


# file_name = u"../bin/output/rocket_dynamics.csv"
# file_name = u"../bin/output/rocket_dynamics_2nd.csv"
# file_name = u"../bin/output/S310_dynamics.csv"
# ☆ファイル読み込み ファイル形式変わったら変更
(time, mass, thrust, lat, lon, altitude, pos_ECI_X, pos_ECI_Y,
 pos_ECI_Z, vel_ECI_X, vel_ECI_Y, vel_ECI_Z, vel_NED_X,
 vel_NED_Y, vel_NED_Z, acc_ECI_X, acc_ECI_Y, acc_ECI_Z,
 acc_BODY_X, acc_BODY_Y, acc_BODY_Z,
 Isp, mach, azimth, elevation, aoa_alpha, aoa_beta,
 dynamic_press, drag, lift,
 wind_speed, wind_direction, downrange) = np.genfromtxt(file_name,
                                            unpack=True, delimiter=",",
                                            skip_header = 1,
                                            usecols = (0,1,2,3,4,5,6,7,8,9,10,11,12,13,
													   14,15,16,17,18,19,20,21,22,23,24,
													   25,26,27,28,29,30,31,32))
g = 9.80665
acc = np.sqrt(acc_ECI_X ** 2 + acc_ECI_Y ** 2 + acc_ECI_Z ** 2)
earth_rad = 6378.137
def latlng_to_xyz(lat, lng):
    rlat, rlng = radians(lat), radians(lng)
    coslat = cos(rlat)
    return coslat*cos(rlng), coslat*sin(rlng), sin(rlat)

def dist_on_sphere(pos0, pos1, radious=earth_rad):
    xyz0, xyz1 = latlng_to_xyz(*pos0), latlng_to_xyz(*pos1)
    return acos(sum(x * y for x, y in zip(xyz0, xyz1)))*radious

launch_LLH = lat[0], lon[0]
LLH = lat, lon
# Osaka = 34.702113, 135.494807
# Tokyo = 35.681541, 139.767103
# London = 51.476853, 0.0

# print(dist_on_sphere(Osaka, Tokyo)) # 403.63km
# print(dist_on_sphere(London, Tokyo)) # 9571.22km

# 最大高度の時間の算出とそれ以降のデータカット
time_index_apogee = np.where(altitude == max(altitude))[0][0]
time_cut = time[0:time_index_apogee]
dynamic_press = dynamic_press[0:time_index_apogee]
aoa_alpha = aoa_alpha[0:time_index_apogee]
aoa_beta = aoa_beta[0:time_index_apogee]
azimth = azimth[0:time_index_apogee]
elevation = elevation[0:time_index_apogee]
mach = mach[0:time_index_apogee]
drag = drag[0:time_index_apogee]
lift = lift[0:time_index_apogee]

plt.ion()
plt.plot(time, mass)
plt.xlabel(u"時刻 (sec)")
plt.ylabel(u"質量 (kg)")
plt.grid()

plt.figure()
plt.plot(time, thrust)
plt.xlabel(u"時刻 (sec)")
plt.ylabel(u"推力 (N)")
plt.grid()

plt.figure()
plt.plot(time, altitude)
plt.xlabel(u"時刻 (sec)")
plt.ylabel(u"高度 (m)")
plt.grid()

plt.figure()
plt.subplot(211)
plt.plot(time, lat)
plt.ylabel(u"緯度 (deg)")
plt.subplot(212)
plt.grid()
plt.plot(time, lon)
plt.ylabel(u"経度 (deg)")
plt.grid()

plt.figure()
plt.subplot(211)
plt.plot(time, vel_NED_X, label="North")
plt.plot(time, vel_NED_Y, label="East")
plt.grid()
plt.legend()
plt.subplot(212)
plt.plot(time, -vel_NED_Z, label="Up")
plt.grid()
plt.legend()
plt.xlabel(u"時刻 (sec)")
plt.ylabel(u"速度 (m/s)")

plt.figure()
plt.plot(time, acc/g)
plt.xlabel(u"時刻 (sec)")
plt.ylabel(u"加速度 (G)")
plt.grid()

plt.figure()
plt.plot(time, Isp)
plt.xlabel(u"時刻 (sec)")
plt.ylabel(u"比推力 (s)")
plt.grid()

plt.figure()
plt.plot(time_cut, mach)
plt.xlabel(u"時刻 (sec)")
plt.ylabel(u"機体の高度の空気密度で計算されるマッハ数 (-)")
plt.grid()

plt.figure()
plt.subplot(211)
plt.plot(time_cut, azimth, label="azimth")
plt.grid()
plt.legend()
plt.subplot(212)
plt.plot(time_cut, elevation, label="elevation")
plt.grid()
plt.legend()
plt.xlabel(u"時刻 (sec)")
plt.ylabel(u"姿勢 (deg)")

plt.figure()
plt.plot(time_cut, aoa_alpha, label="alpha")
plt.plot(time_cut, aoa_beta, label="beta")
plt.xlabel(u"時刻 (sec)")
plt.ylabel(u"迎角 (deg)")
plt.legend(loc="best")
plt.grid()

plt.figure()
plt.subplot(211)
plt.plot(time_cut, drag, label="drag")
plt.grid()
plt.legend()
plt.ylabel(u"抗力 (N)")
plt.subplot(212)
plt.plot(time_cut, lift, label="lift")
plt.grid()
plt.legend()
plt.xlabel(u"時刻 (sec)")
plt.ylabel(u"揚力 (N)")

plt.figure()
plt.plot(time_cut, dynamic_press/1000)
plt.xlabel(u"時刻 (sec)")
plt.ylabel(u"動圧 (kPa)")
plt.grid()

# plt.figure()
# plt.plot(dist_on_sphere(launch_LLH,LLH), altitude)
# plt.xlabel(u"ダウンレンジ (m)")
# plt.ylabel(u"アップレンジ (m)")
# plt.grid()

# fig=plt.figure()
# ax=fig.add_axes([0.1,0.1,0.8,0.8])
# # setup mercator map projection.
# m = Basemap(llcrnrlon=125.,llcrnrlat=30.,urcrnrlon=150.,urcrnrlat=47.,\
#             rsphere=(6378137.00,6356752.3142),\
#             resolution='l',projection='merc',\
#             lat_0=90.,lon_0=130.,lat_ts=20.)
# # nylat, nylon are lat/lon of New York
# nylat = 35.78; nylon = 130.98
# # lonlat, lonlon are lat/lon of London.
# lonlat = 37.53; lonlon = 140.08
# # draw great circle route between NY and London
# for i in range(len(lat)-1):
# 	m.drawgreatcircle(lon[1],lat[1],lon[-1],lat[-1],linewidth=1,color='b')
# # m.drawgreatcircle(nylon,nylat,lonlon,lonlat,linewidth=2,color='b')
# m.drawcoastlines()
# m.fillcontinents()
# # draw parallels
# m.drawparallels(np.arange(10,90,5),labels=[1,1,0,1])
# # draw meridians
# m.drawmeridians(np.arange(-180,180,5),labels=[1,1,0,1])
# ax.set_title('Rocket flight simulator')


# - 入力ファイルの可視化（推力、抗力、揚力、姿勢、風）
