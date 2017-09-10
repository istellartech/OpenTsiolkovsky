# -*- coding: utf-8 -*-
# Copyright (c) 2017 Interstellar Technologies Inc. All Rights Reserved.
# Authors : Takahiro Inagawa
#
# Lisence : MIT Lisence
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
# ==============================================================================

import numpy as np
from numpy import pi, deg2rad, rad2deg, sin, cos
import pandas as pd
import json
from collections import OrderedDict
import io

from jinja2 import Template

from bokeh.embed import components
from bokeh.models import Range1d
from bokeh.plotting import figure
from bokeh.resources import INLINE
from bokeh.util.browser import view
from bokeh.palettes import d3
from bokeh.layouts import gridplot
from bokeh.io import output_file, show
from bokeh.models import PrintfTickFormatter, HoverTool
g = 9.80665


input_json = 'param_unha.json'

f = open(input_json, 'r')
json_dict = json.load(f)
rocket_name = json_dict['name']
stage_str = '1st'
file_name = "output/" + rocket_name + "_dynamics_" + stage_str + ".csv"
df1 = pd.read_csv(file_name)

TOOLS="pan,wheel_zoom,box_zoom,reset,save,hover"
PLOT_OPTIONS = dict(tools=TOOLS, plot_width=550, plot_height=300)
HOVER_SET = [("date (x,y)", "($x{0,0}, $y{0,0})")]
HOVER_SET_F = [("date (x,y)", "($x{0,0}, $y{0,0.00})")]
C = d3["Category10"][10]

# ==== 燃焼終了 or 遠地点までのプロットの場合 ====
time_burnout = df1[df1[" thrust(N)"] == 0]["time(s)"][1:].min()
time_apogee = df1[df1[" altitude(m)"] == df1[" altitude(m)"].max()]["time(s)"]
# df1 = df1[df1["time(s)"] < float(time_burnout)]
df1 = df1[df1["time(s)"] < float(time_apogee)]
# ==== 燃焼終了 or 遠地点までのプロットの場合 ====

xr1 = Range1d(start=0, end=df1["time(s)"].max())


p_mass = figure(title="質量", x_axis_label="時刻 [sec]", y_axis_label="質量 [kg]",
                x_range=xr1, **PLOT_OPTIONS)
p_mass.line(df1["time(s)"], df1[" mass(kg)"], color=C[0])
p_mass.select_one(HoverTool).tooltips = HOVER_SET


p_thrust = figure(title="推力", x_axis_label="時刻 [sec]", y_axis_label="推力 [N]",
                  x_range=xr1, **PLOT_OPTIONS)
p_thrust.line(df1["time(s)"], df1[" thrust(N)"], color=C[1])
p_thrust.yaxis[0].formatter = PrintfTickFormatter(format="%f")
p_thrust.select_one(HoverTool).tooltips = HOVER_SET


p_alt = figure(title="高度", x_axis_label="時刻 [sec]", y_axis_label="高度 [m]",
               x_range=xr1, **PLOT_OPTIONS)
p_alt.line(df1["time(s)"], df1[" altitude(m)"], color=C[2])
p_alt.yaxis[0].formatter = PrintfTickFormatter(format="%f")
p_alt.select_one(HoverTool).tooltips = HOVER_SET


p_Isp = figure(title="比推力", x_axis_label="時刻 [sec]", y_axis_label="比推力 [秒]",
               x_range=xr1, **PLOT_OPTIONS)
p_Isp.line(df1["time(s)"], df1[" Isp(s)"], color=C[3])
p_Isp.select_one(HoverTool).tooltips = HOVER_SET


p_downrange = figure(title="ダウンレンジ", x_axis_label="時刻 [sec]", y_axis_label="ダウンレンジ [m]",
                     x_range=xr1, **PLOT_OPTIONS)
p_downrange.line(df1["time(s)"], df1[" downrange(m)"], color=C[4])
p_downrange.yaxis[0].formatter = PrintfTickFormatter(format="%f")
p_downrange.select_one(HoverTool).tooltips = HOVER_SET


p_profile = figure(title="飛翔プロファイル", x_axis_label="ダウンレンジ [m]", y_axis_label="高度 [m]",
                   **PLOT_OPTIONS)
p_profile.line(df1[" downrange(m)"], df1[" altitude(m)"], color=C[5])
p_profile.yaxis[0].formatter = PrintfTickFormatter(format="%f")
p_profile.select_one(HoverTool).tooltips = HOVER_SET


p_velh = figure(title="水平面速度", x_axis_label="時刻 [sec]", y_axis_label="速度 [m/s]",
                     x_range=xr1, **PLOT_OPTIONS)
p_velh.line(df1["time(s)"], df1[" vel_NED_X(m/s)"], legend="North", color=C[6])
p_velh.line(df1["time(s)"], df1[" vel_NED_Y(m/s)"], legend="East", color=C[7])
p_velh.select_one(HoverTool).tooltips = HOVER_SET


p_velv = figure(title="垂直速度", x_axis_label="時刻 [sec]", y_axis_label="速度 [m/s]",
                     x_range=xr1, **PLOT_OPTIONS)
p_velv.line(df1["time(s)"], -df1[" vel_NED_Z(m/s)"], legend="Up", color=C[8])
p_velv.select_one(HoverTool).tooltips = HOVER_SET


p_q = figure(title="動圧", x_axis_label="時刻 [sec]", y_axis_label="動圧 [kPa]",
                     x_range=xr1, **PLOT_OPTIONS)
p_q.line(df1["time(s)"], df1[" dynamic pressure(Pa)"] / 1000, color=C[9])
p_q.select_one(HoverTool).tooltips = HOVER_SET


p_mach = figure(title="機体のその場高度でのマッハ数", x_axis_label="時刻 [sec]", y_axis_label="マッハ数 [-]",
                     x_range=xr1, **PLOT_OPTIONS)
p_mach.line(df1["time(s)"], df1[" Mach number"], color=C[0])
p_mach.select_one(HoverTool).tooltips = HOVER_SET_F


p_acc = figure(title="加速度", x_axis_label="時刻 [sec]", y_axis_label="加速度 [G]",
               x_range=xr1, **PLOT_OPTIONS)
acc = np.sqrt(df1[" acc_Body_X(m/s)"] **2 + df1[" acc_Body_X(m/s)"] ** 2 + df1[" acc_Body_X(m/s)"] ** 2)
p_acc.line(df1["time(s)"], acc / g, color=C[1])
p_acc.select_one(HoverTool).tooltips = HOVER_SET_F


p_acc3 = figure(title="機体の各軸にかかる加速度", x_axis_label="時刻 [sec]", y_axis_label="加速度 [G]",
                x_range=xr1, **PLOT_OPTIONS)
p_acc3.line(df1["time(s)"], df1[" acc_Body_X(m/s)"] / g, legend="X", color=C[2])
p_acc3.line(df1["time(s)"], df1[" acc_Body_Y(m/s)"] / g, legend="Y", color=C[3])
p_acc3.line(df1["time(s)"], df1[" acc_Body_Z(m/s)"] / g, legend="Z", color=C[4])
p_acc3.select_one(HoverTool).tooltips = HOVER_SET_F


p_az = figure(title="姿勢：方位角", x_axis_label="時刻 [sec]", y_axis_label="角度 [deg]",
               x_range=xr1, **PLOT_OPTIONS)
p_az.line(df1["time(s)"], df1[" attitude_azimth(deg)"], color=C[5])
p_az.select_one(HoverTool).tooltips = HOVER_SET


p_el = figure(title="姿勢：仰角", x_axis_label="時刻 [sec]", y_axis_label="角度 [deg]",
               x_range=xr1, **PLOT_OPTIONS)
p_el.line(df1["time(s)"], df1[" attitude_elevation(deg)"], color=C[6])
p_el.select_one(HoverTool).tooltips = HOVER_SET


p_AoAa = figure(title="迎角：α", x_axis_label="時刻 [sec]", y_axis_label="迎角 [deg]",
               x_range=xr1, **PLOT_OPTIONS)
p_AoAa.line(df1["time(s)"], df1[" attack of angle alpha(deg)"], color=C[7])
p_AoAa.select_one(HoverTool).tooltips = HOVER_SET_F


p_AoAb = figure(title="迎角：β", x_axis_label="時刻 [sec]", y_axis_label="迎角 [deg]",
               x_range=xr1, **PLOT_OPTIONS)
p_AoAb.line(df1["time(s)"], df1[" attack of angle beta(deg)"], color=C[8])
p_AoAb.select_one(HoverTool).tooltips = HOVER_SET_F


p_drag = figure(title="抗力", x_axis_label="時刻 [sec]", y_axis_label="抗力 [N]",
               x_range=xr1, **PLOT_OPTIONS)
p_drag.line(df1["time(s)"], df1[" aero Drag(N)"], color=C[9])
p_drag.select_one(HoverTool).tooltips = HOVER_SET


p_lift = figure(title="揚力", x_axis_label="時刻 [sec]", y_axis_label="揚力 [N]",
               x_range=xr1, **PLOT_OPTIONS)
p_lift.line(df1["time(s)"], df1[" aero Lift(N)"], color=C[0])
p_lift.select_one(HoverTool).tooltips = HOVER_SET


# plots can be a single Bokeh model, a list/tuple, or even a dictionary
# plots = {'mass': p_mass, 'thrust': p_thrust, 'Blue': p2, 'Green': p3}

plots = gridplot([[p_mass, p_thrust], [p_alt, p_Isp],
                  [p_downrange, p_profile], [p_velh, p_velv],
                  [p_q, p_mach], [p_acc, p_acc3],
                  [p_az, p_el], [p_AoAa, p_AoAb],
                  [p_drag, p_lift]])

script, div = components(plots)

template = Template('''<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <title>Bokeh Scatter Plots</title>
        {{ js_resources }}
        {{ css_resources }}
        {{ script }}
        <style>
            .embed-wrapper {
                width: 95%;
                height: 300px;
                margin: auto;
            }
        </style>
    </head>
    <body>
        <H2>1st stage</H2>
        <div class="embed-wrapper">
            {{ div }}
        </div>
    </body>
</html>
''')

js_resources = INLINE.render_js()
css_resources = INLINE.render_css()


if __name__ == '__main__':
    filename = "output/" + rocket_name + ".html"

    html = template.render(js_resources=js_resources,
                           css_resources=css_resources,
                           script=script,
                           div=div)

    with io.open(filename, mode='w', encoding='utf-8') as f:
        f.write(html)

    view(filename)