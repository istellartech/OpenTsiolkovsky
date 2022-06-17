//
//  coordinate_transform.hpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2015/11/28.
//  Copyright © 2015 Takahiro Inagawa. All rights reserved.
//

#ifndef coordinate_transform_hpp
#define coordinate_transform_hpp

#include <stdio.h>
#include <iostream>
#include "../lib/Eigen/Core"
#include "../lib/Eigen/Geometry"

const double pi = 3.14159265358979323846;

using namespace Eigen;
using namespace std;

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
Vector3d angle_of_attack(Vector3d vel_AIR_BODYframe_);
Matrix3d dcmNED2BODY(double azimuth_rad, double elevation_rad);
Matrix3d dcmNED2BODY(double azimuth_rad, double elevation_rad, double roll_rad);
Vector2d azimuth_elevation(Vector3d vel_BODY_NEDframe);
Vector3d azimuth_elevation_roll(Matrix3d dcmNED2BODY_);
Matrix3d dcmECI2BODY(Matrix3d dcmNED2BODY_, Matrix3d dcmECI2NED_);
Vector3d posECEF(Vector3d posLLH_);
Vector3d posECI(Matrix3d posECEF_, double second);
Vector3d vel_ECI_ECIframe(Matrix3d dcmNED2ECI_, Vector3d vel_ECEF_NEDframe_, Vector3d posECI_);
// ==== Initialize ====
Vector3d posECI_init(Vector3d posLLH_);
Vector3d velECI_init(Vector3d vel_ECEF_NEDframe_, Vector3d posLLH_);
double distance_surface(Vector3d pos0_LLH, Vector3d pos1_LLH);
Vector3d posLLH_IIP(Vector3d posECEF_, Vector3d vel_ECEF_ECEFframe_);

inline double deg2rad(double deg){
    return deg / 180.0 * pi;
}

inline double rad2deg(double rad){
    return rad * 180.0 / pi;
}

#endif /* coordinate_transform_hpp */
