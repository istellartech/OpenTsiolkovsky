#include <iostream>
#include "../lib/Eigen/Core"
#include "../lib/Eigen/Geometry"

using namespace std;
using namespace Eigen;

const double pi = 3.14159265358979323846;

inline double deg2rad(double deg){
    return deg / 180.0 * pi;
}

inline double rad2deg(double rad){
    return rad * 180.0 / pi;
}

Matrix3d dcmNED2BODY(double azimuth_rad, double elevation_rad, double roll_rad){
    Matrix3d dcm;
    double az = azimuth_rad;
    double el = elevation_rad;
    double ro = roll_rad;
    dcm <<  cos(el)*cos(az), cos(el)*sin(az), -sin(el),
    -cos(ro)*sin(az)+sin(ro)*sin(el)*cos(az), cos(ro)*cos(az)+sin(ro)*sin(el)*sin(az), sin(ro)*cos(el),
    sin(ro)*sin(az)+cos(ro)*sin(el)*cos(az),  -sin(ro)*cos(az)+cos(ro)*sin(el)*sin(az),  cos(ro)*cos(el);
    return dcm;
}

int main(){
    double yaw = deg2rad(30.0), pitch = deg2rad(45.0), roll = deg2rad(90.0);
    cout << yaw << "," << pitch << "," << roll << endl;
    cout << endl;

    auto angleaxis_inv = AngleAxisd(yaw, Vector3d::UnitZ()) * AngleAxisd(pitch, Vector3d::UnitY()) * AngleAxisd(roll, Vector3d::UnitX());
    Matrix3d dcm = angleaxis_inv.inverse().toRotationMatrix();

    cout << dcmNED2BODY(yaw, pitch, roll) << endl;
    cout << endl;
    cout << dcm << endl;
    
    cout << endl;
    cout << dcm.transpose().eulerAngles(2, 1, 0) << endl;

    return 0;
}

