//
//  fileio.cpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2016/03/10.
//  Copyright © 2016 Takahiro Inagawa. All rights reserved.
//

#include "fileio.hpp"
#include "../lib/Eigen/Core"
#include <iostream>
#include <iomanip>
#include <fstream>
#include <sstream>
#include <string.h>
#include <cmath>
#include <vector>
#include "../lib/csv.h"

using namespace std;
using namespace Eigen;


double interp_matrix(double x, MatrixXd matrix, int col_num){
    // 線形補間をする、外挿は無し。点の外は最外点そのまま
    // (x, y)の行が沢山並んでいるのを想定
    // @params x 取得したいデータのx成分
    // @params matrix 2x? データ配列(x,y)
    // @params col_num 取得したいデータの列数 default:1
    // @return y(double) 入力xのデータ
    double y = 0.0;
    double alpha = 0.0;
    for (int i = 0; i < matrix.rows()-1; i++) {
        if (x >= matrix(i,0) && x < matrix(i+1,0)) {
            alpha = (x - matrix(i,0)) / (matrix(i+1,0) - matrix(i,0));
            y = matrix(i,col_num) + alpha * (matrix(i+1,col_num) - matrix(i,col_num));
        }
    }
    if (x < matrix(0,0)) {
        y = matrix(0,col_num);
    }else if (x >= matrix(matrix.rows()-1,0)){
        y = matrix(matrix.rows()-1,col_num);
    }
    return y;
}


MatrixXd read_csv_vector_2d(string filename, string col_name0, string col_name1){
//    ファイル名と列数を入れるとMatrixxdを返す
    int col_number = 2;
    io::CSVReader<2> in(filename);
    in.read_header(io::ignore_extra_column, col_name0, col_name1);
    MatrixXd value = MatrixXd::Zero(1,col_number);
    double value0, value1;
    int max_col = 1;
    int now_col = 0;
    while(in.read_row(value0, value1)){
        value.conservativeResize(max_col, col_number);
        value(now_col, 0) = value0;
        value(now_col, 1)  =value1;
        now_col++; max_col++;
    }
    return value;
}

MatrixXd read_csv_vector_3d(string filename,
                            string col_name0, string col_name1, string col_name2){
    //    ファイル名と列数を入れるとMatrixxdを返す
    int col_number = 3;
    io::CSVReader<3> in(filename);
    in.read_header(io::ignore_extra_column, col_name0, col_name1, col_name2);
    MatrixXd value = MatrixXd::Zero(1,col_number);
    double value0, value1, value2;
    int max_col = 1;
    int now_col = 0;
    while(in.read_row(value0, value1, value2)){
        value.conservativeResize(max_col, col_number);
        value(now_col, 0) = value0;
        value(now_col, 1)  =value1;
        value(now_col, 2)  =value2;
        now_col++; max_col++;
    }
    return value;
}
