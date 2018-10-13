//
//  fileio.cpp
//  OpenTsiolkovsky
//
//  Created by Takahiro Inagawa on 2016/03/10.
//  Copyright © 2016 Takahiro Inagawa. All rights reserved.
//

#include "fileio.hpp"

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

double interp_matrix_2d(double mach, double alpha, MatrixXd matrix){
    // 2変数関数として線形補間をする。範囲外のデータが入力された場合強制終了。
    // 先頭行先頭列に変数を並べる
    // @params mach  取得したいデータ縦方向
    // @params alpha 取得したいデータ横方向
    // @params matrix 2x? データ配列
    // @return y(double) 入力mach, alphaのデータ
    const int col_number = 15;
    double y;

    int index_mach, index_alpha;
    double Dmach = -1;
    double Dalpha = -1;

    // search index mach and calculate Dmach
    if(mach < matrix(1, 0) || mach > matrix(matrix.rows()-1, 0)){
        std::cout << "ERROR : interp_matrix_2d. First argument is out of the boundary of matrix.";
        exit(1);
    }
    for (int i = 2; i < matrix.rows(); i++) {
        if(mach < matrix(i, 0)){
            index_mach = i - 1;

            double mach_lower, mach_higher;
            mach_lower  = matrix(i - 1, 0);
            mach_higher = matrix(    i, 0);
            Dmach = (mach - mach_lower)/(mach_higher - mach_lower);

            break;
        }
    }
    

    // search index alpha and calculate Dalpha
    if(alpha < matrix(0, 1) || alpha > matrix(0, col_number -1)){
        std::cout << "ERROR : interp_matrix_2d. Second argument is out of the boundary of matrix.";
        exit(1);
    }
    for (int i = 2; i < col_number; i++) {
        if(alpha < matrix(0, i)){
            index_alpha = i - 1;

            double alpha_lower, alpha_higher;
            alpha_lower  = matrix(0, i - 1);
            alpha_higher = matrix(0,     i);
            Dalpha = (alpha - alpha_lower)/(alpha_higher - alpha_lower);

            break;
        }
    }

    // calculate y
    if(Dmach < 0.5){
        if(Dalpha < 0.5){
            y = matrix(index_mach, index_alpha)
              + ( matrix(index_mach + 1, index_alpha) - matrix(index_mach, index_alpha)) * Dmach
              + ( matrix(index_mach, index_alpha + 1) - matrix(index_mach, index_alpha)) * Dalpha;
        }else{
            y = matrix(index_mach, index_alpha + 1)
              + ( matrix(index_mach + 1, index_alpha + 1) - matrix(index_mach, index_alpha + 1)) * Dmach
              + ( matrix(index_mach, index_alpha + 1) - matrix(index_mach, index_alpha)) * (Dalpha - 1);
        }
    }else{
        if(Dalpha < 0.5){
            y = matrix(index_mach + 1, index_alpha)
              + ( matrix(index_mach + 1, index_alpha) - matrix(index_mach, index_alpha)) * (Dmach - 1)
              + ( matrix(index_mach + 1, index_alpha + 1) - matrix(index_mach + 1, index_alpha)) * Dalpha;
        }else{
            y = matrix(index_mach + 1, index_alpha + 1)
              + ( matrix(index_mach + 1, index_alpha + 1) - matrix(index_mach, index_alpha + 1)) * (Dmach - 1)
              + ( matrix(index_mach + 1, index_alpha + 1) - matrix(index_mach + 1, index_alpha)) * (Dalpha - 1);
        }
    }

    return y;
}

MatrixXd read_csv_vector_2d(string filename, string col_name0, string col_name1){
//    ファイル名と列名を入れるとMatrixXd(n行2列)を返す
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
        value(now_col, 1) = value1;
        now_col++; max_col++;
    }
    return value;
}

MatrixXd read_csv_vector_3d(string filename,
                            string col_name0, string col_name1, string col_name2){
    //    ファイル名と列数を入れるとMatrixXd(n行3列)を返す
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
        value(now_col, 1) = value1;
        value(now_col, 2) = value2;
        now_col++; max_col++;
    }
    return value;
}

MatrixXd read_csv_vector_4d(string filename,
                            string col_name0, string col_name1,
                            string col_name2, string col_name3){
    //    ファイル名と列数を入れるとMatrixXd(n行4列)を返す
    int col_number = 4;
    io::CSVReader<4> in(filename);
    in.read_header(io::ignore_extra_column, col_name0, col_name1, col_name2, col_name3);
    MatrixXd value = MatrixXd::Zero(1,col_number);
    double value0, value1, value2, value3;
    int max_col = 1;
    int now_col = 0;
    while(in.read_row(value0, value1, value2, value3)){
        value.conservativeResize(max_col, col_number);
        value(now_col, 0) = value0;
        value(now_col, 1) = value1;
        value(now_col, 2) = value2;
        value(now_col, 3) = value3;
        now_col++; max_col++;
    }
    return value;
}

MatrixXd read_csv_vector_15d(string filename){
//    ファイル名を入れるとMatrixXd(n行15列)を返す
    const int col_number = 15;
    io::CSVReader<col_number> in(filename);
    double buf[col_number];
    in.set_header("1","2","3","4","5","6","7","8","9","10","11","12","13","14","15");
    MatrixXd value = MatrixXd::Zero(1,col_number);
    int now_col = 0;
    while(in.read_row(buf[0], buf[1], buf[2], buf[3], buf[4], buf[5], 
                buf[6], buf[7], buf[8], buf[9], buf[10], buf[11], buf[12], buf[13], buf[14])){
        value.conservativeResize(now_col+1, col_number);
        for(int i = 0; i < col_number; i++){
            value(now_col, i) = buf[i];
        }
        now_col++;
    }

    return value;
}
