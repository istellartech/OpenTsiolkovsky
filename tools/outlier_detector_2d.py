# coding: utf-8
from __future__ import print_function
import numpy as np
import scipy.linalg


class OutlierDetector2D:
    def __init__(self, n_split=20, contamination=0.0027):
        self.n_split = n_split
        self.contamination = contamination

    def fit_predict(self, xy):
        Cov = np.cov(xy, rowvar=0)       # cal. covariance matrix
        A = scipy.linalg.sqrtm(Cov)      # sqrt of Cov matrix
        XY = np.linalg.solve(A, xy.T).T  # cal. A^-1 * xy
        XY -= np.median(XY, axis=0)      # sub. median

        Theta = np.arctan2(XY[:, 1], XY[:, 0])
        Index_original2theta = np.argsort(Theta)
        Index_theta2original = np.argsort(Index_original2theta)

        R2 = np.sum(XY**2, axis=1)       # cal. radius**2
        R2 = R2[Index_original2theta]       # sorting by Theta
        N = len(R2)
        dN = float(N) / float(self.n_split)
        for i in range(self.n_split):    # in each region
            Nrange_i = range(int(np.ceil(dN * i)), min(int(np.ceil(dN * (i + 1))), N))
            sigma2_i = np.mean(R2[Nrange_i]) * 0.5    # cal. estimated sigma**2
            if sigma2_i > 0:
                R2[Nrange_i] /= sigma2_i     # normalize radius
        Index_theta2rlarge = np.argsort(-R2)
        Index_rlarge2theta = np.argsort(Index_theta2rlarge)
        Is_contami_theta_order = (Index_rlarge2theta + 1 <= N * self.contamination)
        return np.where(Is_contami_theta_order[Index_theta2original], -1, +1)


if __name__ == "__main__":
    import argparse
    import pandas as pd
    import os

    parser = argparse.ArgumentParser(description="Outlier Detector for 2D Scattering Data")
    parser.add_argument("filename.csv", type=str)
    parser.add_argument("-col", "--columns",
                        nargs=2, type=int, default=[0, 1], metavar=("COLUMN1", "COLUMN2"),
                        help="columns to process (default=[0, 1])")
    parser.add_argument("-cont", "--contamination",
                        type=float, default=0.0027,
                        help="ratio of contamination of the data set (default=0.0027)")
    parser.add_argument("-n", "--n_split",
                        type=int, default=20,
                        help="number of region to split the data set (defalut=20)")
    args = parser.parse_args()

    filename = vars(args)["filename.csv"]
    df = pd.read_csv(filename, index_col=False)
    xy = df.values[:, args.columns]
    clf = OutlierDetector2D(n_split=args.n_split, contamination=args.contamination)
    pred = clf.fit_predict(xy)

    root, ext = os.path.splitext(filename)
    df_inlier = df[pred == 1]
    df_inlier.to_csv(root + "_inlier" + ext, index=False)
    df_outlier = df[pred == -1]
    df_outlier.to_csv(root + "_outlier" + ext, index=False)
