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

file_name = u"../bin/output/gravity.csv"
# ☆ファイル読み込み ファイル形式変わったら変更
(altitude, gravity) = np.genfromtxt(file_name,
                                            unpack=True, delimiter="\t",
                                            skip_header = 0,
                                            usecols = (0,1))
plt.ion()
plt.plot(altitude, gravity)
plt.xlabel(u"高度 (km)")
plt.ylabel(u"重力加速度 (m/s2)")
plt.title(u"緯度0°での上向き方向の重力加速度")
plt.grid()
plt.savefig(u"gravity.png")

