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

