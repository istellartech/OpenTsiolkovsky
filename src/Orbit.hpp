//
//  Orbit.hpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2016/03/29.
//  Copyright © 2016 Takahiro Inagawa. All rights reserved.
//

#ifndef Orbit_hpp
#define Orbit_hpp

#include <stdio.h>
#include <string.h>
#include <cmath>
#include "../lib/Eigen/Core"
#include "../lib/Eigen/Geometry"

using namespace Eigen;
using namespace std;

class Orbit{
//    元期: Epoch（年と日）
//    平均運動( m ): Mean Motion（周回/日）または半長径 Semi-major Axis（km）
//    離心率( e ): Eccentricity（単位無し）
//    軌道傾斜角( i ): Inclination（rad）
//    昇交点赤経( \Omega  ): RAAN (Right Ascension of Ascending Node)（rad）
//    近地点引数( \omega ): Argument of Perigee（rad）
//    平均近点角( M ): Mean Anomaly（red）
public:
    Orbit(double a=1, double e=0, double i=0,
          double Omega=0, double omega=0, double nu=0){
        semi_major = a;
        eccentricity = e;
        raan = Omega;
        arg_perigee = omega;
        true_anomaly = nu;
        semi_latus_rectum = a * (1-e*e);
    } // constrator
    
    const double mu = 398600.4418; // gravitational constant km3/s2
    double inclination;         // km
    double eccentricity;        // -
    double raan;                // rad
    double arg_perigee;         // rad
    double bstar;               //
    double drag;                //
    double mean_motion;         //
    double mean_anomaly;        // rad
    double true_anomaly;        // rad
    double semi_latus_rectum;   // km
    double semi_major;          // km
    double semi_minor;          // km
    double major;               // km
    double minor;               // km
    double perigee;             // km
    double apogee;              // km
    double period;              //
    
private:
    
};

class TweLineElement : public Orbit{
public:
    TweLineElement();
    TweLineElement(Orbit orbit);
    
    string line1;
    string line2;
    
    int satellite_number = 0; // 衛星カタログ番号
    char classification = 'U'; // 軍事機密種別
    int international_designator_launch_year = 0; // 国際識別符号
    int international_designator_launch_number = 0;
    string international_designator_piece = "";
    string epoch; // 元期
    int epoch_year = 0;
    int epoch_day = 0;
    int epoch_time = 0;
    double mean_motion_1st_time_derivative = 0;
    double mean_motion_2nd_time_derivative = 0;
    int ephemeris_type = 0;
    int element_number = 999;
    double revolution_number_at_epoch = 0;
    
    int checksum(string line);
    string get_line1();
    string get_line2();
    
    string show();
    
private:
    
};

Orbit elementECI2Orbit(Vector3d posECI_, Vector3d velECI_);
Matrix3d dcmPQW2ECI(Orbit element);
Vector3d posOrbit2ECI(Orbit element);
Vector3d velOrbit2ECI(Orbit element);
bool success_orbit(Orbit element);
double julian_day(int year, int mon, int day, int hr, int minute, double sec);

#endif /* Orbit_hpp */
