//
//  main.cpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2015/11/16.
//  Copyright © 2015 Takahiro Inagawa. All rights reserved.
//

#include <iostream>
#include <iomanip>
#include <vector>
#include <chrono>
#include "../lib/Eigen/Core"
#include "../boost/numeric/odeint.hpp"
#include "../lib/picojson.h"
#include "../lib/csv.h"
#include "rocket.hpp"
#include "coordinate_transform.hpp"
#include "gravity.hpp"
#include "air.hpp"
#include "fileio.hpp"
#include "Orbit.hpp"

using namespace std;
using namespace Eigen;
using namespace boost::numeric::odeint;

const string current_version = "0.52";

int main(int argc, const char * argv[]) {
    std::chrono::system_clock::time_point  start, end; // calcuration time measurement
    start = std::chrono::system_clock::now(); // mesurement start time
    
    std::cout << "Hello, OpenTsiolkovsky! version:" + current_version + "\n";

    string input_file_name;
    string input_file_default = "param_sample.json";
    if (argc == 1) {
        input_file_name = input_file_default;
    } else if (argc == 2) {
        input_file_name = argv[1];
    } else {
        cout << "argument error";
        return 1;
    }

    Rocket rocket(input_file_name);
    rocket.flight_simulation();
    
    end = std::chrono::system_clock::now();  // mesurement end time
    double elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(end-start).count();
    std::cout << "Processing time: " << elapsed << "[ms]\n" << std::endl;
    
    return 0;
}
