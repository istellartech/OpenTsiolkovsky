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

if 'Windows' == platform.system():
	fp = FontProperties(fname=r'C:\WINDOWS\Fonts\MSGothic.ttf')

if 'Darwin' == platform.system(): # for Mac
	font_path = '/Library/Fonts/Osaka.ttf'
	font_prop = matplotlib.font_manager.FontProperties(fname=font_path)
	matplotlib.rcParams['font.family'] = font_prop.get_name()
	# pdfのフォントをTrueTypeに変更
	matplotlib.rcParams['pdf.fonttype'] = 42
	# defaultのdpi=100から変更
	matplotlib.rcParams['savefig.dpi'] = 300
	# 数式（Latex)のフォントを変更
	matplotlib.rcParams['mathtext.default'] = 'regular'

plt.close('all')

file_name = u"../bin/output/air.csv"
# ☆ファイル読み込み ファイル形式変わったら変更
(altitude, temp, speed, density) = np.genfromtxt(file_name,
                                            unpack=True, delimiter="\t",
                                            skip_header = 0,
                                            usecols = (0,1,2,3))
plt.ion()
plt.plot(altitude/1000, temp)
plt.xlabel(u"高度 (km)")
plt.ylabel(u"温度 (K)")
plt.title(u"高度と気温")
plt.grid()
plt.savefig(u"air_temp.png")

plt.figure()
plt.plot(altitude/1000, speed)
plt.xlabel(u"高度 (km)")
plt.ylabel(u"音速 (m/s)")
plt.title(u"高度と音速")
plt.grid()
plt.savefig(u"air_speed.png")

plt.figure()
plt.plot(altitude/1000, density)
plt.xlabel(u"高度 (km)")
plt.ylabel(u"空気密度 (kg/m3)")
plt.title(u"高度と空気密度")
plt.grid()
plt.savefig(u"air_density.png")
