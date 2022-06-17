//
//  fileio.hpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2016/03/10.
//  Copyright © 2016 Takahiro Inagawa. All rights reserved.
//

#ifndef fileio_hpp
#define fileio_hpp

#include <stdio.h>
#include <iostream>
#include <iomanip>
#include <fstream>
#include <sstream>
#include <string.h>
#include <cmath>
#include <vector>
#include "../lib/Eigen/Core"
#include "../lib/csv.h"

using namespace std;
using namespace Eigen;

double interp_matrix(double x, MatrixXd matrix, int col_num = 1);
double interp_matrix_2d(double mach, double alpha, MatrixXd matrix);
MatrixXd read_csv_vector_2d(string filename, string col_name0, string col_name1);
MatrixXd read_csv_vector_3d(string filename,
                            string col_name0, string col_name1, string col_name2);
MatrixXd read_csv_vector_4d(string filename,
                            string col_name0, string col_name1,
                            string col_name2, string col_name3);
MatrixXd read_csv_vector_15d(string filename);

#endif /* fileio_hpp */
