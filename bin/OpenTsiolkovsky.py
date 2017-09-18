# -*- coding: utf8 -*-
import sys
import os
import tkinter as tk
import tkinter.ttk as ttk
import tkinter.messagebox as tkmsg
import tkinter.filedialog as tkfd

import json
import pandas as pd
import subprocess

import matplotlib
matplotlib.use("TkAgg")
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg, NavigationToolbar2TkAgg
from matplotlib.figure import Figure
import matplotlib.pyplot as plt


class Application(tk.Frame):
    def __init__(self, master=None):
        super().__init__(master)
        master.title("OpenTsiolkovsky")
        master.geometry("1150x750+100+50")
        self.pack()

        self.f1 = tk.Frame(self)
        self.f12_line = tk.Frame(self)
        self.f2 = tk.Frame(self)
        # self.f3 = tk.Frame(self)
        self.f3 = ttk.Notebook(self)
        self.f4 = tk.Frame(self)
        self.f5 = tk.Frame(self)
        self.f56_line = tk.Frame(self)
        self.f6 = tk.Frame(self)
        self.f67_line = tk.Frame(self)
        self.f7 = tk.Frame(self)
        self.create_widgets()
        self.f1.grid(row=0)
        self.f12_line.grid(row=1)
        self.f2.grid(row=2)
        self.f3.grid(row=3)
        self.f4.grid(row=4)
        self.f5.grid(row=5)
        self.f56_line.grid(row=6)
        self.f6.grid(row=7)
        self.f67_line.grid(row=8)
        self.f7.grid(row=9)
        self.status = tk.Label(root, text="Hello, OpenTsiolkovsky",
                                   borderwidth=2, relief="groove")
        self.status.pack(side=tk.BOTTOM, fill=tk.X)

    def create_widgets(self):
        """ Frame 1 """
        self.label_read_file = tk.Label(self.f1, text='parameter file : ')
        self.label_read_file.pack(side="left")
        self.label_file = tk.Label(self.f1, text='', width=40, bd=2,
                                    anchor="w", relief="groove")
        self.label_file.pack(side="left")
        self.button_read_file = tk.Button(self.f1, text='Read json file', width=10)
        self.button_read_file["command"] = self.read_json_file
        self.button_read_file.pack()
        canvas_hline1 = tk.Canvas(self.f12_line, width=700, height=10, bg = "white")
        canvas_hline1.create_line(0, 5, 700, 5, fill = "black")
        canvas_hline1.grid(row=0)

        """ Frame 2 """
        # , textvariable=tk.IntVarを設定する
        #
        w2 = 10  # width at Frame2
        self.label_name = tk.Label(self.f2, text='Name', width=15, anchor="e")
        self.label_name.grid(row=1, column=0)
        self.entry_name = tk.Entry(self.f2, text='', bd=1, width=32)
        self.entry_name.grid(row=1, column=1, columnspan=3)
        self.label_calc_condition = tk.Label(self.f2, text='Calculate Condition', width=15, anchor="e")
        self.label_calc_condition.grid(row=1, column=4)
        self.label_calc_con0 = tk.Label(self.f2, text='start time [s]', width=w2)
        self.label_calc_con0.grid(row=0, column=5)
        self.label_calc_con1 = tk.Label(self.f2, text='end time [s]', width=w2)
        self.label_calc_con1.grid(row=0, column=6)
        self.label_calc_con2 = tk.Label(self.f2, text='time step [s]', width=w2)
        self.label_calc_con2.grid(row=0, column=7)
        self.entry_calc_con0 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_calc_con0.grid(row=1, column=5)
        self.entry_calc_con1 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_calc_con1.grid(row=1, column=6)
        self.entry_calc_con2 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_calc_con2.grid(row=1, column=7)

        self.label_launch_pos = tk.Label(self.f2, text='Position at launch', width=15, anchor="e")
        self.label_launch_pos.grid(row=3, column=0)
        self.label_launch_pos0 = tk.Label(self.f2, text='latitude [deg]', width=w2)
        self.label_launch_pos0.grid(row=2, column=1)
        self.label_launch_pos1 = tk.Label(self.f2, text='longitude [deg]', width=w2)
        self.label_launch_pos1.grid(row=2, column=2)
        self.label_launch_pos2 = tk.Label(self.f2, text='altitude [m]', width=w2)
        self.label_launch_pos2.grid(row=2, column=3)
        self.entry_launch_pos0 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_pos0.grid(row=3, column=1)
        self.entry_launch_pos1 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_pos1.grid(row=3, column=2)
        self.entry_launch_pos2 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_pos2.grid(row=3, column=3)

        self.label_launch_vel = tk.Label(self.f2, text='Velocity at launch', width=15, anchor="e")
        self.label_launch_vel.grid(row=3, column=4)
        self.label_launch_vel0 = tk.Label(self.f2, text='North [m/s]', width=w2)
        self.label_launch_vel0.grid(row=2, column=5)
        self.label_launch_vel1 = tk.Label(self.f2, text='East [m/s]', width=w2)
        self.label_launch_vel1.grid(row=2, column=6)
        self.label_launch_vel2 = tk.Label(self.f2, text='Down [m/s]', width=w2)
        self.label_launch_vel2.grid(row=2, column=7)
        self.entry_launch_vel0 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_vel0.grid(row=3, column=5)
        self.entry_launch_vel1 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_vel1.grid(row=3, column=6)
        self.entry_launch_vel2 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_vel2.grid(row=3, column=7)

        self.label_launch_date = tk.Label(self.f2, text='Date at launch', width=15, anchor="e")
        self.label_launch_date.grid(row=5, column=0)
        self.label_launch_time0 = tk.Label(self.f2, text='year', width=w2)
        self.label_launch_time0.grid(row=4, column=1)
        self.label_launch_time1 = tk.Label(self.f2, text='month', width=w2)
        self.label_launch_time1.grid(row=4, column=2)
        self.label_launch_time2 = tk.Label(self.f2, text='day', width=w2)
        self.label_launch_time2.grid(row=4, column=3)
        self.entry_launch_time0 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_time0.grid(row=5, column=1)
        self.entry_launch_time1 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_time1.grid(row=5, column=2)
        self.entry_launch_time2 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_time2.grid(row=5, column=3)

        self.label_launch_time = tk.Label(self.f2, text='Time at launch', width=15, anchor="e")
        self.label_launch_time.grid(row=5, column=4)
        self.label_launch_time3 = tk.Label(self.f2, text='hour', width=w2)
        self.label_launch_time3.grid(row=4, column=5)
        self.label_launch_time4 = tk.Label(self.f2, text='minute', width=w2)
        self.label_launch_time4.grid(row=4, column=6)
        self.label_launch_time5 = tk.Label(self.f2, text='second', width=w2)
        self.label_launch_time5.grid(row=4, column=7)
        self.entry_launch_time3 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_time3.grid(row=5, column=5)
        self.entry_launch_time4 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_time4.grid(row=5, column=6)
        self.entry_launch_time5 = tk.Entry(self.f2, text='', bd=1, width=w2)
        self.entry_launch_time5.grid(row=5, column=7)


        """ Frame 3 """
        w3 = 10  # width Frame3
        w3b = 5  # width Frame3 button
        w3l = 7  # width Frame3 label
        self.tab_1 = tk.Frame(self.f3, height=290, width=920)
        self.tab_2 = tk.Frame(self.f3, height=290, width=920)
        self.tab_3 = tk.Frame(self.f3, height=290, width=920)

        self.f3.add(self.tab_1, text="1st stage")
        self.f3.add(self.tab_2, text="2nd stage")
        self.f3.add(self.tab_3, text="3rd stage")

        """ Frame 3 1st stage """
        self.label_mass_init1 = tk.Label(self.tab_1, text='initial mass [kg]', width=15, anchor="w", font=("",0,"bold"))
        self.label_mass_init1.grid(row=0, column=1, columnspan=2)
        self.entry_mass_init1 = tk.Entry(self.tab_1, text='', bd=1, width=w3)
        self.entry_mass_init1.grid(row=0, column=3)

        """ Frame 3 1st stage thrust """
        self.label_thrust1 = tk.Label(self.tab_1, text='thrust', width=4, anchor="w", font=("",0,"bold"))
        self.label_thrust1.grid(row=1, column=0)

        self.label_Isp1 = tk.Label(self.tab_1, text='Isp', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_Isp1.grid(row=1, column=1)
        self.Isp_v1 = tk.IntVar()
        self.Isp_v1.set(0)
        self.radio_Isp_file1 = tk.Radiobutton(self.tab_1, text="file", variable=self.Isp_v1,
                                              value=1, command = self.change_state_Isp1)
        self.radio_Isp_file1.grid(row=1, column=2, sticky='w')
        self.radio_Isp_const1 = tk.Radiobutton(self.tab_1, text="const", variable=self.Isp_v1,
                                              value=2, command = self.change_state_Isp1)
        self.radio_Isp_const1.grid(row=3, column=2, sticky='w')
        self.label_Isp_file1 = tk.Label(self.tab_1, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_Isp_file1.grid(row=1, column=3, columnspan=2)
        self.button_Isp_file1 = tk.Button(self.tab_1, text='Browse...', command=self.Isp_file1, width=w3b)
        self.button_Isp_file1.grid(row=1, column=5, sticky='w')
        self.button_Isp_plot1 = tk.Button(self.tab_1, text='plot', command=self.Isp_plot1, width=w3b-3)
        self.button_Isp_plot1.grid(row=1, column=5, sticky='e')
        self.label_Isp1 = tk.Label(self.tab_1, text='Isp [sec]', width=w3)
        self.label_Isp1.grid(row=2, column=3)
        self.entry_Isp1 = tk.Entry(self.tab_1, text='', bd=1, width=w3)
        self.entry_Isp1.grid(row=3, column=3)

        self.label_thrust1 = tk.Label(self.tab_1, text='thrust', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_thrust1.grid(row=1, column=6)
        self.thrust_v1 = tk.IntVar()
        self.thrust_v1.set(0)
        self.radio_thrust_file1 = tk.Radiobutton(self.tab_1, text="file", variable=self.thrust_v1,
                                              value=1, command = self.change_state_thrust1)
        self.radio_thrust_file1.grid(row=1, column=8, sticky='w')
        self.radio_thrust_const1 = tk.Radiobutton(self.tab_1, text="const", variable=self.thrust_v1,
                                              value=2, command = self.change_state_thrust1)
        self.radio_thrust_const1.grid(row=3, column=8, sticky='w')
        self.label_thrust_file1 = tk.Label(self.tab_1, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_thrust_file1.grid(row=1, column=9, columnspan=2)
        self.button_thrust_file1 = tk.Button(self.tab_1, text='Browse...', command=self.thrust_file1, width=w3b)
        self.button_thrust_file1.grid(row=1, column=11, sticky='w')
        self.button_thrust_plot1 = tk.Button(self.tab_1, text='plot', command=self.thrust_plot1, width=w3b-3)
        self.button_thrust_plot1.grid(row=1, column=11, sticky='e')
        self.label_thrust01 = tk.Label(self.tab_1, text='thrust [N]', width=w3)
        self.label_thrust01.grid(row=2, column=9)
        self.label_thrust11 = tk.Label(self.tab_1, text='start time [sec]', width=w3)
        self.label_thrust11.grid(row=2, column=10)
        self.label_thrust21 = tk.Label(self.tab_1, text='end time [sec]', width=w3)
        self.label_thrust21.grid(row=2, column=11)
        self.entry_thrust01 = tk.Entry(self.tab_1, text='', bd=1, width=w3)
        self.entry_thrust01.grid(row=3, column=9)
        self.entry_thrust11 = tk.Entry(self.tab_1, text='', bd=1, width=w3)
        self.entry_thrust11.grid(row=3, column=10)
        self.entry_thrust21 = tk.Entry(self.tab_1, text='', bd=1, width=w3+2)
        self.entry_thrust21.grid(row=3, column=11)

        self.label_nozzle1 = tk.Label(self.tab_1, text='nozzle', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_nozzle1.grid(row=5, column=1)
        self.label_nozzle01 = tk.Label(self.tab_1, text='throat dia [m]', width=w3)
        self.label_nozzle01.grid(row=4, column=3)
        self.label_nozzle11 = tk.Label(self.tab_1, text='expansion ratio', width=w3)
        self.label_nozzle11.grid(row=4, column=4)
        self.label_nozzle21 = tk.Label(self.tab_1, text='exhaust pressure [Pa]', width=w3*2, anchor='w')
        self.label_nozzle21.grid(row=4, column=5, columnspan=2, sticky='w')
        self.entry_nozzle01 = tk.Entry(self.tab_1, text='', bd=1, width=w3)
        self.entry_nozzle01.grid(row=5, column=3)
        self.entry_nozzle11 = tk.Entry(self.tab_1, text='', bd=1, width=w3)
        self.entry_nozzle11.grid(row=5, column=4)
        self.entry_nozzle21 = tk.Entry(self.tab_1, text='', bd=1, width=w3+2)
        self.entry_nozzle21.grid(row=5, column=5, sticky='w')

        """ Frame 3 1st stage aero """
        self.label_aero1 = tk.Label(self.tab_1, text='aero', width=4, anchor="w", font=("",0,"bold"))
        self.label_aero1.grid(row=6, column=0)

        self.label_lift1 = tk.Label(self.tab_1, text='Lift coef.', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_lift1.grid(row=6, column=1)
        self.lift_v1 = tk.IntVar()
        self.lift_v1.set(0)
        self.radio_lift_file1 = tk.Radiobutton(self.tab_1, text="file", variable=self.lift_v1,
                                              value=1, command = self.change_state_lift1)
        self.radio_lift_file1.grid(row=6, column=2, sticky='w')
        self.radio_lift_const1 = tk.Radiobutton(self.tab_1, text="const", variable=self.lift_v1,
                                              value=2, command = self.change_state_lift1)
        self.radio_lift_const1.grid(row=7, column=2, sticky='w')
        self.label_lift_file1 = tk.Label(self.tab_1, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_lift_file1.grid(row=6, column=3, columnspan=2)
        self.button_lift_file1 = tk.Button(self.tab_1, text='Browse...', command=self.lift_file1, width=w3b)
        self.button_lift_file1.grid(row=6, column=5, sticky='w')
        self.button_lift_plot1 = tk.Button(self.tab_1, text='plot', command=self.lift_plot1, width=w3b-3)
        self.button_lift_plot1.grid(row=6, column=5, sticky='e')
        self.entry_lift1 = tk.Entry(self.tab_1, text='', bd=1, width=w3)
        self.entry_lift1.grid(row=7, column=3)

        self.label_drag1 = tk.Label(self.tab_1, text='Drag coef.', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_drag1.grid(row=6, column=6)
        self.drag_v1 = tk.IntVar()
        self.drag_v1.set(0)
        self.radio_drag_file1 = tk.Radiobutton(self.tab_1, text="file", variable=self.drag_v1,
                                              value=1, command = self.change_state_drag1)
        self.radio_drag_file1.grid(row=6, column=8, sticky='w')
        self.radio_drag_const1 = tk.Radiobutton(self.tab_1, text="const", variable=self.drag_v1,
                                              value=2, command = self.change_state_drag1)
        self.radio_drag_const1.grid(row=7, column=8, sticky='w')
        self.label_drag_file1 = tk.Label(self.tab_1, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_drag_file1.grid(row=6, column=9, columnspan=2)
        self.button_drag_file1 = tk.Button(self.tab_1, text='Browse...', command=self.drag_file1, width=w3b)
        self.button_drag_file1.grid(row=6, column=11, sticky='w')
        self.button_drag_plot1 = tk.Button(self.tab_1, text='plot', command=self.drag_plot1, width=w3b-3)
        self.button_drag_plot1.grid(row=6, column=11, sticky='e')
        self.entry_drag01 = tk.Entry(self.tab_1, text='', bd=1, width=w3)
        self.entry_drag01.grid(row=7, column=9)

        """ Frame 3 1st stage attitude """
        self.label_attitude1 = tk.Label(self.tab_1, text='attitude', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_attitude1.grid(row=8, column=1)
        self.attitude_v1 = tk.IntVar()
        self.attitude_v1.set(0)
        self.radio_attitude_file1 = tk.Radiobutton(self.tab_1, text="file", variable=self.attitude_v1,
                                              value=1, command = self.change_state_attitude1)
        self.radio_attitude_file1.grid(row=8, column=2, sticky='w')
        self.radio_attitude_const1 = tk.Radiobutton(self.tab_1, text="const", variable=self.attitude_v1,
                                              value=2, command = self.change_state_attitude1)
        self.radio_attitude_const1.grid(row=10, column=2, sticky='w')
        self.label_attitude_file1 = tk.Label(self.tab_1, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_attitude_file1.grid(row=8, column=3, columnspan=2)
        self.button_attitude_file1 = tk.Button(self.tab_1, text='Browse...', command=self.attitude_file1, width=w3b)
        self.button_attitude_file1.grid(row=8, column=5, sticky='w')
        self.button_attitude_plot1 = tk.Button(self.tab_1, text='plot', command=self.attitude_plot1, width=w3b-3)
        self.button_attitude_plot1.grid(row=8, column=5, sticky='e')
        self.label_attitude01 = tk.Label(self.tab_1, text='azimth [deg]', width=w3)
        self.label_attitude01.grid(row=9, column=3)
        self.label_attitude11 = tk.Label(self.tab_1, text='elevation [deg]', width=w3)
        self.label_attitude11.grid(row=9, column=4)
        self.entry_attitude01 = tk.Entry(self.tab_1, text='', bd=1, width=w3)
        self.entry_attitude01.grid(row=10, column=3)
        self.entry_attitude11 = tk.Entry(self.tab_1, text='', bd=1, width=w3)
        self.entry_attitude11.grid(row=10, column=4)

        """ Frame 3 1st stage STAGE """
        self.label_stage1 = tk.Label(self.tab_1, text='stage', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_stage1.grid(row=8, column=6)
        self.checkvar_stage1 = tk.IntVar()
        self.checkbutton_stage1 = tk.Checkbutton(self.tab_1, text="following satage exist", variable=self.checkvar_stage1,
                                            command=self.stage_check1, onvalue=1, offvalue=0, width=20, )
        self.checkbutton_stage1.grid(row=8, column=8, columnspan=2, sticky='w')
        self.label_stage11 = tk.Label(self.tab_1, text='separation time[sec]', width=w3*2, anchor='w')
        self.label_stage11.grid(row=9, column=8, columnspan=2, sticky='w')
        self.entry_stage11 = tk.Entry(self.tab_1, text='', bd=1, width=w3)
        self.entry_stage11.grid(row=10, column=8)

        """ Frame 4 """
        w4 = 15  # width at Frame4
        self.label_wind = tk.Label(self.f4, text='Wind', width=15, anchor="e", font=("",0,"bold"))
        self.label_wind.grid(row=0, column=0)
        self.wind_v = tk.IntVar()
        self.wind_v.set(0)
        self.radio_wind_file = tk.Radiobutton(self.f4, text="file", variable=self.wind_v,
                                              value=1, command = self.change_state_wind)
        self.radio_wind_file.grid(row=0, column=1)
        self.radio_wind_const = tk.Radiobutton(self.f4, text="const", variable=self.wind_v,
                                              value=2, command = self.change_state_wind)
        self.radio_wind_const.grid(row=2, column=1)
        self.label_wind_file = tk.Label(self.f4, text='', bd=1, width=30, anchor="w", relief="sunken")
        self.label_wind_file.grid(row=0, column=2, columnspan=2)
        self.button_wind_file = tk.Button(self.f4, text='Browse...', command=self.wind_file, width=10)
        self.button_wind_file.grid(row=0, column=4)
        self.button_wind_plot = tk.Button(self.f4, text='plot', command=self.wind_plot, width=10)
        self.button_wind_plot.grid(row=0, column=5)
        self.label_wind0 = tk.Label(self.f4, text='azimth [deg]', width=w4)
        self.label_wind0.grid(row=1, column=2)
        self.label_wind1 = tk.Label(self.f4, text='wind speed [m/s]', width=w4)
        self.label_wind1.grid(row=1, column=3)
        self.entry_wind0 = tk.Entry(self.f4, text='', bd=1, width=w4)
        self.entry_wind0.grid(row=2, column=2)
        self.entry_wind1 = tk.Entry(self.f4, text='', bd=1, width=w4)
        self.entry_wind1.grid(row=2, column=3)

        """ Frame 5 """
        self.button_calc = tk.Button(self.f5, text='Calc', command=self.exec_calc, width=10).pack(side="right")
        self.button_save = tk.Button(self.f5, text='Save', command=self.save_json, width=10).pack(side="right")

        """ Frame 6 """
        canvas_hline6 = tk.Canvas(self.f56_line, width=700, height=10, bg = "white")
        canvas_hline6.create_line(0, 5, 700, 5, fill = "black")
        canvas_hline6.pack()
        self.label_output = tk.Label(self.f6, text='output : ').pack(side="left")
        self.button_extend = tk.Button(self.f6, text='extend',
            command=lambda:self.output_script("make_extend_output.py"), width=10).pack(side="right")
        self.button_NMEA = tk.Button(self.f6, text='NMEA',
            command=lambda:self.output_script("make_nmea.py"), width=10).pack(side="right")
        self.button_KML = tk.Button(self.f6, text='KML',
            command=lambda:self.output_script("make_kml.py"), width=10).pack(side="right")
        self.button_HTML = tk.Button(self.f6, text='HTML',
            command=lambda:self.output_script("make_html.py"), width=10).pack(side="right")
        self.button_plot = tk.Button(self.f6, text='plot',
            command=lambda:self.output_script("make_plot.py"), width=10).pack(side="right")


        """ Frame 7 """
        canvas_hline2 = tk.Canvas(self.f67_line, width=700, height=10, bg = "white")
        canvas_hline2.create_line(0, 5, 700, 5, fill = "black")
        canvas_hline2.pack()
        self.quit = tk.Button(self.f7, text="QUIT", fg="red",
                              command=root.destroy)
        self.quit.pack()


    def read_json_file(self):
        filename = tkfd.askopenfilename(filetypes=[('OpenTsiolkovsky parameter file','*.json')],
                                        initialdir=os.getcwd())
        if (filename != ""):
            self.filename_json = filename
        else:
            return
        self.label_file["text"] = os.path.basename(self.filename_json)
        with open(self.filename_json, 'r') as f:
            self.param = json.load(f)
        self.load_json(self.param)

    def load_json(self, param_json):
        p = param_json
        self.entry_name.delete(0, tk.END)
        self.entry_name.insert(0, p["name"])
        self.entry_calc_con0.delete(0, tk.END)
        self.entry_calc_con0.insert(0, p["calculate condition"]["start time[s]"])
        self.entry_calc_con1.delete(0, tk.END)
        self.entry_calc_con1.insert(0, p["calculate condition"]["end time[s]"])
        self.entry_calc_con2.delete(0, tk.END)
        self.entry_calc_con2.insert(0, p["calculate condition"]["time step[s]"])
        self.entry_launch_pos0.delete(0, tk.END)
        self.entry_launch_pos0.insert(0, p["launch"]["position LLH[deg,deg,m]"][0])
        self.entry_launch_pos1.delete(0, tk.END)
        self.entry_launch_pos1.insert(0, p["launch"]["position LLH[deg,deg,m]"][1])
        self.entry_launch_pos2.delete(0, tk.END)
        self.entry_launch_pos2.insert(0, p["launch"]["position LLH[deg,deg,m]"][2])
        self.entry_launch_vel0.delete(0, tk.END)
        self.entry_launch_vel0.insert(0, p["launch"]["velocity NED[m/s]"][0])
        self.entry_launch_vel1.delete(0, tk.END)
        self.entry_launch_vel1.insert(0, p["launch"]["velocity NED[m/s]"][1])
        self.entry_launch_vel2.delete(0, tk.END)
        self.entry_launch_vel2.insert(0, p["launch"]["velocity NED[m/s]"][2])
        self.entry_launch_time0.delete(0, tk.END)
        self.entry_launch_time0.insert(0, p["launch"]["time"][0])
        self.entry_launch_time1.delete(0, tk.END)
        self.entry_launch_time1.insert(0, p["launch"]["time"][1])
        self.entry_launch_time2.delete(0, tk.END)
        self.entry_launch_time2.insert(0, p["launch"]["time"][2])
        self.entry_launch_time3.delete(0, tk.END)
        self.entry_launch_time3.insert(0, p["launch"]["time"][3])
        self.entry_launch_time4.delete(0, tk.END)
        self.entry_launch_time4.insert(0, p["launch"]["time"][4])
        self.entry_launch_time5.delete(0, tk.END)
        self.entry_launch_time5.insert(0, p["launch"]["time"][5])

        self.entry_mass_init1.delete(0, tk.END)
        self.entry_mass_init1.insert(0, p["1st stage"]["mass initial[kg]"])
        self.Isp_v1.set(1) if(p["1st stage"]["thrust"]["Isp file exist"]) else self.Isp_v1.set(2)
        self.label_Isp_file1["text"] = p["1st stage"]["thrust"]["Isp file name"]
        self.entry_Isp1.delete(0, tk.END)
        self.entry_Isp1.insert(0, p["1st stage"]["thrust"]["Isp[s]"])
        self.thrust_v1.set(1) if(p["1st stage"]["thrust"]["file exist"]) else self.thrust_v1.set(2)
        self.label_thrust_file1["text"] = p["1st stage"]["thrust"]["file name"]
        self.entry_thrust01.delete(0, tk.END)
        self.entry_thrust01.insert(0, p["1st stage"]["thrust"]["const thrust[N]"])
        self.entry_thrust11.delete(0, tk.END)
        self.entry_thrust11.insert(0, p["1st stage"]["thrust"]["burn start time[s]"])
        self.entry_thrust21.delete(0, tk.END)
        self.entry_thrust21.insert(0, p["1st stage"]["thrust"]["burn end time[s]"])
        self.entry_nozzle01.delete(0, tk.END)
        self.entry_nozzle01.insert(0, p["1st stage"]["thrust"]["throat diameter[m]"])
        self.entry_nozzle11.delete(0, tk.END)
        self.entry_nozzle11.insert(0, p["1st stage"]["thrust"]["nozzle expansion ratio"])
        self.entry_nozzle21.delete(0, tk.END)
        self.entry_nozzle21.insert(0, p["1st stage"]["thrust"]["nozzle exhaust pressure[Pa]"])

        self.lift_v1.set(1) if(p["1st stage"]["aero"]["lift coefficient file exist"]) else self.lift_v1.set(2)
        self.label_lift_file1["text"] = p["1st stage"]["aero"]["lift coefficient file name"]
        self.entry_lift1.delete(0, tk.END)
        self.entry_lift1.insert(0, p["1st stage"]["aero"]["lift coefficient"])
        self.drag_v1.set(1) if(p["1st stage"]["aero"]["drag coefficient file exist"]) else self.drag_v1.set(2)
        self.label_drag_file1["text"] = p["1st stage"]["aero"]["drag coefficient file name"]
        self.entry_drag01.delete(0, tk.END)
        self.entry_drag01.insert(0, p["1st stage"]["aero"]["drag coefficient"])

        self.attitude_v1.set(1) if(p["1st stage"]["attitude"]["file exist"]) else self.attitude_v1.set(2)
        self.label_attitude_file1["text"] = p["1st stage"]["attitude"]["file name"]
        self.entry_attitude01.delete(0, tk.END)
        self.entry_attitude01.insert(0, p["1st stage"]["attitude"]["initial azimth[deg]"])
        self.entry_attitude11.delete(0, tk.END)
        self.entry_attitude11.insert(0, p["1st stage"]["attitude"]["initial elevation[deg]"])

        self.checkbutton_stage1.select() if(p["1st stage"]["stage"]["following stage exist"]) else self.checkbutton_stage1.deselect()
        self.entry_stage11.delete(0, tk.END)
        self.entry_stage11.insert(0, p["1st stage"]["stage"]["separation time[s]"])

        self.wind_v.set(1) if(p["wind"]["file exist"]) else self.wind_v.set(2)
        self.label_wind_file["text"] = p["wind"]["file name"]
        self.entry_wind0.delete(0, tk.END)
        self.entry_wind0.insert(0, p["wind"]["const wind"][0])
        self.entry_wind1.delete(0, tk.END)
        self.entry_wind1.insert(0, p["wind"]["const wind"][1])

    def change_state_Isp1(self):
        print("Isp 1st")

    def Isp_file1(self):
        print("browse Isp1")
        filename = tkfd.askopenfilename(filetypes=[('csv file','*.csv')], initialdir=os.getcwd())
        if (filename == ""):return
        self.label_Isp_file1["text"] = os.path.basename(filename)

    def Isp_plot1(self):
        print("plot Isp1")
        df = pd.read_csv(self.label_Isp_file1["text"])
        plt.plot(df["time"], df["Isp"])
        plt.xlabel("time [sec]");plt.ylabel("Isp [sec]")
        plt.title("Isp csv data");plt.grid();plt.show()

    def change_state_thrust1(self):
        print("thrust 1st")

    def thrust_file1(self):
        print("browse thrust1")
        filename = tkfd.askopenfilename(filetypes=[('csv file','*.csv')], initialdir=os.getcwd())
        if (filename == ""):return
        self.label_thrust_file1["text"] = os.path.basename(filename)

    def thrust_plot1(self):
        print("plot Isp1")
        df = pd.read_csv(self.label_thrust_file1["text"])
        plt.plot(df["time"], df[" thrust"])
        plt.xlabel("time [sec]");plt.ylabel("thrust [N]")
        plt.title("thrust csv data");plt.grid();plt.show()

    def change_state_lift1(self):
        print("lift 1st")

    def lift_file1(self):
        print("browse lift1")
        filename = tkfd.askopenfilename(filetypes=[('csv file','*.csv')], initialdir=os.getcwd())
        if (filename == ""):return
        self.label_lift_file1["text"] = os.path.basename(filename)

    def lift_plot1(self):
        print("plot lift1")
        df = pd.read_csv(self.label_lift_file1["text"])
        plt.plot(df["mach"], df[" CL"])
        plt.xlabel("mach number");plt.ylabel("CL")
        plt.title("Coef. Lift(CL) csv data");plt.grid();plt.show()

    def change_state_drag1(self):
        print("drag 1st")

    def drag_file1(self):
        print("browse drag1")
        filename = tkfd.askopenfilename(filetypes=[('csv file','*.csv')], initialdir=os.getcwd())
        if (filename == ""):return
        self.label_drag_file1["text"] = os.path.basename(filename)

    def drag_plot1(self):
        print("plot drag1")
        df = pd.read_csv(self.label_drag_file1["text"])
        plt.plot(df["mach"], df[" Cd"])
        plt.xlabel("mach number");plt.ylabel("CD")
        plt.title("Coef. Drag(CD) csv data");plt.grid();plt.show()

    def change_state_attitude1(self):
        print("attitude 1st")

    def attitude_file1(self):
        print("browse attitude1")
        filename = tkfd.askopenfilename(filetypes=[('csv file','*.csv')], initialdir=os.getcwd())
        if (filename == ""):return
        self.label_attitude_file1["text"] = os.path.basename(filename)

    def attitude_plot1(self):
        print("plot attitude1")
        df = pd.read_csv(self.label_attitude_file1["text"])
        plt.plot(df["time"], df["azimth"])
        plt.plot(df["time"], df["elevation"])
        plt.xlabel("time [sec]");plt.ylabel("[deg]");plt.legend()
        plt.title("attitude csv data");plt.grid();plt.show()

    def stage_check1(self):
        print("stage check")
        print(self.checkvar_stage1.get())
        if (self.checkvar_stage1.get() == False):
            # self.f3.forget(self.tab_2)
            # self.f3.forget(self.tab_3)
            self.f3.hide(self.tab_2)
            self.f3.hide(self.tab_3)
        else:
            # self.f3.add(self.tab_2, text="2nd stage")
            # self.f3.add(self.tab_3, text="3rd stage")
            self.f3.add(self.tab_2)
            self.f3.add(self.tab_3)

    def change_state_wind(self):
        print("test")

    def wind_file(self):
        print("wind file")
        filename = tkfd.askopenfilename(filetypes=[('csv file','*.csv')], initialdir=os.getcwd())
        if (filename == ""):return
        self.label_wind_file["text"] = os.path.basename(filename)

    def wind_plot(self):
        print("wind plot")
        df = pd.read_csv(self.label_wind_file["text"])
        plt.subplot(1,2,1)
        plt.plot(df["wind_speed"], df["altitude"])
        plt.xlabel("wind speed [m/s]");plt.ylabel("altitude [m]");plt.legend()
        plt.title("wind csv data");plt.grid()
        plt.subplot(1,2,2)
        plt.plot(df["direction"], df["altitude"])
        plt.xlabel("direction [deg]");plt.ylabel("altitude [m]");plt.legend()
        plt.title("wind csv data");plt.grid();plt.show()

    def exec_calc(self):
        print("Calc")

    def save_json(self):
        print("Save")
        f = tkfd.asksaveasfile(mode='w', defaultextension=".json")
        if f is None: # asksaveasfile return `None` if dialog closed with "cancel".
            return
        json.dump(self.param, f, ensure_ascii=False, indent=4, sort_keys=True, separators=(',', ': '))
        f.close() # `()` was missing.
        # self.label_file["text"] = os.path.basename(f)

    def output_script(self, script_file):
        if (self.label_file["text"] == ""):
            print("Please read json file before output button")
            return
        print(script_file)
        subprocess.run(["python", script_file, self.label_file["text"]])


# # scrollbar = tk.Scrollbar(root)
# # scrollbar.pack( side = tk.RIGHT, fill=tk.Y )
#
#
# # f = Figure(figsize=(5,5), dpi=100)
# # a = f.add_subplot(111)
# # a.plot([1,2,3,4,5,6,7,8],[5,6,1,3,8,9,3,5])
# #

if __name__ == '__main__':
    root = tk.Tk()
    app = Application(master=root)
    app.mainloop()
