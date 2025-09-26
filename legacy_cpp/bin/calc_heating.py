# -*- coding: utf-8 -*-
#######
# Aerodynamic Heating for launch Vehicles
# Author : Susumu Tanaka, Takahiro Inagawa
'''
Calculate the object surface tempreture by aerodynamic heating at the time of reentry into the earth, ablation progression during ablation cooling.
Surface Temperature Model: The sum of the heat flux given from the flow and the re-radiation heat is equal to the surface temperature.
Ablation Model: Determine the ablation thickness so that the difference in surface temperature with respect to the set ablation temperature can be eliminaterd by vaporization heat.
Ref.
* 宇宙飛行体の熱気体力学
* Heat Transfer to Satellite Vehicles Re-entering the Atomosphere
* 超軌道速度飛行体の輻射加熱環境に関する研究
'''
import numpy as np
from scipy.integrate import odeint
import matplotlib.pyplot as plt
from scipy import interpolate
import sys
import json
import pandas as pd
# import environment as env

class NoseCone:
    def __init__(self):
        self.T_surface_init = 15.0 + 273.15  # [K] initial temperature
        self.R_nosetip = 0.2  # [m] blunt radius
        self.thickness = 0.005  # [m] thickness at stagnation point
        self.rho = 1270.0  # [kg/m^3] material density
        self.c = 1592.0  # [J/kg-K] specific heat
        self.epsilon = 0.8  # [-] surface emissivity

        self.T_ablation = 300.0 + 273.15  # [K] abation temperature
        self.h_vaporization = 9288.48 * 1000.0  # [J/kg] vaporization heat

class FlightHeating:
    '''
    Calculate aerodynamic heating and ablation cooling during flight from flight log file speed, altitude.
    '''
    def __init__(self, time_array, vel_array, altitude_array):
        self.time = time_array
        self.vel = vel_array
        self.altitude = altitude_array

    def heating(self, obj):
        obj = NoseCone()
        env = Environment()
        Re = 6371000  #[m] earth surface
        cp = 1006.0  # [J/kg-K] specific heat at pressure constant of air
        sigma = 5.669 * 10**(-8)  # Stefan-Boltzmann constant
        g0 = env.gravity(0.0)  # [m/s^2]

        vel_array = np.array([9.0, 9.25, 9.5, 9.75, 10.0, 10.25, 10.5, 10.75, 11.0, 11.5, 12.0, 12.5, 13.0, 13.5, 14.0, 14.5, 15.0, 15.5, 16.0])
        func_array = np.array([1.5, 4.3, 9.7, 18.5, 35.0, 55.0, 81.0, 115.0, 151.0, 238.0, 359.0, 495.0, 660.0, 850.0, 1065.0, 1313.0, 1550.0, 1780.0, 2040.0])
        radiative_vel_func = interpolate.interp1d(vel_array, func_array, bounds_error = False, fill_value = (func_array[0], func_array[-1]))

        rho_air = env.get_std_density(self.altitude)
        g = env.gravity(self.altitude)
        R = Re + self.altitude
        uc = np.sqrt(g0 * Re)
        # ref. Detra-Kemp-Riddell
        self.q_conv = 11030.0 / np.sqrt(obj.R_nosetip) * (rho_air / env.get_std_density(0.0))**0.5 * (np.abs(self.vel) / uc)**3.05 * 10**4  # [W/m^2]
        # ref. Tauber
        def exp_n(R_nose, vel, rho):
            def eq(R_nose, vel, rho):
                # input:[m, m/s, kg/m^3]
                n = 1.072 * 10.0**6 * np.abs(vel)**(-1.88) * rho**(-0.325)
                if R_nose <= 1.0:
                    return n
                elif R_nose >= 2.0:
                    return min(0.5, n)
                else:
                    return min(0.6, n)
            return np.array([eq(R_nose, v, rh) for v, rh in zip(vel, rho)])
        self.q_rad = 4.736 * 10**4 * obj.R_nosetip**exp_n(obj.R_nosetip, self.vel, rho_air) * rho_air**1.22 * radiative_vel_func(self.vel/1000.0) * 10**4  # [W/m^2]

        self.T_surface = np.zeros_like(self.time, dtype=float)
        self.T_surface[0] = obj.T_surface_init
        self.thickness = np.zeros_like(self.time, dtype=float)
        self.thickness[0] = obj.thickness
        """
        現在熱分布無しになっているが、これを少なくても１次元の非定常熱伝達方程式に変えないといけない
        """
        for i in range(1, len(self.time)):
            dt = self.time[i] - self.time[i-1]
            self.T_surface[i] = self.T_surface[i-1] + dt * (self.q_conv[i] + self.q_rad[i] - sigma * obj.epsilon * self.T_surface[i-1]**4) / (obj.c * obj.rho * obj.thickness)  # [K]
            if self.T_surface[i] < obj.T_ablation:
                self.thickness[i] = self.thickness[i-1]
            else:
                self.thickness[i] = self.thickness[i-1] - dt * (self.T_surface[i] - obj.T_ablation) * obj.c * self.thickness[i-1] / obj.h_vaporization  # [m]
                self.T_surface[i] = obj.T_ablation


class Environment:
    # ref. 1976 standard atmosphere
    # ジオポテンシャル高度を基準として標準大気の各層の気温減率から各大気値を算出
    # 高度86 kmまで対応
    def std_atmo(self, altitude):
        # altitude [m]
        R = 287.1
        gamma = 1.4
        Re = 6378.137e3 # Earth Radius [m]
        g0 = 9.80665

        # atmospheric layer
        height_list  = [0.0, 11.0e3, 20.0e3, 32.0e3, 47.0e3, 51.0e3, 71.0e3, 84.852e3] # geopotential height [m]
        temp_grad_list = [-6.5e-3, 0.0, 1.0e-3, 2.8e-3, 0, -2.8e-3, -2.0e-3, 0.0] # Temp. gradient [K/m]
        temp_list  = [288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65, 186.946] # [K]
        pressure_list  = [101325.0, 22632.0, 5474.9, 868.02, 110.91, 66.939, 3.9564, 0.3734] # [Pa]

        h = altitude * Re / (Re + altitude) # geometric altitude => geopotential height

        k = 0 # dafault layer
        for i in range(8):
            if h < height_list[i]:
                k = i - 1
                break
            elif h >= height_list[7]:
                k = 7
                break

        temperature = temp_list[k] + temp_grad_list[k] * (h - height_list[k]) # [K]
        if temp_grad_list[k] == 0.0:
            pressure = pressure_list[k] * np.exp(g0 / R * (height_list[k] - h) / temp_list[k])
        else:
            pressure = pressure_list[k] * np.power(temp_list[k] / temperature, g0 / R / temp_grad_list[k]) # [Pa]
        density = pressure / (R * temperature) # [kg/m^3]
        soundSpeed = np.sqrt(gamma * R * temperature) # [m/s]

        return temperature, pressure, density, soundSpeed

    def __get_std_atmo(self, altitude, index):
        return self.std_atmo(altitude)[index]

    def get_std_temp(self, altitude):
        if isinstance(altitude, float) or isinstance(altitude, int):
            return self.__get_std_atmo(altitude, 0)
        else:
            return np.array([self.__get_std_atmo(alt, 0) for alt in altitude])

    def get_std_press(self, altitude):
        if isinstance(altitude, float) or isinstance(altitude, int):
            return self.__get_std_atmo(altitude, 1)
        else:
            return np.array([self.__get_std_atmo(alt, 1) for alt in altitude])

    def get_std_density(self, altitude):
        if isinstance(altitude, float) or isinstance(altitude, int):
            return self.__get_std_atmo(altitude, 2)
        else:
            return np.array([self.__get_std_atmo(alt, 2) for alt in altitude])

    def get_std_soundspeed(self, altitude):
        if isinstance(altitude, float) or isinstance(altitude, int):
            return self.__get_std_atmo(altitude, 3)
        else:
            return np.array([self.__get_std_atmo(alt, 3) for alt in altitude])

    def gravity(self, altitude):
        # altitude [m]
        def eq(alt):
            Re = 6378.137e3 # Earth Radius [m]
            g0 = 9.80665
            gravity = g0 * (Re / (Re + altitude)) ** 2 # [m/s^2]
            return gravity
        if isinstance(altitude, float) or isinstance(altitude, int):
            return eq(altitude)
        else:
            return np.array([eq(alt) for alt in altitude])


if __name__ == '__main__':
    if (len(sys.argv) != 1):
        file_name = sys.argv[1]
    else:
        file_name = "param_sample.json"
    try:
        data = json.load(open(file_name))
        name = data["name"]
    except:
        print("JSON file can not be read...finish")
        sys.exit()

    csv_file = "output/" + name + "_dynamics_1st.csv"
    df = pd.read_csv(csv_file, index_col=False)
    time = df["time(s)"]
    vel = np.sqrt(df["vel_NED_X(m/s)"]**2 + df["vel_NED_Y(m/s)"]**2 + df["vel_NED_Z(m/s)"]**2)
    altitude = df["altitude(m)"]

    solver = FlightHeating(time, vel, altitude)
    obj = NoseCone()
    solver.heating(obj)
    result = np.c_[solver.time, solver.q_conv, solver.q_rad, solver.T_surface, solver.thickness]
    np.savetxt('heating_log.csv',result, delimiter=',')

    plt.ion()
    plt.close("all")

    plt.figure(0)
    plt.plot(solver.time, solver.q_conv/10**6, label='convection')
    plt.plot(solver.time, solver.q_rad/10**6, label='radiation')
    plt.xlabel('time [sec]')
    plt.ylabel('q_dot [MW/m2]')
    plt.title("heat flux at stagnation point")
    plt.legend()
    plt.xlim([0, 150])
    plt.ylim([0, 0.1])
    plt.grid()

    plt.figure(1)
    plt.plot(solver.time, solver.T_surface)
    plt.xlabel('time [sec]')
    plt.ylabel('T_surface [K]')
    plt.title("temperature at stagnation point surface")
    plt.xlim([0, 150])
    # plt.ylim([273, 400])
    plt.grid()

    plt.figure(2)
    plt.plot(solver.time, solver.thickness*1000.0)
    plt.xlabel('time [sec]')
    plt.ylabel('thickness [mm]')
    plt.title("thickness at stagnation point surface")
    plt.grid()
    plt.ylim(ymin=0)

    plt.show()
