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

file_name = u"../bin/output/drag.csv"
# ☆ファイル読み込み ファイル形式変わったら変更
(mach, cd) = np.genfromtxt(file_name,
                                            unpack=True, delimiter="\t",
                                            skip_header = 0,
                                            usecols = (0,1))
plt.ion()
plt.plot(mach, cd)
plt.xlabel(u"マッハ数 (-)")
plt.ylabel(u"Cd (-)")
plt.title(u"マッハ数とCd値")
plt.grid()
plt.savefig(u"drag.png")

