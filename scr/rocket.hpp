//
//  rocket.hpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2015/11/28.
//  Copyright © 2015 Takahiro Inagawa. All rights reserved.
//

#ifndef rocket_hpp
#define rocket_hpp

#include <stdio.h>
#include <iostream>
#include <fstream>
#include <string>
#include <sstream>
#include "../lib/Eigen/Core"
#include "../lib/Eigen/Geometry"
#include "../boost/numeric/odeint.hpp"
//#include <boost/array.hpp>
#include "air.hpp"
#include "Orbit.hpp"

const double pi = 3.1415926535897932384262;

using namespace Eigen;
using namespace std;

class Rocket{
private:
public:
    std::ifstream fin;
    std::ofstream fout;
    enum State{
        GROUND = 0, STAGE1 = 1, STAGE2 = 2,
        STAGE3 = 3, PAYLOAD = 4, PARACHUTE = 5,
        REENTRY = 6
    };                              // 状態, 列挙型で指定
    State state;                    // 状態を決める関数
    string name;                    // 名前
    string output_filename;         // 出力ファイル名
//    ==== フラグ ====
    bool is_aerodynamically_stable = false;  // 空力的に安定しているモードかどうか, 燃焼後やペイロードを想定
    bool is_powered = false;  // 推力を発生しているかどうか？ trueで推力発生
    bool is_separated = false;  // 上段分離しているかどうか
//    ====計算の変数====
    double calc_start_time;
    double calc_end_time;
    double calc_step_time;
//    ====ロケットの変数====
    double mass_init_1st;           // 初期質量[kg]
    double mass_init_2nd;           // 初期質量[kg]
    double mass_init_3rd;           // 初期質量[kg]
//    ==推力==
    bool Isp_file_exist_1st = false;
    bool Isp_file_exist_2nd = false;
    bool Isp_file_exist_3rd = false;
    string Isp_file_name_1st;
    string Isp_file_name_2nd;
    string Isp_file_name_3rd;
    MatrixXd Isp_mat_1st;
    MatrixXd Isp_mat_2nd;
    MatrixXd Isp_mat_3rd;
    double Isp_1st;                 // 比推力[sec]
    double Isp_2nd;                 // 比推力[sec]
    double Isp_3rd;                 // 比推力[sec]
    bool thrust_file_exist_1st;
    bool thrust_file_exist_2nd;
    bool thrust_file_exist_3rd;
    string thrust_file_name_1st;
    string thrust_file_name_2nd;
    string thrust_file_name_3rd;
    MatrixXd thrust_mat_1st;
    MatrixXd thrust_mat_2nd;
    MatrixXd thrust_mat_3rd;
    double thrust_1st;              // 推力[N]
    double thrust_2nd;
    double thrust_3rd;
    double burn_start_time_1st;     // 燃焼開始時間[sec]
    double burn_start_time_2nd;
    double burn_start_time_3rd;
    double burn_end_time_1st;       // 燃焼終了時間[sec]
    double burn_end_time_2nd;
    double burn_end_time_3rd;
    double burn_time_1st;           // 燃焼時間[sec]
    double burn_time_2nd;
    double burn_time_3rd;
    double throat_diameter_1st;     // ノズル直径[m]
    double throat_diameter_2nd;
    double throat_diameter_3rd;
    double throat_area_1st;         // ノズル出口面積[m2]
    double throat_area_2nd;
    double throat_area_3rd;
    double nozzle_expansion_ratio_1st; // ノズル膨張比
    double nozzle_expansion_ratio_2nd;
    double nozzle_expansion_ratio_3rd;
    double nozzle_exhaust_pressure_1st;// ノズル排出圧力[Pa]
    double nozzle_exhaust_pressure_2nd;
    double nozzle_exhaust_pressure_3rd;
//    ==空力==
    double body_diameter_1st;       // 機体の直径[m]
    double body_diameter_2nd;
    double body_diameter_3rd;
    double body_area_1st;           // 機体の断面積[m2]
    double body_area_2nd;
    double body_area_3rd;
    bool CL_file_exist_1st;         // CLファイルの有無
    bool CL_file_exist_2nd;
    bool CL_file_exist_3rd;
    string CL_file_name_1st;        // CLファイルの名前
    string CL_file_name_2nd;
    string CL_file_name_3rd;
    MatrixXd CL_mat_1st;
    MatrixXd CL_mat_2nd;
    MatrixXd CL_mat_3rd;
    double CLa_1st;                 // 揚力傾斜[/rad]
    double CLa_2nd;
    double CLa_3rd;
    double CL_1st;                  // 揚力係数[-]
    double CL_2nd;
    double CL_3rd;
    bool CD_file_exist_1st;         // CDファイルの有無
    bool CD_file_exist_2nd;
    bool CD_file_exist_3rd;
    string CD_file_name_1st;        // CDファイルの名前
    string CD_file_name_2nd;
    string CD_file_name_3rd;
    MatrixXd CD_mat_1st;
    MatrixXd CD_mat_2nd;
    MatrixXd CD_mat_3rd;
    double CD_1st;                  // 抗力係数[-]
    double CD_2nd;
    double CD_3rd;
//    ==姿勢==
    bool attitude_file_exist_1st;   // 姿勢ファイルの有無
    bool attitude_file_exist_2nd;
    bool attitude_file_exist_3rd;
    string attitude_file_name_1st;  // 姿勢ファイルの名前
    string attitude_file_name_2nd;
    string attitude_file_name_3rd;
    MatrixXd attitude_mat_1st;
    MatrixXd attitude_mat_2nd;
    MatrixXd attitude_mat_3rd;
    double attitude_azimth_1st;     // 方位角(単位は？)
    double attitude_azimth_2nd;
    double attitude_azimth_3rd;
    double attitude_elevation_1st;  // 仰角(単位は？)
    double attitude_elevation_2nd;
    double attitude_elevation_3rd;
//    ==ステージ==
    bool following_stage_exist_1st; // 後段があるかどうか
    bool following_stage_exist_2nd;
    bool following_stage_exist_3rd;
    double stage_separation_time_1st;   //分離時間[sec]
    double stage_separation_time_2nd;
    double stage_separation_time_3rd;

//    ====パラシュート====
    bool parachute_exist;           // パラシュートがあるかどうか
    double parachute_CD;            // パラシュート抗力係数[-]
    double parachute_diameter;      // パラシュート開傘時の直径[m]
    double parachute_deploy_time;   // パラシュート展開時間[sec]
    double parachute_area;          // パラシュート面積[m2]
//    ====風====
    bool wind_file_exist;
    string wind_file_name;
    Vector3d wind_const;
    MatrixXd wind_mat;              // [altitude[m], wind speed[m/s], wind direction[deg]]
//    ====射点====
    Vector3d launch_pos_LLH;        // 初期位置（緯度経度高度）[deg,m]
    Vector3d launch_pos_ECEF;       // 初期位置（ECEF座標）
    Vector3d launch_vel_ECEF;       // 初期速度（ECEF座標）
    Vector3d launch_vel_NED;        // 初期速度（NED座標）
//    ==== rocket_dynamicsの中で使う変数 ====
    double g0 = 9.80665;
    double thrust = 0.0;
    double Isp = 0.1;
    double m_dot = 0.0;
    double nozzle_exhaust_area = 0.0;
    double CD = 0.0;
    double CL = 0.0;
    double drag = 0.0;
    double air_density = 0.0;
    double area = 0.1;
    double vel_AIR_BODYframe_abs = 0.0;
    double dynamic_pressure = 0.0;
    double force_drag;
    double force_lift;
    Air air;
    double wind_speed = 0.0;
    double wind_direction = 0.0;
    double azimth = 0;
    double elevation = pi/2;
    double mach_number = 0.0;

public:
    Rocket(Rocket& obj); // コピーコンストラクタ
    Rocket(const std::string& FileName);
};

void set_rocket_state(Rocket& rocket, double time, double altitude);
void set_rocket_state_aero(Rocket& rocket, double mach_number);

struct rocket_dynamics{
private:
    double g0 = 9.80665;
    double thrust = 0.0;
    double Isp = 0.1;
    double m_dot = 0.0;
    double CD = 0.0;
    double CL = 0.0;
    double drag = 0.0;
    double air_density = 0.0;
    double area = 0.1;
    double vel_AIR_BODYframe_abs = 0.0;
    double dynamic_pressure = 0.0;
    double force_drag;
    double force_lift;
    Air air;
    double mach_number;
public:
//    using state = boost::array<double, 7>;
    using state = std::array<double, 7>;
    Vector3d posECI_;
    Vector3d velECI_;
    Vector3d accECI_;
    Vector3d accBODY_;
    Matrix3d dcmECI2ECEF_;
    Vector3d posECEF_;
    Vector3d posLLH_;
    Matrix3d dcmECEF2NED_;
    Matrix3d dcmNED2ECEF_;
    Matrix3d dcmECI2NED_;
    Matrix3d dcmNED2ECI_;
    Vector3d vel_ECEF_NEDframe_;
    Vector3d vel_wind_NEDframe_;
    Vector3d vel_AIR_BODYframe_;
    Vector2d attack_of_angle_;
    Matrix3d dcmBODY2AIR_;
    Matrix3d dcmBODY2NED_;
    Matrix3d dcmNED2BODY_;
    Matrix3d dcmECI2BODY_;
    Matrix3d dcmBODY2ECI_;
    Matrix3d dcmECEF2NED_init_;
    Matrix3d dcmECI2NED_init_;

    double wind_speed = 0.0;
    double wind_direction = 0.0;
    double azimth = 0;
    double elevation = pi/2;
    
    Vector3d force_air_vector;
    Vector3d force_thrust_vector;
    Vector3d gravity_vector;
    double downrange;
    Vector3d posLLH_IIP_;
    
    Rocket rocket;
    rocket_dynamics(Rocket rocket_): rocket(rocket_){}
    
    void operator()(const state& x, state& dx, double t);
};

struct csv_observer{
    double g0 = 9.80665;
    double thrust = 0.0;
    double Isp = 0.1;
    double m_dot = 0.0;
    double CD = 0.0;
    double CL = 0.0;
    double drag = 0.0;
    double air_density = 0.0;
    double area = 0.1;
    double vel_AIR_BODYframe_abs = 0.0;
    double dynamic_pressure = 0.0;
    double force_drag;
    double force_lift;
    Air air;

    Vector3d posECI_;
    Vector3d velECI_;
    Vector3d accECI_;
    Vector3d accBODY_;
    Matrix3d dcmECI2ECEF_;
    Vector3d posECEF_;
    Vector3d posLLH_;
    Matrix3d dcmECEF2NED_;
    Matrix3d dcmNED2ECEF_;
    Matrix3d dcmECI2NED_;
    Matrix3d dcmNED2ECI_;
    Vector3d vel_ECEF_NEDframe_;
    Vector3d vel_wind_NEDframe_;
    Vector3d vel_AIR_BODYframe_;
    Vector2d attack_of_angle_;
    Matrix3d dcmBODY2AIR_;
    Matrix3d dcmBODY2NED_;
    Matrix3d dcmNED2BODY_;
    Matrix3d dcmECI2BODY_;
    Matrix3d dcmBODY2ECI_;
    Matrix3d dcmECEF2NED_init_;
    Matrix3d dcmECI2NED_init_;
    double wind_speed = 0.0, wind_direction=0.0;
    double azimth = 0.0;
    double elevation = pi/2;
    Vector3d force_air_vector;
    Vector3d force_thrust_vector;
    Vector3d gravity_vector;
    double downrange;
    Vector3d posLLH_IIP_;

//    loss velocity
    double loss_gravity;
    double loss_aerodynamics;
    double loss_thrust;
    double loss_control;
    double loss_total;
    
//    double max_alt = 0.0;
    double mach_number;
    using state = rocket_dynamics::state;
    Rocket rocket;
    std::ofstream fout;

    csv_observer(Rocket rocket_, const std::string& FileName, bool isAddition = false) : rocket(rocket_){
        if (isAddition == false){ // 追加書き込みモードかどうか
            fout.open(FileName, std::ios_base::out);
            fout << "time(s),mass(kg),thrust(N),lat(deg),lon(deg),altitude(m),pos_ECI_X(m),pos_ECI_Y(m),pos_ECI_Z(m),"
                 << "vel_ECI_X(m/s),vel_ECI_Y(m/s),vel_ECI_Z(m/s),vel_NED_X(m/s),vel_NED_Y(m/s),vel_NED_Z(m/s),"
                 << "acc_ECI_X(m/s2),acc_ECI_Y(m/s2),acc_ECI_Z(m/s2),acc_Body_X(m/s),acc_Body_Y(m/s),acc_Body_Z(m/s),"
                 << "Isp(s),Mach number,attitude_azimth(deg),attitude_elevation(deg),"
                 << "attack of angle alpha(deg),attack of angle beta(deg),dynamic pressure(Pa),aero Drag(N),aero Lift(N),"
                 << "wind speed(m/s),wind direction(deg),downrange(m),"
                 << "IIP_lat(deg),IIP_lon(deg),"
                 << "dcmBODY2ECI_11,dcmBODY2ECI_12,dcmBODY2ECI_13,"
                 << "dcmBODY2ECI_21,dcmBODY2ECI_22,dcmBODY2ECI_23,"
                 << "dcmBODY2ECI_31,dcmBODY2ECI_32,dcmBODY2ECI_33,"
                 << "loss_gravity(m/s2),"
                 << "loss_aerodynamics(m/s2),"
                 << "loss_thrust(m/s2)"
                 << std::endl;
        } else {
            fout.open(FileName, std::ios_base::out | std::ios_base::app); // 追加書き込みモード
        }
    };
    
    void operator()(const state& x, double t);
//    double get_max_alt();
};

void flight_simulation(string input_filename, string output_filename, Rocket::State state);

Matrix3d dcmECI2ECEF(double second);
Vector3d posECEF(Matrix3d dcmECI2ECEF_, Vector3d posECI_);
Vector3d posLLH(Vector3d posECEF_);
double n_posECEF2LLH(double phi_n, double a, double e2);
inline double deg2rad(double deg);
Matrix3d dcmECEF2NED(Vector3d posLLH_);
Matrix3d dcmECI2NED(Matrix3d dcmECEF2NED_, Matrix3d dcmECI2ECEF_);
Vector3d vel_ECEF_NEDframe(Matrix3d dcmECI2NED_, Vector3d vel_ECI_ECIframe_, Vector3d pos_ECI_);
Vector3d vel_wind_NEDframe(double wind_speed, double wind_direction);
Vector3d vel_AIR_BODYframe(Matrix3d dcmNED2ECEF_, Vector3d vel_ECEF_NEDframe_, Vector3d vel_wind_NEDframe_);
Vector2d attack_of_angle(Vector3d vel_AIR_BODYframe_);
Matrix3d dcmBODY2AIR(Vector2d attack_of_angle_);
//Matrix3d dcmBODY2NED(double azimth, double elevation);
Matrix3d dcmNED2BODY(double azimth, double elevation);
Vector2d azimth_elevaztion(Vector3d vel_BODY_NEDframe);
Matrix3d dcmECI2BODY(Matrix3d dcmNED2BODY_, Matrix3d dcmECI2NED_);
// Initialize
Vector3d posECEF(Vector3d posLLH_);
Vector3d posECI(Matrix3d posECEF_, double second);
Vector3d vel_ECI_ECIframe(Matrix3d dcmNED2ECI_, Vector3d vel_ECEF_NEDframe_, Vector3d posECI_);
// 初期値設定 Initialize
Vector3d posECI_init(Vector3d posLLH_);
Vector3d velECI_init(Vector3d vel_ECEF_NEDframe_, Vector3d posLLH_);
void progress(double time_now, Rocket rocket);
double distance_surface(Vector3d pos0_LLH, Vector3d pos1_LLH);
Vector3d posLLH_IIP(double t, Vector3d posECI_, Vector3d vel_ECEF_NEDframe_);

inline double deg2rad(double deg){
    return deg / 180.0 * pi;
}

inline double rad2deg(double rad){
    return rad * 180.0 / pi;
}

void testCoordinate();

#endif /* rocket_hpp */
