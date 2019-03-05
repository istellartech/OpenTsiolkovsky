#!/usr/bin/python3
# coding: utf-8
import sys
import os
import glob
import pandas as pd

if __name__ == "__main__":
    if len(sys.argv) <= 1:
        print("Usage:  {0} TARGET_DIRECTORY [COLUMN_NAME]".format(sys.argv[0]))
        exit(1)

    target_directory = sys.argv[1]
    if len(sys.argv) > 2:
        col_name = sys.argv[2]
    else:
        col_name = "suffix"

    filenames_csv_with_path = glob.glob("{}/*.csv".format(target_directory))

    merged_dataframes = {}

    for filename_csv_with_path in filenames_csv_with_path:
        _, filename_csv = os.path.split(filename_csv_with_path)
        filename_csv_woext, _ = os.path.splitext(filename_csv)
        basename, suffix = filename_csv_woext.rsplit('_', 1)

        df = pd.read_csv(filename_csv_with_path, index_col=False)
        df[col_name] = suffix
        if basename in merged_dataframes.keys():
            merged_dataframes[basename] = pd.concat([merged_dataframes[basename], df])
        else:
            merged_dataframes[basename] = df

    for basename, df_merged in merged_dataframes.items():
        cols_ordered = [col_name] + [c for c in df_merged.columns if c != col_name]
        df_merged = df_merged[cols_ordered]
        df_merged = df_merged.sort_values(col_name)
        df_merged.to_csv("{0}/{1}_merged.csv".format(target_directory, basename), index=False)
