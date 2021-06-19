import numpy as np
from numpy import sin, cos, sqrt, deg2rad, pi
import pandas as pd
import scipy.interpolate
import os
import sys
import subprocess
import json
import argparse
from collections import OrderedDict


# path to OpenTsiolkovsky
path_opentsio = os.getenv('PATH_OPENTSIO', "/usr/local/OpenTsiolkovsky/bin")

# import local modules
path_tools = os.path.join(path_opentsio, "../tools")
sys.path.append(path_tools)
from coordinate_transform import *

# functions
def calc_IIP(acc, ddtheta, t_stop, ang_dir, posLLH, velNED, dcmBODY2NED_, delta=0.0):
    # theta = 0.5 * ddtheta * t_stop**2
    (ssa, csa) = scipy.special.fresnel(sqrt(ddtheta / pi) * t_stop)
    dv_para = acc * sqrt(pi / ddtheta) * csa
    dv_vert = acc * sqrt(pi / ddtheta) * ssa
    dv_ax = dv_para * cos(delta) + dv_vert * sin(delta)
    dv_no = - dv_para * sin(delta) + dv_vert * cos(delta)

    vec_dir = np.array([0., -sin(deg2rad(ang_dir)), cos(deg2rad(ang_dir))])
    dv = np.array([dv_ax, 0., 0.]) + vec_dir * dv_no

    velNED_new = np.matmul(dcmBODY2NED_, dv) + velNED
    posLLH_impact = posLLH_IIP(posLLH, velNED_new)
    return posLLH_impact[:2]

# global difinitions
directions = [
    {"name": "head", "offset[deg]": 0.},
    {"name": "left", "offset[deg]": 90.},
    {"name": "tail", "offset[deg]": 180.},
    {"name":"right", "offset[deg]": 270.},
]
opentsio = os.path.join(path_opentsio, "OpenTsiolkovsky")


if __name__ == "__main__":
# read command-line arguments
    parser = argparse.ArgumentParser()
    parser.add_argument("filename.json", type=str)
    parser.add_argument("max_emst_time", type=float)                    # max emergency stop time[s]
    parser.add_argument("max_gimbal_angle", type=float)                 # max gimable angle [deg]
    parser.add_argument("-ts", "--time_step", type=float, default=1.0)  # timestep of output [s]
    parser.add_argument("-dts", "--dt_stop", type=float, default=0.05)  # calculation timestep of emergency stop time [s]
    args = parser.parse_args()
    filename_json = vars(args)["filename.json"]
    time_emst_max = args.max_emst_time
    gimbal_angle_max = args.max_gimbal_angle
    time_step = args.time_step
    dt_stop = args.dt_stop

# read nominal json file
    with open(filename_json) as f:
        nominal_json = json.load(f, object_pairs_hook=OrderedDict)

# import body specs
    filename_inertia = nominal_json["stage1"]["6DoF"]["moment of inertia file name(str)"]
    filename_cgxt = nominal_json["stage1"]["attitude neutrality(3DoF)"]["CG, Controller position file(str)"]
    df_inertia = pd.read_csv(filename_inertia, index_col=False)
    inertia_yy_at = scipy.interpolate.interp1d(df_inertia["time [s]"], df_inertia["inertia all at CG [kgm^2]"])
    df_cgxt = pd.read_csv(filename_cgxt, index_col=False)
    length_cg2cont = df_cgxt["Controller_pos_STA[m]"].values - df_cgxt["CG_pos_STA[m]"].values
    length_cg2cont_at = scipy.interpolate.interp1d(df_cgxt["time[s]"], length_cg2cont)

# make rocket dynamics CSV output for IIP calculation
    tmp_json = nominal_json.copy()
    tmp_json["name(str)"] += "_temp"
    if time_step is not None:
        tmp_json["calculate condition"]["time step for output[s]"] = time_step
    tmp_dir = "./_temp_"
    while os.path.exists(tmp_dir):
        tmp_dir += "_"
    os.mkdir(tmp_dir)
    exists_output_dir = os.path.exists("./output")
    if not exists_output_dir:
        os.mkdir("./output")
    filename_tmp = os.path.join(tmp_dir, "{}.json".format(tmp_json["name(str)"]))
    with open(filename_tmp, "w") as f:
        json.dump(tmp_json, f, indent=4)
    subprocess.run([opentsio, filename_tmp], stdout=subprocess.PIPE)
    filename_result = os.path.join("./output", "{}_dynamics_1.csv".format(tmp_json["name(str)"]))
    df_result = pd.read_csv(filename_result, index_col=False)
    df_pwd = df_result[df_result["is_powered(1=powered 0=free)"] == 1]

# IIP calculation with additional velocity
    array_out = []
    for index, se_pwd in df_pwd.iterrows():  # each break time
        t_break, mass, thrust = se_pwd[["time(s)", "mass(kg)", "thrust(N)"]].values

        posLLH = se_pwd[["lat(deg)", "lon(deg)", "altitude(m)"]].values
        velNED = se_pwd[["vel_NED_X(m/s)", "vel_NED_Y(m/s)", "vel_NED_Z(m/s)"]].values
        dcmBODY2ECI_ = se_pwd[["dcmBODY2ECI_{0}{1}".format(i, j) for i in range(1, 4) for j in range(1, 4)]].values
        dcmBODY2ECI_ = np.reshape(dcmBODY2ECI_, (3, 3))

        dcmECI2ECEF_ = dcmECI2ECEF(t_break)
        dcmECEF2NED_ = dcmECEF2NEDfromLLH(posLLH)
        dcmBODY2NED_ = np.matmul(dcmECEF2NED_, np.matmul(dcmECI2ECEF_, dcmBODY2ECI_))

        acc = thrust / mass
        ddtheta = thrust * sin(deg2rad(gimbal_angle_max)) * length_cg2cont_at(t_break) / inertia_yy_at(t_break)
        delta = deg2rad(gimbal_angle_max)

        time_stops = np.arange(dt_stop, time_emst_max + dt_stop, dt_stop)

        latlon_IIP_nominal = calc_IIP(acc, ddtheta, 0, 0, posLLH, velNED, dcmBODY2NED_, delta)
        latlon_IIP_distmax = np.full((len(directions), len(latlon_IIP_nominal)), latlon_IIP_nominal.copy())
        time_stop_distmax = np.zeros_like(directions)
        latlon_IIP_center = latlon_IIP_nominal.copy()

        latlon_IIPs = [[] for d in directions]
        for t_stop in time_stops:
            for i, d in enumerate(directions):
                ll = calc_IIP(acc, ddtheta, t_stop, d["offset[deg]"], posLLH, velNED, dcmBODY2NED_)
                latlon_IIPs[i].append(ll)

                if distance_surface(ll, latlon_IIP_center) > distance_surface(latlon_IIP_distmax[i], latlon_IIP_center):
                    latlon_IIP_distmax[i] = ll
                    time_stop_distmax[i] = t_stop
                    latlon_IIP_center = np.mean(latlon_IIP_distmax, axis=0)

        distance_max = max([distance_surface(ll, latlon_IIP_center) for ll in latlon_IIP_distmax])
        dlatlon_IIP_center = latlon_IIP_center - latlon_IIP_nominal
        dlatlon_IIP_distmax = latlon_IIP_distmax - latlon_IIP_nominal
        temp_array = [t_break] + list(latlon_IIP_nominal) + list(dlatlon_IIP_center) + [distance_max]
        [temp_array.extend([t] + list(ll)) for t, ll in zip(time_stop_distmax, dlatlon_IIP_distmax)]
        array_out.append(temp_array)

    cols = ["time(s)"] + ["lat(deg)", "lon(deg)"] + ["dlat_c(deg)", "dlon_c(deg)"] + ["radius(m)"]
    for d in directions:
        n0 = d["name"][0]
        cols.extend(["t_stop_{}(s)".format(n0), "dlat_{}(deg)".format(n0), "dlon_{}(deg)".format(n0)])
    df_out = pd.DataFrame(array_out, columns=cols)
    df_out.to_csv("output/{}_path_rotation.csv".format(nominal_json["name(str)"]), index=False)

    os.remove(filename_tmp)
    os.rmdir(tmp_dir)
