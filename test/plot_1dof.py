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

file_name = u"../bin/output/1dof.csv"
# ☆ファイル読み込み ファイル形式変わったら変更
(time, mass, vel, pos) = np.genfromtxt(file_name,
                                            unpack=True, delimiter=",",
                                            skip_header = 0,
                                            usecols = (0,1,2,3))
plt.ion()
plt.subplot(311)
plt.plot(time, mass)
plt.ylabel(u"質量 (kg)")
plt.grid()

plt.subplot(312)
plt.plot(time, vel)
plt.ylabel(u"速度 (m/s)")
plt.grid()

plt.subplot(313)
plt.plot(time, pos)
plt.ylabel(u"位置 (m)")
plt.grid()
plt.savefig(u"1dof.png")
