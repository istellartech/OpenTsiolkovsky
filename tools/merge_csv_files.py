#!/usr/bin/python
# coding: utf-8
from __future__ import print_function, division
import sys
import os
import glob
import pandas as pd

if __name__ == "__main__":
    if len(sys.argv) <= 1:
        print("Usage:  {0} TARGET_DIRECTORY".format(argv[0]))
        exit(1)
         
    target_directory = argv[1]
    filenames_csv_with_path = glob.glob("{}/*.csv".format(target_directory))

    merged_dataframes = {}
    
    for filename_csv_with_path in filenames_csv_with_path:
        _, filename_csv_base = os.path.split(filename_csv_with_path)
        filename_csv_woext, _ = os.path.splitext(filename_csv_base)
        
        
