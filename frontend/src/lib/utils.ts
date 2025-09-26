import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { SimulationState, ClientConfig } from './simulation'
import { vec3ToObject } from './simulation'

// UI Utilities
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Coordinate Transform Constants and Utilities
const WGS84_A = 6378137.0  // Semi-major axis [m]
const WGS84_F = 1.0 / 298.257223563  // Flattening [-]
const WGS84_E2 = WGS84_F * (2.0 - WGS84_F)  // Eccentricity squared [-]
const OMEGA_EARTH = 7.2921159e-5  // Earth's angular velocity [rad/s]
const EARTH_RADIUS_KM = 6371

const deg2rad = (deg: number): number => deg * Math.PI / 180.0
const rad2deg = (rad: number): number => rad * 180.0 / Math.PI

export function getJ2000Seconds(datetime: {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}, timezone: number = 9): number {
  const j2000 = new Date('2000-01-01T11:58:55.816Z')
  const launchDate = new Date(Date.UTC(
    datetime.year,
    datetime.month - 1,
    datetime.day,
    datetime.hour - timezone,
    datetime.minute,
    datetime.second
  ))
  return (launchDate.getTime() - j2000.getTime()) / 1000.0
}

function dcmEciToEcef(timeSeconds: number): number[][] {
  const theta = OMEGA_EARTH * timeSeconds
  const cos_theta = Math.cos(theta)
  const sin_theta = Math.sin(theta)
  return [
    [cos_theta, sin_theta, 0.0],
    [-sin_theta, cos_theta, 0.0],
    [0.0, 0.0, 1.0]
  ]
}

function dcmEcefToLlh(lat: number, lon: number): number[][] {
  const cos_lat = Math.cos(lat)
  const sin_lat = Math.sin(lat)
  const cos_lon = Math.cos(lon)
  const sin_lon = Math.sin(lon)

  return [
    [-sin_lat * cos_lon, -sin_lat * sin_lon, cos_lat],
    [-sin_lon, cos_lon, 0.0],
    [-cos_lat * cos_lon, -cos_lat * sin_lon, -sin_lat]
  ]
}

export function posEciToLlh(pos_eci: { x: number; y: number; z: number }, timeSeconds: number): {lat: number, lon: number, alt: number} {
  const dcm_eci_to_ecef = dcmEciToEcef(timeSeconds)

  const pos_ecef = {
    x: dcm_eci_to_ecef[0][0] * pos_eci.x + dcm_eci_to_ecef[0][1] * pos_eci.y + dcm_eci_to_ecef[0][2] * pos_eci.z,
    y: dcm_eci_to_ecef[1][0] * pos_eci.x + dcm_eci_to_ecef[1][1] * pos_eci.y + dcm_eci_to_ecef[1][2] * pos_eci.z,
    z: dcm_eci_to_ecef[2][0] * pos_eci.x + dcm_eci_to_ecef[2][1] * pos_eci.y + dcm_eci_to_ecef[2][2] * pos_eci.z
  }

  const r_xy = Math.sqrt(pos_ecef.x * pos_ecef.x + pos_ecef.y * pos_ecef.y)
  const lon = Math.atan2(pos_ecef.y, pos_ecef.x)

  let lat = Math.atan2(pos_ecef.z, r_xy)
  let N = WGS84_A

  for (let i = 0; i < 10; i++) {
    const sin_lat = Math.sin(lat)
    N = WGS84_A / Math.sqrt(1.0 - WGS84_E2 * sin_lat * sin_lat)
    const new_lat = Math.atan2(pos_ecef.z + WGS84_E2 * N * sin_lat, r_xy)

    if (Math.abs(new_lat - lat) < 1e-12) break
    lat = new_lat
  }

  const alt = r_xy / Math.cos(lat) - N

  return {
    lat: rad2deg(lat),
    lon: rad2deg(lon),
    alt: alt / 1000.0  // Convert to km
  }
}

// Geospatial Utilities
export type LatLonAlt = {
  lat: number
  lon: number
  altKm: number
}

export function eciToLatLon(pos: { x: number; y: number; z: number }, time?: number): { latitude: number; longitude: number } {
  const result = posEciToLlh(pos, time || 0)
  return { latitude: result.lat, longitude: result.lon }
}

export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export function computeDownrangeKm(lat: number, lon: number, baseState: any): number {
  if (!baseState) return 0
  try {
    const basePos = vec3ToObject(baseState.position_eci || baseState.position)
    const baseLoc = eciToLatLon(basePos, baseState.time || 0)
    return haversineDistanceKm(baseLoc.latitude, baseLoc.longitude, lat, lon)
  } catch (error) {
    console.warn('Error computing downrange:', error)
    return 0
  }
}

export function computeDownrangeKmArray(points: LatLonAlt[]): number[] {
  if (!points || points.length === 0) return []
  const { lat: baseLat, lon: baseLon } = points[0]
  return points.map((p) => haversineDistanceKm(baseLat, baseLon, p.lat, p.lon))
}

export function constrainLongitude(lon: number): number {
  let result = lon
  while (result > 180) result -= 360
  while (result < -180) result += 360
  return result
}

// KML Generation
export interface KMLData {
  trajectory: SimulationState[]
  config: ClientConfig
}

function positionToLatLonAlt(position: SimulationState['position'], simulationTime: number): {lat: number, lon: number, alt: number} {
  const pos = vec3ToObject(position)
  return posEciToLlh(pos, simulationTime)
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function generateKML(data: KMLData): string {
  const { trajectory, config } = data
  const launchLat = config.launch.latitude_deg
  const launchLon = config.launch.longitude_deg
  const rocketName = escapeXML(config.name)

  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${rocketName} Trajectory</name>
    <description>OpenTsiolkovsky simulation trajectory for ${rocketName}</description>

    <!-- Styles -->
    <Style id="trajectoryLine">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>

    <Style id="eventPoint">
      <IconStyle>
        <color>ff00ff00</color>
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <Style id="launchPoint">
      <IconStyle>
        <color>ff0000ff</color>
        <scale>1.5</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/arrow.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <!-- Launch Point -->
    <Placemark>
      <name>Launch Site</name>
      <description>Launch coordinates for ${rocketName}</description>
      <styleUrl>#launchPoint</styleUrl>
      <Point>
        <coordinates>${launchLon},${launchLat},0</coordinates>
      </Point>
    </Placemark>

    <!-- Trajectory Line -->
    <Placemark>
      <name>Flight Path</name>
      <description>Complete trajectory of ${rocketName}</description>
      <styleUrl>#trajectoryLine</styleUrl>
      <LineString>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
`

  // Add trajectory coordinates
  trajectory.forEach((state) => {
    const pos = positionToLatLonAlt(state.position, state.time)
    const altitudeMeters = pos.alt * 1000 // Convert km back to meters for KML
    kml += `          ${pos.lon},${pos.lat},${altitudeMeters}\n`
  })

  kml += `        </coordinates>
      </LineString>
    </Placemark>

    <!-- Key Events -->
`

  // Add stage separation events
  const stageEvents: Array<{time: number, name: string, description: string}> = []

  // Find stage changes in the trajectory
  let currentStage = -1
  trajectory.forEach((state, index) => {
    if (state.stage !== currentStage) {
      if (currentStage >= 0 && index > 0) {
        stageEvents.push({
          time: state.time,
          name: `Stage ${currentStage + 1} Separation`,
          description: `Stage ${currentStage + 1} separated at t+${state.time.toFixed(1)}s`
        })
      }
      currentStage = state.stage
    }
  })

  // Add max altitude event
  const maxAltState = trajectory.reduce((prev, current) =>
    (current.altitude > prev.altitude) ? current : prev
  )
  if (maxAltState) {
    stageEvents.push({
      time: maxAltState.time,
      name: 'Maximum Altitude',
      description: `Apogee reached at ${(maxAltState.altitude / 1000).toFixed(2)} km altitude at t+${maxAltState.time.toFixed(1)}s`
    })
  }

  // Add event placemarks
  stageEvents.forEach(event => {
    const eventState = trajectory.find(s => Math.abs(s.time - event.time) < 0.5)
    if (eventState) {
      const pos = positionToLatLonAlt(eventState.position, eventState.time)
      const altitudeMeters = pos.alt * 1000

      kml += `    <Placemark>
      <name>${escapeXML(event.name)}</name>
      <description>${escapeXML(event.description)}</description>
      <styleUrl>#eventPoint</styleUrl>
      <Point>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${pos.lon},${pos.lat},${altitudeMeters}</coordinates>
      </Point>
    </Placemark>
`
    }
  })

  kml += `  </Document>
</kml>`

  return kml
}

export async function downloadKML(data: KMLData): Promise<void> {
  const kmlContent = generateKML(data)
  const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `${data.config.name.replace(/[^a-zA-Z0-9]/g, '_')}_trajectory.kml`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}