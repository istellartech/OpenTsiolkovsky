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
    double omega = 7.292115e-5; // 地球の自転角速度[rad/s]
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
    double omega = 7.292115e-5; // 地球の自転角速度[rad]
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
Vector3d angle_of_attack(Vector3d vel_AIR_BODYframe_){
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
//        beta = asin(vel_AIR_BODYframe_[1] / vel_abs);
        beta = atan2(vel_AIR_BODYframe_[1], vel_AIR_BODYframe_[0]);
        gamma = atan2(sqrt(vel_AIR_BODYframe_[1] * vel_AIR_BODYframe_[1] +
                      vel_AIR_BODYframe_[2] * vel_AIR_BODYframe_[2]), vel_AIR_BODYframe_[0]);
    }
    Vector3d aoa;
    aoa[0] = alpha;
    aoa[1] = beta;
    aoa[2] = gamma;
    return aoa;
}

Matrix3d dcmNED2BODY(double azimuth_rad, double elevation_rad){
    Matrix3d dcm;
    double az = azimuth_rad;
    double el = elevation_rad;
    /*
    dcm <<  cos(el)*cos(az), cos(el)*sin(az), -sin(el),
    -sin(az),                cos(az),          0,
    sin(el)*cos(az),         sin(el)*sin(az),  cos(el);
    */
    dcm = dcmNED2BODY(az, el, 0.0);
    return dcm;
}

Matrix3d dcmNED2BODY(double azimuth_rad, double elevation_rad, double roll_rad){
    Matrix3d dcm;
    double az = azimuth_rad;
    double el = elevation_rad;
    double ro = roll_rad;

    dcm <<  cos(el)*cos(az), cos(el)*sin(az), -sin(el),
    -cos(ro)*sin(az)+sin(ro)*sin(el)*cos(az), cos(ro)*cos(az)+sin(ro)*sin(el)*sin(az), sin(ro)*cos(el),
    sin(ro)*sin(az)+cos(ro)*sin(el)*cos(az),  -sin(ro)*cos(az)+cos(ro)*sin(el)*sin(az),  cos(ro)*cos(el);

    /*
    auto angleaxis_inv = AngleAxisd(az, Vector3d::UnitZ()) * AngleAxisd(el, Vector3d::UnitY()) * AngleAxisd(ro, Vector3d::UnitX());
    dcm = angleaxis_inv.inverse().toRotationMatrix();
    */

    return dcm;
}

Vector2d azimuth_elevation(Vector3d vel_BODY_NEDframe){
    double north  = vel_BODY_NEDframe[0];
    double east = vel_BODY_NEDframe[1];
    double down = vel_BODY_NEDframe[2];
    double azimuth = pi/2.0 - atan2(north, east);
    double elevation = atan2(-down, sqrt(north * north + east * east));
    Vector2d azel;
    azel[0] = azimuth;
    azel[1] = elevation;
    return azel;
}

Vector3d azimuth_elevation_roll(Matrix3d dcmNED2BODY_){
    Vector3d azelro = dcmNED2BODY_.transpose().eulerAngles(2, 1, 0);
    double az_rad = azelro[0];
    double el_rad = azelro[1];
    double ro_rad = azelro[2];

    if (el_rad > deg2rad(90.0)) {
        ro_rad += deg2rad(180.0);
        az_rad += deg2rad(180.0);
        el_rad = deg2rad(180.0) - el_rad;
    } else if (el_rad < deg2rad(-90.0)) {
        ro_rad += deg2rad(180.0);
        az_rad += deg2rad(180.0);
        el_rad = deg2rad(-180.0) - el_rad;
    }

    if (ro_rad > deg2rad(180.0)){
        ro_rad -= deg2rad(360.0);
    }

    return  Vector3d(az_rad, el_rad, ro_rad);
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
    double omega = 7.292115e-5; // 地球の自転角速度[rad]
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
Vector3d posLLH_IIP(Vector3d posECEF_, Vector3d vel_ECEF_ECEFframe_){

    int n_iter = 5;
    double Ra = 6378137.0;
    double f = 1.0 / 298.257223563;
    double Rb = Ra * (1.0 - f);
    double e2 = (Ra * Ra - Rb *Rb) / Ra / Ra;
    double mu = 3.986004418e14;
    double omega = 7.2921151467e-5;
    Vector3d omegaVec_;
    omegaVec_ << 0.0, 0.0, omega;

    // (v)-(A): The distance frome the center of the Earth ellipsoid to the launch point (the initial approximation of r_k1, k=1)
    double r_k1 = Rb;
   
    // (v)-(B): The radial distance from the geocenter to the launch vehicle position
    Vector3d posECI_init_ = posECEF_;
    double r0 = posECI_init_.norm();
    if (r0 < r_k1) // then tha launch vehicle position is below the Earth's surface and an impact point cannot be computed
        return Vector3d::Zero();      // no solution
    
    // (v)-(C): The inertial velocity compoents
    Vector3d velECI_init_ = vel_ECEF_ECEFframe_ + omegaVec_.cross(posECEF_);
    // (v)-(D): The magnitude of the inertial velocity vector
    double v0 = velECI_init_.norm();
    
    // (v)-(E): The eccentricity of the trajectory ellipse multiplied by the cosine of the eccentric anomaly at epoch
    double eps_cos = (r0 * v0 * v0 / mu) - 1.0;
    
    if (eps_cos >= 1.0) // then the trajectory orbit is not elliptical, but is hyperbolic or parabolic, and an impact point cannot be computed
        return Vector3d::Zero();      // no solution

    // (v)-(F): The semi-major axis of the trajectory ellipse
    double a_t = r0 / (1 - eps_cos);
    
    // (v)-(G): The eccentricity of the trajectory ellipse multiplied by the sine of the eccentric anomaly at epoch
    double eps_sin = posECI_init_.dot(velECI_init_) / sqrt(mu * a_t);
    
    // (v)-(H): The eccentricity of the trajectory ellipse squared 
    double eps2 = eps_cos * eps_cos + eps_sin * eps_sin;
    if (sqrt(eps2) <= 1.0 && a_t * (1 - sqrt(eps2)) - Ra >= 0.0) // then the trajectory perigee height is positive and an impact point cannot be computed
        return Vector3d::Zero();      // no solution
    
    double eps_k_cos, eps_k_sin, delta_eps_k_cos, delta_eps_k_sin;
    double fseries_2, gseries_2, Ek, Fk, Gk, r_k2, r_k1_tmp;
    
    for (int i=0; i<n_iter; i++){
        // (v)-(I): The eccentricity of the trajectory ellipse multiplied by the cosine of the eccentric anomaly at impact
        eps_k_cos = (a_t - r_k1) / a_t;
        
        // (v)-(J): The eccentricity of the trajectory ellipse multiplied by the sine of the eccentric anomaly at impact
        if ((eps2 - eps_k_cos * eps_k_cos) < 0) // then the trajectory orbit does not intersect the Earth's surface and an impact point cannot be computed
            return Vector3d::Zero();      // no solution
        eps_k_sin = -sqrt(eps2 - eps_k_cos * eps_k_cos);
        
        // (v)-(K): The cosine of the difference between the eccentric anomaly at impact and epoch
        delta_eps_k_cos = (eps_k_cos*eps_cos + eps_k_sin*eps_sin) / eps2;
        
        // (v)-(L): The sine of the difference between the eccentric anomaly at impact and epoch
        delta_eps_k_sin = (eps_k_sin*eps_cos - eps_k_cos*eps_sin) / eps2;
        
        // (v)-(M): The f-series expansion of Kepler's equations
        fseries_2 = (delta_eps_k_cos - eps_cos) / (1 - eps_cos);
        // (v)-(N): The g-series expansion of Kepler's equations
        gseries_2 = (delta_eps_k_sin + eps_sin - eps_k_sin) * sqrt(a_t*a_t*a_t / mu);
        
        // (v)-(O): The E,F,G coordinates at impact
        Ek = fseries_2*posECI_init_[0] + gseries_2*velECI_init_[0];
        Fk = fseries_2*posECI_init_[1] + gseries_2*velECI_init_[1];
        Gk = fseries_2*posECI_init_[2] + gseries_2*velECI_init_[2];
        
        // (v)-(P): The approximated distance from the geocenter to the launch vehicle position at impact
        r_k2 = Ra / sqrt((e2/(1 - e2))*(Gk/r_k1)*(Gk/r_k1) + 1);
        
        // (v)-(Q): Substituting and repeating
        r_k1_tmp = r_k1;
        r_k1 = r_k2;
    }

    // (v)-(Q): check convergence
    if (abs(r_k1_tmp - r_k2) > 1.0) // then the iterative solution does not converge and an impact point does not meet the accuracy tolerance
        return Vector3d::Zero();      // no solution
    
    // (v)-(R): The difference between the eccentric anomaly at impact and epoch
    double delta_eps = atan2(delta_eps_k_sin, delta_eps_k_cos);
    
    // (v)-(S): The time of flight from epoch to impact
    double time_sec = (delta_eps + eps_sin - eps_k_sin) * sqrt(a_t*a_t*a_t / mu);
    
    // (v)-(T): The geocentric latitude at impact
    double phi_impact_tmp = asin(Gk / r_k2);
    // (v)-(U): The geodetic latitude at impact
    double phi_impact = atan2(tan(phi_impact_tmp), 1.0 - e2);
    // (v)-(V): The East longitude at impact
    double lambda_impact = atan2(Fk, Ek) - omega*time_sec;
    
    // finish: convert to posECEF_IIP_
    // posECEF_IIP_ = coord_utils.CoordUtils([rad2deg(phi_impact), rad2deg(lammda_impact), 0]).ecef_origin
    
    Vector3d posIIP(phi_impact, lambda_impact, 0.0);
    return posIIP * 180.0 / M_PI;

}

