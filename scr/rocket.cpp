//
//  rocket.cpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2015/11/28.
//  Copyright © 2015 Takahiro Inagawa. All rights reserved.
//

#include "rocket.hpp"
#include <iostream>
#include <cmath>
#include "../boost/numeric/odeint.hpp"
//#include <boost/array.hpp>
#include "../lib/picojson.h"
#include "air.hpp"
#include "gravity.hpp"
#include "fileio.hpp"
#include "Orbit.hpp"

using namespace std;

extern Vector3d posLLH_init_g;
extern Vector3d vel_NED_init_g;
extern Vector3d posECI_init_g;
extern Vector3d velECI_init_g;
extern bool separation_flag_12;
extern bool separation_flag_23;
extern double max_downrange;
extern double max_alt;
extern Vector2d impact_point; // LLH[deg]
extern bool impact_flag;


void flight_simulation(string input_filename, string output_filename,
                       Rocket::State state){
    bool is_control_stepper = true; // control stepperのバグが取れない　2016/06/18
    Rocket rocket(input_filename);
    rocket.state = state;
    rocket_dynamics System(rocket); // システム
    double start_time = 0;
    double separation_time = 10e100; // 分離時間
    double end_time = rocket.calc_end_time;
    double step_time = rocket.calc_step_time;
    double mass_init;
    if (rocket.state == Rocket::STAGE1){
        mass_init = rocket.mass_init_1st;
        posLLH_init_g << rocket.launch_pos_LLH[0], rocket.launch_pos_LLH[1], rocket.launch_pos_LLH[2];
        vel_NED_init_g << rocket.launch_vel_NED[0], rocket.launch_vel_NED[1], rocket.launch_vel_NED[2];
        posECI_init_g = posECI_init(posLLH_init_g);
        velECI_init_g = velECI_init(vel_NED_init_g, posLLH_init_g);
        start_time = rocket.calc_start_time;
        if (rocket.following_stage_exist_1st) {
            separation_time = rocket.stage_separation_time_1st;
        }
    } else if (rocket.state == Rocket::STAGE2){
        mass_init = rocket.mass_init_2nd;
        start_time = rocket.stage_separation_time_1st;
        if (rocket.following_stage_exist_2nd) {
            separation_time = rocket.stage_separation_time_2nd;
        }
    } else if (rocket.state == Rocket::STAGE3){
        mass_init = rocket.mass_init_3rd;
        start_time = rocket.stage_separation_time_2nd;
    }
    rocket_dynamics::state State = {mass_init,
        posECI_init_g[0], posECI_init_g[1], posECI_init_g[2],
        velECI_init_g[0], velECI_init_g[1], velECI_init_g[2]};
    if (is_control_stepper == true){ // 常微分方程式のStepperがcontrol stepperかどうかで場合わけ
//        controlの場合は、分離の時間によって時間を固定する
        using base_stepper_type = boost::numeric::odeint::runge_kutta_dopri5<rocket_dynamics::state>;
        auto Stepper = make_dense_output( 1.0e-9 , 1.0e-9 , base_stepper_type());
        if (separation_time < end_time) {
            csv_observer Observer0(rocket, output_filename, false);
            boost::numeric::odeint::integrate_const(Stepper, System, State,
                                                    start_time,
                                                    separation_time,
                                                    step_time,
                                                    std::ref(Observer0));
            csv_observer Observer1(rocket, output_filename, true);
            boost::numeric::odeint::integrate_const(Stepper, System, State,
                                                    separation_time,
                                                    end_time,
                                                    step_time,
                                                    std::ref(Observer1));
        } else {
            csv_observer Observer(rocket, output_filename, false);
            boost::numeric::odeint::integrate_const(Stepper, System, State,
                                                    start_time,
                                                    end_time,
                                                    step_time,
                                                    std::ref(Observer));
        }
    } else {
        boost::numeric::odeint::runge_kutta4<rocket_dynamics::state> Stepper;
        csv_observer Observer(rocket, output_filename);
        boost::numeric::odeint::integrate_adaptive(Stepper, System, State,
                                                   start_time,
                                                   end_time,
                                                   step_time,
                                                   std::ref(Observer));
    }
    return;
}

Rocket::Rocket(Rocket& obj){
//    コピーコンストラクタ
    name                        = obj.name;
    output_filename             = obj.output_filename;
    state                       = obj.state;
    calc_start_time             = obj.calc_start_time;
    calc_end_time               = obj.calc_end_time;
    calc_step_time              = obj.calc_step_time;
    mass_init_1st               = obj.mass_init_1st;
    mass_init_2nd               = obj.mass_init_2nd;
    mass_init_3rd               = obj.mass_init_3rd;
    Isp_file_exist_1st          = obj.Isp_file_exist_1st;
    Isp_file_exist_2nd          = obj.Isp_file_exist_2nd;
    Isp_file_exist_3rd          = obj.Isp_file_exist_3rd;
    Isp_file_name_1st           = obj.Isp_file_name_1st;
    Isp_file_name_2nd           = obj.Isp_file_name_2nd;
    Isp_file_name_3rd           = obj.Isp_file_name_3rd;
    Isp_mat_1st                 = obj.Isp_mat_1st;
    Isp_mat_2nd                 = obj.Isp_mat_2nd;
    Isp_mat_3rd                 = obj.Isp_mat_3rd;
    Isp_1st                     = obj.Isp_1st;
    Isp_2nd                     = obj.Isp_2nd;
    Isp_3rd                     = obj.Isp_3rd;
    thrust_file_exist_1st       = obj.thrust_file_exist_1st;
    thrust_file_exist_2nd       = obj.thrust_file_exist_2nd;
    thrust_file_exist_3rd       = obj.thrust_file_exist_3rd;
    thrust_file_name_1st        = obj.thrust_file_name_1st;
    thrust_file_name_2nd        = obj.thrust_file_name_2nd;
    thrust_file_name_3rd        = obj.thrust_file_name_3rd;
    thrust_mat_1st              = obj.thrust_mat_1st;
    thrust_mat_2nd              = obj.thrust_mat_2nd;
    thrust_mat_3rd              = obj.thrust_mat_3rd;
    thrust_1st                  = obj.thrust_1st;
    thrust_2nd                  = obj.thrust_2nd;
    thrust_3rd                  = obj.thrust_3rd;
    burn_start_time_1st         = obj.burn_start_time_1st;
    burn_start_time_2nd         = obj.burn_start_time_2nd;
    burn_start_time_3rd         = obj.burn_start_time_3rd;
    burn_end_time_1st           = obj.burn_end_time_1st;
    burn_end_time_2nd           = obj.burn_end_time_2nd;
    burn_end_time_3rd           = obj.burn_end_time_3rd;
    burn_time_1st               = obj.burn_time_1st;
    burn_time_2nd               = obj.burn_time_2nd;
    burn_time_3rd               = obj.burn_time_3rd;
    throat_diameter_1st         = obj.throat_diameter_1st;
    throat_diameter_2nd         = obj.throat_diameter_2nd;
    throat_diameter_3rd         = obj.throat_diameter_3rd;
    throat_area_1st             = obj.throat_area_1st;
    throat_area_2nd             = obj.throat_area_2nd;
    throat_area_3rd             = obj.throat_area_3rd;
    nozzle_expansion_ratio_1st  = obj.nozzle_expansion_ratio_1st;
    nozzle_expansion_ratio_2nd  = obj.nozzle_expansion_ratio_2nd;
    nozzle_expansion_ratio_3rd  = obj.nozzle_expansion_ratio_3rd;
    nozzle_exhaust_pressure_1st = obj.nozzle_exhaust_pressure_1st;
    nozzle_exhaust_pressure_2nd = obj.nozzle_exhaust_pressure_2nd;
    nozzle_exhaust_pressure_3rd = obj.nozzle_exhaust_pressure_3rd;
    body_diameter_1st           = obj.body_diameter_1st;
    body_diameter_2nd           = obj.body_diameter_2nd;
    body_diameter_3rd           = obj.body_diameter_3rd;
    body_area_1st               = obj.body_area_1st;
    body_area_2nd               = obj.body_area_2nd;
    body_area_3rd               = obj.body_area_3rd;
    CL_file_exist_1st           = obj.CL_file_exist_1st;
    CL_file_exist_2nd           = obj.CL_file_exist_2nd;
    CL_file_exist_3rd           = obj.CL_file_exist_3rd;
    CL_file_name_1st            = obj.CL_file_name_1st;
    CL_file_name_2nd            = obj.CL_file_name_2nd;
    CL_file_name_3rd            = obj.CL_file_name_3rd;
    CL_mat_1st                  = obj.CL_mat_1st;
    CL_mat_2nd                  = obj.CL_mat_2nd;
    CL_mat_3rd                  = obj.CL_mat_3rd;
    CLa_1st                     = obj.CLa_1st;
    CLa_2nd                     = obj.CLa_2nd;
    CLa_3rd                     = obj.CLa_3rd;
    CL_1st                      = obj.CL_1st;
    CL_2nd                      = obj.CL_2nd;
    CL_3rd                      = obj.CL_3rd;
    CD_file_exist_1st           = obj.CD_file_exist_1st;
    CD_file_exist_2nd           = obj.CD_file_exist_2nd;
    CD_file_exist_3rd           = obj.CD_file_exist_3rd;
    CD_file_name_1st            = obj.CD_file_name_1st;
    CD_file_name_2nd            = obj.CD_file_name_2nd;
    CD_file_name_3rd            = obj.CD_file_name_3rd;
    CD_mat_1st                  = obj.CD_mat_1st;
    CD_mat_2nd                  = obj.CD_mat_2nd;
    CD_mat_3rd                  = obj.CD_mat_3rd;
    CD_1st                      = obj.CD_1st;
    CD_2nd                      = obj.CD_2nd;
    CD_3rd                      = obj.CD_3rd;
    attitude_file_exist_1st     = obj.attitude_file_exist_1st;
    attitude_file_exist_2nd     = obj.attitude_file_exist_2nd;
    attitude_file_exist_3rd     = obj.attitude_file_exist_3rd;
    attitude_file_name_1st      = obj.attitude_file_name_1st;
    attitude_file_name_2nd      = obj.attitude_file_name_2nd;
    attitude_file_name_3rd      = obj.attitude_file_name_3rd;
    attitude_mat_1st            = obj.attitude_mat_1st;
    attitude_mat_2nd            = obj.attitude_mat_2nd;
    attitude_mat_3rd            = obj.attitude_mat_3rd;
    attitude_azimth_1st         = obj.attitude_azimth_1st;
    attitude_azimth_2nd         = obj.attitude_azimth_2nd;
    attitude_azimth_3rd         = obj.attitude_azimth_3rd;
    attitude_elevation_1st      = obj.attitude_elevation_1st;
    attitude_elevation_2nd      = obj.attitude_elevation_2nd;
    attitude_elevation_3rd      = obj.attitude_elevation_3rd;
    following_stage_exist_1st   = obj.following_stage_exist_1st;
    following_stage_exist_2nd   = obj.following_stage_exist_2nd;
    following_stage_exist_3rd   = obj.following_stage_exist_3rd;
    stage_separation_time_1st   = obj.stage_separation_time_1st;
    stage_separation_time_2nd   = obj.stage_separation_time_2nd;
    stage_separation_time_3rd   = obj.stage_separation_time_3rd;
    parachute_exist             = obj.parachute_exist;
    parachute_CD                = obj.parachute_CD;
    parachute_diameter          = obj.parachute_diameter;
    parachute_deploy_time       = obj.parachute_deploy_time;
    parachute_area              = obj.parachute_area;
    launch_pos_LLH              = obj.launch_pos_LLH;
    launch_pos_ECEF             = obj.launch_pos_ECEF;
    launch_vel_ECEF             = obj.launch_vel_ECEF;
    launch_vel_NED              = obj.launch_vel_NED;
    wind_file_exist             = obj.wind_file_exist;
    wind_file_name              = obj.wind_file_name;
    wind_const                  = obj.wind_const;
    wind_mat                    = obj.wind_mat;
}

// コンストラクタ
Rocket::Rocket(const std::string& FileName): fin(FileName){
    if( !fin ) {
        cout << "Error:Input data file not found" << endl;
        return;
    }

    picojson::value v;
    fin >> v;
    if (std::cin.fail()) {
        std::cerr << picojson::get_last_error() << std::endl;
    }
    picojson::object& o = v.get<picojson::object>();
    picojson::object& o_calc         = o["calculate condition"].get<picojson::object>();
    picojson::object& o_1st          = o["1st stage"].get<picojson::object>();
    picojson::object& o_1st_thrust   = o_1st["thrust"].get<picojson::object>();
    picojson::object& o_1st_aero     = o_1st["aero"].get<picojson::object>();
    picojson::object& o_1st_attitude = o_1st["attitude"].get<picojson::object>();
    picojson::object& o_1st_stage    = o_1st["stage"].get<picojson::object>();
    picojson::object& o_2nd          = o["2nd stage"].get<picojson::object>();
    picojson::object& o_2nd_thrust   = o_2nd["thrust"].get<picojson::object>();
    picojson::object& o_2nd_aero     = o_2nd["aero"].get<picojson::object>();
    picojson::object& o_2nd_attitude = o_2nd["attitude"].get<picojson::object>();
    picojson::object& o_2nd_stage    = o_2nd["stage"].get<picojson::object>();
    picojson::object& o_3rd          = o["3rd stage"].get<picojson::object>();
    picojson::object& o_3rd_thrust   = o_3rd["thrust"].get<picojson::object>();
    picojson::object& o_3rd_aero     = o_3rd["aero"].get<picojson::object>();
    picojson::object& o_3rd_attitude = o_3rd["attitude"].get<picojson::object>();
    picojson::object& o_3rd_stage    = o_3rd["stage"].get<picojson::object>();
    picojson::object& o_launch       = o["launch"].get<picojson::object>();
    picojson::object& o_parachute    = o["parachute"].get<picojson::object>();
    picojson::object& o_wind         = o["wind"].get<picojson::object>();

    name = o["name"].get<string>();
    output_filename = o["output file name"].get<string>();
    state = Rocket::GROUND;
    calc_start_time = o_calc["start time[s]"].get<double>();
    calc_end_time = o_calc["end time[s]"].get<double>();
    calc_step_time = o_calc["time step[s]"].get<double>();
//    ====1st stage====
    mass_init_1st = o_1st["mass initial[kg]"].get<double>();
    if (! o_1st_thrust["Isp file exist"].is<picojson::null>() ){
        Isp_file_exist_1st = o_1st_thrust["Isp file exist"].get<bool>();
    }
    if (! o_1st_thrust["Isp file name"].is<picojson::null>() ){
        Isp_file_name_1st = o_1st_thrust["Isp file name"].get<string>();
    }
    Isp_1st = o_1st_thrust["Isp[s]"].get<double>();
    thrust_file_exist_1st = o_1st_thrust["file exist"].get<bool>();
    thrust_file_name_1st = o_1st_thrust["file name"].get<string>();
    thrust_1st = o_1st_thrust["const thrust[N]"].get<double>();
    burn_start_time_1st = o_1st_thrust["burn start time[s]"].get<double>();
    burn_end_time_1st = o_1st_thrust["burn end time[s]"].get<double>();
    throat_diameter_1st = o_1st_thrust["throat diameter[m]"].get<double>();
    nozzle_expansion_ratio_1st = o_1st_thrust["nozzle expansion ratio"].get<double>();
    nozzle_exhaust_pressure_1st = o_1st_thrust["nozzle exhaust pressure[Pa]"].get<double>();
    body_diameter_1st = o_1st_aero["body diameter[m]"].get<double>();
    CL_file_exist_1st = o_1st_aero["lift coefficient file exist"].get<bool>();
    CL_file_name_1st = o_1st_aero["lift coefficient file name"].get<string>();
    CL_1st = o_1st_aero["lift coefficient"].get<double>();
    CD_file_exist_1st = o_1st_aero["drag coefficient file exist"].get<bool>();
    CD_file_name_1st = o_1st_aero["drag coefficient file name"].get<string>();
    CD_1st = o_1st_aero["drag coefficient"].get<double>();
    attitude_file_exist_1st = o_1st_attitude["file exist"].get<bool>();
    attitude_file_name_1st = o_1st_attitude["file name"].get<string>();
    attitude_elevation_1st = o_1st_attitude["initial elevation[deg]"].get<double>();
    attitude_azimth_1st = o_1st_attitude["initial azimth[deg]"].get<double>();
    following_stage_exist_1st = o_1st_stage["following stage exist"].get<bool>();
    if (following_stage_exist_1st){ //分離しないなら分離時間を大きな数にする
        stage_separation_time_1st = o_1st_stage["separation time[s]"].get<double>();
    }else{
        stage_separation_time_1st = 1.0e100; //取り敢えず大きな数
    }
//    ====2nd stage====
    mass_init_2nd = o_2nd["mass initial[kg]"].get<double>();
    if (! o_2nd_thrust["Isp file exist"].is<picojson::null>() ){
        Isp_file_exist_2nd = o_2nd_thrust["Isp file exist"].get<bool>();
    }
    if (! o_2nd_thrust["Isp file name"].is<picojson::null>() ){
        Isp_file_name_2nd = o_2nd_thrust["Isp file name"].get<string>();
    }
    Isp_2nd = o_2nd_thrust["Isp[s]"].get<double>();
    thrust_file_exist_2nd = o_2nd_thrust["file exist"].get<bool>();
    thrust_file_name_2nd = o_2nd_thrust["file name"].get<string>();
    thrust_2nd = o_2nd_thrust["const thrust[N]"].get<double>();
    burn_start_time_2nd = o_2nd_thrust["burn start time[s]"].get<double>();
    burn_end_time_2nd = o_2nd_thrust["burn end time[s]"].get<double>();
    throat_diameter_2nd = o_2nd_thrust["throat diameter[m]"].get<double>();
    nozzle_expansion_ratio_2nd = o_2nd_thrust["nozzle expansion ratio"].get<double>();
    nozzle_exhaust_pressure_2nd = o_2nd_thrust["nozzle exhaust pressure[Pa]"].get<double>();
    body_diameter_2nd = o_2nd_aero["body diameter[m]"].get<double>();
    CL_file_exist_2nd = o_2nd_aero["lift coefficient file exist"].get<bool>();
    CL_file_name_2nd = o_2nd_aero["lift coefficient file name"].get<string>();
    CL_2nd = o_2nd_aero["lift coefficient"].get<double>();
    CD_file_exist_2nd = o_2nd_aero["drag coefficient file exist"].get<bool>();
    CD_file_name_2nd = o_2nd_aero["drag coefficient file name"].get<string>();
    CD_2nd = o_2nd_aero["drag coefficient"].get<double>();
    attitude_file_exist_2nd = o_2nd_attitude["file exist"].get<bool>();
    attitude_file_name_2nd = o_2nd_attitude["file name"].get<string>();
    attitude_elevation_2nd = o_2nd_attitude["initial elevation[deg]"].get<double>();
    attitude_azimth_2nd = o_2nd_attitude["initial azimth[deg]"].get<double>();
    following_stage_exist_2nd = o_2nd_stage["following stage exist"].get<bool>();
    if (following_stage_exist_2nd){ //分離しないなら分離時間を大きな数にする
        stage_separation_time_2nd = o_2nd_stage["separation time[s]"].get<double>();
    }else{
        stage_separation_time_2nd = 1.0e100; //取り敢えず大きな数
    }
//    ====3rd stage====
    mass_init_3rd = o_3rd["mass initial[kg]"].get<double>();
    if (! o_3rd_thrust["Isp file exist"].is<picojson::null>() ){
        Isp_file_exist_3rd = o_3rd_thrust["Isp file exist"].get<bool>();
    }
    if (! o_3rd_thrust["Isp file name"].is<picojson::null>() ){
        Isp_file_name_3rd = o_3rd_thrust["Isp file name"].get<string>();
    }
    Isp_3rd = o_3rd_thrust["Isp[s]"].get<double>();
    thrust_file_exist_3rd = o_3rd_thrust["file exist"].get<bool>();
    thrust_file_name_3rd = o_3rd_thrust["file name"].get<string>();
    thrust_3rd = o_3rd_thrust["const thrust[N]"].get<double>();
    burn_start_time_3rd = o_3rd_thrust["burn start time[s]"].get<double>();
    burn_end_time_3rd = o_3rd_thrust["burn end time[s]"].get<double>();
    throat_diameter_3rd = o_3rd_thrust["throat diameter[m]"].get<double>();
    nozzle_expansion_ratio_3rd = o_3rd_thrust["nozzle expansion ratio"].get<double>();
    nozzle_exhaust_pressure_3rd = o_3rd_thrust["nozzle exhaust pressure[Pa]"].get<double>();
    body_diameter_3rd = o_3rd_aero["body diameter[m]"].get<double>();
    CL_file_exist_3rd = o_3rd_aero["lift coefficient file exist"].get<bool>();
    CL_file_name_3rd = o_3rd_aero["lift coefficient file name"].get<string>();
    CL_3rd = o_3rd_aero["lift coefficient"].get<double>();
    CD_file_exist_3rd = o_3rd_aero["drag coefficient file exist"].get<bool>();
    CD_file_name_3rd = o_3rd_aero["drag coefficient file name"].get<string>();
    CD_3rd = o_3rd_aero["drag coefficient"].get<double>();
    attitude_file_exist_3rd = o_3rd_attitude["file exist"].get<bool>();
    attitude_file_name_3rd = o_3rd_attitude["file name"].get<string>();
    attitude_elevation_3rd = o_3rd_attitude["initial elevation[deg]"].get<double>();
    attitude_azimth_3rd = o_3rd_attitude["initial azimth[deg]"].get<double>();
    following_stage_exist_3rd = o_3rd_stage["following stage exist"].get<bool>();
    if (following_stage_exist_3rd){ //分離しないなら分離時間を大きな数にする
        stage_separation_time_3rd = o_3rd_stage["separation time[s]"].get<double>();
    }else{
        stage_separation_time_3rd = 1.0e100; //取り敢えず大きな数
    }
    //    ====others====
    picojson::array& array_pos = o_launch["position LLH[deg,deg,m]"].get<picojson::array>();
    launch_pos_LLH[0] = array_pos[0].get<double>();
    launch_pos_LLH[1] = array_pos[1].get<double>();
    launch_pos_LLH[2] = array_pos[2].get<double>();
    picojson::array& array_vel = o_launch["velocity NED[m/s]"].get<picojson::array>();
    launch_vel_NED[0] = array_vel[0].get<double>();
    launch_vel_NED[1] = array_vel[1].get<double>();
    launch_vel_NED[2] = array_vel[2].get<double>();
    parachute_exist = o_parachute["exist"].get<bool>();
    parachute_CD = o_parachute["drag coefficient"].get<double>();
    parachute_diameter = o_parachute["diameter"].get<double>();
    parachute_deploy_time = o_parachute["deploy time"].get<double>();
    
    wind_file_exist = o_wind["file exist"].get<bool>();
    wind_file_name = o_wind["file name"].get<string>();
    picojson::array& array_wind_const = o_wind["const wind"].get<picojson::array>();
    wind_const[0] = array_wind_const[0].get<double>();
    wind_const[1] = array_wind_const[1].get<double>();

    body_area_1st = body_diameter_1st * body_diameter_1st * pi / 4.0;
    body_area_2nd = body_diameter_2nd * body_diameter_2nd * pi / 4.0;
    body_area_3rd = body_diameter_3rd * body_diameter_3rd * pi / 4.0;
    burn_time_1st = burn_end_time_1st - burn_start_time_1st;
    burn_time_2nd = burn_end_time_2nd - burn_start_time_2nd;
    burn_time_3rd = burn_end_time_3rd - burn_start_time_3rd;
    throat_area_1st = throat_diameter_1st * throat_diameter_1st * pi / 4.0;
    throat_area_2nd = throat_diameter_2nd * throat_diameter_2nd * pi / 4.0;
    throat_area_3rd = throat_diameter_3rd * throat_diameter_3rd * pi / 4.0;
    
//    ファイル読み込み
//    thrust(time,thrust), CL(mach,CL), CD(mach,CD), attitude(time, azimth, elevation)
    if (Isp_file_exist_1st) {
        Isp_mat_1st = read_csv_vector_2d("./" + Isp_file_name_1st, "time", "Isp");
    }
    if (Isp_file_exist_2nd) {
        Isp_mat_2nd = read_csv_vector_2d("./" + Isp_file_name_2nd, "time", "Isp");
    }
    if (Isp_file_exist_3rd) {
        Isp_mat_3rd = read_csv_vector_2d("./" + Isp_file_name_3rd, "time", "Isp");
    }
    if (thrust_file_exist_1st) {
        thrust_mat_1st = read_csv_vector_3d("./" + thrust_file_name_1st,
                                            "time", "thrust", "nozzle_exhaust_pressure[Pa]"); // TODO:例外を入れる
    }
    if (thrust_file_exist_2nd) {
        thrust_mat_2nd = read_csv_vector_3d("./" + thrust_file_name_2nd,
                                            "time", "thrust", "nozzle_exhaust_pressure[Pa]");
    }
    if (thrust_file_exist_3rd) {
        thrust_mat_3rd = read_csv_vector_3d("./" + thrust_file_name_3rd,
                                            "time", "thrust", "nozzle_exhaust_pressure[Pa]");
    }
    if (CL_file_exist_1st) {
        CL_mat_1st = read_csv_vector_2d("./" + CL_file_name_1st, "mach", "CL");
    }
    if (CL_file_exist_2nd) {
        CL_mat_2nd = read_csv_vector_2d("./" + CL_file_name_2nd, "mach", "CL");
    }
    if (CL_file_exist_3rd) {
        CL_mat_3rd = read_csv_vector_2d("./" + CL_file_name_3rd, "mach", "CL");
    }
    if (CD_file_exist_1st) {
        CD_mat_1st = read_csv_vector_2d("./" + CD_file_name_1st, "mach", "Cd");
    }
    if (CD_file_exist_2nd) {
        CD_mat_2nd = read_csv_vector_2d("./" + CD_file_name_2nd, "mach", "Cd");
    }
    if (CD_file_exist_3rd) {
        CD_mat_3rd = read_csv_vector_2d("./" + CD_file_name_3rd, "mach", "Cd");
    }
    if (attitude_file_exist_1st) {
        attitude_mat_1st = read_csv_vector_3d("./" + attitude_file_name_1st, "time", "azimth", "elevation");
    }
    if (attitude_file_exist_2nd) {
        attitude_mat_2nd = read_csv_vector_3d("./" + attitude_file_name_2nd, "time", "azimth", "elevation");
    }
    if (attitude_file_exist_3rd) {
        attitude_mat_3rd = read_csv_vector_3d("./" + attitude_file_name_3rd, "time", "azimth", "elevation");
    }
    if (wind_file_exist) {
        wind_mat = read_csv_vector_3d("./" + wind_file_name, "altitude", "wind_speed", "direction");
    }
    return;
}

void set_rocket_state(Rocket& rocket, double time, double altitude){
    //    時間によってState変化とrocketインスタンスの値を変更する
    //    enum State{GROUND = 0, STAGE1 = 1, STAGE2 = 2,
    //               STAGE3 = 3, PAYLOAD = 4, PARACHUTE = 5;}
    //    time[s],altitude[m]
    double g0 = 9.80665;
    Air air, air_ground;
    air = air.altitude(altitude);
    air_ground = air.altitude(rocket.launch_pos_LLH[2]); // paramファイルのファイルのthrustはランチパッドの標高推力であることが前提
    switch (rocket.state) {
        case Rocket::STAGE1:
            //  推力はファイルがある場合はMatrixから補間して読み込み、ない場合は一定値を燃焼時間分だけ
            if (rocket.Isp_file_exist_1st){
                rocket.Isp_1st = interp_matrix(time, rocket.Isp_mat_1st);
            }
            if (rocket.thrust_file_exist_1st){
                rocket.thrust = interp_matrix(time, rocket.thrust_mat_1st);
                if (rocket.thrust != 0) {
                    rocket.m_dot = rocket.thrust / rocket.Isp_1st / g0;
                    rocket.nozzle_exhaust_pressure_1st = interp_matrix(time, rocket.thrust_mat_1st, 2);
                    rocket.thrust = rocket.thrust + rocket.throat_area_1st *
                                    rocket.nozzle_expansion_ratio_1st *
                                    (air_ground.pressure - air.pressure);
                    if (rocket.m_dot > 0.0001) {
                        rocket.Isp = rocket.thrust / rocket.m_dot / g0;
                    } else {
                        rocket.Isp = 0.0;
                    }
                    rocket.is_aerodynamically_stable = false;
                } else {
                    rocket.thrust = 0.0;
                    rocket.m_dot = 0.0;
                    rocket.Isp = 0.0;
                    rocket.is_aerodynamically_stable = true;
                }
            } else {
                if(time > rocket.burn_start_time_1st &&
                   time < rocket.burn_time_1st){
                    rocket.thrust = rocket.thrust_1st + rocket.throat_area_1st *
                                    rocket.nozzle_expansion_ratio_1st *
                                    (air_ground.pressure - air.pressure);
                    rocket.m_dot = rocket.thrust_1st / rocket.Isp_1st / g0;
                    rocket.Isp = rocket.thrust / rocket.m_dot / g0;
                    rocket.is_aerodynamically_stable = false;
                } else {
                    rocket.thrust = 0.0;
                    rocket.m_dot = 0.0;
                    rocket.Isp = 0.0;
                    rocket.is_aerodynamically_stable = true;
                }
            }
//            rocket.Isp = rocket.Isp_1st;
//            rocket.m_dot = rocket.thrust / rocket.Isp_1st / g0;
            //            CL,CD値はファイルがある場合は読み込み
//            if (rocket.CD_file_exist_1st) {
//                rocket.CD = interp_matrix(mach_number, rocket.CD_mat_1st);
//            } else {
//                rocket.CD = rocket.CD_1st;
//            }
//            if (rocket.CL_file_exist_1st) {
//                rocket.CL = interp_matrix(mach_number, rocket.CL_mat_1st);
//            } else {
//                rocket.CL = rocket.CL_1st;
//            }
            if (rocket.attitude_file_exist_1st) {
                rocket.azimth = deg2rad(interp_matrix(time, rocket.attitude_mat_1st, 1));
                rocket.elevation = deg2rad(interp_matrix(time, rocket.attitude_mat_1st, 2));
            } else {
                rocket.azimth = deg2rad(rocket.attitude_azimth_1st);
                rocket.elevation = deg2rad(rocket.attitude_elevation_1st);
            }
            rocket.area = rocket.body_area_1st;
            break;
        case Rocket::STAGE2:
            if (rocket.Isp_file_exist_2nd){
                rocket.Isp_2nd = interp_matrix(time, rocket.Isp_mat_2nd);
            }
            if (rocket.thrust_file_exist_2nd){
                rocket.thrust = interp_matrix(time - rocket.stage_separation_time_1st, rocket.thrust_mat_2nd);
                if (rocket.thrust != 0) {
                    rocket.m_dot = rocket.thrust / rocket.Isp_2nd / g0;
                    rocket.nozzle_exhaust_pressure_2nd = interp_matrix(time, rocket.thrust_mat_2nd, 2);
                    rocket.thrust = rocket.thrust + rocket.throat_area_2nd *
                    rocket.nozzle_expansion_ratio_2nd *
                    (rocket.nozzle_exhaust_pressure_2nd  - air.pressure); // TODO: 2段以降は推力取得時の周囲大気圧を入力するようにする
                    if (rocket.m_dot > 0.0001) {
                        rocket.Isp = rocket.thrust / rocket.m_dot / g0;
                    } else {
                        rocket.Isp = 0.0;
                    }
                    rocket.is_aerodynamically_stable = false;
                } else {
                    rocket.thrust = 0.0;
                    rocket.m_dot = 0.0;
                    rocket.Isp = 0.0;
                    rocket.is_aerodynamically_stable = true;
                }
            } else {
                if(time > rocket.stage_separation_time_1st + rocket.burn_start_time_2nd &&
                   time < rocket.stage_separation_time_1st + rocket.burn_start_time_2nd + rocket.burn_time_2nd){
                    rocket.thrust = rocket.thrust_2nd + rocket.throat_area_2nd *
                                    rocket.nozzle_expansion_ratio_2nd *
                                    (rocket.nozzle_exhaust_pressure_2nd  - air.pressure); // TODO: 2段以降は推力取得時の周囲大気圧を入力するようにする
                    rocket.m_dot = rocket.thrust_2nd / rocket.Isp_2nd / g0;
                    rocket.Isp = rocket.thrust / rocket.m_dot / g0;
                    rocket.is_aerodynamically_stable = false;
                } else {
                    rocket.thrust = 0.0;
                    rocket.m_dot = 0.0;
                    rocket.Isp = 0.0;
                    rocket.is_aerodynamically_stable = true;
                }
            }
//            rocket.Isp = rocket.Isp_2nd;
//            rocket.m_dot = rocket.thrust / rocket.Isp_2nd / g0;
//            if (rocket.CD_file_exist_2nd) {
//                rocket.CD = interp_matrix(mach_number, rocket.CD_mat_2nd);
//            } else {
//                rocket.CD = rocket.CD_2nd;
//            }
//            if (rocket.CL_file_exist_2nd) {
//                rocket.CL = interp_matrix(mach_number, rocket.CL_mat_2nd);
//            } else {
//                rocket.CL = rocket.CL_2nd;
//            }
            if (rocket.attitude_file_exist_2nd) {
                rocket.azimth = deg2rad(interp_matrix(time - rocket.stage_separation_time_1st, rocket.attitude_mat_2nd, 1));
                rocket.elevation = deg2rad(interp_matrix(time - rocket.stage_separation_time_1st, rocket.attitude_mat_2nd, 2));
            } else {
                rocket.azimth = deg2rad(rocket.attitude_azimth_2nd);
                rocket.elevation = deg2rad(rocket.attitude_elevation_2nd);
            }
            rocket.area = rocket.body_area_2nd;
            break;
        case Rocket::STAGE3:
            if (rocket.Isp_file_exist_3rd){
                rocket.Isp_3rd = interp_matrix(time, rocket.Isp_mat_3rd);
            }
            if (rocket.thrust_file_exist_3rd){
                rocket.thrust = interp_matrix(time - rocket.stage_separation_time_2nd, rocket.thrust_mat_3rd);
                if (rocket.thrust != 0) {
                    rocket.m_dot = rocket.thrust / rocket.Isp_3rd / g0;
                    rocket.nozzle_exhaust_pressure_3rd = interp_matrix(time, rocket.thrust_mat_3rd, 2);
                    rocket.thrust = rocket.thrust + rocket.throat_area_3rd *
                    rocket.nozzle_expansion_ratio_3rd *
                    (rocket.nozzle_exhaust_pressure_3rd - air.pressure); // TODO: 2段以降は推力取得時の周囲大気圧を入力するようにする
                    if (rocket.m_dot > 0.0001) {
                        rocket.Isp = rocket.thrust / rocket.m_dot / g0;
                    } else {
                        rocket.Isp = 0.0;
                    }
                    rocket.is_aerodynamically_stable = false;
                } else {
                    rocket.thrust = 0.0;
                    rocket.m_dot = 0.0;
                    rocket.Isp = 0.0;
                    rocket.is_aerodynamically_stable = true;
                }
            } else {
                if(time > rocket.stage_separation_time_2nd + rocket.burn_start_time_3rd &&
                   time < rocket.stage_separation_time_2nd + rocket.burn_start_time_3rd + rocket.burn_time_3rd){
                    rocket.thrust = rocket.thrust_3rd + rocket.throat_area_3rd *
                                    rocket.nozzle_expansion_ratio_3rd *
                                    (rocket.nozzle_exhaust_pressure_3rd - air.pressure); // TODO: 2段以降は推力取得時の周囲大気圧を入力するようにする
                    rocket.m_dot = rocket.thrust_3rd / rocket.Isp_3rd / g0;
                    rocket.Isp = rocket.thrust / rocket.m_dot / g0;
                    rocket.is_aerodynamically_stable = false;
                } else {
                    rocket.thrust = 0.0;
                    rocket.m_dot = 0.0;
                    rocket.Isp = 0.0;
                    rocket.is_aerodynamically_stable = true;
                }
            }
//            rocket.Isp = rocket.Isp_3rd;
//            rocket.m_dot = rocket.thrust / rocket.Isp_3rd / g0;
//            if (rocket.CD_file_exist_3rd) {
//                rocket.CD = interp_matrix(mach_number, rocket.CD_mat_3rd);
//            } else {
//                rocket.CD = rocket.CD_3rd;
//            }
//            if (rocket.CL_file_exist_3rd) {
//                rocket.CL = interp_matrix(mach_number, rocket.CL_mat_3rd);
//            } else {
//                rocket.CL = rocket.CL_3rd;
//            }
            if (rocket.attitude_file_exist_3rd) {
                rocket.azimth = deg2rad(interp_matrix(time - rocket.stage_separation_time_2nd, rocket.attitude_mat_3rd, 1));
                rocket.elevation = deg2rad(interp_matrix(time - rocket.stage_separation_time_2nd, rocket.attitude_mat_3rd, 2));
            } else {
                rocket.azimth = deg2rad(rocket.attitude_azimth_3rd);
                rocket.elevation = deg2rad(rocket.attitude_elevation_3rd);
            }
            rocket.area = rocket.body_area_3rd;
            break;
        default:
            break;
    }
    if (rocket.wind_file_exist) {
        rocket.wind_speed = interp_matrix(altitude, rocket.wind_mat, 1);
        rocket.wind_direction = interp_matrix(altitude, rocket.wind_mat, 2);
    } else {
        rocket.wind_speed = rocket.wind_const[0];
        rocket.wind_direction = rocket.wind_const[1];
    }
}

void set_rocket_state_aero(Rocket& rocket, double mach_number){
    //    時間によってState変化とrocketインスタンスの値を変更する
    //    enum State{GROUND = 0, STAGE1 = 1, STAGE2 = 2,
    //               STAGE3 = 3, PAYLOAD = 4, PARACHUTE = 5;}
    switch (rocket.state) {
        case Rocket::STAGE1:
            if (rocket.CD_file_exist_1st) {
                rocket.CD = interp_matrix(mach_number, rocket.CD_mat_1st);
            } else {
                rocket.CD = rocket.CD_1st;
            }
            if (rocket.CL_file_exist_1st) {
                rocket.CL = interp_matrix(mach_number, rocket.CL_mat_1st);
            } else {
                rocket.CL = rocket.CL_1st;
            }
            break;
        case Rocket::STAGE2:

            if (rocket.CD_file_exist_2nd) {
                rocket.CD = interp_matrix(mach_number, rocket.CD_mat_2nd);
            } else {
                rocket.CD = rocket.CD_2nd;
            }
            if (rocket.CL_file_exist_2nd) {
                rocket.CL = interp_matrix(mach_number, rocket.CL_mat_2nd);
            } else {
                rocket.CL = rocket.CL_2nd;
            }
            break;
        case Rocket::STAGE3:
            if (rocket.CD_file_exist_3rd) {
                rocket.CD = interp_matrix(mach_number, rocket.CD_mat_3rd);
            } else {
                rocket.CD = rocket.CD_3rd;
            }
            if (rocket.CL_file_exist_3rd) {
                rocket.CL = interp_matrix(mach_number, rocket.CL_mat_3rd);
            } else {
                rocket.CL = rocket.CL_3rd;
            }
            break;
        default:
            break;
    }
}

void rocket_dynamics::operator()(const rocket_dynamics::state& x, rocket_dynamics::state& dx, double t){
    //  x = [mass, x_ECI, y_ECI, z_ECI, vx_ECI, vy_ECI, vz_ECI]
    posECI_ << x[1], x[2], x[3];
    velECI_ << x[4], x[5], x[6];

    //    地面に落下したときは変化なしにする
    if ( posLLH_[2] < 0) {
        dx[0] = 0;
        dx[1] = 0; dx[2] = 0; dx[3] = 0;
        dx[4] = 0; dx[5] = 0; dx[6] = 0;
        if ((int)t % 10 == 0 && (int)(t*10) % 10 == 0 ){ // progress
            progress(t, rocket);
        }
        if ( impact_flag == false ) {
            impact_point << posLLH_[0], posLLH_[1];
            impact_flag = true;
        }
        return;
    }
    
//    機体の状態を更新
    set_rocket_state(rocket, t, posLLH_[2]);
    thrust = rocket.thrust;
    Isp = rocket.Isp;
    m_dot = rocket.m_dot;
    wind_speed = rocket.wind_speed;
    wind_direction = rocket.wind_direction;
    azimth = rocket.azimth;
    elevation = rocket.elevation;
    area = rocket.area;

//    座標変換
    dcmECI2ECEF_ = dcmECI2ECEF(t);
    posECEF_ = posECEF(dcmECI2ECEF_, posECI_);
    posLLH_ = posLLH(posECEF_);
    dcmECEF2NED_ = dcmECEF2NED(posLLH_);
    dcmNED2ECEF_ = dcmECEF2NED_.transpose();
    dcmECI2NED_ = dcmECI2NED(dcmECEF2NED_, dcmECI2ECEF_);
    dcmNED2ECI_ = dcmECI2NED_.transpose();
    vel_ECEF_NEDframe_ = vel_ECEF_NEDframe(dcmECI2NED_, velECI_, posECI_);
    vel_wind_NEDframe_ = vel_wind_NEDframe(wind_speed, wind_direction);
    if(!rocket.is_aerodynamically_stable){ // 姿勢指定モード（通常）
        dcmNED2BODY_ = dcmNED2BODY(azimth, elevation);
        vel_AIR_BODYframe_ = vel_AIR_BODYframe(dcmNED2BODY_, vel_ECEF_NEDframe_, vel_wind_NEDframe_);
        attack_of_angle_ = attack_of_angle(vel_AIR_BODYframe_);
    } else { // 姿勢を空力安定モード
        attack_of_angle_ << 0.0, 0.0;
        Vector3d vel_BODY_NEDframe_ = vel_ECEF_NEDframe_ - vel_wind_NEDframe_;
        vel_AIR_BODYframe_ << vel_BODY_NEDframe_.norm(), 0.0, 0.0;
        Vector2d azel = azimth_elevaztion(vel_BODY_NEDframe_);
        azimth = azel[0];
        elevation = azel[1];
        dcmNED2BODY_ = dcmNED2BODY(azimth, elevation);
    }
    dcmBODY2AIR_ = dcmBODY2AIR(attack_of_angle_);
//    ここにt=0の時のdcmECI2NEDを入れないといけない。
    dcmECEF2NED_init_ = dcmECEF2NED(rocket.launch_pos_LLH);
    dcmECI2NED_init_ = dcmECI2NED(dcmECEF2NED_init_, dcmECI2ECEF(0.0));
    //    その時々の局所NED座標系姿勢角の方がいいのではないか？2016/03/24→その場合は_init無しのものにする
//   2016-03-24 _init_無しのものに変更
    dcmECI2BODY_ = dcmECI2BODY(dcmNED2BODY_, dcmECI2NED_);
//    dcmECI2BODY_ = dcmECI2BODY(dcmNED2BODY_, dcmECI2NED_init_);
//    t=0のときのdcmECI2NEDのアルゴリズム
//    dcmECI2BODY_ = dcmECI2BODY(dcmNED2BODY_, dcmECI2NED_);
    dcmBODY2ECI_ = dcmECI2BODY_.transpose();
    downrange = distance_surface(rocket.launch_pos_LLH, posLLH_);

    
//    状態を更新
//    set_rocket_state(t);
//    set_rocket_state(rocket, t, posLLH_[2]); //↑に移動
    //    分離　分離時の位置速度をグローバル変数に代入し、次の段の計算の初期位置へ
    if (rocket.state == Rocket::STAGE1 && separation_flag_12 == false && t >= rocket.stage_separation_time_1st){
        separation_flag_12 = true;
        posECI_init_g = posECI_;
        velECI_init_g = velECI_;
    } // 2/3段分離
    if (rocket.state == Rocket::STAGE2 && separation_flag_23 == false && t >= rocket.stage_separation_time_2nd){
        separation_flag_23 = true;
        posECI_init_g = posECI_;
        velECI_init_g = velECI_;
    }
    
//    推力
    force_thrust_vector << thrust, 0.0, 0.0;
//    空力項
    air = air.altitude(posLLH_[2]);
    vel_AIR_BODYframe_abs = vel_AIR_BODYframe_.norm();
    mach_number = vel_AIR_BODYframe_abs / air.airspeed;
    set_rocket_state_aero(rocket, mach_number);
    CD = rocket.CD;
    CL = rocket.CL;
    dynamic_pressure = 0.5 * air.density * vel_AIR_BODYframe_abs * vel_AIR_BODYframe_abs;
    force_drag = CD * dynamic_pressure * area;
    force_lift = CL * dynamic_pressure * area;
    force_air_vector << -force_drag, 0.0, -force_lift;
//    重力項 北方向の重力加速度は未考慮
    gravity_vector << 0.0, 0.0, - gravity(posLLH_[2], posLLH_[0]);
//    dv/dt
    accECI_ = 1/x[0] * (dcmBODY2ECI_ * (force_thrust_vector + dcmBODY2AIR_.transpose() * force_air_vector))
                     + dcmNED2ECI_ * gravity_vector;
    
    dx[0] = -m_dot;
    dx[1] = x[4];
    dx[2] = x[5];
    dx[3] = x[6];
    dx[4] = accECI_[0];
    dx[5] = accECI_[1];
    dx[6] = accECI_[2];
    
////    地面に落下したときは変化なしにする
//    if ( posLLH_[2] < 0) {
//        dx[0] = 0;
//        dx[1] = 0; dx[2] = 0; dx[3] = 0;
//        dx[4] = 0; dx[5] = 0; dx[6] = 0;
//        is_impacted = true;
//        return;
//    }
    
    //    最大高度の更新
    if (max_alt < posLLH_[2]){
        max_alt = posLLH_[2];
    }
    //    最大ダウンレンジの更新
    if (max_downrange < downrange){
        max_downrange = downrange;
    }
    
    if ((int)t % 10 == 0 && (int)(t*10) % 10 == 0 ){ // progress
        progress(t, rocket);
    }
}

void csv_observer::operator()(const state& x, double t){
    
    // 落下フラグが立っていると何もしない
    if ( impact_flag == true) {
        return;
    }
    
    posECI_ << x[1], x[2], x[3];
    velECI_ << x[4], x[5], x[6];
    
    set_rocket_state(rocket, t, posLLH_[2]);
    thrust = rocket.thrust;
    Isp = rocket.Isp;
    m_dot = rocket.m_dot;
    wind_speed = rocket.wind_speed;
    wind_direction = rocket.wind_direction;
    azimth = rocket.azimth;
    elevation = rocket.elevation;
    area = rocket.area;
    
    dcmECI2ECEF_ = dcmECI2ECEF(t);
    posECEF_ = posECEF(dcmECI2ECEF_, posECI_);
    posLLH_ = posLLH(posECEF_);
    if (posLLH_[2]< 0) {
        return;
    }
    dcmECEF2NED_ = dcmECEF2NED(posLLH_);
    dcmNED2ECEF_ = dcmECEF2NED_.transpose();
    dcmECI2NED_ = dcmECI2NED(dcmECEF2NED_, dcmECI2ECEF_);
    dcmNED2ECI_ = dcmECI2NED_.transpose();
    vel_ECEF_NEDframe_ = vel_ECEF_NEDframe(dcmECI2NED_, velECI_, posECI_);
    vel_wind_NEDframe_ = vel_wind_NEDframe(wind_speed, wind_direction);
    if(!rocket.is_aerodynamically_stable){ // 姿勢指定モード（通常）
        dcmNED2BODY_ = dcmNED2BODY(azimth, elevation);
        vel_AIR_BODYframe_ = vel_AIR_BODYframe(dcmNED2BODY_, vel_ECEF_NEDframe_, vel_wind_NEDframe_);
        attack_of_angle_ = attack_of_angle(vel_AIR_BODYframe_);
    } else { // 姿勢を空力安定モード
        attack_of_angle_ << 0.0, 0.0;
        Vector3d vel_BODY_NEDframe_ = vel_ECEF_NEDframe_ - vel_wind_NEDframe_;
        vel_AIR_BODYframe_ << vel_BODY_NEDframe_.norm(), 0.0, 0.0;
        Vector2d azel = azimth_elevaztion(vel_BODY_NEDframe_);
        azimth = azel[0];
        elevation = azel[1];
        dcmNED2BODY_ = dcmNED2BODY(azimth, elevation);
    }
    dcmBODY2AIR_ = dcmBODY2AIR(attack_of_angle_);
//    dcmNED2BODY_ = dcmNED2BODY(azimth, elevation);
    dcmECEF2NED_init_ = dcmECEF2NED(rocket.launch_pos_LLH);
    dcmECI2NED_init_ = dcmECI2NED(dcmECEF2NED_init_, dcmECI2ECEF(0.0));
    dcmECI2BODY_ = dcmECI2BODY(dcmNED2BODY_, dcmECI2NED_);
    dcmBODY2ECI_ = dcmECI2BODY_.transpose();
    
//    set_rocket_state(rocket, t, posLLH_[2]);


    force_thrust_vector << thrust, 0.0, 0.0;
    air = air.altitude(posLLH_[2]);
    vel_AIR_BODYframe_abs = vel_AIR_BODYframe_.norm();
    mach_number = vel_AIR_BODYframe_abs / air.airspeed;
    set_rocket_state_aero(rocket, mach_number);
    CD = rocket.CD;
    CL = rocket.CL;
    dynamic_pressure = 0.5 * air.density * vel_AIR_BODYframe_abs * vel_AIR_BODYframe_abs;
    force_drag = CD * dynamic_pressure * area;
    force_lift = CL * dynamic_pressure * area;
    force_air_vector << -force_drag, 0.0, -force_lift;
    gravity_vector << 0.0, 0.0, - gravity(posLLH_[2], posLLH_[0]);
    accECI_ = 1/x[0] * (dcmBODY2ECI_ * (force_thrust_vector + dcmBODY2AIR_.transpose() * force_air_vector))
    + dcmNED2ECI_ * gravity_vector;
    accBODY_ = dcmECI2BODY_ * accECI_;
    
    downrange = distance_surface(rocket.launch_pos_LLH, posLLH_);
    posLLH_IIP_ = posLLH_IIP(t, posECI_, vel_ECEF_NEDframe_);

    
////    地面に落下していたら出力無し
    if ( posLLH_[2] > 0) {
        fout << t << ",";
        fout << x[0] << "," << thrust << ",";
        fout.precision(8);
        fout << posLLH_[0] << "," << posLLH_[1] << "," << posLLH_[2] << ","
        << x[1] << "," << x[2] << "," << x[3] << ","
        << x[4] << "," << x[5] << "," << x[6] << ","
        << vel_ECEF_NEDframe_[0] << "," << vel_ECEF_NEDframe_[1] << ","
        << vel_ECEF_NEDframe_[2] << ","
        << accECI_[0] << "," << accECI_[1] << "," << accECI_[2] << ","
        << accBODY_[0] << "," << accBODY_[1] << "," << accBODY_[2] << ","
        << Isp << "," << mach_number << ","
        << rad2deg(azimth) << "," << rad2deg(elevation) << ","
        << rad2deg(attack_of_angle_[0]) << "," << rad2deg(attack_of_angle_[1]) << ","
        << dynamic_pressure << "," << force_drag << "," << force_lift << ","
        << wind_speed << "," << wind_direction << ","
        << downrange << "," << posLLH_IIP_[0] << "," << posLLH_IIP_[1] << endl;
    }
    
//    element
    VectorXd element_;
//    element_ = elementECI2orbit(posECI_, velECI_);
//    cout << "element:\t" << element_ << endl;
}


Matrix3d dcmECI2ECEF(double second){
    double omega = 7.2921159e-5; // 地球の自転角速度[rad/s]
    double theta = omega * second;
    Matrix3d dcm;
    dcm << cos(theta), sin(theta), 0.0,
          -sin(theta), cos(theta), 0.0,
           0.0,        0.0,        1.0;
    return dcm;
}

Vector3d posECEF(Matrix3d dcmECI2ECEF_, Vector3d posECI_){
    Vector3d posECEF = dcmECI2ECEF_ * posECI_;
    return posECEF;
}

double n_posECEF2LLH(double phi_n_deg, double a, double e2){
    return a / sqrt(1.0 - e2 * sin(deg2rad(phi_n_deg)) * sin(deg2rad(phi_n_deg)));
}

// deg返し
Vector3d posLLH(Vector3d posECEF_){
    
    Vector3d posLLH;
    double a = 6378137.0;               // WGS84の長軸[m]
    double one_f = 298.257223563;       // 扁平率fの1/f（平滑度）
    double b = a * (1.0 - 1.0 / one_f); // WGS84の短軸[m] b = 6356752.314245
    double e2 = (1.0 / one_f) * (2.0 - (1.0 / one_f));  // 第一離心率eの2乗
    double ed2 = (e2 * a * a / (b * b));// 第二離心率e'の2乗
    double p = sqrt(posECEF_(0) * posECEF_(0) + posECEF_(1) * posECEF_(1));    // 現在位置での地球回転軸からの距離[m]
    double theta = atan2(posECEF_(2)*a, p*b);    //[rad]
    posLLH[0] = rad2deg(atan2((posECEF_(2) + ed2 * b * pow(sin(theta),3)), p - e2 * a * pow(cos(theta),3)));
    posLLH[1] = rad2deg(atan2(posECEF_(1),posECEF_(0)));
    posLLH[2] = p / cos(deg2rad(posLLH(0))) - n_posECEF2LLH(posLLH(0), a, e2);
    return posLLH;
}

Matrix3d dcmECEF2NED(Vector3d posLLH_){
    Matrix3d dcm;
    double lat = deg2rad(posLLH_[0]);
    double lon = deg2rad(posLLH_[1]);
    dcm << -sin(lat)*cos(lon), -sin(lat)*sin(lon), cos(lat),
           -sin(lon),           cos(lon),          0,
           -cos(lat)*cos(lon), -cos(lat)*sin(lon), -sin(lat);
    return dcm;
}

Matrix3d dcmECI2NED(Matrix3d dcmECEF2NED_, Matrix3d dcmECI2ECEF_){
    return dcmECEF2NED_ * dcmECI2ECEF_;
}

Vector3d vel_ECEF_NEDframe(Matrix3d dcmECI2NED_, Vector3d vel_ECI_ECIframe_, Vector3d pos_ECI_){
    double omega = 7.2921159e-5; // 地球の自転角速度[rad]
    Matrix3d omegaECI2ECEF_;    // 角速度テンソル angular velocity tensorß
    omegaECI2ECEF_ << 0.0,   -omega, 0.0,
                      omega, 0.0,    0.0,
                      0.0,   0.0,    0.0;
    return dcmECI2NED_ * (vel_ECI_ECIframe_ - omegaECI2ECEF_ * pos_ECI_);
}

// @param wind_speed        風速 m/s
// @param wind_direction    風向 deg
Vector3d vel_wind_NEDframe(double wind_speed, double wind_direction){
    Vector3d vel;
    vel[0] = - wind_speed * cos(deg2rad(wind_direction));
    vel[1] = - wind_speed * sin(deg2rad(wind_direction));
    vel[2] = 0;
    return vel;
}

//Vector3d vel_AIR_BODYframe(Matrix3d dcmNED2ECEF_, Vector3d vel_ECEF_NEDframe_, Vector3d vel_wind_NEDframe_){
//    return dcmNED2ECEF_ * (vel_ECEF_NEDframe_ - vel_wind_NEDframe_);
//}

Vector3d vel_AIR_BODYframe(Matrix3d dcmNED2BODY_, Vector3d vel_ECEF_NEDframe_, Vector3d vel_wind_NEDframe_){
    return dcmNED2BODY_ * (vel_ECEF_NEDframe_ - vel_wind_NEDframe_);
}


// rad返し
Vector2d attack_of_angle(Vector3d vel_AIR_BODYframe_){
    double vel_abs = vel_AIR_BODYframe_.norm();
    double alpha;
    double beta;
    if(abs(vel_AIR_BODYframe_[0]) < 0.001 || vel_abs < 0.01){
        alpha = 0;
        beta = 0;
    }else{
        alpha = atan2(vel_AIR_BODYframe_[2], vel_AIR_BODYframe_[0]);
        beta = asin(vel_AIR_BODYframe_[1] / vel_abs);
    }
    Vector2d aoa;
    aoa[0] = alpha;
    aoa[1] = beta;
    return aoa;
}

Matrix3d dcmBODY2AIR(Vector2d attack_of_angle_){
    Matrix3d dcm;
    double alpha = attack_of_angle_[0];
    double beta  = attack_of_angle_[1];
    dcm <<  cos(alpha)*cos(beta), sin(beta),  sin(alpha)*cos(beta),
           -cos(alpha)*sin(beta), cos(beta), -sin(alpha)*sin(beta),
           -sin(alpha),           0,          cos(alpha);
    return dcm;
}

//Matrix3d dcmBODY2NED(double azimth, double elevation){
//    Matrix3d dcm;
//    dcm <<  cos(elevation)*cos(azimth), cos(elevation)*sin(azimth), -sin(elevation),
//           -sin(azimth),                cos(azimth),                 0,
//            sin(elevation)*cos(azimth), sin(elevation)*sin(azimth),  cos(elevation);
//    return dcm;
//}

Matrix3d dcmNED2BODY(double azimth, double elevation){
    Matrix3d dcm;
    dcm <<  cos(elevation)*cos(azimth), cos(elevation)*sin(azimth), -sin(elevation),
    -sin(azimth),                cos(azimth),                 0,
    sin(elevation)*cos(azimth), sin(elevation)*sin(azimth),  cos(elevation);
    return dcm;
}

Vector2d azimth_elevaztion(Vector3d vel_BODY_NEDframe){
    double north  = vel_BODY_NEDframe[0];
    double east = vel_BODY_NEDframe[1];
    double down = vel_BODY_NEDframe[2];
    double azimth = pi/2.0 - atan2(north, east);
    double elevation = atan2(-down, sqrt(north * north + east * east));
    Vector2d azel;
    azel[0] = azimth;
    azel[1] = elevation;
    return azel;
}


Matrix3d dcmECI2BODY(Matrix3d dcmNED2BODY_, Matrix3d dcmECI2NED_){
    return dcmNED2BODY_ * dcmECI2NED_;
}

// Initialize
// degから位置返し
Vector3d posECEF(Vector3d posLLH_){
    Vector3d pos;
    double lat = deg2rad(posLLH_[0]); //degree
    double lon = deg2rad(posLLH_[1]);
    double alt = posLLH_[2];
    double a = 6378137; // 長半径a [m]
    double f = 1.0 / 298.257223563; // 扁平率
    double e = sqrt(2*f - f*f); // 離心率 e
    double e2 = e * e;
    double W = sqrt(1.0 - e2 * sin(lat) * sin(lat));
    double N = a / W; // 卯酉線曲率半径
    pos[0] = (N + alt) * cos(lat) * cos(lon);
    pos[1] = (N + alt) * cos(lat) * sin(lon);
    pos[2] = (N * (1 - e2) + alt) * sin(lat);
    return pos;
}

Vector3d posECI(Vector3d posECEF_, double second){
    Matrix3d dcmECI2ECEF_ = dcmECI2ECEF(second);
    Matrix3d dcmECEF2ECI_ = dcmECI2ECEF_.transpose();
    return dcmECEF2ECI_ * posECEF_;
}

Vector3d vel_ECI_ECIframe(Matrix3d dcmNED2ECI_, Vector3d vel_ECEF_NEDframe_, Vector3d posECI_){
    double omega = 7.2921159e-5; // 地球の自転角速度[rad]
    Matrix3d omegaECI2ECEF_;    // 角速度テンソル angular velocity tensorß
    omegaECI2ECEF_ << 0.0,   -omega, 0.0,
                      omega, 0.0,    0.0,
                      0.0,   0.0,    0.0;
    return dcmNED2ECI_ * vel_ECEF_NEDframe_ + omegaECI2ECEF_ * posECI_;
}

// 初期値設定 Initialize
// degから位置
Vector3d posECI_init(Vector3d posLLH_){
    Vector3d posECEF_;
    double second = 0.0;
    posECEF_ = posECEF(posLLH_);
    return posECI(posECEF_, second);
}

// deg, m/sから速度
Vector3d velECI_init(Vector3d vel_ECEF_NEDframe_, Vector3d posLLH_){
    double second = 0.0;
    Matrix3d dcmECI2ECEF_;
    Matrix3d dcmECEF2NED_;
    Matrix3d dcmECI2NED_;
    Matrix3d dcmNED2ECI_;
    Vector3d posECI_init_;
    posECI_init_ = posECI_init(posLLH_);
    dcmECI2ECEF_ = dcmECI2ECEF(second);
    dcmECEF2NED_ = dcmECEF2NED(posLLH_);
    dcmECI2NED_ = dcmECI2NED(dcmECEF2NED_, dcmECI2ECEF_);
    dcmNED2ECI_ = dcmECI2NED_.transpose();
    return vel_ECI_ECIframe(dcmNED2ECI_, vel_ECEF_NEDframe_, posECI_init_);
}



// コンソールにプログレス表示
#define STR(var) #var   //引数にした変数を変数名を示す文字列リテラルとして返すマクロ関数
void progress(double time_now, Rocket rocket){
    double time_total;
    time_total = rocket.calc_end_time - rocket.calc_start_time;
//    cout.precision(1);
    cout << fixed << setprecision(0);
    cout << time_now << "sec / " << time_total << "sec\t@Stage" << rocket.state << "\r" << flush;
    return;
}

// 緯度経度高度で記述された距離2地点間の地球表面の距離を算出
// ダウンレンジの計算などに使用
// LLH→ECEFを算出し、直交座標系での地球中心からの角度を求め、角度と地球半径から計算
// http://www.ic.daito.ac.jp/~mizutani/gps/measuring_earth.html
double distance_surface(Vector3d pos0_LLH_, Vector3d pos1_LLH_){
    double const earth_radius = 6378137; // 地球半径 m
    Vector3d pos0_ECEF_ = posECEF(pos0_LLH_);
    Vector3d pos1_ECEF_ = posECEF(pos1_LLH_);
    double theta = acos(pos0_ECEF_.dot(pos1_ECEF_) /
                        pos0_ECEF_.norm() / pos1_ECEF_.norm()); // radius
    return earth_radius * theta;
}

// その時刻でのIIP（瞬間落下地点）をLLHで出力
Vector3d posLLH_IIP(double t, Vector3d posECI_, Vector3d vel_ECEF_NEDframe_){
    double g0 = 9.80665;
    Matrix3d dcmECI2ECEF_ = dcmECI2ECEF(t);
    Vector3d posLLH_ = posLLH(posECEF(dcmECI2ECEF_, posECI_));
    Matrix3d dcmNED2ECI_ = dcmECI2NED(dcmECEF2NED(posLLH_), dcmECI2ECEF_).transpose();
    double vel_north_ = vel_ECEF_NEDframe_(0);
    double vel_east_ = vel_ECEF_NEDframe_(1);
    double vel_up_ = - vel_ECEF_NEDframe_(2);
    double h = posLLH_(2);
    double tau = 1.0 / g0 * (vel_up_ + sqrt(vel_up_ * vel_up_ + 2 * h * g0));
    Vector3d dist_IIP_from_now_NED;
    Vector3d posECI_IIP_;
    Vector3d posECEF_IIP_;
    dist_IIP_from_now_NED << vel_north_ * tau, vel_east_ * tau, -h;
    posECI_IIP_ = posECI_ + dcmNED2ECI_ * dist_IIP_from_now_NED;
    posECEF_IIP_ = posECEF(dcmECI2ECEF(t), posECI_IIP_);
    return posLLH(posECEF_IIP_);
}

/*
 テスト
 */
void testCoordinate(){
    double second = 100.0;
    Vector3d posECI_(-3957314.620, 3310254.137, 3737540.043);
    Vector3d velECI_(10.0, 20.0, 30.0);
    std::ofstream ofs( "./output/coordinate.csv");
    if (!ofs) {
        std::cerr << "ファイルオープンに失敗" << std::endl;
        std::exit(1);
    }
    
    Matrix3d dcmECI2ECEF_;
    Vector3d posECEF_;
    Vector3d posLLH_;
    Matrix3d dcmECEF2NED_;
    Matrix3d dcmECI2NED_;
    Vector3d vel_ECEF_NEDframe_;
    Vector3d vel_wind_NEDframe_;
    Vector3d vel_AIR_BODYframe_;
    Vector2d attack_of_angle_;
    Matrix3d dcmBODY2AIR_;
    Matrix3d dcmBODY2NED_;
    Matrix3d dcmNED2BODY_;
    Matrix3d dcmECI2BODY_;
    double wind_speed = 10.0;
    double wind_direction = 0.0;
    double azimth = 10.0;
    double elevation = pi/2;
    dcmECI2ECEF_ = dcmECI2ECEF(second);
    posECEF_ = posECEF(dcmECI2ECEF_, posECI_);
    posLLH_ = posLLH(posECEF_);
    dcmECEF2NED_ = dcmECEF2NED(posLLH_);
    dcmECI2NED_ = dcmECI2NED(dcmECEF2NED_, dcmECI2ECEF_);
    vel_ECEF_NEDframe_ = vel_ECEF_NEDframe(dcmECI2NED_, velECI_, posECI_);
    vel_wind_NEDframe_ = vel_wind_NEDframe(wind_speed, wind_direction);
    vel_AIR_BODYframe_ = vel_AIR_BODYframe(dcmECEF2NED_.transpose(), vel_ECEF_NEDframe_, vel_wind_NEDframe_);
    attack_of_angle_ = attack_of_angle(vel_AIR_BODYframe_);
    dcmBODY2AIR_ = dcmBODY2AIR(attack_of_angle_);
//    dcmBODY2NED_ = dcmBODY2NED(azimth, elevation);
    dcmNED2BODY_ = dcmNED2BODY(azimth, elevation);
    dcmECI2BODY_ = dcmECI2BODY(dcmNED2BODY_, dcmECI2NED_);
    // initalization
    Vector3d posECEF_init;
    Vector3d posECI_init;
    Vector3d vel_ECI_ECIframe_init;
    vel_ECEF_NEDframe_ << 0.0, 0.0, 0.0;
    posECEF_init = posECEF(posLLH_);
    posECI_init = posECI(posECEF_, second);
    dcmECI2ECEF_ = dcmECI2ECEF(second);
    dcmECEF2NED_ = dcmECEF2NED(posLLH_);
    dcmECI2NED_ = dcmECI2NED(dcmECEF2NED_, dcmECI2ECEF_);
    vel_ECI_ECIframe_init = vel_ECI_ECIframe(dcmECI2NED_.transpose(), vel_ECEF_NEDframe_, posECI_init);

    /*
     計算出力
     */
    ofs << "time(秒)" << "\t" << second << endl;
    ofs << "posECI(m)" << "\t" << posECI_(0) << "\t" << posECI_(1) << "\t" << posECI_(2) << endl;
    ofs << "dcmECI2ECEF" << endl << dcmECI2ECEF_ << endl;
    ofs << "posECEF(m)\t" << posECEF_(0) << "\t" << posECEF_(1) << "\t" << posECEF_(2) << endl;
    ofs << "LLH\t" << posLLH_(0) << "\t" << posLLH_(1) << "\t" << posLLH_(2) << endl;
    ofs << "dcmECEF2NED" << endl << dcmECEF2NED_ << endl;
    ofs << "vel_ECEF_NEDframe\t" << vel_ECEF_NEDframe_(0) << "\t" << vel_ECEF_NEDframe_(1) << "\t" << vel_ECEF_NEDframe_(2) << endl;
    ofs << "vel_wind_NEDframe\t" << vel_wind_NEDframe_(0) << "\t" << vel_wind_NEDframe_(1) << "\t" << vel_wind_NEDframe_(2) << endl;
    ofs << "vel_AIR_BODYframe\t" << vel_AIR_BODYframe_(0) << "\t" << vel_AIR_BODYframe_(1) << "\t" << vel_AIR_BODYframe_(2) << endl;
    ofs << "attack_of_angle" << "\t" << attack_of_angle_[0] << "\t" << attack_of_angle_[1] << endl;
    ofs << "dcmBODY2AIR" << endl << dcmBODY2AIR_ << endl;
    ofs << "dcmNED2BODY" << endl << dcmNED2BODY_ << endl;
//    ofs << "dcmBODY2NED" << endl << dcmBODY2NED_ << endl;
    ofs << "dcmECI2BODY" << endl << dcmECI2BODY_ << endl;
    ofs << endl;
    ofs << "==== 初期化処理 ====" << endl;
    ofs << "posECEF\t" << posECEF_init[0] << "\t" << posECEF_init[1] << "\t" << posECEF_init[2] << endl;
    ofs << "dcmECEF2ECI" << endl << dcmECI2ECEF(second).transpose() << endl;
    ofs << "posECI\t" << posECI_init[0] << "\t" << posECI_init[1] << "\t" << posECI_init[2] << endl;
    ofs << "vel_ECI_ECIframe\t" << vel_ECI_ECIframe_init(0) << "\t" << vel_ECI_ECIframe_init(1) << "\t" << vel_ECI_ECIframe_init(2) << endl;
}
