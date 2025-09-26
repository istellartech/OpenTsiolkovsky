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
        master.geometry("1100x580+100+100")
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
        # self.status = tk.Label(root, text="Hello, OpenTsiolkovsky",
        #                            borderwidth=2, relief="groove")
        # self.status.pack(side=tk.BOTTOM, fill=tk.X)

    def int_validate(self, new_text):
        if not new_text: return True
        try:
            entered_number = int(new_text)
            return True
        except ValueError:
            return False

    def float_validate(self, new_text):
        if not new_text: return True
        try:
            entered_number = float(new_text)
            return True
        except ValueError:
            return False

    def create_widgets(self):
        """ validate on Entry """
        int_vcmd = self.register(self.int_validate)
        float_vcmd = self.register(self.float_validate)

        """ Frame 1 """
        self.label_read_file = tk.Label(self.f1, text='parameter file : ')
        self.label_read_file.pack(side="left")
        self.label_file = tk.Label(self.f1, text='', width=40, bd=2,
                                    anchor="w", relief="groove")
        self.label_file.pack(side="left", pady=12)

        """ Frame 2 """

        """ Frame 3 """
        w3 = 10  # width Frame3
        w3b = 5  # width Frame3 button
        w3l = 7  # width Frame3 label
        self.tab_0 = tk.Frame(self.f3, height=320, width=920)
        self.tab_1 = tk.Frame(self.f3, height=320, width=920)
        self.tab_2 = tk.Frame(self.f3, height=320, width=920)
        self.tab_3 = tk.Frame(self.f3, height=320, width=920)

        self.f3.add(self.tab_0, text="general")
        self.f3.add(self.tab_1, text="1st stage")
        self.f3.add(self.tab_2, text="2nd stage")
        self.f3.add(self.tab_3, text="3rd stage")
        self.f3.hide(self.tab_2)
        self.f3.hide(self.tab_3)

        """ Frame 3 general """
        w2 = 10  # width at Frame2
        self.label_name = tk.Label(self.tab_0, text='Name', width=15, anchor="e")
        self.label_name.grid(row=1, column=0, columnspan=2, sticky='e')
        self.entry_name = tk.Entry(self.tab_0, text='', bd=1, width=32)
        self.entry_name.grid(row=1, column=2, columnspan=3, sticky='w')
        self.label_calc_condition = tk.Label(self.tab_0, text='Calc. Condition', width=18, anchor="e")
        self.label_calc_condition.grid(row=1, column=5, columnspan=2)
        self.label_calc_con0 = tk.Label(self.tab_0, text='start time [s]', width=w2)
        self.label_calc_con0.grid(row=0, column=7)
        self.label_calc_con1 = tk.Label(self.tab_0, text='end time [s]', width=w2)
        self.label_calc_con1.grid(row=0, column=8)
        self.label_calc_con2 = tk.Label(self.tab_0, text='time step [s]', width=w2)
        self.label_calc_con2.grid(row=0, column=9)
        self.var_calc_con0 = tk.DoubleVar().set(0)
        self.entry_calc_con0 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_calc_con0.grid(row=1, column=7)
        self.entry_calc_con1 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_calc_con1.grid(row=1, column=8)
        self.entry_calc_con2 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_calc_con2.grid(row=1, column=9)

        canvas_hline300 = tk.Canvas(self.tab_0, width=940, height=8, bg = "white")
        canvas_hline300.create_line(40, 5, 940, 5, fill = "black")
        canvas_hline300.grid(row=2, columnspan=10)

        self.label_launch_pos = tk.Label(self.tab_0, text='Position at launch', width=15, anchor="e")
        self.label_launch_pos.grid(row=4, column=0, columnspan=2, sticky='e')
        self.label_launch_pos0 = tk.Label(self.tab_0, text='latitude [deg]', width=w2)
        self.label_launch_pos0.grid(row=3, column=2)
        self.label_launch_pos1 = tk.Label(self.tab_0, text='longitude [deg]', width=w2)
        self.label_launch_pos1.grid(row=3, column=3)
        self.label_launch_pos2 = tk.Label(self.tab_0, text='altitude [m]', width=w2)
        self.label_launch_pos2.grid(row=3, column=4)
        self.entry_launch_pos0 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_launch_pos0.grid(row=4, column=2)
        self.entry_launch_pos1 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_launch_pos1.grid(row=4, column=3)
        self.entry_launch_pos2 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_launch_pos2.grid(row=4, column=4)

        self.label_launch_vel = tk.Label(self.tab_0, text='Velocity at launch', width=15, anchor="e")
        self.label_launch_vel.grid(row=4, column=5, columnspan=2)
        self.label_launch_vel0 = tk.Label(self.tab_0, text='North [m/s]', width=w2)
        self.label_launch_vel0.grid(row=3, column=7)
        self.label_launch_vel1 = tk.Label(self.tab_0, text='East [m/s]', width=w2)
        self.label_launch_vel1.grid(row=3, column=8)
        self.label_launch_vel2 = tk.Label(self.tab_0, text='Down [m/s]', width=w2)
        self.label_launch_vel2.grid(row=3, column=9)
        self.entry_launch_vel0 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_launch_vel0.grid(row=4, column=7)
        self.entry_launch_vel1 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_launch_vel1.grid(row=4, column=8)
        self.entry_launch_vel2 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_launch_vel2.grid(row=4, column=9)

        self.label_launch_date = tk.Label(self.tab_0, text='Date at launch', width=15, anchor="e")
        self.label_launch_date.grid(row=6, column=0, columnspan=2, sticky='e')
        self.label_launch_time0 = tk.Label(self.tab_0, text='year', width=w2)
        self.label_launch_time0.grid(row=5, column=2)
        self.label_launch_time1 = tk.Label(self.tab_0, text='month', width=w2)
        self.label_launch_time1.grid(row=5, column=3)
        self.label_launch_time2 = tk.Label(self.tab_0, text='day', width=w2)
        self.label_launch_time2.grid(row=5, column=4)
        self.entry_launch_time0 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(int_vcmd, '%P'))
        self.entry_launch_time0.grid(row=6, column=2)
        self.entry_launch_time1 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(int_vcmd, '%P'))
        self.entry_launch_time1.grid(row=6, column=3)
        self.entry_launch_time2 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(int_vcmd, '%P'))
        self.entry_launch_time2.grid(row=6, column=4)

        self.label_launch_time = tk.Label(self.tab_0, text='Time at launch', width=15, anchor="e")
        self.label_launch_time.grid(row=6, column=5, columnspan=2)
        self.label_launch_time3 = tk.Label(self.tab_0, text='hour', width=w2)
        self.label_launch_time3.grid(row=5, column=7)
        self.label_launch_time4 = tk.Label(self.tab_0, text='minute', width=w2)
        self.label_launch_time4.grid(row=5, column=8)
        self.label_launch_time5 = tk.Label(self.tab_0, text='second', width=w2)
        self.label_launch_time5.grid(row=5, column=9)
        self.entry_launch_time3 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(int_vcmd, '%P'))
        self.entry_launch_time3.grid(row=6, column=7)
        self.entry_launch_time4 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(int_vcmd, '%P'))
        self.entry_launch_time4.grid(row=6, column=8)
        self.entry_launch_time5 = tk.Entry(self.tab_0, text='', bd=1, width=w2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_launch_time5.grid(row=6, column=9)

        canvas_hline301 = tk.Canvas(self.tab_0, width=940, height=8, bg = "white")
        canvas_hline301.create_line(40, 5, 940, 5, fill = "black")
        canvas_hline301.grid(row=7, columnspan=10)

        w4 = 10  # width at Frame4
        self.label_wind = tk.Label(self.tab_0, text='Wind   ', width=10, anchor="e", font=("",0,"bold"))
        self.label_wind.grid(row=8, column=0)
        self.wind_v = tk.IntVar()
        self.wind_v.set(0)
        self.radio_wind_file = tk.Radiobutton(self.tab_0, text="file", variable=self.wind_v,
                                              value=1, command = self.change_state_wind)
        self.radio_wind_file.grid(row=8, column=1, sticky='w')
        self.radio_wind_const = tk.Radiobutton(self.tab_0, text="const", variable=self.wind_v,
                                              value=2, command = self.change_state_wind)
        self.radio_wind_const.grid(row=10, column=1, sticky='w')
        self.label_wind_file = tk.Label(self.tab_0, text='', bd=1, width=22, anchor="w", relief="sunken")
        self.label_wind_file.grid(row=8, column=2, columnspan=3, sticky='w')
        self.button_wind_file = tk.Button(self.tab_0, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_wind_file), width=w3b)
        self.button_wind_file.grid(row=8, column=4, sticky='e')
        self.button_wind_plot = tk.Button(self.tab_0, text='plot', command=self.wind_plot, width=w3b-3)
        self.button_wind_plot.grid(row=8, column=5, sticky='w')
        self.label_wind0 = tk.Label(self.tab_0, text='azimuth [deg]', width=w4)
        self.label_wind0.grid(row=9, column=2)
        self.label_wind1 = tk.Label(self.tab_0, text='wind speed [m/s]', width=w4*2, anchor='w')
        self.label_wind1.grid(row=9, column=3, columnspan=2, sticky='w')
        self.entry_wind0 = tk.Entry(self.tab_0, text='', bd=1, width=w4, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_wind0.grid(row=10, column=2)
        self.entry_wind1 = tk.Entry(self.tab_0, text='', bd=1, width=w4, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_wind1.grid(row=10, column=3)

        """ Frame 3 1st stage """
        self.label_mass_init1 = tk.Label(self.tab_1, text='initial mass [kg]', width=15, anchor="w", font=("",0,"bold"))
        self.label_mass_init1.grid(row=0, column=1, columnspan=2)
        self.entry_mass_init1 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_mass_init1.grid(row=0, column=3)

        canvas_hline310 = tk.Canvas(self.tab_1, width=960, height=8, bg = "white")
        canvas_hline310.create_line(20, 5, 960, 5, fill = "black")
        canvas_hline310.grid(row=1, columnspan=12)

        """ Frame 3 1st stage thrust """
        self.label_thrust1 = tk.Label(self.tab_1, text='thrust', width=4, anchor="w", font=("",0,"bold"))
        self.label_thrust1.grid(row=2, column=0)

        self.label_Isp1 = tk.Label(self.tab_1, text='Isp', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_Isp1.grid(row=2, column=1)
        self.Isp_v1 = tk.IntVar()
        self.Isp_v1.set(0)
        self.radio_Isp_file1 = tk.Radiobutton(self.tab_1, text="file", variable=self.Isp_v1,
                                              value=1, command = self.change_state_Isp1)
        self.radio_Isp_file1.grid(row=2, column=2, sticky='w')
        self.radio_Isp_const1 = tk.Radiobutton(self.tab_1, text="const", variable=self.Isp_v1,
                                              value=2, command = self.change_state_Isp1)
        self.radio_Isp_const1.grid(row=4, column=2, sticky='w')
        self.label_Isp_file1 = tk.Label(self.tab_1, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_Isp_file1.grid(row=2, column=3, columnspan=2)
        self.button_Isp_file1 = tk.Button(self.tab_1, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_Isp_file1), width=w3b)
        self.button_Isp_file1.grid(row=2, column=5, sticky='w')
        self.button_Isp_plot1 = tk.Button(self.tab_1, text='plot', width=w3b-3,
            command=lambda:self.plot_time(self.label_Isp_file1, ["Isp"], "Isp [sec]", "Isp csv data"))
        self.button_Isp_plot1.grid(row=2, column=5, sticky='e')
        self.label_Isp1 = tk.Label(self.tab_1, text='Isp [sec]', width=w3)
        self.label_Isp1.grid(row=3, column=3)
        self.entry_Isp1 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_Isp1.grid(row=4, column=3)

        self.label_thrust1 = tk.Label(self.tab_1, text='   thrust', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_thrust1.grid(row=2, column=6)
        self.thrust_v1 = tk.IntVar()
        self.thrust_v1.set(0)
        self.radio_thrust_file1 = tk.Radiobutton(self.tab_1, text="file", variable=self.thrust_v1,
                                              value=1, command = self.change_state_thrust1)
        self.radio_thrust_file1.grid(row=2, column=8, sticky='w')
        self.radio_thrust_const1 = tk.Radiobutton(self.tab_1, text="const", variable=self.thrust_v1,
                                              value=2, command = self.change_state_thrust1)
        self.radio_thrust_const1.grid(row=4, column=8, sticky='w')
        self.label_thrust_file1 = tk.Label(self.tab_1, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_thrust_file1.grid(row=2, column=9, columnspan=2)
        self.button_thrust_file1 = tk.Button(self.tab_1, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_thrust_file1), width=w3b)
        self.button_thrust_file1.grid(row=2, column=11, sticky='w')
        self.button_thrust_plot1 = tk.Button(self.tab_1, text='plot', width=w3b-3,
            command=lambda:self.plot_time(self.label_thrust_file1, [" thrust"], "thrust [N]", "thrust csv data"))
        self.button_thrust_plot1.grid(row=2, column=11, sticky='e')
        self.label_thrust01 = tk.Label(self.tab_1, text='thrust [N]', width=w3)
        self.label_thrust01.grid(row=3, column=9)
        self.label_thrust11 = tk.Label(self.tab_1, text='start time [sec]', width=w3)
        self.label_thrust11.grid(row=3, column=10)
        self.label_thrust21 = tk.Label(self.tab_1, text='end time [sec]', width=w3)
        self.label_thrust21.grid(row=3, column=11)
        self.entry_thrust01 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_thrust01.grid(row=4, column=9)
        self.entry_thrust11 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_thrust11.grid(row=4, column=10)
        self.entry_thrust21 = tk.Entry(self.tab_1, text='', bd=1, width=w3+2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_thrust21.grid(row=4, column=11)

        self.label_nozzle1 = tk.Label(self.tab_1, text='nozzle', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_nozzle1.grid(row=5, column=1)
        self.label_nozzle01 = tk.Label(self.tab_1, text='throat dia [m]', width=w3)
        self.label_nozzle01.grid(row=5, column=3)
        self.label_nozzle11 = tk.Label(self.tab_1, text='expansion ratio', width=w3)
        self.label_nozzle11.grid(row=5, column=4)
        self.label_nozzle21 = tk.Label(self.tab_1, text='exhaust pressure [Pa]', width=w3*2, anchor='w')
        self.label_nozzle21.grid(row=5, column=5, columnspan=2, sticky='w')
        self.entry_nozzle01 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_nozzle01.grid(row=6, column=3)
        self.entry_nozzle11 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_nozzle11.grid(row=6, column=4)
        self.entry_nozzle21 = tk.Entry(self.tab_1, text='', bd=1, width=w3+2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_nozzle21.grid(row=6, column=5, sticky='w')

        canvas_hline311 = tk.Canvas(self.tab_1, width=960, height=8, bg = "white")
        canvas_hline311.create_line(20, 5, 960, 5, fill = "black")
        canvas_hline311.grid(row=7, columnspan=12)

        """ Frame 3 1st stage aero """
        self.label_aero1 = tk.Label(self.tab_1, text='aero', width=4, anchor="w", font=("",0,"bold"))
        self.label_aero1.grid(row=8, column=0)

        self.label_body_dia1 = tk.Label(self.tab_1, text='body diameter [m]', width=15, anchor="w", font=("",0,"bold"))
        self.label_body_dia1.grid(row=8, column=1, columnspan=2)
        self.entry_body_dia1 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_body_dia1.grid(row=8, column=3)

        self.label_lift1 = tk.Label(self.tab_1, text='Lift coef.', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_lift1.grid(row=9, column=1)
        self.lift_v1 = tk.IntVar()
        self.lift_v1.set(0)
        self.radio_lift_file1 = tk.Radiobutton(self.tab_1, text="file", variable=self.lift_v1,
                                              value=1, command = self.change_state_lift1)
        self.radio_lift_file1.grid(row=9, column=2, sticky='w')
        self.radio_lift_const1 = tk.Radiobutton(self.tab_1, text="const", variable=self.lift_v1,
                                              value=2, command = self.change_state_lift1)
        self.radio_lift_const1.grid(row=10, column=2, sticky='w')
        self.label_lift_file1 = tk.Label(self.tab_1, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_lift_file1.grid(row=9, column=3, columnspan=2)
        self.button_lift_file1 = tk.Button(self.tab_1, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_lift_file1), width=w3b)
        self.button_lift_file1.grid(row=9, column=5, sticky='w')
        self.button_lift_plot1 = tk.Button(self.tab_1, text='plot', width=w3b-3,
            command=lambda:self.plot_mach(self.label_lift_file1, " CL", "CL", "Coef. Lift(CL) csv data"))
        self.button_lift_plot1.grid(row=9, column=5, sticky='e')
        self.entry_lift1 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_lift1.grid(row=10, column=3)

        self.label_drag1 = tk.Label(self.tab_1, text='   Drag coef.', width=w3l+1, anchor="w", font=("",0,"bold"))
        self.label_drag1.grid(row=9, column=6)
        self.drag_v1 = tk.IntVar()
        self.drag_v1.set(0)
        self.radio_drag_file1 = tk.Radiobutton(self.tab_1, text="file", variable=self.drag_v1,
                                              value=1, command = self.change_state_drag1)
        self.radio_drag_file1.grid(row=9, column=8, sticky='w')
        self.radio_drag_const1 = tk.Radiobutton(self.tab_1, text="const", variable=self.drag_v1,
                                              value=2, command = self.change_state_drag1)
        self.radio_drag_const1.grid(row=10, column=8, sticky='w')
        self.label_drag_file1 = tk.Label(self.tab_1, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_drag_file1.grid(row=9, column=9, columnspan=2)
        self.button_drag_file1 = tk.Button(self.tab_1, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_drag_file1), width=w3b)
        self.button_drag_file1.grid(row=9, column=11, sticky='w')
        self.button_drag_plot1 = tk.Button(self.tab_1, text='plot', width=w3b-3,
            command=lambda:self.plot_mach(self.label_drag_file1, " Cd", "CD", "Coef. Drag(CD) csv data"))
        self.button_drag_plot1.grid(row=9, column=11, sticky='e')
        self.entry_drag1 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_drag1.grid(row=10, column=9)

        canvas_hline312 = tk.Canvas(self.tab_1, width=960, height=8, bg = "white")
        canvas_hline312.create_line(20, 5, 960, 5, fill = "black")
        canvas_hline312.grid(row=11, columnspan=12)


        """ Frame 3 1st stage attitude """
        self.label_attitude1 = tk.Label(self.tab_1, text='attitude', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_attitude1.grid(row=12, column=1)
        self.attitude_v1 = tk.IntVar()
        self.attitude_v1.set(0)
        self.radio_attitude_file1 = tk.Radiobutton(self.tab_1, text="file", variable=self.attitude_v1,
                                              value=1, command = self.change_state_attitude1)
        self.radio_attitude_file1.grid(row=12, column=2, sticky='w')
        self.radio_attitude_const1 = tk.Radiobutton(self.tab_1, text="const", variable=self.attitude_v1,
                                              value=2, command = self.change_state_attitude1)
        self.radio_attitude_const1.grid(row=14, column=2, sticky='w')
        self.label_attitude_file1 = tk.Label(self.tab_1, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_attitude_file1.grid(row=12, column=3, columnspan=2)
        self.button_attitude_file1 = tk.Button(self.tab_1, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_attitude_file1), width=w3b)
        self.button_attitude_file1.grid(row=12, column=5, sticky='w')
        self.button_attitude_plot1 = tk.Button(self.tab_1, text='plot', width=w3b-3,
            command=lambda:self.plot_time(self.label_attitude_file1, ["azimuth", "elevation"], "[deg]", "attitude csv data"))
        self.button_attitude_plot1.grid(row=12, column=5, sticky='e')
        self.label_attitude01 = tk.Label(self.tab_1, text='azimuth [deg]', width=w3)
        self.label_attitude01.grid(row=13, column=3)
        self.label_attitude11 = tk.Label(self.tab_1, text='elevation [deg]', width=w3)
        self.label_attitude11.grid(row=13, column=4)
        self.entry_attitude01 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_attitude01.grid(row=14, column=3)
        self.entry_attitude11 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_attitude11.grid(row=14, column=4)

        """ Frame 3 1st stage STAGE """
        self.label_stage1 = tk.Label(self.tab_1, text='   stage', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_stage1.grid(row=12, column=6)
        self.checkvar_stage1 = tk.IntVar()
        self.checkbutton_stage1 = tk.Checkbutton(self.tab_1, text="following satage exist", variable=self.checkvar_stage1,
                                            command=self.stage_check1, onvalue=1, offvalue=0, width=20, )
        self.checkbutton_stage1.grid(row=12, column=8, columnspan=2, sticky='w')
        self.label_stage11 = tk.Label(self.tab_1, text='separation time[sec]', width=w3*2, anchor='w')
        self.label_stage11.grid(row=13, column=8, columnspan=2, sticky='w')
        self.entry_stage11 = tk.Entry(self.tab_1, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_stage11.grid(row=14, column=8)

        """ Frame 3 2nd stage """
        self.label_mass_init2 = tk.Label(self.tab_2, text='initial mass [kg]', width=15, anchor="w", font=("",0,"bold"))
        self.label_mass_init2.grid(row=0, column=1, columnspan=2)
        self.entry_mass_init2 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_mass_init2.grid(row=0, column=3)

        canvas_hline320 = tk.Canvas(self.tab_2, width=960, height=8, bg = "white")
        canvas_hline320.create_line(20, 5, 960, 5, fill = "black")
        canvas_hline320.grid(row=1, columnspan=12)

        """ Frame 3 2nd stage thrust """
        self.label_thrust2 = tk.Label(self.tab_2, text='thrust', width=4, anchor="w", font=("",0,"bold"))
        self.label_thrust2.grid(row=2, column=0)

        self.label_Isp2 = tk.Label(self.tab_2, text='Isp', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_Isp2.grid(row=2, column=1)
        self.Isp_v2 = tk.IntVar()
        self.Isp_v2.set(0)
        self.radio_Isp_file2 = tk.Radiobutton(self.tab_2, text="file", variable=self.Isp_v2,
                                              value=1, command = self.change_state_Isp2)
        self.radio_Isp_file2.grid(row=2, column=2, sticky='w')
        self.radio_Isp_const2 = tk.Radiobutton(self.tab_2, text="const", variable=self.Isp_v2,
                                              value=2, command = self.change_state_Isp2)
        self.radio_Isp_const2.grid(row=4, column=2, sticky='w')
        self.label_Isp_file2 = tk.Label(self.tab_2, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_Isp_file2.grid(row=2, column=3, columnspan=2)
        self.button_Isp_file2 = tk.Button(self.tab_2, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_Isp_file2), width=w3b)
        self.button_Isp_file2.grid(row=2, column=5, sticky='w')
        self.button_Isp_plot2 = tk.Button(self.tab_2, text='plot', width=w3b-3,
            command=lambda:self.plot_time(self.label_Isp_file2, ["Isp"], "Isp [sec]", "Isp csv data"))
        self.button_Isp_plot2.grid(row=2, column=5, sticky='e')
        self.label_Isp2 = tk.Label(self.tab_2, text='Isp [sec]', width=w3)
        self.label_Isp2.grid(row=3, column=3)
        self.entry_Isp2 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_Isp2.grid(row=4, column=3)

        self.label_thrust2 = tk.Label(self.tab_2, text='   thrust', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_thrust2.grid(row=2, column=6)
        self.thrust_v2 = tk.IntVar()
        self.thrust_v2.set(0)
        self.radio_thrust_file2 = tk.Radiobutton(self.tab_2, text="file", variable=self.thrust_v2,
                                              value=1, command = self.change_state_thrust2)
        self.radio_thrust_file2.grid(row=2, column=8, sticky='w')
        self.radio_thrust_const2 = tk.Radiobutton(self.tab_2, text="const", variable=self.thrust_v2,
                                              value=2, command = self.change_state_thrust2)
        self.radio_thrust_const2.grid(row=4, column=8, sticky='w')
        self.label_thrust_file2 = tk.Label(self.tab_2, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_thrust_file2.grid(row=2, column=9, columnspan=2)
        self.button_thrust_file2 = tk.Button(self.tab_2, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_thrust_file2), width=w3b)
        self.button_thrust_file2.grid(row=2, column=11, sticky='w')
        self.button_thrust_plot2 = tk.Button(self.tab_2, text='plot', width=w3b-3,
            command=lambda:self.plot_time(self.label_thrust_file2, [" thrust"], "thrust [N]", "thrust csv data"))
        self.button_thrust_plot2.grid(row=2, column=11, sticky='e')
        self.label_thrust02 = tk.Label(self.tab_2, text='thrust [N]', width=w3)
        self.label_thrust02.grid(row=3, column=9)
        self.label_thrust12 = tk.Label(self.tab_2, text='start time [sec]', width=w3)
        self.label_thrust12.grid(row=3, column=10)
        self.label_thrust22 = tk.Label(self.tab_2, text='end time [sec]', width=w3)
        self.label_thrust22.grid(row=3, column=11)
        self.entry_thrust02 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_thrust02.grid(row=4, column=9)
        self.entry_thrust12 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_thrust12.grid(row=4, column=10)
        self.entry_thrust22 = tk.Entry(self.tab_2, text='', bd=1, width=w3+2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_thrust22.grid(row=4, column=11)

        self.label_nozzle2 = tk.Label(self.tab_2, text='nozzle', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_nozzle2.grid(row=5, column=1)
        self.label_nozzle02 = tk.Label(self.tab_2, text='throat dia [m]', width=w3)
        self.label_nozzle02.grid(row=5, column=3)
        self.label_nozzle12 = tk.Label(self.tab_2, text='expansion ratio', width=w3)
        self.label_nozzle12.grid(row=5, column=4)
        self.label_nozzle22 = tk.Label(self.tab_2, text='exhaust pressure [Pa]', width=w3*2, anchor='w')
        self.label_nozzle22.grid(row=5, column=5, columnspan=2, sticky='w')
        self.entry_nozzle02 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_nozzle02.grid(row=6, column=3)
        self.entry_nozzle12 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_nozzle12.grid(row=6, column=4)
        self.entry_nozzle22 = tk.Entry(self.tab_2, text='', bd=1, width=w3+2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_nozzle22.grid(row=6, column=5, sticky='w')

        canvas_hline321 = tk.Canvas(self.tab_2, width=960, height=8, bg = "white")
        canvas_hline321.create_line(20, 5, 960, 5, fill = "black")
        canvas_hline321.grid(row=7, columnspan=12)

        """ Frame 3 2nd stage aero """
        self.label_aero2 = tk.Label(self.tab_2, text='aero', width=4, anchor="w", font=("",0,"bold"))
        self.label_aero2.grid(row=8, column=0)

        self.label_body_dia2 = tk.Label(self.tab_2, text='body diameter [m]', width=15, anchor="w", font=("",0,"bold"))
        self.label_body_dia2.grid(row=8, column=1, columnspan=2)
        self.entry_body_dia2 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_body_dia2.grid(row=8, column=3)

        self.label_lift2 = tk.Label(self.tab_2, text='Lift coef.', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_lift2.grid(row=9, column=1)
        self.lift_v2 = tk.IntVar()
        self.lift_v2.set(0)
        self.radio_lift_file2 = tk.Radiobutton(self.tab_2, text="file", variable=self.lift_v2,
                                              value=1, command = self.change_state_lift2)
        self.radio_lift_file2.grid(row=9, column=2, sticky='w')
        self.radio_lift_const2 = tk.Radiobutton(self.tab_2, text="const", variable=self.lift_v2,
                                              value=2, command = self.change_state_lift2)
        self.radio_lift_const2.grid(row=10, column=2, sticky='w')
        self.label_lift_file2 = tk.Label(self.tab_2, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_lift_file2.grid(row=9, column=3, columnspan=2)
        self.button_lift_file2 = tk.Button(self.tab_2, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_lift_file2), width=w3b)
        self.button_lift_file2.grid(row=9, column=5, sticky='w')
        self.button_lift_plot2 = tk.Button(self.tab_2, text='plot', width=w3b-3,
            command=lambda:self.plot_mach(self.label_lift_file2, " CL", "CL", "Coef. Lift(CL) csv data"))
        self.button_lift_plot2.grid(row=9, column=5, sticky='e')
        self.entry_lift2 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_lift2.grid(row=10, column=3)

        self.label_drag2 = tk.Label(self.tab_2, text='   Drag coef.', width=w3l+1, anchor="w", font=("",0,"bold"))
        self.label_drag2.grid(row=9, column=6)
        self.drag_v2 = tk.IntVar()
        self.drag_v2.set(0)
        self.radio_drag_file2 = tk.Radiobutton(self.tab_2, text="file", variable=self.drag_v2,
                                              value=1, command = self.change_state_drag2)
        self.radio_drag_file2.grid(row=9, column=8, sticky='w')
        self.radio_drag_const2 = tk.Radiobutton(self.tab_2, text="const", variable=self.drag_v2,
                                              value=2, command = self.change_state_drag2)
        self.radio_drag_const2.grid(row=10, column=8, sticky='w')
        self.label_drag_file2 = tk.Label(self.tab_2, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_drag_file2.grid(row=9, column=9, columnspan=2)
        self.button_drag_file2 = tk.Button(self.tab_2, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_drag_file2), width=w3b)
        self.button_drag_file2.grid(row=9, column=11, sticky='w')
        self.button_drag_plot2 = tk.Button(self.tab_2, text='plot', width=w3b-3,
            command=lambda:self.plot_mach(self.label_drag_file2, " Cd", "CD", "Coef. Drag(CD) csv data"))
        self.button_drag_plot2.grid(row=9, column=11, sticky='e')
        self.entry_drag2 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_drag2.grid(row=10, column=9)

        canvas_hline322 = tk.Canvas(self.tab_2, width=960, height=8, bg = "white")
        canvas_hline322.create_line(20, 5, 960, 5, fill = "black")
        canvas_hline322.grid(row=11, columnspan=12)


        """ Frame 3 2nd stage attitude """
        self.label_attitude2 = tk.Label(self.tab_2, text='attitude', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_attitude2.grid(row=12, column=1)
        self.attitude_v2 = tk.IntVar()
        self.attitude_v2.set(0)
        self.radio_attitude_file2 = tk.Radiobutton(self.tab_2, text="file", variable=self.attitude_v2,
                                              value=1, command = self.change_state_attitude2)
        self.radio_attitude_file2.grid(row=12, column=2, sticky='w')
        self.radio_attitude_const2 = tk.Radiobutton(self.tab_2, text="const", variable=self.attitude_v2,
                                              value=2, command = self.change_state_attitude2)
        self.radio_attitude_const2.grid(row=14, column=2, sticky='w')
        self.label_attitude_file2 = tk.Label(self.tab_2, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_attitude_file2.grid(row=12, column=3, columnspan=2)
        self.button_attitude_file2 = tk.Button(self.tab_2, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_attitude_file2), width=w3b)
        self.button_attitude_file2.grid(row=12, column=5, sticky='w')
        self.button_attitude_plot2 = tk.Button(self.tab_2, text='plot', width=w3b-3,
            command=lambda:self.plot_time(self.label_attitude_file2, ["azimuth", "elevation"], "[deg]", "attitude csv data"))
        self.button_attitude_plot2.grid(row=12, column=5, sticky='e')
        self.label_attitude02 = tk.Label(self.tab_2, text='azimuth [deg]', width=w3)
        self.label_attitude02.grid(row=13, column=3)
        self.label_attitude12 = tk.Label(self.tab_2, text='elevation [deg]', width=w3)
        self.label_attitude12.grid(row=13, column=4)
        self.entry_attitude02 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_attitude02.grid(row=14, column=3)
        self.entry_attitude12 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_attitude12.grid(row=14, column=4)

        """ Frame 3 2nd stage STAGE """
        self.label_stage2 = tk.Label(self.tab_2, text='   stage', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_stage2.grid(row=12, column=6)
        self.checkvar_stage2 = tk.IntVar()
        self.checkbutton_stage2 = tk.Checkbutton(self.tab_2, text="following satage exist", variable=self.checkvar_stage2,
                                            command=self.stage_check2, onvalue=1, offvalue=0, width=20, )
        self.checkbutton_stage2.grid(row=12, column=8, columnspan=2, sticky='w')
        self.label_stage12 = tk.Label(self.tab_2, text='separation time[sec]', width=w3*2, anchor='w')
        self.label_stage12.grid(row=13, column=8, columnspan=2, sticky='w')
        self.entry_stage12 = tk.Entry(self.tab_2, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_stage12.grid(row=14, column=8)

        """ Frame 3 3rd stage """
        self.label_mass_init3 = tk.Label(self.tab_3, text='initial mass [kg]', width=15, anchor="w", font=("",0,"bold"))
        self.label_mass_init3.grid(row=0, column=1, columnspan=2)
        self.entry_mass_init3 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_mass_init3.grid(row=0, column=3)

        canvas_hline330 = tk.Canvas(self.tab_3, width=960, height=8, bg = "white")
        canvas_hline330.create_line(20, 5, 960, 5, fill = "black")
        canvas_hline330.grid(row=1, columnspan=12)

        """ Frame 3 3rd stage thrust """
        self.label_thrust3 = tk.Label(self.tab_3, text='thrust', width=4, anchor="w", font=("",0,"bold"))
        self.label_thrust3.grid(row=2, column=0)

        self.label_Isp3 = tk.Label(self.tab_3, text='Isp', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_Isp3.grid(row=2, column=1)
        self.Isp_v3 = tk.IntVar()
        self.Isp_v3.set(0)
        self.radio_Isp_file3 = tk.Radiobutton(self.tab_3, text="file", variable=self.Isp_v3,
                                              value=1, command = self.change_state_Isp3)
        self.radio_Isp_file3.grid(row=2, column=2, sticky='w')
        self.radio_Isp_const3 = tk.Radiobutton(self.tab_3, text="const", variable=self.Isp_v3,
                                              value=2, command = self.change_state_Isp3)
        self.radio_Isp_const3.grid(row=4, column=2, sticky='w')
        self.label_Isp_file3 = tk.Label(self.tab_3, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_Isp_file3.grid(row=2, column=3, columnspan=2)
        self.button_Isp_file3 = tk.Button(self.tab_3, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_Isp_file3), width=w3b)
        self.button_Isp_file3.grid(row=2, column=5, sticky='w')
        self.button_Isp_plot3 = tk.Button(self.tab_3, text='plot', width=w3b-3,
            command=lambda:self.plot_time(self.label_Isp_file3, ["Isp"], "Isp [sec]", "Isp csv data"))
        self.button_Isp_plot3.grid(row=2, column=5, sticky='e')
        self.label_Isp3 = tk.Label(self.tab_3, text='Isp [sec]', width=w3)
        self.label_Isp3.grid(row=3, column=3)
        self.entry_Isp3 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_Isp3.grid(row=4, column=3)

        self.label_thrust3 = tk.Label(self.tab_3, text='   thrust', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_thrust3.grid(row=2, column=6)
        self.thrust_v3 = tk.IntVar()
        self.thrust_v3.set(0)
        self.radio_thrust_file3 = tk.Radiobutton(self.tab_3, text="file", variable=self.thrust_v3,
                                              value=1, command = self.change_state_thrust3)
        self.radio_thrust_file3.grid(row=2, column=8, sticky='w')
        self.radio_thrust_const3 = tk.Radiobutton(self.tab_3, text="const", variable=self.thrust_v3,
                                              value=2, command = self.change_state_thrust3)
        self.radio_thrust_const3.grid(row=4, column=8, sticky='w')
        self.label_thrust_file3 = tk.Label(self.tab_3, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_thrust_file3.grid(row=2, column=9, columnspan=2)
        self.button_thrust_file3 = tk.Button(self.tab_3, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_thrust_file3), width=w3b)
        self.button_thrust_file3.grid(row=2, column=11, sticky='w')
        self.button_thrust_plot3 = tk.Button(self.tab_3, text='plot', width=w3b-3,
            command=lambda:self.plot_time(self.label_thrust_file3, [" thrust"], "thrust [N]", "thrust csv data"))
        self.button_thrust_plot3.grid(row=2, column=11, sticky='e')
        self.label_thrust03 = tk.Label(self.tab_3, text='thrust [N]', width=w3)
        self.label_thrust03.grid(row=3, column=9)
        self.label_thrust13 = tk.Label(self.tab_3, text='start time [sec]', width=w3)
        self.label_thrust13.grid(row=3, column=10)
        self.label_thrust23 = tk.Label(self.tab_3, text='end time [sec]', width=w3)
        self.label_thrust23.grid(row=3, column=11)
        self.entry_thrust03 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_thrust03.grid(row=4, column=9)
        self.entry_thrust13 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_thrust13.grid(row=4, column=10)
        self.entry_thrust23 = tk.Entry(self.tab_3, text='', bd=1, width=w3+2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_thrust23.grid(row=4, column=11)

        self.label_nozzle3 = tk.Label(self.tab_3, text='nozzle', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_nozzle3.grid(row=5, column=1)
        self.label_nozzle03 = tk.Label(self.tab_3, text='throat dia [m]', width=w3)
        self.label_nozzle03.grid(row=5, column=3)
        self.label_nozzle13 = tk.Label(self.tab_3, text='expansion ratio', width=w3)
        self.label_nozzle13.grid(row=5, column=4)
        self.label_nozzle23 = tk.Label(self.tab_3, text='exhaust pressure [Pa]', width=w3*2, anchor='w')
        self.label_nozzle23.grid(row=5, column=5, columnspan=2, sticky='w')
        self.entry_nozzle03 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_nozzle03.grid(row=6, column=3)
        self.entry_nozzle13 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_nozzle13.grid(row=6, column=4)
        self.entry_nozzle23 = tk.Entry(self.tab_3, text='', bd=1, width=w3+2, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_nozzle23.grid(row=6, column=5, sticky='w')

        canvas_hline331 = tk.Canvas(self.tab_3, width=960, height=8, bg = "white")
        canvas_hline331.create_line(20, 5, 960, 5, fill = "black")
        canvas_hline331.grid(row=7, columnspan=12)

        """ Frame 3 3rd stage aero """
        self.label_aero3 = tk.Label(self.tab_3, text='aero', width=4, anchor="w", font=("",0,"bold"))
        self.label_aero3.grid(row=8, column=0)

        self.label_body_dia3 = tk.Label(self.tab_3, text='body diameter [m]', width=15, anchor="w", font=("",0,"bold"))
        self.label_body_dia3.grid(row=8, column=1, columnspan=2)
        self.entry_body_dia3 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_body_dia3.grid(row=8, column=3)

        self.label_lift3 = tk.Label(self.tab_3, text='Lift coef.', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_lift3.grid(row=9, column=1)
        self.lift_v3 = tk.IntVar()
        self.lift_v3.set(0)
        self.radio_lift_file3 = tk.Radiobutton(self.tab_3, text="file", variable=self.lift_v3,
                                              value=1, command = self.change_state_lift3)
        self.radio_lift_file3.grid(row=9, column=2, sticky='w')
        self.radio_lift_const3 = tk.Radiobutton(self.tab_3, text="const", variable=self.lift_v3,
                                              value=2, command = self.change_state_lift3)
        self.radio_lift_const3.grid(row=10, column=2, sticky='w')
        self.label_lift_file3 = tk.Label(self.tab_3, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_lift_file3.grid(row=9, column=3, columnspan=2)
        self.button_lift_file3 = tk.Button(self.tab_3, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_lift_file3), width=w3b)
        self.button_lift_file3.grid(row=9, column=5, sticky='w')
        self.button_lift_plot3 = tk.Button(self.tab_3, text='plot', width=w3b-3,
            command=lambda:self.plot_mach(self.label_lift_file3, " CL", "CL", "Coef. Lift(CL) csv data"))
        self.button_lift_plot3.grid(row=9, column=5, sticky='e')
        self.entry_lift3 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_lift3.grid(row=10, column=3)

        self.label_drag3 = tk.Label(self.tab_3, text='   Drag coef.', width=w3l+1, anchor="w", font=("",0,"bold"))
        self.label_drag3.grid(row=9, column=6)
        self.drag_v3 = tk.IntVar()
        self.drag_v3.set(0)
        self.radio_drag_file3 = tk.Radiobutton(self.tab_3, text="file", variable=self.drag_v3,
                                              value=1, command = self.change_state_drag3)
        self.radio_drag_file3.grid(row=9, column=8, sticky='w')
        self.radio_drag_const3 = tk.Radiobutton(self.tab_3, text="const", variable=self.drag_v3,
                                              value=2, command = self.change_state_drag3)
        self.radio_drag_const3.grid(row=10, column=8, sticky='w')
        self.label_drag_file3 = tk.Label(self.tab_3, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_drag_file3.grid(row=9, column=9, columnspan=2)
        self.button_drag_file3 = tk.Button(self.tab_3, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_drag_file3), width=w3b)
        self.button_drag_file3.grid(row=9, column=11, sticky='w')
        self.button_drag_plot3 = tk.Button(self.tab_3, text='plot', width=w3b-3,
            command=lambda:self.plot_mach(self.label_drag_file3, " Cd", "CD", "Coef. Drag(CD) csv data"))
        self.button_drag_plot3.grid(row=9, column=11, sticky='e')
        self.entry_drag3 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_drag3.grid(row=10, column=9)

        canvas_hline332 = tk.Canvas(self.tab_3, width=960, height=8, bg = "white")
        canvas_hline332.create_line(20, 5, 960, 5, fill = "black")
        canvas_hline332.grid(row=11, columnspan=12)


        """ Frame 3 3rd stage attitude """
        self.label_attitude3 = tk.Label(self.tab_3, text='attitude', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_attitude3.grid(row=12, column=1)
        self.attitude_v3 = tk.IntVar()
        self.attitude_v3.set(0)
        self.radio_attitude_file3 = tk.Radiobutton(self.tab_3, text="file", variable=self.attitude_v3,
                                              value=1, command = self.change_state_attitude3)
        self.radio_attitude_file3.grid(row=12, column=2, sticky='w')
        self.radio_attitude_const3 = tk.Radiobutton(self.tab_3, text="const", variable=self.attitude_v3,
                                              value=2, command = self.change_state_attitude3)
        self.radio_attitude_const3.grid(row=14, column=2, sticky='w')
        self.label_attitude_file3 = tk.Label(self.tab_3, text='', bd=1, width=21, anchor="w", relief="sunken")
        self.label_attitude_file3.grid(row=12, column=3, columnspan=2)
        self.button_attitude_file3 = tk.Button(self.tab_3, text='Browse...',
            command=lambda:self.browse_csv_file(self.label_attitude_file3), width=w3b)
        self.button_attitude_file3.grid(row=12, column=5, sticky='w')
        self.button_attitude_plot3 = tk.Button(self.tab_3, text='plot', width=w3b-3,
            command=lambda:self.plot_time(self.label_attitude_file3, ["azimuth", "elevation"], "[deg]", "attitude csv data"))
        self.button_attitude_plot3.grid(row=12, column=5, sticky='e')
        self.label_attitude03 = tk.Label(self.tab_3, text='azimuth [deg]', width=w3)
        self.label_attitude03.grid(row=13, column=3)
        self.label_attitude13 = tk.Label(self.tab_3, text='elevation [deg]', width=w3)
        self.label_attitude13.grid(row=13, column=4)
        self.entry_attitude03 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_attitude03.grid(row=14, column=3)
        self.entry_attitude13 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_attitude13.grid(row=14, column=4)

        """ Frame 3 3rd stage STAGE """
        self.label_stage3 = tk.Label(self.tab_3, text='   stage', width=w3l, anchor="w", font=("",0,"bold"))
        self.label_stage3.grid(row=12, column=6)
        self.checkvar_stage3 = tk.IntVar()
        self.checkbutton_stage3 = tk.Checkbutton(self.tab_3, text="following satage exist", variable=self.checkvar_stage3,
                                            command=self.stage_check3, onvalue=1, offvalue=0, width=20, )
        # self.checkbutton_stage3.grid(row=12, column=8, columnspan=2, sticky='w')
        self.label_stage13 = tk.Label(self.tab_3, text='separation time[sec]', width=w3*2, anchor='w')
        self.label_stage13.grid(row=13, column=8, columnspan=2, sticky='w')
        self.entry_stage13 = tk.Entry(self.tab_3, text='', bd=1, width=w3, validate="key", vcmd=(float_vcmd, '%P'))
        self.entry_stage13.grid(row=14, column=8)

        """ Frame 4 """

        """ Frame 5 """
        self.img_read = tk.PhotoImage(file="img/Read.gif")
        self.img_save = tk.PhotoImage(file="img/Save.gif")
        self.img_calc = tk.PhotoImage(file="img/Calc.gif")
        self.img_plot = tk.PhotoImage(file="img/Plot.gif")
        self.img_html = tk.PhotoImage(file="img/HTML.gif")
        self.img_kml = tk.PhotoImage(file="img/KML.gif")
        self.img_nmea = tk.PhotoImage(file="img/NMEA.gif")
        self.img_extend = tk.PhotoImage(file="img/Extend.gif")
        self.img_quit = tk.PhotoImage(file="img/Quit.gif")

        self.quit = tk.Button(self.f5, image=self.img_quit, command=root.destroy)
        self.quit.pack(side="right")

        canvas_hline51 = tk.Canvas(self.f5, width=20, height=110, bg = "white")
        canvas_hline51.create_line(12, 0, 12, 110, fill = "black")
        canvas_hline51.pack(side="right")

        self.button_extend = tk.Button(self.f5, image=self.img_extend,
            command=lambda:self.output_script("make_extend_output.py"))
        self.button_extend["state"] = tk.DISABLED
        self.button_extend.pack(side="right")
        self.button_NMEA = tk.Button(self.f5, image=self.img_nmea,
            command=lambda:self.output_script("make_nmea.py"))
        self.button_NMEA["state"] = tk.DISABLED
        self.button_NMEA.pack(side="right")
        self.button_KML = tk.Button(self.f5, image=self.img_kml,
            command=lambda:self.output_script("make_kml.py"))
        self.button_KML["state"] = tk.DISABLED
        self.button_KML.pack(side="right")
        self.button_HTML = tk.Button(self.f5, image=self.img_html,
            command=lambda:self.output_script("make_html.py"))
        self.button_HTML["state"] = tk.DISABLED
        self.button_HTML.pack(side="right")
        self.button_plot = tk.Button(self.f5, image=self.img_plot,
            command=lambda:self.output_script("make_plot.py"))
        self. button_plot["state"] = tk.DISABLED
        self.button_plot.pack(side="right")

        canvas_hline52 = tk.Canvas(self.f5, width=20, height=110, bg = "white")
        canvas_hline52.create_line(12, 0, 12, 110, fill = "black")
        canvas_hline52.pack(side="right")

        self.button_calc = tk.Button(self.f5, command=self.exec_calc, image=self.img_calc)
        self.button_calc["state"] = tk.DISABLED
        self.button_calc.pack(side="right")
        self.button_save = tk.Button(self.f5, command=self.save_json, image=self.img_save)
        self.button_save["state"] = tk.DISABLED
        self.button_save.pack(side="right")

        canvas_hline53 = tk.Canvas(self.f5, width=20, height=110, bg = "white")
        canvas_hline53.create_line(12, 0, 12, 110, fill = "black")
        canvas_hline53.pack(side="right")

        self.button_read_file = tk.Button(self.f5, command=self.read_json_file, image=self.img_read)
        self.button_read_file.pack(side="right")

        """ Frame 6 """

        """ Frame 7 """


    def read_json_file(self):
        """ button click on "Raad file" """
        filename = tkfd.askopenfilename(filetypes=[('OpenTsiolkovsky parameter file','*.json')],
                                        initialdir=os.getcwd())
        if (filename != ""):
            self.filename_json = filename
        else:
            return
        self.label_file["text"] = os.path.basename(self.filename_json)
        with open(self.filename_json, 'r') as f:
            try:
                self.param = json.load(f)
            except json.decoder.JSONDecodeError:
                tkmsg.showerror("json error", "JSON decode error\nPlease correct the parameter file.")
                return
        self.load_json(self.param)

        self.button_calc["state"] = tk.NORMAL
        self.button_save["state"] = tk.NORMAL
        self.button_extend["state"] = tk.NORMAL
        self.button_HTML["state"] = tk.NORMAL
        self.button_KML["state"] = tk.NORMAL
        self.button_NMEA["state"] = tk.NORMAL
        self.button_plot["state"] = tk.NORMAL

        self.change_state_wind()
        self.change_state_Isp1()
        self.change_state_thrust1()
        self.change_state_lift1()
        self.change_state_drag1()
        self.change_state_attitude1()
        self.change_state_Isp2()
        self.change_state_thrust2()
        self.change_state_lift2()
        self.change_state_drag2()
        self.change_state_attitude2()
        self.change_state_Isp3()
        self.change_state_thrust3()
        self.change_state_lift3()
        self.change_state_drag3()
        self.change_state_attitude3()

        self.stage_check1()
        self.stage_check2()

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

        self.wind_v.set(1) if(p["wind"]["file exist"]) else self.wind_v.set(2)
        self.label_wind_file["text"] = p["wind"]["file name"]
        self.entry_wind0.delete(0, tk.END)
        self.entry_wind0.insert(0, p["wind"]["const wind"][0])
        self.entry_wind1.delete(0, tk.END)
        self.entry_wind1.insert(0, p["wind"]["const wind"][1])

        """ load json 1st stage """
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

        self.entry_body_dia1.delete(0, tk.END)
        self.entry_body_dia1.insert(0, p["1st stage"]["aero"]["body diameter[m]"])
        self.lift_v1.set(1) if(p["1st stage"]["aero"]["lift coefficient file exist"]) else self.lift_v1.set(2)
        self.label_lift_file1["text"] = p["1st stage"]["aero"]["lift coefficient file name"]
        self.entry_lift1.delete(0, tk.END)
        self.entry_lift1.insert(0, p["1st stage"]["aero"]["lift coefficient"])
        self.drag_v1.set(1) if(p["1st stage"]["aero"]["drag coefficient file exist"]) else self.drag_v1.set(2)
        self.label_drag_file1["text"] = p["1st stage"]["aero"]["drag coefficient file name"]
        self.entry_drag1.delete(0, tk.END)
        self.entry_drag1.insert(0, p["1st stage"]["aero"]["drag coefficient"])

        self.attitude_v1.set(1) if(p["1st stage"]["attitude"]["file exist"]) else self.attitude_v1.set(2)
        self.label_attitude_file1["text"] = p["1st stage"]["attitude"]["file name"]
        self.entry_attitude01.delete(0, tk.END)
        self.entry_attitude01.insert(0, p["1st stage"]["attitude"]["initial azimuth[deg]"])
        self.entry_attitude11.delete(0, tk.END)
        self.entry_attitude11.insert(0, p["1st stage"]["attitude"]["initial elevation[deg]"])

        self.checkbutton_stage1.select() if(p["1st stage"]["stage"]["following stage exist"]) else self.checkbutton_stage1.deselect()
        self.entry_stage11.delete(0, tk.END)
        self.entry_stage11.insert(0, p["1st stage"]["stage"]["separation time[s]"])

        """ load json 2nd stage """
        self.entry_mass_init2.delete(0, tk.END)
        self.entry_mass_init2.insert(0, p["2nd stage"]["mass initial[kg]"])
        self.Isp_v2.set(1) if(p["2nd stage"]["thrust"]["Isp file exist"]) else self.Isp_v2.set(2)
        self.label_Isp_file2["text"] = p["2nd stage"]["thrust"]["Isp file name"]
        self.entry_Isp2.delete(0, tk.END)
        self.entry_Isp2.insert(0, p["2nd stage"]["thrust"]["Isp[s]"])
        self.thrust_v2.set(1) if(p["2nd stage"]["thrust"]["file exist"]) else self.thrust_v2.set(2)
        self.label_thrust_file2["text"] = p["2nd stage"]["thrust"]["file name"]
        self.entry_thrust02.delete(0, tk.END)
        self.entry_thrust02.insert(0, p["2nd stage"]["thrust"]["const thrust[N]"])
        self.entry_thrust12.delete(0, tk.END)
        self.entry_thrust12.insert(0, p["2nd stage"]["thrust"]["burn start time[s]"])
        self.entry_thrust22.delete(0, tk.END)
        self.entry_thrust22.insert(0, p["2nd stage"]["thrust"]["burn end time[s]"])
        self.entry_nozzle02.delete(0, tk.END)
        self.entry_nozzle02.insert(0, p["2nd stage"]["thrust"]["throat diameter[m]"])
        self.entry_nozzle12.delete(0, tk.END)
        self.entry_nozzle12.insert(0, p["2nd stage"]["thrust"]["nozzle expansion ratio"])
        self.entry_nozzle22.delete(0, tk.END)
        self.entry_nozzle22.insert(0, p["2nd stage"]["thrust"]["nozzle exhaust pressure[Pa]"])

        self.entry_body_dia2.delete(0, tk.END)
        self.entry_body_dia2.insert(0, p["2nd stage"]["aero"]["body diameter[m]"])
        self.lift_v2.set(1) if(p["2nd stage"]["aero"]["lift coefficient file exist"]) else self.lift_v2.set(2)
        self.label_lift_file2["text"] = p["2nd stage"]["aero"]["lift coefficient file name"]
        self.entry_lift2.delete(0, tk.END)
        self.entry_lift2.insert(0, p["2nd stage"]["aero"]["lift coefficient"])
        self.drag_v2.set(1) if(p["2nd stage"]["aero"]["drag coefficient file exist"]) else self.drag_v2.set(2)
        self.label_drag_file2["text"] = p["2nd stage"]["aero"]["drag coefficient file name"]
        self.entry_drag2.delete(0, tk.END)
        self.entry_drag2.insert(0, p["2nd stage"]["aero"]["drag coefficient"])

        self.attitude_v2.set(1) if(p["2nd stage"]["attitude"]["file exist"]) else self.attitude_v2.set(2)
        self.label_attitude_file2["text"] = p["2nd stage"]["attitude"]["file name"]
        self.entry_attitude02.delete(0, tk.END)
        self.entry_attitude02.insert(0, p["2nd stage"]["attitude"]["initial azimuth[deg]"])
        self.entry_attitude12.delete(0, tk.END)
        self.entry_attitude12.insert(0, p["2nd stage"]["attitude"]["initial elevation[deg]"])

        self.checkbutton_stage2.select() if(p["2nd stage"]["stage"]["following stage exist"]) else self.checkbutton_stage2.deselect()
        self.entry_stage12.delete(0, tk.END)
        self.entry_stage12.insert(0, p["2nd stage"]["stage"]["separation time[s]"])

        """ load json 3rd stage """
        self.entry_mass_init3.delete(0, tk.END)
        self.entry_mass_init3.insert(0, p["3rd stage"]["mass initial[kg]"])
        self.Isp_v3.set(1) if(p["3rd stage"]["thrust"]["Isp file exist"]) else self.Isp_v3.set(2)
        self.label_Isp_file3["text"] = p["3rd stage"]["thrust"]["Isp file name"]
        self.entry_Isp3.delete(0, tk.END)
        self.entry_Isp3.insert(0, p["3rd stage"]["thrust"]["Isp[s]"])
        self.thrust_v3.set(1) if(p["3rd stage"]["thrust"]["file exist"]) else self.thrust_v3.set(2)
        self.label_thrust_file3["text"] = p["3rd stage"]["thrust"]["file name"]
        self.entry_thrust03.delete(0, tk.END)
        self.entry_thrust03.insert(0, p["3rd stage"]["thrust"]["const thrust[N]"])
        self.entry_thrust13.delete(0, tk.END)
        self.entry_thrust13.insert(0, p["3rd stage"]["thrust"]["burn start time[s]"])
        self.entry_thrust23.delete(0, tk.END)
        self.entry_thrust23.insert(0, p["3rd stage"]["thrust"]["burn end time[s]"])
        self.entry_nozzle03.delete(0, tk.END)
        self.entry_nozzle03.insert(0, p["3rd stage"]["thrust"]["throat diameter[m]"])
        self.entry_nozzle13.delete(0, tk.END)
        self.entry_nozzle13.insert(0, p["3rd stage"]["thrust"]["nozzle expansion ratio"])
        self.entry_nozzle23.delete(0, tk.END)
        self.entry_nozzle23.insert(0, p["3rd stage"]["thrust"]["nozzle exhaust pressure[Pa]"])

        self.entry_body_dia3.delete(0, tk.END)
        self.entry_body_dia3.insert(0, p["3rd stage"]["aero"]["body diameter[m]"])
        self.lift_v3.set(1) if(p["3rd stage"]["aero"]["lift coefficient file exist"]) else self.lift_v3.set(2)
        self.label_lift_file3["text"] = p["3rd stage"]["aero"]["lift coefficient file name"]
        self.entry_lift3.delete(0, tk.END)
        self.entry_lift3.insert(0, p["3rd stage"]["aero"]["lift coefficient"])
        self.drag_v3.set(1) if(p["3rd stage"]["aero"]["drag coefficient file exist"]) else self.drag_v3.set(2)
        self.label_drag_file3["text"] = p["3rd stage"]["aero"]["drag coefficient file name"]
        self.entry_drag3.delete(0, tk.END)
        self.entry_drag3.insert(0, p["3rd stage"]["aero"]["drag coefficient"])

        self.attitude_v3.set(1) if(p["3rd stage"]["attitude"]["file exist"]) else self.attitude_v3.set(2)
        self.label_attitude_file3["text"] = p["3rd stage"]["attitude"]["file name"]
        self.entry_attitude03.delete(0, tk.END)
        self.entry_attitude03.insert(0, p["3rd stage"]["attitude"]["initial azimuth[deg]"])
        self.entry_attitude13.delete(0, tk.END)
        self.entry_attitude13.insert(0, p["3rd stage"]["attitude"]["initial elevation[deg]"])

        self.checkbutton_stage3.select() if(p["3rd stage"]["stage"]["following stage exist"]) else self.checkbutton_stage3.deselect()
        self.entry_stage13.delete(0, tk.END)
        self.entry_stage13.insert(0, p["3rd stage"]["stage"]["separation time[s]"])


    def plot_time(self, label_file, df_y, ylabel, title):
        """ plot time vs data when click "plot" button.
        Args:
            label_file (tk.Label) : file Label
            df_y (list of str) : csv column name list
            ylabel (str) : plot ylabel
            title (str) : plot title
        """
        try:
            df = pd.read_csv(label_file["text"])
            for y in df_y:
                plt.plot(df["time"], df[y])
            plt.xlabel("time [sec]");plt.ylabel(ylabel)
            plt.title(title);plt.grid();plt.show()
        except KeyError:
            print("Error, wrong csv file!")
            self.status["text"] = title + ": Error, wrong csv file!"
            tkmsg.showerror("csv error", "Error, wrong csv file\nPlease correct the csv file.")
        except FileNotFoundError:
            print("Error, file not found.you must put the file in the same directory OpenTsiolkovsky.py")
            self.status["text"] = title + ": Error, file not found. you must put the file in the same directory OpenTsiolkovsky.py"
            tkmsg.showerror("file error", "Error, file not found.")

    def plot_mach(self, label_file, df_y, ylabel, title):
        """ plot mach vs data when click "plot" button.
        Args:
            label_file (tk.Label) : file Label
            df_y (str) : csv column name
            ylabel (str) : plot ylabel
            title (str) : plot title
        """
        try:
            df = pd.read_csv(label_file["text"])
            plt.plot(df["mach"], df[df_y])
            plt.xlabel("mach number");plt.ylabel(ylabel)
            plt.title(title);plt.grid();plt.show()
        except KeyError:
            print("Error, wrong csv file!")
            self.status["text"] = title + ": Error, wrong csv file!"
            tkmsg.showerror("csv error", "Error, wrong csv file\nPlease correct the csv file.")
        except FileNotFoundError:
            print("Error, file not found.you must put the file in the same directory OpenTsiolkovsky.py")
            self.status["text"] = title + ": Error, file not found. you must put the file in the same directory OpenTsiolkovsky.py"
            tkmsg.showerror("file error", "Error, file not found.")

    def wind_plot(self):
        try:
            df = pd.read_csv(self.label_wind_file["text"])
            plt.subplot(1,2,1)
            plt.plot(df["wind_speed"], df["altitude"])
            plt.xlabel("wind speed [m/s]");plt.ylabel("altitude [m]");plt.legend()
            plt.title("wind csv data");plt.grid()
            plt.subplot(1,2,2)
            plt.plot(df["direction"], df["altitude"])
            plt.xlabel("direction [deg]");plt.ylabel("altitude [m]");plt.legend()
            plt.title("wind csv data");plt.grid();plt.show()
        except KeyError:
            print("Error, wrong csv file!")
            self.status["text"] = title + ": Error, wrong csv file!"
            tkmsg.showerror("csv error", "Error, wrong csv file\nPlease correct the csv file.")
        except FileNotFoundError:
            print("Error, file not found.you must put the file in the same directory OpenTsiolkovsky.py")
            self.status["text"] = title + ": Error, file not found. you must put the file in the same directory OpenTsiolkovsky.py"
            tkmsg.showerror("file error", "Error, file not found.")

    def browse_csv_file(self, label_file):
        """ read csv function when "Browse..." button on.
        Args:
            label_file (tk.Label) : Label that file is displayed.
        """
        filename = tkfd.askopenfilename(filetypes=[('csv file','*.csv')], initialdir=os.getcwd())
        if (filename == ""):return
        label_file["text"] = os.path.basename(filename)

    def change_state(self, variable, file_list, const_list):
        """ change button/entry state when file/const radiobutton change
        Args:
            variable (tk.IntVar()) : radiobutton variable
            file_list (list of button/entry) : turn on widget when "file" ON
            const_list (list of button/entry) : turn on widget when "const" ON
        """
        if (variable.get() == 1):
            for on in file_list:
                on["state"] = tk.NORMAL
            for off in const_list:
                off["state"] = tk.DISABLED
        elif (variable.get() == 2):
            for on in file_list:
                on["state"] = tk.DISABLED
            for off in const_list:
                off["state"] = tk.NORMAL
        else:
            for on in file_list:
                on["state"] = tk.DISABLED
            for off in const_list:
                off["state"] = tk.DISABLED

    """ stage 1 """
    def change_state_wind(self):
        self.change_state(self.wind_v,
                         [self.label_wind_file, self.button_wind_file, self.button_wind_plot],
                         [self.entry_wind0, self.entry_wind1])

    def change_state_Isp1(self):
        self.change_state(self.Isp_v1,
                         [self.label_Isp_file1, self.button_Isp_file1, self.button_Isp_plot1],
                         [self.entry_Isp1])

    def change_state_thrust1(self):
        self.change_state(self.thrust_v1,
                         [self.label_thrust_file1, self.button_thrust_file1, self.button_thrust_plot1],
                         [self.entry_thrust01, self.entry_thrust11, self.entry_thrust21])

    def change_state_lift1(self):
        self.change_state(self.lift_v1,
                         [self.label_lift_file1, self.button_lift_file1, self.button_lift_plot1],
                         [self.entry_lift1])

    def change_state_drag1(self):
        self.change_state(self.drag_v1,
                         [self.label_drag_file1, self.button_drag_file1, self.button_drag_plot1],
                         [self.entry_drag1])

    def change_state_attitude1(self):
        self.change_state(self.attitude_v1,
                         [self.label_attitude_file1, self.button_attitude_file1, self.button_attitude_plot1],
                         [self.entry_attitude01, self.entry_attitude11])

    """ stage 2 """
    def change_state_Isp2(self):
        self.change_state(self.Isp_v2,
                         [self.label_Isp_file2, self.button_Isp_file2, self.button_Isp_plot2],
                         [self.entry_Isp2])

    def change_state_thrust2(self):
        self.change_state(self.thrust_v2,
                         [self.label_thrust_file2, self.button_thrust_file2, self.button_thrust_plot2],
                         [self.entry_thrust02, self.entry_thrust12, self.entry_thrust22])

    def change_state_lift2(self):
        self.change_state(self.lift_v2,
                         [self.label_lift_file2, self.button_lift_file2, self.button_lift_plot2],
                         [self.entry_lift2])

    def change_state_drag2(self):
        self.change_state(self.drag_v2,
                         [self.label_drag_file2, self.button_drag_file2, self.button_drag_plot2],
                         [self.entry_drag2])

    def change_state_attitude2(self):
        self.change_state(self.attitude_v2,
                         [self.label_attitude_file2, self.button_attitude_file2, self.button_attitude_plot2],
                         [self.entry_attitude02, self.entry_attitude12])

    """ stage 3 """
    def change_state_Isp3(self):
        self.change_state(self.Isp_v3,
                         [self.label_Isp_file3, self.button_Isp_file3, self.button_Isp_plot3],
                         [self.entry_Isp3])

    def change_state_thrust3(self):
        self.change_state(self.thrust_v3,
                         [self.label_thrust_file3, self.button_thrust_file3, self.button_thrust_plot3],
                         [self.entry_thrust03, self.entry_thrust13, self.entry_thrust23])

    def change_state_lift3(self):
        self.change_state(self.lift_v3,
                         [self.label_lift_file3, self.button_lift_file3, self.button_lift_plot3],
                         [self.entry_lift3])

    def change_state_drag3(self):
        self.change_state(self.drag_v3,
                         [self.label_drag_file3, self.button_drag_file3, self.button_drag_plot3],
                         [self.entry_drag3])

    def change_state_attitude3(self):
        self.change_state(self.attitude_v3,
                         [self.label_attitude_file3, self.button_attitude_file3, self.button_attitude_plot3],
                         [self.entry_attitude03, self.entry_attitude13])

    def stage_check1(self):
        if (self.checkvar_stage1.get() == False):
            self.f3.hide(self.tab_2)
        else:
            self.f3.add(self.tab_2)

    def stage_check2(self):
        if (self.checkvar_stage2.get() == False):
            self.f3.hide(self.tab_3)
        else:
            self.f3.add(self.tab_3)

    def stage_check3(self):
        pass

    def exec_calc(self):
        """ button click on "Calc" """
        filename_json = self.label_file["text"]
        with open(filename_json, 'r') as f:
            try:
                param_file = json.load(f)
            except json.decoder.JSONDecodeError:
                tkmsg.showerror("json error", "JSON decode error\nPlease correct the parameter file.")
                return

        param_GUI = self.read_GUI_json()
        if (param_file != param_GUI):
            # the same function of self.save_json()
            self.save_p = self.read_GUI_json()
            f = tkfd.asksaveasfile(mode='w', defaultextension=".json")
            if f is None: # asksaveasfile return `None` if dialog closed with "cancel".
                return
            json.dump(self.save_p, f, ensure_ascii=False, indent=4, sort_keys=True, separators=(',', ': '))
            self.label_file["text"] = os.path.basename(f.name)
            f.close() # `()` was missing.
        subprocess.run(["./OpenTsiolkovsky", self.label_file["text"]])

    def read_GUI_json(self):
        p = {
            "name": "test",
            "output file name": "test",
            "calculate condition": {
                "start time[s]": 0, "end time[s]": 260, "time step[s]": 0.05
            },
            "launch": {
                "position LLH[deg,deg,m]": [40.0, 140.0, 10.0],
                "velocity NED[m/s]": [0.0, 0.0, 0.0],
                "time": [2016,1,1,12,0,0]
            },
            "1st stage": {
                "mass initial[kg]": 200.0,
                "thrust": {
                    "Isp[s]": 200.0,
                    "Isp file exist": False,
                    "Isp file name": "Isp.csv",
                    "file exist": False,
                    "file name": "thrust.csv",
                    "const thrust[N]": 5000,
                    "burn start time[s]": 0.0,
                    "burn end time[s]": 40.0,
                    "throat diameter[m]": 0.1,
                    "nozzle expansion ratio": 10,
                    "nozzle exhaust pressure[Pa]": 101300
                },
                "aero": {
                    "body diameter[m]": 0.1,
                    "lift coefficient file exist": False,
                    "lift coefficient file name": "CL.csv",
                    "lift coefficient": 0.0,
                    "drag coefficient file exist": False,
                    "drag coefficient file name": "CD.csv",
                    "drag coefficient": 0.2
                },
                "attitude": {
                    "file exist": False,
                    "file name": "attitude.csv",
                    "initial elevation[deg]": 90.0,
                    "initial azimuth[deg]": 0
                },
                "stage": {
                    "following stage exist": True,
                    "separation time[s]": 150
                }
            },
            "2nd stage": {
                "mass initial[kg]": 50.0,
                "thrust": {
                    "Isp[s]": 200.0,
                    "Isp file exist": False,
                    "Isp file name": "Isp.csv",
                    "file exist": False,
                    "file name": "thrust.csv",
                    "const thrust[N]": 1000,
                    "burn start time[s]": 0.0,
                    "burn end time[s]": 40.0,
                    "throat diameter[m]": 0.1,
                    "nozzle expansion ratio": 10,
                    "nozzle exhaust pressure[Pa]": 0
                },
                "aero": {
                    "body diameter[m]": 0.1,
                    "lift coefficient file exist": False,
                    "lift coefficient file name": "CL.csv",
                    "lift coefficient": 0.0,
                    "drag coefficient file exist": False,
                    "drag coefficient file name": "CD.csv",
                    "drag coefficient": 0.2
                },
                "attitude": {
                    "file exist": False,
                    "file name": "attitude.csv",
                    "initial elevation[deg]": 90.0,
                    "initial azimuth[deg]": 0
                },
                "stage": {
                    "following stage exist": True,
                    "separation time[s]": 100
                }
            },
            "3rd stage": {
                "mass initial[kg]": 200.0,
                "thrust": {
                    "Isp[s]": 200.0,
                    "Isp file exist": False,
                    "Isp file name": "Isp.csv",
                    "file exist": False,
                    "file name": "thrust.csv",
                    "const thrust[N]": 5000,
                    "burn start time[s]": 0.0,
                    "burn end time[s]": 40.0,
                    "throat diameter[m]": 0.1,
                    "nozzle expansion ratio": 10,
                    "nozzle exhaust pressure[Pa]": 0
                },
                "aero": {
                    "body diameter[m]": 0.1,
                    "lift coefficient file exist": False,
                    "lift coefficient file name": "CL.csv",
                    "lift coefficient": 0.0,
                    "drag coefficient file exist": False,
                    "drag coefficient file name": "CD.csv",
                    "drag coefficient": 0.2
                },
                "attitude": {
                    "file exist": False,
                    "file name": "attitude.csv",
                    "initial elevation[deg]": 90.0,
                    "initial azimuth[deg]": 0
                },
                "stage": {
                    "following stage exist": False, "separation time[s]": 200
                }
            },
            "payload": {
                "weight": 1, "deploy time": 10000
            },
            "parachute": {
                "exist": False, "drag coefficient": 1.0,
                "diameter": 1.5, "deploy time": 100
            },
            "wind": {
                "file exist": False, "file name": "wind.csv", "const wind": [0.0, 0.0]
            }
        }
        p["name"] = self.entry_name.get()
        p["output file name"] = self.entry_name.get()
        p["calculate condition"]["start time[s]"] = float(self.entry_calc_con0.get())
        p["calculate condition"]["end time[s]"] = float(self.entry_calc_con1.get())
        p["calculate condition"]["time step[s]"] = float(self.entry_calc_con2.get())
        p["launch"]["position LLH[deg,deg,m]"][0] = float(self.entry_launch_pos0.get())
        p["launch"]["position LLH[deg,deg,m]"][1] = float(self.entry_launch_pos1.get())
        p["launch"]["position LLH[deg,deg,m]"][2] = float(self.entry_launch_pos2.get())
        p["launch"]["velocity NED[m/s]"][0] = float(self.entry_launch_vel0.get())
        p["launch"]["velocity NED[m/s]"][1] = float(self.entry_launch_vel1.get())
        p["launch"]["velocity NED[m/s]"][2] = float(self.entry_launch_vel2.get())
        p["launch"]["time"][0] = int(self.entry_launch_time0.get())
        p["launch"]["time"][1] = int(self.entry_launch_time1.get())
        p["launch"]["time"][2] = int(self.entry_launch_time2.get())
        p["launch"]["time"][3] = int(self.entry_launch_time3.get())
        p["launch"]["time"][4] = int(self.entry_launch_time4.get())
        p["launch"]["time"][5] = float(self.entry_launch_time5.get())

        p["wind"]["file exist"] = True if(self.wind_v.get()==1) else False
        p["wind"]["file name"] = self.label_wind_file["text"]
        p["wind"]["const wind"][0] = float(self.entry_wind0.get())
        p["wind"]["const wind"][1] = float(self.entry_wind1.get())

        p["1st stage"]["mass initial[kg]"] = float(self.entry_mass_init1.get())
        p["1st stage"]["thrust"]["Isp file exist"] = True if(self.Isp_v1.get()==1) else False
        p["1st stage"]["thrust"]["Isp file name"] = self.label_Isp_file1["text"]
        p["1st stage"]["thrust"]["Isp[s]"] = float(self.entry_Isp1.get())
        p["1st stage"]["thrust"]["file exist"] = True if(self.thrust_v1.get()==1) else False
        p["1st stage"]["thrust"]["file name"] = self.label_thrust_file1["text"]
        p["1st stage"]["thrust"]["const thrust[N]"] = float(self.entry_thrust01.get())
        p["1st stage"]["thrust"]["burn start time[s]"] = float(self.entry_thrust11.get())
        p["1st stage"]["thrust"]["burn end time[s]"] = float(self.entry_thrust21.get())
        p["1st stage"]["thrust"]["throat diameter[m]"] = float(self.entry_nozzle01.get())
        p["1st stage"]["thrust"]["nozzle expansion ratio"] = float(self.entry_nozzle11.get())
        p["1st stage"]["thrust"]["nozzle exhaust pressure[Pa]"] = float(self.entry_nozzle21.get())
        p["1st stage"]["aero"]["body diameter[m]"] = float(self.entry_body_dia1.get())
        p["1st stage"]["aero"]["lift coefficient file exist"] = True if(self.lift_v1.get()==1) else False
        p["1st stage"]["aero"]["lift coefficient file name"] = self.label_lift_file1["text"]
        p["1st stage"]["aero"]["lift coefficient"] = float(self.entry_lift1.get())
        p["1st stage"]["aero"]["drag coefficient file exist"] = True if(self.drag_v1.get()==1) else False
        p["1st stage"]["aero"]["drag coefficient file name"] = self.label_drag_file1["text"]
        p["1st stage"]["aero"]["drag coefficient"] = float(self.entry_drag1.get())
        p["1st stage"]["attitude"]["file exist"] = True if(self.attitude_v1.get()==1) else False
        p["1st stage"]["attitude"]["file name"] = self.label_attitude_file1["text"]
        p["1st stage"]["attitude"]["initial azimuth[deg]"] = float(self.entry_attitude01.get())
        p["1st stage"]["attitude"]["initial elevation[deg]"] = float(self.entry_attitude11.get())
        p["1st stage"]["stage"]["following stage exist"] = True if(self.checkvar_stage1.get()==1) else False
        p["1st stage"]["stage"]["separation time[s]"] = float(self.entry_stage11.get())

        p["2nd stage"]["mass initial[kg]"] = float(self.entry_mass_init2.get())
        p["2nd stage"]["thrust"]["Isp file exist"] = True if(self.Isp_v2.get()==1) else False
        p["2nd stage"]["thrust"]["Isp file name"] = self.label_Isp_file2["text"]
        p["2nd stage"]["thrust"]["Isp[s]"] = float(self.entry_Isp2.get())
        p["2nd stage"]["thrust"]["file exist"] = True if(self.thrust_v2.get()==1) else False
        p["2nd stage"]["thrust"]["file name"] = self.label_thrust_file2["text"]
        p["2nd stage"]["thrust"]["const thrust[N]"] = float(self.entry_thrust02.get())
        p["2nd stage"]["thrust"]["burn start time[s]"] = float(self.entry_thrust12.get())
        p["2nd stage"]["thrust"]["burn end time[s]"] = float(self.entry_thrust22.get())
        p["2nd stage"]["thrust"]["throat diameter[m]"] = float(self.entry_nozzle02.get())
        p["2nd stage"]["thrust"]["nozzle expansion ratio"] = float(self.entry_nozzle12.get())
        p["2nd stage"]["thrust"]["nozzle exhaust pressure[Pa]"] = float(self.entry_nozzle22.get())
        p["2nd stage"]["aero"]["body diameter[m]"] = float(self.entry_body_dia2.get())
        p["2nd stage"]["aero"]["lift coefficient file exist"] = True if(self.lift_v2.get()==1) else False
        p["2nd stage"]["aero"]["lift coefficient file name"] = self.label_lift_file2["text"]
        p["2nd stage"]["aero"]["lift coefficient"] = float(self.entry_lift2.get())
        p["2nd stage"]["aero"]["drag coefficient file exist"] = True if(self.drag_v2.get()==1) else False
        p["2nd stage"]["aero"]["drag coefficient file name"] = self.label_drag_file2["text"]
        p["2nd stage"]["aero"]["drag coefficient"] = float(self.entry_drag2.get())
        p["2nd stage"]["attitude"]["file exist"] = True if(self.attitude_v2.get()==1) else False
        p["2nd stage"]["attitude"]["file name"] = self.label_attitude_file2["text"]
        p["2nd stage"]["attitude"]["initial azimuth[deg]"] = float(self.entry_attitude02.get())
        p["2nd stage"]["attitude"]["initial elevation[deg]"] = float(self.entry_attitude12.get())
        p["2nd stage"]["stage"]["following stage exist"] = True if(self.checkvar_stage2.get()==1) else False
        p["2nd stage"]["stage"]["separation time[s]"] = float(self.entry_stage12.get())

        p["3rd stage"]["mass initial[kg]"] = float(self.entry_mass_init3.get())
        p["3rd stage"]["thrust"]["Isp file exist"] = True if(self.Isp_v3.get()==1) else False
        p["3rd stage"]["thrust"]["Isp file name"] = self.label_Isp_file3["text"]
        p["3rd stage"]["thrust"]["Isp[s]"] = float(self.entry_Isp3.get())
        p["3rd stage"]["thrust"]["file exist"] = True if(self.thrust_v3.get()==1) else False
        p["3rd stage"]["thrust"]["file name"] = self.label_thrust_file3["text"]
        p["3rd stage"]["thrust"]["const thrust[N]"] = float(self.entry_thrust03.get())
        p["3rd stage"]["thrust"]["burn start time[s]"] = float(self.entry_thrust13.get())
        p["3rd stage"]["thrust"]["burn end time[s]"] = float(self.entry_thrust23.get())
        p["3rd stage"]["thrust"]["throat diameter[m]"] = float(self.entry_nozzle03.get())
        p["3rd stage"]["thrust"]["nozzle expansion ratio"] = float(self.entry_nozzle13.get())
        p["3rd stage"]["thrust"]["nozzle exhaust pressure[Pa]"] = float(self.entry_nozzle23.get())
        p["3rd stage"]["aero"]["body diameter[m]"] = float(self.entry_body_dia3.get())
        p["3rd stage"]["aero"]["lift coefficient file exist"] = True if(self.lift_v3.get()==1) else False
        p["3rd stage"]["aero"]["lift coefficient file name"] = self.label_lift_file3["text"]
        p["3rd stage"]["aero"]["lift coefficient"] = float(self.entry_lift3.get())
        p["3rd stage"]["aero"]["drag coefficient file exist"] = True if(self.drag_v3.get()==1) else False
        p["3rd stage"]["aero"]["drag coefficient file name"] = self.label_drag_file3["text"]
        p["3rd stage"]["aero"]["drag coefficient"] = float(self.entry_drag3.get())
        p["3rd stage"]["attitude"]["file exist"] = True if(self.attitude_v3.get()==1) else False
        p["3rd stage"]["attitude"]["file name"] = self.label_attitude_file3["text"]
        p["3rd stage"]["attitude"]["initial azimuth[deg]"] = float(self.entry_attitude03.get())
        p["3rd stage"]["attitude"]["initial elevation[deg]"] = float(self.entry_attitude13.get())
        p["3rd stage"]["stage"]["following stage exist"] = True if(self.checkvar_stage3.get()==1) else False
        p["3rd stage"]["stage"]["separation time[s]"] = float(self.entry_stage13.get())

        return p

    def save_json(self):
        """ button click "Save" """
        self.save_p = self.read_GUI_json()
        f = tkfd.asksaveasfile(mode='w', defaultextension=".json")
        if f is None: # asksaveasfile return `None` if dialog closed with "cancel".
            return
        json.dump(self.save_p, f, ensure_ascii=False, indent=4, sort_keys=True, separators=(',', ': '))
        self.label_file["text"] = os.path.basename(f.name)
        f.close() # `()` was missing.

    def output_script(self, script_file):
        """ button click "Plot", "HTML", "KML", "NMEA", "Extend" """
        if (self.label_file["text"] == ""):
            print("Please read json file before output button")
            return
        print(script_file)
        subprocess.run(["python", script_file, self.label_file["text"]])


if __name__ == '__main__':
    root = tk.Tk()
    app = Application(master=root)
    app.mainloop()
