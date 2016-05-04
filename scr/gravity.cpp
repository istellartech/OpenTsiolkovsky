//
//  gravity.cpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2015/11/23.
//  Copyright © 2015 Takahiro Inagawa. All rights reserved.
//

#include <iostream>
#include <fstream>
#include <cmath>
#include "gravity.hpp"

using namespace std;

double gravity(double altitude, double latitude){
//    altitude m
//    latitude rad
    double mu = 3.986004e14;
    double Re = 6378.135e3;
    double J2 = 1.08263e-3;
    double epsilon = 1 / 298.257;
    double r;
    double gc;
    double gnorth;
    
    r = altitude + Re * (1 - epsilon * sin(latitude) * sin(latitude));
    
    gc = - mu / r / r * (1 - 1.5 * J2 *(Re/r) * (Re/r) * (3*sin(latitude) * sin(latitude) - 1));
    gnorth = mu / r /r * J2 * (Re/r) * (Re/r) * sin(2*latitude);
    return gc;
}


void test_gravity(){
    double latitude;
    latitude = 0;
    double g = 0.0;
    
    std::cout << g << std::endl;
    std::ofstream ofs( "./output/gravity.csv");
    if (!ofs) {
        std::cerr << "ファイルオープンに失敗" << std::endl;
        std::exit(1);
    }
    ofs << "altitude(km)" << "\t" << "gravity(m/s2)" << endl;
    for (int altitude = 0; altitude < 1000000; altitude = altitude + 1000) {
        g = gravity(altitude, latitude);
        int alt_km = altitude / 1000;
        ofs << alt_km << "\t" << g << endl;
//        cout << g << endl;
    }
}


