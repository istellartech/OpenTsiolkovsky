# coding: utf-8
import numpy as np
from numpy import pi, sqrt, sin, cos, deg2rad, rad2deg

##### Constants ###############################################
G0 = 9.80665

### WGS84 ###
A = 6378137.0           # Equatorial radius [m]
ONE_F = 298.257223563   # Inverse flattening [-]
GM = 3.986004418e14     # Gravitational constant [m3/s2]
OMEGA = 7.292115e-5     # Angular velocity of the Earth [rad/s]

###############################################################

# lat: geodetic latitude
# latc: geocentric latitude

def posECEFfromLLH(posLLH_):
    lat = deg2rad(posLLH_[0])
    lon = deg2rad(posLLH_[1])
    alt = posLLH_[2]
    a = A                           # Equatorial radius [m]
    f = 1.0 / ONE_F                 # Flattening [-]
    e2 = 2.0 * f - f * f            # Square of eccentricity e
    W = sqrt(1.0 - e2 * sin(lat) * sin(lat))
    N = a / W                       # Radius of prime vertical circle [m]

    posECEF_ = np.empty(3)
    posECEF_[0] = (N + alt) * cos(lat) * cos(lon)
    posECEF_[1] = (N + alt) * cos(lat) * sin(lon)
    posECEF_[2] = (N * (1 - e2) + alt) * sin(lat)

    return posECEF_


def posLLHfromECEF(posECEF_):
    a = A                           # Equatorial radius [m]
    f = 1.0 / ONE_F                 # Flattening [-]
    e2 = 2.0 * f - f * f            # Square of eccentricity e
    b = a * (1.0 - f)               # Polar radius [m]
    ed2 = (e2 * a * a / (b * b))    # Square of second eccentricity e'
    p = np.sqrt(posECEF_[0]**2 + posECEF_[1]**2)    # Distance from the rotation axis of the Earth [m]
    theta = np.arctan2(posECEF_[2] * a, p * b)      # [rad]

    posLLH = np.empty(3)
    posLLH[0] = rad2deg(np.arctan2((posECEF_[2] + ed2 * b * sin(theta)**3), p - e2 * a * cos(theta)**3))
    posLLH[1] = rad2deg(np.arctan2(posECEF_[1], posECEF_[0]))
    posLLH[2] = p / np.cos(deg2rad(posLLH[0])) - a / sqrt(1.0 - e2 * sin(deg2rad(posLLH[0]))**2)

    return posLLH  # deg, deg, m


def dcmECEF2NEDfromLLH(posLLH_):  # deg, deg, m
    lat = deg2rad(posLLH_[0])
    lon = deg2rad(posLLH_[1])

    dcm = np.array([[-sin(lat) * cos(lon), -sin(lat)*sin(lon),  cos(lat)],
                    [-sin(lon),            np.cos(lon),         0.      ],
                    [-cos(lat) * cos(lon), -cos(lat)*sin(lon), -sin(lat)]])
    return dcm


def dcmECI2ECEFfromSecond(second):  # Elapsed time from start [s]
    omega = OMEGA
    theta = omega * second

    dcm = np.array([[ cos(theta), sin(theta), 0.],
                    [-sin(theta), cos(theta), 0.],
                    [0.,          0.,         1.]])
    return dcm


def distance_surface(posLLH1, posLLH2):
    earth_radius = A            # Earth radius ~ Equatorial radius
    if len(posLLH1) == 2:
        posLLH1 = np.append(posLLH1, 0.)
    if len(posLLH2) == 2:
        posLLH2 = np.append(posLLH2, 0.)
    posECEF1 = posECEFfromLLH(posLLH1)
    posECEF2 = posECEFfromLLH(posLLH2)

    costheta = np.dot(posECEF1, posECEF2) / (np.linalg.norm(posECEF1) * np.linalg.norm(posECEF2))
    costheta = np.clip(costheta, -1., 1.)
    theta = np.arccos(costheta)     # Angle at the center of the Earth
    return earth_radius * theta


def vel_ECEF_NEDframe(dcmECI2NED_, vel_ECI_ECIframe_, pos_ECI_):
    omega = OMEGA

    omegaECI2ECEF_ = np.array([[0.,   -omega, 0.],
                               [omega, 0.,    0.],
                               [0.,    0.,    0.]])

    return np.matmul(dcmECI2NED_, (vel_ECI_ECIframe_ - np.matmul(omegaECI2ECEF_, pos_ECI_)))


def posLLH_IIP(posLLH_, vel_ECEF_NEDframe_):
    g0 = G0
    vel_north_ = vel_ECEF_NEDframe_[0]
    vel_east_ = vel_ECEF_NEDframe_[1]
    vel_up_ = - vel_ECEF_NEDframe_[2]
    h = posLLH_[2]
    tau = 1.0 / g0 * (vel_up_ + sqrt(vel_up_**2 + 2 * h * g0))
    dist_IIP_from_now_NED = np.array([vel_north_ * tau, vel_east_ * tau, h])
    posECEF_ = posECEFfromLLH(posLLH_)
    dcmECEF2NED_ = dcmECEF2NEDfromLLH(posLLH_)
    dcmNED2ECEF_ = dcmECEF2NED_.T
    posECEF_IIP_ = posECEF_ + np.matmul(dcmNED2ECEF_, dist_IIP_from_now_NED)
    return posLLHfromECEF(posECEF_IIP_)


def posfromDistanceAndAzimuth(latlon, disaz):  # ([deg], [deg]), ([m], [deg])
    a = A                           # Equatorial radius [m]
    f = 1.0 / ONE_F                 # Flattening [-]
    e2 = 2.0 * f - f * f            # Square of eccentricity e

    lat, lon = latlon
    d, az = disaz

    theta_lat = deg2rad(lat)
    N = a / sqrt(1.0 - e2 * sin(theta_lat)**2)  # Prime vertical radius of curvature
    Re = N * sqrt(cos(theta_lat)**2 + ((1.0 - e2) * sin(theta_lat))**2)

    theta = d / Re
    phi = pi - deg2rad(az)

    x = sin(theta) * cos(phi)
    y = sin(theta) * sin(phi)
    z = cos(theta)

    alpha = pi * 0.5 - deg2rad(lat)

    X = x * cos(alpha) + z * sin(alpha)
    Y = y
    Z = -x * sin(alpha) + z * cos(alpha)

    theta_new = np.arccos(Z)
    phi_new = np.sign(Y) * np.arccos(X / sqrt(X**2 + Y**2))

    lat_ans = rad2deg(pi * 0.5 - theta_new)
    lon_ans = lon + rad2deg(phi_new)

    lat_ans = (lat_ans + 90) % 180 - 90
    lon_ans = (lon_ans + 180) % 360 - 180

    return (lat_ans, lon_ans)


def lonlat2xyratio(lat):  # [lon[deg], lat[deg]] to [x[m], y[m]] ratio
    a = A                           # Equatorial radius [m]
    f = 1.0 / ONE_F                 # Flattening [-]
    e2 = 2.0 * f - f * f            # Square of eccentricity e

    theta_lat = deg2rad(lat)
    N = a / sqrt(1.0 - e2 * sin(theta_lat)**2)  # Prime vertical radius of curvature

    dxdlon = N * cos(theta_lat)
    dydlat = N * (1.0 - e2) / (1.0 - e2 * sin(theta_lat)**2)

    return np.array([dxdlon, dydlat]).T * deg2rad(1.)


# points in hull must not be overlapping (so hull[0] != hull[-1]), and ordered in anti-clockwise
def extend_lonlat_hull(lonlat_hull, distance, dlondlat=[0, 0], max_deg=30):  # [deg, deg], [m], [deg, deg]
    lonlat_ave = np.mean(lonlat_hull, axis=0)
    lola2xy = lonlat2xyratio(lonlat_ave[1])
    dxdy = dlondlat * lola2xy
    xy_hull = lonlat_hull * lola2xy
    xy_hull_new = extend_xy_hull(xy_hull, distance, dxdy, max_deg)
    lonlat_hull_new = xy_hull_new / lola2xy
    return lonlat_hull_new


def extend_xy_hull(xy_hull, distance, dxdy=[0, 0], max_deg=30):
    xy0 = xy_hull
    xy1 = np.roll(xy_hull, -1, axis=0)
    dxy = xy1 - xy0
    udxy = dxy / np.array([np.linalg.norm(dxy, axis=1)]).T
    ndxy = np.matmul(udxy, [[0, -1], [1, 0]])
    ddxy = distance * ndxy
    xy0n = xy0 + ddxy + dxdy
    xy1n = xy1 + ddxy + dxdy

    costheta = np.sum(ndxy * np.roll(ndxy, -1, axis=0), axis=1).clip(-1, 1)
    theta = np.arccos(costheta)
    xy_corners = []
    for theta_, ddxy_, xy1_ in zip(theta, ddxy, xy1):
        N_ = (theta_ // deg2rad(max_deg))
        n_ = np.arange(0, N_, 1)
        theta_n = theta_ * (n_ + 1) / (N_ + 1)
        An_T = np.array([[cos(theta_n), -sin(theta_n)], [sin(theta_n), cos(theta_n)]]).transpose(2, 1, 0)
        ddxy_n = np.matmul(ddxy_, An_T)
        xy1_nn = xy1_ + ddxy_n + dxdy
        xy_corners += [xy1_nn]

    xy_ans_list = []
    for xy0n_, xy1n_, xycs_ in zip(xy0n, xy1n, xy_corners):
        xy_ans_list += [xy0n_, xy1n_]
        xy_ans_list += list(xycs_)
    return np.array(xy_ans_list)

