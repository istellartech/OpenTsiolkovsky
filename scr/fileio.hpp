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
#include "../lib/Eigen/Core"
#include <vector>

using namespace std;
using namespace Eigen;

double interp_matrix(double x, MatrixXd matrix, int col_num = 1);
MatrixXd read_csv_vector_2d(string filename, string col_name0, string col_name1);
MatrixXd read_csv_vector_3d(string filename,
                            string col_name0, string col_name1, string col_name2);

#endif /* fileio_hpp */
