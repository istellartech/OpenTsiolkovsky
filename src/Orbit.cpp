//
//  Orbit.cpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2016/03/29.
//  Copyright © 2016 Takahiro Inagawa. All rights reserved.
//

#include "Orbit.hpp"

// ECI座標系の位置、速度から軌道６要素を取得
Orbit elementECI2Orbit(Vector3d posECI_, Vector3d velECI_){
    //    output
    //    a     Semi-major Axis(km)         長半径(km)
    //    e     Eccentricity(-)             離心率(-)
    //    i     Inclination(rad)            軌道傾斜角(rad)
    //    Omega RAAN(rad)                   昇交点赤経(rad)
    //    omega Argument of Perigee(rad)    近地点引数(rad)
    //    nu    true Anomaly                真近地点離角(rad)
    //    M     Mean Anomaly                平均近地点(rad)
    // cf. http://ccar.colorado.edu/asen5070/handouts/cart2kep2002.pdf
    Orbit element = Orbit();
    double a, e, i, Omega, omega, nu;
    double mu = 3.986004418e5;        // earth gravitational constant 地球の重力定数(km3/s2)
    Vector3d momentumECI_;
    double momentum_abs_;
    double posECI_abs_;
    double velECI_abs_;
    posECI_ = posECI_ / 1000; //m -> km
    velECI_ = velECI_ / 1000;
    momentumECI_ = posECI_.cross(velECI_);
    momentum_abs_ = momentumECI_.norm();
    posECI_abs_ = posECI_.norm();
    velECI_abs_ = velECI_.norm();
    double specific_energy = velECI_abs_ * velECI_abs_ / 2 - mu / posECI_abs_;
    a = - mu / 2 / specific_energy;
    e = pow(1 - momentum_abs_ * momentum_abs_ / a / mu, 0.5);
    i = acos(momentumECI_[2] / momentum_abs_);
    Omega = atan2(momentumECI_[0], -momentumECI_[1]);
    double argument_of_latitude = atan2(posECI_[2] / sin(i), posECI_[0] * cos(Omega) + posECI_[1] * sin(Omega));
    nu = acos((a * (1 - e*e) - posECI_abs_) / e / posECI_abs_);
    omega = argument_of_latitude - nu;
    element.semi_major = a;
    element.eccentricity = e;
    element.inclination = i;
    element.raan = Omega;
    element.arg_perigee = omega;
    element.true_anomaly = nu;
    return element;
}

// 軌道要素からECI座標系の位置速度を算出するための座標変換行列
// 楕円座標系としてPQW座標系
Matrix3d dcmPQW2ECI(Orbit element){
    Matrix3d dcmPQW2ECI_ = Matrix3d::Zero();
    double Omega = element.raan;
    double omega = element.arg_perigee;
    double i = element.inclination;
    double cO = cos(Omega); double sO = sin(Omega);
    double co = cos(omega); double so = sin(omega);
    double ci = cos(i);     double si = sin(i);
    dcmPQW2ECI_ << cO*co-sO*ci*so, -cO*so-sO*ci*co,  sO*si,
    sO*co+cO*ci*so, -sO*so+cO*ci*co, -cO*si,
    si*so,           si*co,           ci;
    return dcmPQW2ECI_;
}

// cf. Fundamental of Astrodynamic Application
Vector3d posOrbit2ECI(Orbit element){
    double p = element.semi_latus_rectum;
    double nu = element.true_anomaly;
    double e = element.eccentricity;
    Vector3d posPQW_;
    Vector3d posECI_;
    posPQW_ << p*cos(nu)/(1+e*cos(nu)),
    p*sin(nu)/(1+e*cos(nu)),
    0;
    posECI_ = dcmPQW2ECI(element) * posPQW_;
    return posECI_;
}

Vector3d velOrbit2ECI(Orbit element){
    double p = element.semi_latus_rectum;
    double nu = element.true_anomaly;
    double e = element.eccentricity;
    double mu = element.mu;
    Vector3d velPQW_;
    Vector3d velECI_;
    velPQW_ << -sqrt(mu/p)*sin(nu),
    sqrt(mu/p)*(e+cos(nu)),
    0;
    velECI_ = dcmPQW2ECI(element) * velPQW_;
    return velECI_;
}

// 軌道要素から人工衛星になっているかどうかのチェック
// 1. 現在時刻でのECI座標系での位置・速度取得
// 1. ECI位置速度から軌道要素を計算
// 1. 軌道要素からM=0もしくはν=0のとき（近地点）のECI座標系での位置を計算
// 1. 近地点での位置がわかるので、軌道投入されたかの閾値演算
// 1. 軌道投入に成功したかの判断
// ### 軌道投入の閾値について
// 軌道は必ず円錐曲線になる。その中でも楕円軌道になる。楕円の焦点の一つは地球中心になる。
// その中で、地表に落下せずに人工衛星になるための条件は下記
// - 近地点距離が地球半径以上
bool success_orbit(Orbit element){
    double const earth_radius = 6378.137; // 地球半径 km
    Vector3d posECI_check;
    element.true_anomaly = 0;
    posECI_check = posOrbit2ECI(element);
    if (posECI_check.norm() > earth_radius) {
        return true;
    } else {
        return false;
    }
}

// 日時からユリウス日の算出
// ユリウス日はB.C4713年1月1日の正午（世界時）からの日数
double julian_day(int year, int mon, int day, int hr, int minute, double sec){
    /* Input UTC
     *  inputs          description                    range / units
     *    year        - year                           1900 .. 2100
     *    mon         - month                          1 .. 12
     *    day         - day                            1 .. 28,29,30,31
     *    hr          - universal time hour            0 .. 23
     *    min         - universal time min             0 .. 59
     *    sec         - universal time sec             0.0 .. 59.999
     *  outputs       :
     *    jd          - julian date                    days from 4713 bc
     * cf. sgp4ext.cpp */
    double jd = 367.0 * year - floor((7 * (year + floor((mon + 9) / 12.0))) * 0.25) +
                floor( 275 * mon / 9.0 ) + day + 1721013.5 +
                ((sec / 60.0 + minute) / 60.0 + hr) / 24.0;  // ut in days
    return jd;
}


