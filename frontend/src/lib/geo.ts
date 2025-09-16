const EARTH_RADIUS_KM = 6371

export type LatLonAlt = {
  lat: number
  lon: number
  altKm: number
}

export function eciToLatLon(pos: { x: number; y: number; z: number }): LatLonAlt {
  const rad2deg = 180 / Math.PI
  const xy = Math.sqrt(pos.x * pos.x + pos.y * pos.y)
  const r = Math.sqrt(xy * xy + pos.z * pos.z)
  const lat = Math.atan2(pos.z, xy) * rad2deg
  let lon = Math.atan2(pos.y, pos.x) * rad2deg
  if (lon > 180) lon -= 360
  if (lon < -180) lon += 360
  return { lat, lon, altKm: r / 1000 - EARTH_RADIUS_KM }
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const deg2rad = Math.PI / 180
  const dLat = (lat2 - lat1) * deg2rad
  const dLon = (lon2 - lon1) * deg2rad
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * deg2rad) * Math.cos(lat2 * deg2rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
  return EARTH_RADIUS_KM * c
}

export function computeDownrangeKm(points: LatLonAlt[]): number[] {
  if (points.length === 0) return []
  const { lat: baseLat, lon: baseLon } = points[0]
  return points.map((p) => haversineDistanceKm(baseLat, baseLon, p.lat, p.lon))
}

export function constrainLongitude(lon: number): number {
  let result = lon
  while (result > 180) result -= 360
  while (result < -180) result += 360
  return result
}
