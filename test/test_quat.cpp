#include <iostream>
#include "../lib/Eigen/Core"
#include "../lib/Eigen/Geometry"

using namespace std;
using namespace Eigen;

const double pi = 3.14159265358979323846;

inline double deg2rad(double deg){
    return deg / 180.0 * pi;
}

int main(){
    double navi_yaw_offset = 0.0, navi_pitch_offset = 90.0, navi_roll_offset = 180.0;

    Quaterniond quat_offset;
    quat_offset = Quaterniond(AngleAxisd(deg2rad(navi_yaw_offset), Vector3d::UnitZ())) *
        Quaterniond(AngleAxisd(deg2rad(navi_pitch_offset), Vector3d::UnitY())) *
        Quaterniond(AngleAxisd(deg2rad(navi_roll_offset), Vector3d::UnitX()));

    cout << "(w, x, y, z): " 
        << quat_offset.w() << " " 
        << quat_offset.x() << " "
        << quat_offset.y() << " "
        << quat_offset.z() << endl;

    /*
    quat_offset = Quaterniond(AngleAxisd(deg2rad(navi_yaw_offset), Vector3d::UnitZ()) *
        AngleAxisd(deg2rad(navi_pitch_offset), Vector3d::UnitY()) *
        AngleAxisd(deg2rad(navi_roll_offset), Vector3d::UnitX()));

    cout << "(w, x, y, z): " 
        << quat_offset.w() << " " 
        << quat_offset.x() << " "
        << quat_offset.y() << " "
        << quat_offset.z() << endl;
        */

    navi_yaw_offset = 0.0, navi_pitch_offset = 0.0, navi_roll_offset = 90.0;
    quat_offset = Quaterniond(AngleAxisd(deg2rad(navi_yaw_offset), Vector3d::UnitZ())) *
        Quaterniond(AngleAxisd(deg2rad(navi_pitch_offset), Vector3d::UnitY())) *
        Quaterniond(AngleAxisd(deg2rad(navi_roll_offset), Vector3d::UnitX()));

    cout << "(w, x, y, z): " 
        << quat_offset.w() << " " 
        << quat_offset.x() << " "
        << quat_offset.y() << " "
        << quat_offset.z() << endl;

    cout << quat_offset.toRotationMatrix() << endl;

    return 0;
}
