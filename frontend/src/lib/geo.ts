// Geodesy helpers: ECI → geodetic conversion and great-circle distance.

const WGS84_A = 6378137.0 // Semi-major axis [m]
const WGS84_F = 1.0 / 298.257223563 // Flattening [-]
const WGS84_E2 = WGS84_F * (2.0 - WGS84_F) // Eccentricity squared [-]
const OMEGA_EARTH = 7.2921159e-5 // Earth's angular velocity [rad/s]
const EARTH_RADIUS_KM = 6371

export const G0 = 9.80665 // Standard gravity [m/s²]

const DEG = Math.PI / 180

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * ECI position [m] at `timeSeconds` after launch → geodetic latitude/longitude
 * [deg] and altitude [km]. The ECI frame coincides with ECEF at t = 0.
 */
export function posEciToLlh(pos: Vec3, timeSeconds: number): { lat: number; lon: number; alt: number } {
  const theta = OMEGA_EARTH * timeSeconds
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const x = c * pos.x + s * pos.y
  const y = -s * pos.x + c * pos.y
  const z = pos.z

  const rXY = Math.hypot(x, y)
  const lon = Math.atan2(y, x)
  let lat = Math.atan2(z, rXY)
  let n = WGS84_A
  for (let i = 0; i < 10; i++) {
    const sinLat = Math.sin(lat)
    n = WGS84_A / Math.sqrt(1.0 - WGS84_E2 * sinLat * sinLat)
    const next = Math.atan2(z + WGS84_E2 * n * sinLat, rXY)
    if (Math.abs(next - lat) < 1e-12) break
    lat = next
  }
  // Stable at all latitudes (rXY / cos φ − N breaks down near the poles).
  const sinLat = Math.sin(lat)
  const alt = rXY * Math.cos(lat) + (z + WGS84_E2 * n * sinLat) * sinLat - n
  return { lat: lat / DEG, lon: lon / DEG, alt: alt / 1000.0 }
}

/** Great-circle distance on a spherical Earth [km]. */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG
  const dLon = (lon2 - lon1) * DEG
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}
