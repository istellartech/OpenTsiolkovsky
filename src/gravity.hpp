//
//  gravity.hpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2015/11/23.
//  Copyright © 2015 Takahiro Inagawa. All rights reserved.
//

#ifndef gravity_hpp
#define gravity_hpp

#include <stdio.h>
#include <iostream>
#include <fstream>
#include <cmath>
#include "../lib/Eigen/Core"
#include "../lib/Eigen/Geometry"

using namespace std;
using namespace Eigen;

// double gravity(double altitude, double latitude);
Vector3d gravityECI(Vector3d posECI_);
// void test_gravity();

#endif /* gravity_hpp */
