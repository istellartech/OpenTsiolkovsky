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

import sys
import platform

import numpy as np
import pandas as pd
import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from math import sin, cos, acos, radians
import json
import csv
import os

plt.close('all')
mpl.rcParams['axes.grid'] = True
mpl.rcParams['figure.autolayout'] = False
mpl.rcParams['pdf.fonttype'] = 42 # change font to TrueType in pdf

g = 9.80665

def plot_timespan(time, time_idx, facecolor, alpha):
    for e in time_idx:
        begin = time[e[0]]
        end = time[e[1]]
        plt.axvspan(begin, end, facecolor=facecolor, alpha=alpha)

class RocketStage_input():
    def __init__(self, data, num_stage):
        """
        Args:
            data(dic) : json file data( > json.load(open(json_file)))
        """
        self.name = data["name(str)"]
        self.calc = data["calculate condition"]
        self.wind = data["wind"]
        self.s = data["stage" + str(num_stage)]
        self.thrust = self.s["thrust"]
        self.aero = self.s["aero"]
        self.attitude = self.s["aero"]
        self.attitude = self.s["attitude"]
        self.dump = self.s["dumping product"]
        self.neutrality = self.s["attitude neutrality(3DoF)"]
        self.stage = self.s["stage"]

        if(self.thrust["Isp vac file exist?(bool)"]):
            df = pd.read_csv(self.thrust["Isp vac file name(str)"])
            self.Isp_time = df["time[s]"]
            self.Isp = df["Isp vac[s]"]
        else:
            self.Isp_time = [0, 1]
            self.Isp = [self.thrust["const Isp vac[s]"]] * 2

        if(self.thrust["thrust vac file exist?(bool)"]):
            df = pd.read_csv(self.thrust["thrust vac file name(str)"])
            self.thrust_time = df["time[s]"]
            self.thrust = df["thrust vac[N]"]
        else:
            self.thrust_time = [0, 1]
            self.thrust = [self.thrust["const thrust vac[N]"]] * 2

        if(self.aero["lift coefficient file exist?(bool)"]):
            df = pd.read_csv(self.aero["lift coefficient file name(str)"])
            self.CL_mach = df["mach[-]"]
            self.CL = df["CL[-]"]
        else:
            self.CL_mach = [0, 5]
            self.CL = [self.aero["const lift coefficient[-]"]] * 2

        if(self.aero["drag coefficient file exist?(bool)"]):
            df = pd.read_csv(self.aero["drag coefficient file name(str)"])
            self.CD_mach = df["mach[-]"]
            self.CD = df["CD[-]"]
        else:
            self.CD_mach = [0, 5]
            self.CD = [self.aero["const drag coefficient[-]"]] * 2

        if(self.attitude["attitude file exist?(bool)"]):
            df = pd.read_csv(self.attitude["attitude file name(str)"])
            self.attitude_time = df["time[s]"]
            if 'azimuth[deg]' in df:
                self.azimuth = df["azimuth[deg]"]
            else:
                self.azimuth = df["azimth[deg]"]
            self.elevation = df["elevation[deg]"]
        else:
            self.altitude_time = [0, 1]
            if 'const azimuth[deg]' in self.attitude:
                self.azimuth = [self.attitude["const azimuth[deg]"]] * 2
            else:
                self.azimuth = [self.attitude["const azimth[deg]"]] * 2
            self.elevation = [self.attitude["const elevation[deg]"]] * 2

        if(self.neutrality["considering neutrality?(bool)"]):
            df = pd.read_csv(self.neutrality["CG,CP,Controller position file(str)"])
            self.neutrality_time = df["time[s]"]
            self.pos_CG = df["CG_pos_STA[m]"]
            self.pos_CP = df["CP_pos_STA[m]"]
            self.pos_Control = df["Controller_pos_STA[m]"]
        else:
            self.neutrality_time = [0, 1]
            self.pos_CG = [0, 0]
            self.pos_CP = [0, 0]
            self.pos_Control = [0, 0]

        if(self.wind["wind file exist?(bool)"]):
            df = pd.read_csv(self.wind["wind file name(str)"])
            self.wind_altitude = df["altitude[m]"]
            self.wind_speed = df["wind_speed[m/s]"]
            self.wind_direction = df["direction[deg]"]
        else:
            self.wind_altitude = [0, 1]
            self.wind_speed = self.wind["const wind[m/s,deg]"][0]
            self.wind_direction = self.wind["const wind[m/s,deg]"][1]


def plot_grid(x, y, pos_x, pos_y, x_label, y_label):
    grid_size = (3, 2)
    plt.subplot2grid(grid_size, (pos_x, pos_y), rowspan=1, colspan=1)
    plt.plot(x, y)
    plt.xlabel(x_label)
    plt.ylabel(y_label)

def plot_grid_p(x, y, pos_x, pos_y, x_label, y_label, event_array):
    grid_size = (3, 2)
    plt.subplot2grid(grid_size, (pos_x, pos_y), rowspan=1, colspan=1)
    plt.plot(x, y)
    for i in event_array:
        plt.plot(x[i], y[i], "ko", markersize=4)
    plt.xlabel(x_label)
    plt.ylabel(y_label)

def make_event_index_array(df, time):
    is_powered = df["is_powered(1=powered 0=free)"]
    is_separated = df["is_separated(1=already 0=still)"]
    is_powered_prev = is_powered[0]
    is_separated_prev = is_separated[0]
    event_index_array = []
    for i in range(len(time)):
        if (is_powered_prev == 1 and is_powered[i] == 0):
            event_index_array.append(i)
        if (is_powered_prev == 0 and is_powered[i] == 1):
            event_index_array.append(i)
        if (is_separated_prev == 0 and is_separated[i] == 1):
            event_index_array.append(i)
        is_powered_prev = is_powered[i]
        is_separated_prev = is_separated[i]
    return event_index_array


if __name__ == '__main__':
    if (len(sys.argv) != 1):
        file_name = sys.argv[1]
    else:
    	file_name = "param_sample_01.json"

    f = open(file_name)
    data = json.load(f)
    rocket_name = data["name(str)"]

    # ==== PLOT "input" JSON file ====
    pdf = PdfPages('output/' + rocket_name + '_input.pdf')
    plt.rc('figure', figsize=(11.69,8.27))
    print("input data plot drawing...")
    for i in range(1, 10):
        if ("stage" + str(i) in data):
            r_in = RocketStage_input(data, i)

            print("Now %d stage drawing..." % (i), end="")
            sys.stdout.write("\r")
            sys.stdout.flush()
            fig = plt.figure()
            plot_grid(r_in.Isp_time, r_in.Isp, 0, 0, "time [s]", "Isp [s]")
            plot_grid(r_in.thrust_time, r_in.thrust, 0, 1, "time [s]", "thrust [N]")
            plot_grid(r_in.CL_mach, r_in.CL, 1, 0, "mach [-]", "CL [-]")
            plot_grid(r_in.CD_mach, r_in.CD, 1, 1, "mach [-]", "CD [-]")
            plot_grid(r_in.Isp_time, r_in.Isp, 2, 0, "time", "Isp")
            plot_grid(r_in.Isp_time, r_in.Isp, 2, 1, "time", "Isp")
            plt.tight_layout(pad=1.8)
            fig.suptitle(r_in.name + " stage %d input" % (i), fontsize=20)
            fig.subplots_adjust(top=0.9)

            pdf.savefig()

            if(r_in.neutrality["considering neutrality?(bool)"]):
                plt.figure()
                plt.plot(r_in.neutrality_time, r_in.pos_CG, label="CG")
                plt.plot(r_in.neutrality_time, r_in.pos_CP, label="CP")
                plt.plot(r_in.neutrality_time, r_in.pos_Control, label="Controller")
                plt.gca().invert_yaxis()
                plt.xlabel("time [s]")
                plt.ylabel("postion STA [m]")
                plt.title("*CAUTION* Upside-Down\n" + r_in.name + " stage %d input" %(i))
                plt.legend()
                pdf.savefig()

    pdf.close()

    # ==== PLOT "output" CSV file ====
    pdf = PdfPages('output/' + rocket_name + '_output.pdf')
    plt.rc('figure', figsize=(11.69,8.27))
    grid_size = (3, 2)
    print("output data plot drawing...")
    for i in range(1, 10):
        if ("stage" + str(i) in data):
            df = pd.read_csv("output/" + rocket_name + "_dynamics_" + str(i) + ".csv", index_col=False)
            time = df["time(s)"]
            time_apogee_index = df.loc[df["altitude(m)"] == max(df["altitude(m)"])].index[0]
            t_end = time_apogee_index
            acc = np.sqrt(df["acc_Body_X(m/s)"] ** 2 + df["acc_Body_Y(m/s)"] ** 2 + df["acc_Body_Z(m/s)"] ** 2)
            e = make_event_index_array(df, time)  # e: event_index(list)
            e = np.array(e)
            e = e[e < t_end]

            num_page = 1
            print("Now %d stage %d page drawing..." % (i, num_page), end="")
            sys.stdout.write("\r")
            sys.stdout.flush()
            plt.figure()
            plot_grid_p(time[:t_end], df["mass(kg)"][:t_end], 0, 0, "time [s]", "mass [kg]", e)
            plot_grid_p(time[:t_end], df["thrust(N)"][:t_end], 0, 1, "time [s]", "thrust [N]", e)
            plot_grid_p(time[:t_end], df["Isp(s)"][:t_end], 1, 0, "time [s]", "Isp [s]", e)
            plot_grid_p(time[:t_end], df["altitude(m)"][:t_end], 1, 1, "time [s]", "altitude [m]", e)
            plot_grid_p(time[:t_end], df["downrange(m)"][:t_end], 2, 0, "time [s]", "downrange [m]", e)
            plot_grid_p(df["downrange(m)"][:t_end], df["altitude(m)"][:t_end], 2, 1, "time [s]", "downrange [m]", e)
            plt.tight_layout(pad=1.8)
            plt.suptitle(rocket_name + " stage %d output " % (i) + "(%d)" % (num_page), fontsize=20)
            plt.subplots_adjust(top=0.9)
            pdf.savefig()

            num_page += 1
            print("Now %d stage %d page drawing..." % (i, num_page), end="")
            sys.stdout.write("\r")
            sys.stdout.flush()
            plt.figure()
            plt.subplot2grid(grid_size, (0, 0), rowspan=1, colspan=1)
            plt.plot(time[:t_end], df["vel_NED_X(m/s)"][:t_end], label="North")
            plt.plot(time[:t_end], df["vel_NED_Y(m/s)"][:t_end], label="East")
            for j in e:
                plt.plot(time[j], df["vel_NED_X(m/s)"][j], "ko", markersize=4)
                plt.plot(time[j], df["vel_NED_Y(m/s)"][j], "ko", markersize=4)
            plt.xlabel("time (sec)");plt.ylabel("velocity (m/s)")
            plt.legend(loc="best")
            plot_grid_p(time[:t_end], -df["vel_NED_Z(m/s)"][:t_end], 0, 1, "time [s]", "velocity Up [m/s]", e)
            plot_grid_p(time[:t_end], df["dynamic pressure(Pa)"][:t_end]/1000, 1, 0, "time [s]", "dynamic pressure [kPa]", e)
            plot_grid_p(time[:t_end], df["Mach number"][:t_end], 1, 1, "time [s]", "Mach number [-]", e)
            plot_grid_p(time[:t_end], acc[:t_end]/g, 2, 0, "time [s]", "acceleration [G]", e)
            plot_grid_p(time[:t_end], df["acc_Body_X(m/s)"][:t_end], 2, 1, "time [s]", "acceleration X [G]", e)
            plt.tight_layout(pad=1.8)
            plt.suptitle(rocket_name + " stage %d output " % (i) + "(%d)" % (num_page), fontsize=20)
            plt.subplots_adjust(top=0.9)
            pdf.savefig()

            num_page += 1
            print("Now %d stage %d page drawing..." % (i, num_page), end="")
            sys.stdout.write("\r")
            sys.stdout.flush()
            plt.figure()
            if 'attitude_azimuth(deg)' in df:
                plot_grid_p(time[:t_end], df["attitude_azimuth(deg)"][:t_end], 0, 0, "time [s]", "azimuth [deg]", e)
            else:
                plot_grid_p(time[:t_end], df["attitude_azimth(deg)"][:t_end], 0, 0, "time [s]", "azimuth [deg]", e)
            plot_grid_p(time[:t_end], df["attitude_elevation(deg)"][:t_end], 0, 1, "time [s]", "elevation [deg]", e)
            plot_grid_p(time[:t_end], df["all attack of angle gamma(deg)"][:t_end], 1, 0, "time [s]", "AoA all [deg]", e)
            plot_grid_p(time[:t_end], df["Mach number"][:t_end], 1, 1, "time [s]", "Mach number [-]", e)
            plot_grid_p(time[:t_end], df["aero Drag(N)"][:t_end], 2, 0, "time [s]", "Drag [N]", e)
            plot_grid_p(time[:t_end], df["aero Lift(N)"][:t_end], 2, 1, "time [s]", "Lift [N]", e)
            plt.tight_layout(pad=1.8)
            plt.suptitle(rocket_name + " stage %d output " % (i) + "(%d)" % (num_page), fontsize=20)
            plt.subplots_adjust(top=0.9)
            pdf.savefig()

            num_page += 1
            print("Now %d stage %d page drawing..." % (i, num_page), end="")
            sys.stdout.write("\r")
            sys.stdout.flush()
            plt.figure()
            plt.subplot2grid(grid_size, (0, 0), rowspan=1, colspan=1)
            plt.plot(time[:t_end], df["gimbal_angle_pitch(deg)"][:t_end], label="pitch")
            plt.plot(time[:t_end], df["gimbal_angle_yaw(deg)"][:t_end], label="yaw")
            for j in e:
                plt.plot(time[j], df["gimbal_angle_pitch(deg)"][j], "ko", markersize=4)
                plt.plot(time[j], df["gimbal_angle_yaw(deg)"][j], "ko", markersize=4)
            plt.xlabel("time (sec)");plt.ylabel("gimbal angle [deg]")
            plt.legend(loc="best")
            plt.subplot2grid(grid_size, (0, 1), rowspan=1, colspan=1)
            plt.plot(time[:t_end], df["thrust_Body_Y[N]"][:t_end], label="thrust Y")
            plt.plot(time[:t_end], df["thrust_Body_Z[N]"][:t_end], label="thrust Z")
            for j in e:
                plt.plot(time[j], df["thrust_Body_Y[N]"][j], "ko", markersize=4)
                plt.plot(time[j], df["thrust_Body_Z[N]"][j], "ko", markersize=4)
            plt.xlabel("time (sec)");plt.ylabel("thrust Body_frame [N]")
            plt.legend(loc="best")
            plt.subplot2grid(grid_size, (1, 0), rowspan=1, colspan=1)
            plt.plot(time[:t_end], df["airforce_Body_Y[N]"][:t_end], label="airforce Y")
            plt.plot(time[:t_end], df["airforce_Body_Z[N]"][:t_end], label="airforce Z")
            for j in e:
                plt.plot(time[j], df["airforce_Body_Y[N]"][j], "ko", markersize=4)
                plt.plot(time[j], df["airforce_Body_Z[N]"][j], "ko", markersize=4)
            plt.xlabel("time (sec)");plt.ylabel("airforce Body_frame [N]")
            plt.legend(loc="best")
            plot_grid_p(time[:t_end], df["inertial velocity(m/s)"][:t_end], 1, 1, "time [s]", "inertia velocity [m/s]", e)
            plot_grid_p(time[:t_end], df["wind speed(m/s)"][:t_end], 2, 0, "time [s]", "wind speed [m/s]", e)
            plot_grid_p(time[:t_end], df["wind direction(deg)"][:t_end], 2, 1, "time [s]", "wind direction [deg]", e)
            plt.tight_layout(pad=1.8)
            plt.suptitle(rocket_name + " stage %d output " % (i) + "(%d)" % (num_page), fontsize=20)
            plt.subplots_adjust(top=0.9)
            pdf.savefig()

    pdf.close()


    # ==== PLOT "output" SUMMERY ====
    df_sum = pd.DataFrame()
    e_each = []
    e_time = []  # イベント時の時刻を取得
    for i in range(1, 10):
        if ("stage" + str(i) in data):
            df = pd.read_csv("output/" + rocket_name + "_dynamics_" + str(i) + ".csv", index_col=False)
            df_sep = df[df["is_separated(1=already 0=still)"] == 0]
            df_sum = pd.concat([df_sum, df_sep])
            e_each = []
            e_each.extend(make_event_index_array(df_sep, df_sep["time(s)"]))
            e_each.append(df_sep.index[-1])  # SEP時のtimeもイベントに追加
            for j in e_each:
                e_time.append(df_sep["time(s)"].iloc[j])

    print("Now summery plot drawing...")
    time_sum = df_sum["time(s)"]
    acc = np.sqrt(df_sum["acc_Body_X(m/s)"] ** 2 + df_sum["acc_Body_Y(m/s)"] ** 2 + df_sum["acc_Body_Z(m/s)"] ** 2)
    grid_size = (2, 2)
    plt.figure()
    plt.subplot2grid(grid_size, (0, 0), rowspan=1, colspan=1)
    plt.plot(df_sum["downrange(m)"]/1000, df_sum["altitude(m)"]/1000)
    plt.xlabel("downrange [km]")
    plt.ylabel("altitude [km]")
    for j in e_time:
        plt.plot(df_sum["downrange(m)"][df_sum["time(s)"]==j]/1000, df_sum["altitude(m)"][df_sum["time(s)"]==j]/1000, "ko", markersize=6)

    plt.subplot2grid(grid_size, (0, 1), rowspan=1, colspan=1)
    plt.plot(time_sum, df_sum["inertial velocity(m/s)"])
    plt.xlabel("time [s]")
    plt.ylabel("inertial velocity [m/s]")
    for j in e_time:
        plt.plot(time_sum[df_sum["time(s)"]==j], df_sum["inertial velocity(m/s)"][df_sum["time(s)"]==j], "ko", markersize=6)

    plt.subplot2grid(grid_size, (1, 0), rowspan=1, colspan=1)
    plt.plot(time_sum, acc/g)
    plt.xlabel("time [s]")
    plt.ylabel("acceleration [G]")
    for j in e_time:
        plt.plot(time_sum[df_sum["time(s)"]==j], acc[df_sum["time(s)"]==j]/g, "ko", markersize=6)

    plt.subplot2grid(grid_size, (1, 1), rowspan=1, colspan=1)
    plt.plot(time_sum, df_sum["dynamic pressure(Pa)"]/1000)
    plt.xlabel("time [s]")
    plt.ylabel("dynamic pressure [kPa]")
    for j in e_time:
        plt.plot(time_sum[df_sum["time(s)"]==j], df_sum["dynamic pressure(Pa)"][df_sum["time(s)"]==j]/1000, "ko", markersize=6)

    plt.tight_layout(pad=1.8)
    plt.suptitle(rocket_name + " Summery", fontsize=20)
    plt.subplots_adjust(top=0.9)

    plt.savefig('output/' + rocket_name + '_output_summery.png')

    plt.show()
    print("==== make_plot.py DONE ====")
