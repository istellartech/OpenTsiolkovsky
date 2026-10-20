/** Presentation-only paths. No simulation quantities are fabricated for maps. */
export interface GeographicPoint {
  time: number
  lat: number
  lon: number
  alt: number
  stage: number
  powered: boolean
}
export interface GeographicMarker extends GeographicPoint {
  label: string
}
export interface GeographicPath {
  id: string
  label: string
  points: GeographicPoint[]
  markers: GeographicMarker[]
}

export function pointOnPath(points: GeographicPoint[], time: number): GeographicPoint | null {
  if (!points.length) return null
  let lo = 0,
    hi = points.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].time <= time) lo = mid + 1
    else hi = mid
  }
  const index = Math.max(0, lo - 1),
    a = points[index],
    b = points[Math.min(points.length - 1, index + 1)]
  if (a === b || b.time <= a.time) return a
  const fraction = Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)))
  const deltaLon = ((b.lon - a.lon + 540) % 360) - 180
  return {
    ...a,
    time: Math.max(points[0].time, Math.min(time, points[points.length - 1].time)),
    lat: a.lat + (b.lat - a.lat) * fraction,
    lon: ((a.lon + deltaLon * fraction + 540) % 360) - 180,
    alt: a.alt + (b.alt - a.alt) * fraction,
  }
}
