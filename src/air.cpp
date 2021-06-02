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

Air Air::altitude_with_variation(double altitude, double input_percent){
    // Pseudo constructor.
    // Enter altitude and variation ratio air density with altitude to calculate air density
    Air air = Air::altitude(altitude);
    double coef = Air::coef_density_variance(altitude, input_percent);
    air.density = air.density * (1.0 + coef);
    return air;
}

Air Air::altitude_with_variation_table(double altitude, MatrixXd variation_table){
    // Pseudo constructor.
    // Enter altitude and variation ratio air density table to calculate air density
    Air air = Air::altitude(altitude);
    double coef = Air::coef_density_variance_table(altitude, variation_table);
    air.density = air.density * (1.0 + coef);
    return air;
}

double Air::coef_density_variance(double altitude, double input_percent){
    // altitude : [m]
    // percent : [%](-100 ~ 100), enter 0 when nominal air density
    // @output coefficient of density variance : [-1.0 ~ 1.0]
    // cf. U.S. standard atmosphere PART2 Atmospheric Model 2.1.4 Density Variations
    if (input_percent == 0){
        return 0;
    }
    //vector<double> minus_x = {-12.8, -7.9, -1.3, -14.3, -15.9, -18.6, -32.1, -38.6, -50.0, -55.3, -65.0, -68.1, -76.7, -42.2};
    vector<double> minus_x = {21.6, 7.4, -1.3, -14.3, -15.9, -18.6, -32.1, -38.6, -50.0, -55.3, -65.0, -68.1, -76.7, -42.2};
    vector<double> minus_y = {1010, 4300, 8030, 10220, 16360, 20300, 26220, 29950, 40250, 50110, 59970, 70270, 80140, 90220};
    //vector<double> plus_x = {21.6, 7.4, 1.5, 5.3, 26.7, 20.2, 14.3, 18.2, 33.6, 47.4, 59.5, 72.2, 58.7, 41.4};
    vector<double> plus_x = {-12.8, -7.9, 1.5, 5.3, 26.7, 20.2, 14.3, 18.2, 33.6, 47.4, 59.5, 72.2, 58.7, 41.4};
    vector<double> plus_y = {1230, 4300, 8030, 10000, 16360, 20300, 26220, 29950, 40250, 50110, 59970, 70270, 80360, 90880};
    double percent_of_density_with_alt;
    if (input_percent < 0){
        percent_of_density_with_alt = linear_interp1_from_y(altitude, minus_x, minus_y);
    } else {
        percent_of_density_with_alt = linear_interp1_from_y(altitude, plus_x, plus_y);
    }
    return percent_of_density_with_alt / 100 * abs(input_percent) / 100;
}

double Air::coef_density_variance_table(double altitude, MatrixXd variation_table){
    // variation table : [altitude[m], air density variation[percent]
    vector<double> altitude_ref;
    vector<double> variation_ref;
    int len = variation_table.rows();

    altitude_ref.resize(len);
    variation_ref.resize(len);

    for(int i=0; i<len; i++){
        altitude_ref[i] = variation_table(i, 0);
        variation_ref[i] = variation_table(i, 1);
    }
    
    double percent_of_density_with_alt = linear_interp1_from_y(altitude, variation_ref, altitude_ref);

    return percent_of_density_with_alt / 100;
}

double linear_interp1_from_y(double y, vector<double> x_array, vector<double> y_array){
    // linear interpolattion with same number of x_array and y_array from y-axis
    // not extrapolation, It has the same value as the outermost point.
    // @params y: y component of the data you want to obtain
    // @params x_array The x component of the original data
    // @params y_array The x component of the original data
    // @return x(double) interpolated value
    double x = 0.0;
    double alpha = 0.0;
    for (int i = 0; i < y_array.size()-1; i++) {
        if (y >= y_array[i] && y < y_array[i+1]) {
            alpha = (y - y_array[i]) / (y_array[i+1] - y_array[i]);
            x = x_array[i] + alpha * (x_array[i+1] - x_array[i]);
        }
    }
    if (y < y_array[0]) {
        x = x_array[0];
    }else if (y >= y_array.back()){
        x = x_array.back();
    }
    return x;
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
