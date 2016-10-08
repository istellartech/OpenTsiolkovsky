//
//  main.cpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2015/11/16.
//  Copyright © 2015 Takahiro Inagawa. All rights reserved.
//

#include <iostream>
#include <iomanip>
#include <vector>
#include <chrono>
#include "../lib/Eigen/Core"
#include "../boost/numeric/odeint.hpp"
//#include <boost/array.hpp>
#include "../lib/picojson.h"
#include "../lib/csv.h"
#include "rocket.hpp"
#include "gravity.hpp"
#include "air.hpp"
#include "fileio.hpp"
#include "Orbit.hpp"

using namespace std;
using namespace Eigen;
using namespace boost::numeric::odeint;

Vector3d posLLH_init_g;
Vector3d vel_NED_init_g;
Vector3d posECI_init_g;
Vector3d velECI_init_g;
bool separation_flag_12 = false;
bool separation_flag_23 = false;

// 最適化のために標準出力に出すもの
double max_downrange = 0.0;
double max_alt = 0.0;
Vector2d impact_point; // LLH[deg]
bool impact_flag = false;

int main(int argc, const char * argv[]) {
    std::chrono::system_clock::time_point  start, end; // calcuration time measurement
    start = std::chrono::system_clock::now(); // 計測開始時間
    std::cout << "Hello, OpenTsiolkovsky!\n";
//    test_gravity();
//    test_air();
//    test_LLH_ECEF();
//    testCoordinate();
    
//    main関数の引数を読み取って、jsonファイル読み出し、jsonの中身を読み取って、STAGEがいくつあるかを読み取り
//    それによってflight_simulationを実行
    string input_file_name;
    string input_file_default = "param.json";
    if (argc == 1) {
        input_file_name = input_file_default;
    } else if (argc == 2) {
        input_file_name = argv[1];
    } else {
        cout << "argument error";
        return 0;
    }

    ifstream fin("./" + input_file_name);
    if( !fin ) {
        cout << "Error:Input data file not found" << endl;
        return 0;
    }
    picojson::value v;
    fin >> v;
    if (std::cin.fail()) {
        std::cerr << picojson::get_last_error() << std::endl;
        return 0;
    }
    picojson::object& o              = v.get<picojson::object>();
    picojson::object& o_1st          = o["1st stage"].get<picojson::object>();
    picojson::object& o_1st_stage    = o_1st["stage"].get<picojson::object>();
    picojson::object& o_2nd          = o["2nd stage"].get<picojson::object>();
    picojson::object& o_2nd_stage    = o_2nd["stage"].get<picojson::object>();
//    picojson::object& o_3rd          = o["3rd stage"].get<picojson::object>();
//    picojson::object& o_3rd_stage    = o_3rd["stage"].get<picojson::object>();
//    picojson::object& o_parachute    = o["parachute"].get<picojson::object>();
    string output_filename           = o["output file name"].get<string>();
    bool following_stage_exist_1st   = o_1st_stage["following stage exist"].get<bool>();
    bool following_stage_exist_2nd   = o_2nd_stage["following stage exist"].get<bool>();
//    bool following_stage_exist_3rd   = o_3rd_stage["following stage exist"].get<bool>();

//    STAGEの有無によって飛翔計算を実施
    flight_simulation("./" + input_file_name,
                      "./output/" + output_filename + "_dynamics_1st.csv",
                      Rocket::STAGE1);
    cout << fixed << setprecision(6) << "1st stage impact point [deg]:\t";
    cout << impact_point[0] << "\t"<< impact_point[1] << endl;
    impact_point << 0.0,0.0;
    impact_flag = false;
    if (following_stage_exist_1st) {
        flight_simulation("./" + input_file_name,
                          "./output/" + output_filename + "_dynamics_2nd.csv",
                          Rocket::STAGE2);
        cout << fixed << setprecision(6) << "2nd stage impact point [deg]:\t";
        cout << impact_point[0] << "\t"<< impact_point[1] << endl;
        impact_point << 0.0,0.0;
        impact_flag = false;
    }
    if (following_stage_exist_2nd) {
        flight_simulation("./" + input_file_name,
                          "./output/" + output_filename + "_dynamics_3rd.csv",
                          Rocket::STAGE3);
        cout << fixed << setprecision(6) << "3rd stage impact point [deg]:\t";
        cout << impact_point[0] << "\t"<< impact_point[1] << endl;
        impact_point << 0.0,0.0;
        impact_flag = false;
    }
    
    cout << fixed << setprecision(0);
    cout << "max altitude[m]:\t" << max_alt << endl;
    cout << "max downrange[m]:\t" << max_downrange << endl;
    cout << "Simulation Success!" << endl;
    end = std::chrono::system_clock::now();  // 計測終了時間
    double elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(end-start).count();
    std::cout << "Processing time:" << elapsed << "[ms]" << std::endl;
    
    return 0;
}
