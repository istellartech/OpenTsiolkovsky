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

Orbit elementECI2Orbit(Vector3d posECI_, Vector3d velECI_);
Matrix3d dcmPQW2ECI(Orbit element);
Vector3d posOrbit2ECI(Orbit element);
Vector3d velOrbit2ECI(Orbit element);
bool success_orbit(Orbit element);

#endif /* Orbit_hpp */
