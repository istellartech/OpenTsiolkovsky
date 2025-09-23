import type { SimulationState, ClientConfig } from './types'
import { vec3ToObject } from './types'

export interface KMLData {
  trajectory: SimulationState[]
  config: ClientConfig
}

// Convert simulation position to lat/lon/alt
// This is a simplified conversion - in reality you might need proper coordinate system transformation
function positionToLatLonAlt(position: SimulationState['position'], launchLat: number, launchLon: number): {lat: number, lon: number, alt: number} {
  const pos = vec3ToObject(position)

  // Simple approximation: treating x/y as meters from launch point
  // This should be replaced with proper geodetic conversion
  const earthRadius = 6371000 // meters
  const latOffset = pos.y / earthRadius * (180 / Math.PI)
  const lonOffset = pos.x / (earthRadius * Math.cos(launchLat * Math.PI / 180)) * (180 / Math.PI)

  return {
    lat: launchLat + latOffset,
    lon: launchLon + lonOffset,
    alt: pos.z
  }
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
        <Icon>
          <href>http://earth.google.com/images/kml-icons/track-directional/track-none.png</href>
        </Icon>
      </IconStyle>
    </Style>
`

  // Group trajectory by stages
  const stageGroups = new Map<number, SimulationState[]>()
  trajectory.forEach(state => {
    if (!stageGroups.has(state.stage)) {
      stageGroups.set(state.stage, [])
    }
    stageGroups.get(state.stage)!.push(state)
  })

  // Generate trajectory lines for each stage
  stageGroups.forEach((states, stage) => {
    kml += `    <Placemark>
      <name>Stage ${stage} Trajectory</name>
      <description>Flight path for stage ${stage}</description>
      <styleUrl>#trajectoryLine</styleUrl>
      <LineString>
        <extrude>1</extrude>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
`

    // Sample every 10th point to reduce file size
    const sampleInterval = Math.max(1, Math.floor(states.length / 100))

    states.forEach((state, index) => {
      if (index % sampleInterval === 0 || index === states.length - 1) {
        const coords = positionToLatLonAlt(state.position, launchLat, launchLon)
        kml += `          ${coords.lon},${coords.lat},${coords.alt}\n`
      }
    })

    kml += `        </coordinates>
      </LineString>
    </Placemark>
`
  })

  // Add event markers (stage transitions, etc.)
  let prevStage = trajectory[0]?.stage || 1
  trajectory.forEach((state, index) => {
    if (state.stage !== prevStage && index > 0) {
      const coords = positionToLatLonAlt(state.position, launchLat, launchLon)
      const eventName = `Stage ${prevStage} → ${state.stage} Separation`

      kml += `    <Placemark>
      <name>${eventName}</name>
      <description>T+${state.time.toFixed(1)}s - ${eventName}</description>
      <styleUrl>#eventPoint</styleUrl>
      <Point>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${coords.lon},${coords.lat},${coords.alt}</coordinates>
      </Point>
    </Placemark>
`
      prevStage = state.stage
    }
  })

  // Add launch point
  kml += `    <Placemark>
      <name>Launch Point</name>
      <description>Launch location for ${rocketName}</description>
      <styleUrl>#eventPoint</styleUrl>
      <Point>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${launchLon},${launchLat},${config.launch.altitude_m}</coordinates>
      </Point>
    </Placemark>
`

  // Add apogee point
  let maxAltState = trajectory[0]
  trajectory.forEach(state => {
    if (state.altitude > maxAltState.altitude) {
      maxAltState = state
    }
  })

  const apogeecCoords = positionToLatLonAlt(maxAltState.position, launchLat, launchLon)
  kml += `    <Placemark>
      <name>Apogee</name>
      <description>T+${maxAltState.time.toFixed(1)}s - Maximum altitude: ${maxAltState.altitude.toFixed(0)}m</description>
      <styleUrl>#eventPoint</styleUrl>
      <Point>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${apogeecCoords.lon},${apogeecCoords.lat},${apogeecCoords.alt}</coordinates>
      </Point>
    </Placemark>
`

  kml += `  </Document>
</kml>`

  return kml
}

export function downloadKML(data: KMLData): void {
  const kmlContent = generateKML(data)
  const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `${data.config.name}_trajectory.kml`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Clean up the URL object
  setTimeout(() => URL.revokeObjectURL(url), 100)
}