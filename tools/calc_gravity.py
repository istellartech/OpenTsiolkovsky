import numpy as np
from numpy import sin, sqrt

##### Constants ###############################################
G0 = 9.80665

### WGS84 ###
A = 6378137.0           # Equatorial radius [m]
ONE_F = 298.257223563   # Inverse flattening [-]
GM = 3.986004418e14     # Gravitational constant [m3/s2]
OMEGA = 7.292115e-5     # Angular velocity of the Earth [rad/s]

### WGS84 EGM96 ###
BAR_C20 = -0.484165371736e-3    # Normalized Gravitational Coefficient \bar{C}_{20}

###############################################################

# def gravity(altitude, latitude):  # m, rad
#     mu = 3.986004e14
#     Re = 6378.135e3
#     J2 = 1.08263e-3
#     epsilon = 1. / 298.257
# 
#     r = altitude + Re * (1 - epsilon * sin(latitude) * sin(latitude))
# 
#     gc = - mu / (r**2) * (1 - 1.5 * J2 * (Re / r)**2 * (3 * sin(latitude)**2 - 1))
#     gnorth = mu / (r**2) * J2 * (Re / r)**2 * sin(2 * latitude)
#     return (gc, gnorth)


def gravityECI(posECI_):
    """
    Args:
        posECI_ (np.array 3x1) : position in ECI coordinate [m, m, m]
    Return:
        (np.array 3x1) : gravity vector in ECI coordinate [m/s2, m/s2, m/s2]
    """
    a = A
    one_f = ONE_F
    mu = GM
    omega = OMEGA
    barC20 = BAR_C20

    f = 1.0 / one_f             # Flattening [-]
    b = a * (1.0 - f)           # Polar radius [m]

    x = posECI_[0]
    y = posECI_[1]
    z = posECI_[2]
    r = sqrt(x * x + y * y + z * z)

    if r == 0.0:
        irx = iry = irz = 0
    else:
        irx = x / r
        iry = x / r
        irz = x / r

    barP20  = sqrt(5.0) * (3.0 * irz * irz - 1.0) * 0.5
    barP20d = sqrt(5.0) * 3.0 * irz

    if r < b:    # If position is under the ground
        r = b       # Override the radius

    g_ir = - mu / (r * r) * (1.0 + barC20 * (a/r) * (a/r) * (3.0 * barP20 + irz * barP20d))
    g_iz =   mu / (r * r) * (a/r) * (a/r) * barC20 * barP20d

    gravityECI_ = np.empty(3)
    gravityECI_[0] = g_ir * irx
    gravityECI_[1] = g_ir * iry
    gravityECI_[2] = g_ir * irz + g_iz
    return gravityECI_
