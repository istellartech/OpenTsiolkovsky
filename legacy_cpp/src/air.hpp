//
//  air.hpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2015/11/23.
//  Copyright © 2015 Takahiro Inagawa. All rights reserved.
//

#ifndef air_hpp
#define air_hpp

#include <stdio.h>
#include <vector>
#include "../lib/Eigen/Core"

using namespace std;
using namespace Eigen;

class Air{
private:
    double g = 9.80655;
    double gamma = 1.4;
    double R = 287.0531;
    //    height of atmospheric layer
    int HAL[8] = {0, 11000, 20000, 32000, 47000, 51000, 71000, 84852};
    //    Lapse Rate Kelvin per meter
    double LR[8] = {-0.0065, 0.0, 0.001, 0.0028, 0, -0.0028, -0.002, 0.0};
    //    Tempareture Kelvin
    double T0[8] = {288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65, 186.95};
    //    Pressure Pa
    double P0[8] = {101325, 22632, 5474.9, 868.02, 110.91, 66.939, 3.9564, 0.3734};
    int k = 0;
    
public:
    double temperature = 300;
    double airspeed = 1200;
    double pressure = 101300;
    double density = 1.2;
    Air altitude(double altitude);
    Air altitude_with_variation(double altitude, double input_percent);
    Air altitude_with_variation_table(double altitude, MatrixXd variation_table);
    double coef_density_variance(double altitude, double input_percent);
    double coef_density_variance_table(double altitude, MatrixXd variation_table);
};

double linear_interp1_from_y(double y, vector<double> x_array, vector<double> y_array);
void test_air();

#endif /* air_hpp */
