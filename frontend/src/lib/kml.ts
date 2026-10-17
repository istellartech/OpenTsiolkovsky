// Google Earth export of a flight track.
import type { Track } from './trajectory'

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function generateKML(track: Track, vehicleName: string): string {
  const name = escapeXML(vehicleName)
  const first = track.samples[0]
  const coords = track.samples.map((s) => `          ${s.lon},${s.lat},${s.alt}`).join('\n')
  const events = track.events
    .filter((e) => e.kind !== 'liftoff')
    .map((e) => {
      const s = track.samples.reduce((best, cur) => (Math.abs(cur.t - e.t) < Math.abs(best.t - e.t) ? cur : best))
      return `    <Placemark>
      <name>${escapeXML(e.label)}</name>
      <description>${escapeXML(`T+${e.t.toFixed(1)} s, ${(s.alt / 1000).toFixed(2)} km`)}</description>
      <styleUrl>#eventPoint</styleUrl>
      <Point>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${s.lon},${s.lat},${s.alt}</coordinates>
      </Point>
    </Placemark>
`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name} Trajectory</name>
    <description>OpenTsiolkovsky simulation trajectory for ${name}</description>

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

    <Placemark>
      <name>Launch Site</name>
      <description>Launch coordinates for ${name}</description>
      <styleUrl>#launchPoint</styleUrl>
      <Point>
        <coordinates>${first.lon},${first.lat},0</coordinates>
      </Point>
    </Placemark>

    <Placemark>
      <name>Flight Path</name>
      <description>Complete trajectory of ${name}</description>
      <styleUrl>#trajectoryLine</styleUrl>
      <LineString>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
${coords}
        </coordinates>
      </LineString>
    </Placemark>

${events}  </Document>
</kml>`
}
