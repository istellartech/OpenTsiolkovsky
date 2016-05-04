//
//  air.cpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2015/11/23.
//  Copyright © 2015 Takahiro Inagawa. All rights reserved.
//

#include "air.hpp"
#include "../lib/Eigen/Core"
#include <iostream>
#include <iomanip>
#include <fstream>
#include <sstream>
#include <string.h>
#include <cmath>
#include <vector>
//#include "unsupported/Eigen/Splines"

using namespace std;
using namespace Eigen;

Air Air::altitude(double altitude){
    Air air;
    if ( altitude > HAL[0] && altitude < HAL[1] ){
        k = 0;
    } else if ( altitude >= HAL[1] && altitude < HAL[2] ){
        k = 1;
    } else if ( altitude >= HAL[2] && altitude < HAL[3] ){
        k = 2;
    } else if ( altitude >= HAL[3] && altitude < HAL[4] ){
        k = 3;
    } else if ( altitude >= HAL[4] && altitude < HAL[5] ){
        k = 4;
    } else if ( altitude >= HAL[5] && altitude < HAL[6] ){
        k = 5;
    } else if ( altitude >= HAL[6] && altitude < HAL[7] ){
        k = 6;
    } else if ( altitude >= HAL[7]){
        k = 7;
    } else {
        k = 0;
    }
        
    air.temperature = air.T0[k] + air.LR[k] * (altitude - air.HAL[k]);
    air.airspeed = sqrt(air.temperature * air.gamma * air.R);
    if (air.LR[k] != 0){
        air.pressure = air.P0[k] * pow(((T0[k] + LR[k] *(altitude - air.HAL[k])) / air.T0[k]) ,
                                       (air.g / -air.LR[k] / air.R));
    } else {
        air.pressure = air.P0[k] * exp(air.g / air.R * (air.HAL[k] - altitude) / air.T0[k]);
    }
    air.density = air.pressure / R / air.temperature;
    return air;
}

void test_air(){
    Air air;
    std::ofstream ofs( "./output/air.csv");
    if (!ofs) {
        std::cerr << "ファイルオープンに失敗" << std::endl;
        std::exit(1);
    }
    ofs << "altitude(m)" << "\t" << "temperature (K)" << "\t" <<
           "airspeed (m/s)" << "\t" << "density (kg/m3)" << endl;

    for (int altitude = 0; altitude < 100000; altitude = altitude + 100) {
        air = air.altitude((altitude));
        ofs << altitude << "\t" << air.temperature << "\t" <<
        air.airspeed << "\t" << air.density << endl;
    }
}


//function [T, a, P, rho] = atmosphere_Rocket( h )
//% ATMOSPHERE_ROCKET 標準大気モデルを用いた、高度による温度、音速、大気圧、空気密度の関数
//% 高度は基準ジオポテンシャル高度を元にしている。
//% 標準大気の各層ごとの気温減率から定義式を用いて計算している。
//% Standard Atmosphere 1976　ISO 2533:1975
//% 中間圏高度86kmまでの気温に対応している。それ以上は国際標準大気に当てはまらないので注意。
//% cf. http://www.pdas.com/hydro.pdf
//% @param h 高度[m]
//% @return T 温度[K]
//% @return a 音速[m/s]
//% @return P 気圧[Pa]
//% @return rho 空気密度[kg/m3]
//% 1:	対流圏		高度0m
//% 2:	対流圏界面	高度11000m
//% 3:	成層圏  		高度20000m
//% 4:	成層圏　 		高度32000m
//% 5:	成層圏界面　	高度47000m
//% 6:	中間圏　 		高度51000m
//% 7:	中間圏　 		高度71000m
//% 8:	中間圏界面　	高度84852m
//
//% ----
//% Future Works:
//% ATOMOSPHERIC and SPACE FLIGHT DYNAMICSより
//% Standard ATOMOSPHEREのスクリプトに変更して高度2000kmまで対応にする。
//% 主に温度上昇と重力加速度とガス状数が変化することに対応すること。
//% ----


double coef_drag(double mach){
    double Cd = 0.0;
    double alpha;
    vector<double> mach_data{0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.1, 1.2, 1.4, 1.6,
                             1.8, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0};
    vector<double> cd_data{0.28, 0.28, 0.28, 0.29, 0.35, 0.64, 0.67, 0.69, 0.66,
                           0.62, 0.58, 0.55, 0.48, 0.42, 0.38, 0.355, 0.33};
//    線形補間
    for (int i = 0; i < mach_data.size()-1; i++) {
        if (mach >= mach_data[i] && mach < mach_data[i+1]) {
            alpha = (mach - mach_data[i]) / (mach_data[i+1] - mach_data[i]);
            Cd = cd_data[i] + alpha * (cd_data[i+1] - cd_data[i]);
            break;
        }
        if (mach < mach_data[0]) {
            Cd = cd_data[0];
        }else if (mach >= mach_data[mach_data.size()]){
            Cd = cd_data[cd_data.size()-1];
        }
    }
    return Cd;
}

void test_coef_drag(){
    double cd;
    std::ofstream ofs( "./output/drag.csv");
    if (!ofs) {
        std::cerr << "ファイルオープンに失敗" << std::endl;
        std::exit(1);
    }
    ofs << "Mach number(-)" << "\t" << "Cd (-)" << endl;
    
    for (double Mach = 0; Mach < 10.0; Mach = Mach + 0.01) {
        cd = coef_drag(Mach);
        ofs << Mach << "\t" << cd << endl;
    }
}

MatrixXd read_coef_drag(){
    MatrixXd value = MatrixXd::Zero(2,2);
    ifstream ifs("./Cd.csv");
    if(!ifs){
        cout<<"input file error";
    }
    string str;
    string name;
    int col = 0;
    int max_col = 2;
    while( getline( ifs, str ) ){
        string token;
        stringstream ss0, ss1;
        istringstream stream( str );
        int row = 0;
        while( getline( stream, token, ',' ) ) {
            switch (row) {
                case 0:
                    value(col, row) = stof(token); break;
                case 1:
                    value(col, row) = stof(token); break;
            }
            row++;
        }
        max_col++;
        value.conservativeResize(max_col, 2);
        col++;
    }
    value.conservativeResize(max_col-2, 2);
    return value;
}
