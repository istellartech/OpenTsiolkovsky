from numpy import sin, deg2rad


def gravity(altitude, latitude):  # m, rad
    mu = 3.986004e14
    Re = 6378.135e3
    J2 = 1.08263e-3
    epsilon = 1. / 298.257

    r = altitude + Re * (1 - epsilon * sin(latitude) * sin(latitude))

    gc = - mu / (r**2) * (1 - 1.5 * J2 * (Re / r)**2 * (3 * sin(latitude)**2 - 1))
    gnorth = mu / (r**2) * J2 * (Re / r)**2 * sin(2 * latitude)
    return (gc, gnorth)


def gravityfromLLH(posLLH):  # deg, deg, m
    return gravity(posLLH[2], deg2rad(posLLH[0]))
