//
//  coordinate_transform.cpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2015/11/28.
//  Copyright © 2015 Takahiro Inagawa. All rights reserved.
//

#include "coordinate_transform.hpp"

using namespace std;

Matrix3d dcmECI2ECEF(double second){
    double omega = 7.2921159e-5; // 地球の自転角速度[rad/s]
    double theta = omega * second;
    Matrix3d dcm;
    dcm << cos(theta), sin(theta), 0.0,
          -sin(theta), cos(theta), 0.0,
           0.0,        0.0,        1.0;
    return dcm;
}

Vector3d posECEF(Matrix3d dcmECI2ECEF_, Vector3d posECI_){
    Vector3d posECEF = dcmECI2ECEF_ * posECI_;
    return posECEF;
}

double n_posECEF2LLH(double phi_n_deg, double a, double e2){
    return a / sqrt(1.0 - e2 * sin(deg2rad(phi_n_deg)) * sin(deg2rad(phi_n_deg)));
}

// deg返し
Vector3d posLLH(Vector3d posECEF_){
    
    Vector3d posLLH;
    double a = 6378137.0;               // WGS84の長軸[m]
    double one_f = 298.257223563;       // 扁平率fの1/f（平滑度）
    double b = a * (1.0 - 1.0 / one_f); // WGS84の短軸[m] b = 6356752.314245
    double e2 = (1.0 / one_f) * (2.0 - (1.0 / one_f));  // 第一離心率eの2乗
    double ed2 = (e2 * a * a / (b * b));// 第二離心率e'の2乗
    double p = sqrt(posECEF_(0) * posECEF_(0) + posECEF_(1) * posECEF_(1));    // 現在位置での地球回転軸からの距離[m]
    double theta = atan2(posECEF_(2)*a, p*b);    //[rad]
    posLLH[0] = rad2deg(atan2((posECEF_(2) + ed2 * b * pow(sin(theta),3)), p - e2 * a * pow(cos(theta),3)));
    posLLH[1] = rad2deg(atan2(posECEF_(1),posECEF_(0)));
    posLLH[2] = p / cos(deg2rad(posLLH(0))) - n_posECEF2LLH(posLLH(0), a, e2);
    return posLLH;
}

Matrix3d dcmECEF2NED(Vector3d posLLH_){
    Matrix3d dcm;
    double lat = deg2rad(posLLH_[0]);
    double lon = deg2rad(posLLH_[1]);
    dcm << -sin(lat)*cos(lon), -sin(lat)*sin(lon), cos(lat),
           -sin(lon),           cos(lon),          0,
           -cos(lat)*cos(lon), -cos(lat)*sin(lon), -sin(lat);
    return dcm;
}

Matrix3d dcmECI2NED(Matrix3d dcmECEF2NED_, Matrix3d dcmECI2ECEF_){
    return dcmECEF2NED_ * dcmECI2ECEF_;
}

Vector3d vel_ECEF_NEDframe(Matrix3d dcmECI2NED_, Vector3d vel_ECI_ECIframe_, Vector3d pos_ECI_){
    double omega = 7.2921159e-5; // 地球の自転角速度[rad]
    Matrix3d omegaECI2ECEF_;    // 角速度テンソル angular velocity tensorß
    omegaECI2ECEF_ << 0.0,   -omega, 0.0,
                      omega, 0.0,    0.0,
                      0.0,   0.0,    0.0;
    return dcmECI2NED_ * (vel_ECI_ECIframe_ - omegaECI2ECEF_ * pos_ECI_);
}

// @param wind_speed        風速 m/s
// @param wind_direction    風向 deg
Vector3d vel_wind_NEDframe(double wind_speed, double wind_direction){
    Vector3d vel;
    vel[0] = - wind_speed * cos(deg2rad(wind_direction));
    vel[1] = - wind_speed * sin(deg2rad(wind_direction));
    vel[2] = 0;
    return vel;
}

//Vector3d vel_AIR_BODYframe(Matrix3d dcmNED2ECEF_, Vector3d vel_ECEF_NEDframe_, Vector3d vel_wind_NEDframe_){
//    return dcmNED2ECEF_ * (vel_ECEF_NEDframe_ - vel_wind_NEDframe_);
//}

Vector3d vel_AIR_BODYframe(Matrix3d dcmNED2BODY_, Vector3d vel_ECEF_NEDframe_, Vector3d vel_wind_NEDframe_){
    return dcmNED2BODY_ * (vel_ECEF_NEDframe_ - vel_wind_NEDframe_);
}


// rad返し
Vector3d attack_of_angle(Vector3d vel_AIR_BODYframe_){
    double vel_abs = vel_AIR_BODYframe_.norm();
    double alpha;
    double beta;
    double gamma;
    if(abs(vel_AIR_BODYframe_[0]) < 0.001 || vel_abs < 0.01){
        alpha = 0;
        beta = 0;
        gamma = 0;
    }else{
        alpha = atan2(vel_AIR_BODYframe_[2], vel_AIR_BODYframe_[0]);
        beta = asin(vel_AIR_BODYframe_[1] / vel_abs);
//        beta = atan2(vel_AIR_BODYframe_[1], vel_AIR_BODYframe_[0]);
        gamma = atan2(sqrt(vel_AIR_BODYframe_[1] * vel_AIR_BODYframe_[1] +
                      vel_AIR_BODYframe_[2] * vel_AIR_BODYframe_[2]), vel_AIR_BODYframe_[0]);
    }
    Vector3d aoa;
    aoa[0] = alpha;
    aoa[1] = beta;
    aoa[2] = gamma;
    return aoa;
}

Matrix3d dcmBODY2AIR(Vector3d attack_of_angle_){
    Matrix3d dcm;
    double alpha = attack_of_angle_[0];
    double beta  = attack_of_angle_[1];
    dcm <<  cos(alpha)*cos(beta), sin(beta),  sin(alpha)*cos(beta),
           -cos(alpha)*sin(beta), cos(beta), -sin(alpha)*sin(beta),
           -sin(alpha),           0,          cos(alpha);
    return dcm;
}

//Matrix3d dcmBODY2NED(double azimth, double elevation){
//    Matrix3d dcm;
//    dcm <<  cos(elevation)*cos(azimth), cos(elevation)*sin(azimth), -sin(elevation),
//           -sin(azimth),                cos(azimth),                 0,
//            sin(elevation)*cos(azimth), sin(elevation)*sin(azimth),  cos(elevation);
//    return dcm;
//}

Matrix3d dcmNED2BODY(double azimth_rad, double elevation_rad){
    Matrix3d dcm;
    double az = azimth_rad;
    double el = elevation_rad;
    dcm <<  cos(el)*cos(az), cos(el)*sin(az), -sin(el),
    -sin(az),                cos(az),          0,
    sin(el)*cos(az),         sin(el)*sin(az),  cos(el);
    return dcm;
}

Vector2d azimth_elevaztion(Vector3d vel_BODY_NEDframe){
    double north  = vel_BODY_NEDframe[0];
    double east = vel_BODY_NEDframe[1];
    double down = vel_BODY_NEDframe[2];
    double azimth = pi/2.0 - atan2(north, east);
    double elevation = atan2(-down, sqrt(north * north + east * east));
    Vector2d azel;
    azel[0] = azimth;
    azel[1] = elevation;
    return azel;
}


Matrix3d dcmECI2BODY(Matrix3d dcmNED2BODY_, Matrix3d dcmECI2NED_){
    return dcmNED2BODY_ * dcmECI2NED_;
}

// Initialize
// degから位置返し
Vector3d posECEF(Vector3d posLLH_){
    Vector3d pos;
    double lat = deg2rad(posLLH_[0]); //degree
    double lon = deg2rad(posLLH_[1]);
    double alt = posLLH_[2];
    double a = 6378137; // 長半径a [m]
    double f = 1.0 / 298.257223563; // 扁平率
    double e = sqrt(2*f - f*f); // 離心率 e
    double e2 = e * e;
    double W = sqrt(1.0 - e2 * sin(lat) * sin(lat));
    double N = a / W; // 卯酉線曲率半径
    pos[0] = (N + alt) * cos(lat) * cos(lon);
    pos[1] = (N + alt) * cos(lat) * sin(lon);
    pos[2] = (N * (1 - e2) + alt) * sin(lat);
    return pos;
}

Vector3d posECI(Vector3d posECEF_, double second){
    Matrix3d dcmECI2ECEF_ = dcmECI2ECEF(second);
    Matrix3d dcmECEF2ECI_ = dcmECI2ECEF_.transpose();
    return dcmECEF2ECI_ * posECEF_;
}

Vector3d vel_ECI_ECIframe(Matrix3d dcmNED2ECI_, Vector3d vel_ECEF_NEDframe_, Vector3d posECI_){
    double omega = 7.2921159e-5; // 地球の自転角速度[rad]
    Matrix3d omegaECI2ECEF_;    // 角速度テンソル angular velocity tensorß
    omegaECI2ECEF_ << 0.0,   -omega, 0.0,
                      omega, 0.0,    0.0,
                      0.0,   0.0,    0.0;
    return dcmNED2ECI_ * vel_ECEF_NEDframe_ + omegaECI2ECEF_ * posECI_;
}

// 初期値設定 Initialize
// degから位置
Vector3d posECI_init(Vector3d posLLH_){
    Vector3d posECEF_;
    double second = 0.0;
    posECEF_ = posECEF(posLLH_);
    return posECI(posECEF_, second);
}

// deg, m/sから速度
Vector3d velECI_init(Vector3d vel_ECEF_NEDframe_, Vector3d posLLH_){
    double second = 0.0;
    Matrix3d dcmECI2ECEF_;
    Matrix3d dcmECEF2NED_;
    Matrix3d dcmECI2NED_;
    Matrix3d dcmNED2ECI_;
    Vector3d posECI_init_;
    posECI_init_ = posECI_init(posLLH_);
    dcmECI2ECEF_ = dcmECI2ECEF(second);
    dcmECEF2NED_ = dcmECEF2NED(posLLH_);
    dcmECI2NED_ = dcmECI2NED(dcmECEF2NED_, dcmECI2ECEF_);
    dcmNED2ECI_ = dcmECI2NED_.transpose();
    return vel_ECI_ECIframe(dcmNED2ECI_, vel_ECEF_NEDframe_, posECI_init_);
}


// 緯度経度高度で記述された距離2地点間の地球表面の距離を算出
// ダウンレンジの計算などに使用
// LLH→ECEFを算出し、直交座標系での地球中心からの角度を求め、角度と地球半径から計算
// http://www.ic.daito.ac.jp/~mizutani/gps/measuring_earth.html
double distance_surface(Vector3d pos0_LLH_, Vector3d pos1_LLH_){
    double const earth_radius = 6378137; // 地球半径 m
    Vector3d pos0_ECEF_ = posECEF(pos0_LLH_);
    Vector3d pos1_ECEF_ = posECEF(pos1_LLH_);
    double theta = acos(pos0_ECEF_.dot(pos1_ECEF_) /
                        pos0_ECEF_.norm() / pos1_ECEF_.norm()); // radius
    return earth_radius * theta;
}

// その時刻でのIIP（瞬間落下地点）をLLHで出力
Vector3d posLLH_IIP(double t, Vector3d posECI_, Vector3d vel_ECEF_NEDframe_){
    double g0 = 9.80665;
    Matrix3d dcmECI2ECEF_ = dcmECI2ECEF(t);
    Vector3d posLLH_ = posLLH(posECEF(dcmECI2ECEF_, posECI_));
    Matrix3d dcmNED2ECI_ = dcmECI2NED(dcmECEF2NED(posLLH_), dcmECI2ECEF_).transpose();
    double vel_north_ = vel_ECEF_NEDframe_(0);
    double vel_east_ = vel_ECEF_NEDframe_(1);
    double vel_up_ = - vel_ECEF_NEDframe_(2);
    double h = posLLH_(2);
    double tau = 1.0 / g0 * (vel_up_ + sqrt(vel_up_ * vel_up_ + 2 * h * g0));
    Vector3d dist_IIP_from_now_NED;
    Vector3d posECI_IIP_;
    Vector3d posECEF_IIP_;
    dist_IIP_from_now_NED << vel_north_ * tau, vel_east_ * tau, -h;
    posECI_IIP_ = posECI_ + dcmNED2ECI_ * dist_IIP_from_now_NED;
    posECEF_IIP_ = posECEF(dcmECI2ECEF(t), posECI_IIP_);
    return posLLH(posECEF_IIP_);
}

