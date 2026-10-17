// Instantaneous impact point limit line (ILL): the boundary the IIP must stay
// inside. A flight whose IIP crosses it would be terminated by range safety.
//
// The line is a closed polygon in latitude/longitude, treated as planar in
// degrees. That is accurate enough for the few-hundred-km areas ILLs cover;
// longitudes are unwrapped around the first vertex so a line may cross the
// antimeridian.
import type { Track, TrackSample } from './trajectory'

export type IllPoint = {
  lat_deg: number
  lon_deg: number
}

export interface IllViolation {
  /** Time the IIP first leaves the area [s] */
  t: number
  /** IIP at that time [deg] */
  lat: number
  lon: number
  /** Time the IIP is back inside, or null if it stays out (or vanishes into orbit) [s] */
  reentryT: number | null
}

/** An ILL needs at least a triangle. */
export const isIllUsable = (ill: IllPoint[] | undefined): ill is IllPoint[] => !!ill && ill.length >= 3

/** Longitude brought within ±180° of `ref`. */
const unwrap = (lon: number, ref: number) => lon - 360 * Math.round((lon - ref) / 360)

/** Even-odd point-in-polygon test, in degrees. */
export function insideIll(ill: IllPoint[], lat: number, lon: number): boolean {
  const ref = ill[0].lon_deg
  const x = unwrap(lon, ref)
  let inside = false
  for (let i = 0, j = ill.length - 1; i < ill.length; j = i++) {
    const yi = ill[i].lat_deg
    const yj = ill[j].lat_deg
    if (yi > lat === yj > lat) continue
    const xi = unwrap(ill[i].lon_deg, ref)
    const xj = unwrap(ill[j].lon_deg, ref)
    if (x < xi + ((lat - yi) / (yj - yi)) * (xj - xi)) inside = !inside
  }
  return inside
}

/**
 * Fraction along the IIP step a→b where it first meets the ILL, found by
 * bisection on the inside test (robust for any polygon shape).
 */
function crossing(ill: IllPoint[], a: [number, number], b: [number, number], aInside: boolean): number {
  const lonB = unwrap(b[1], a[1])
  let lo = 0
  let hi = 1
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2
    const inside = insideIll(ill, a[0] + (b[0] - a[0]) * mid, a[1] + (lonB - a[1]) * mid)
    if (inside === aInside) lo = mid
    else hi = mid
  }
  return hi
}

/**
 * When the vehicle's IIP first leaves the ILL, or null if it stays inside.
 * Samples without an IIP (orbital or escape velocity) are skipped: the IIP
 * jumps there rather than moving along the ground, so no crossing is drawn
 * across the gap.
 */
export function findIllViolation(samples: TrackSample[], ill: IllPoint[]): IllViolation | null {
  if (!isIllUsable(ill)) return null
  let prev: { t: number; p: [number, number]; inside: boolean } | null = null
  let out: Omit<IllViolation, 'reentryT'> | null = null
  for (const s of samples) {
    if (s.iipLat === null || s.iipLon === null) {
      prev = null
      continue
    }
    const p: [number, number] = [s.iipLat, s.iipLon]
    const inside = insideIll(ill, p[0], p[1])
    if (!out && !inside) {
      if (!prev) {
        out = { t: s.t, lat: p[0], lon: p[1] }
      } else {
        const f = crossing(ill, prev.p, p, prev.inside)
        const lon = prev.p[1] + (unwrap(p[1], prev.p[1]) - prev.p[1]) * f
        out = { t: prev.t + (s.t - prev.t) * f, lat: prev.p[0] + (p[0] - prev.p[0]) * f, lon: unwrap(lon, 0) }
      }
    } else if (out && inside && prev && !prev.inside) {
      const f = crossing(ill, prev.p, p, false)
      return { ...out, reentryT: prev.t + (s.t - prev.t) * f }
    }
    prev = { t: s.t, p, inside }
  }
  return out && { ...out, reentryT: null }
}

const EARTH_RADIUS_KM = 6371

/** Point `km` from (lat, lon) along `bearing` (great circle) [deg]. */
function destination(lat: number, lon: number, bearing: number, km: number): IllPoint {
  const r = Math.PI / 180
  const d = km / EARTH_RADIUS_KM
  const φ1 = lat * r
  const θ = bearing * r
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ))
  const λ2 = lon * r + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2))
  const round = (v: number) => Math.round(v * 1e4) / 1e4
  return { lat_deg: round(φ2 / r), lon_deg: round(unwrap(λ2 / r, 0)) }
}

/**
 * A starting ILL to edit: a corridor that widens downrange along the launch
 * azimuth, 20 km wide at the pad and ±15° out to 1,000 km.
 */
export function defaultIll(lat: number, lon: number, azimuth: number): IllPoint[] {
  return [
    destination(lat, lon, azimuth + 180, 10),
    destination(lat, lon, azimuth - 90, 10),
    destination(lat, lon, azimuth - 15, 1000),
    destination(lat, lon, azimuth + 15, 1000),
    destination(lat, lon, azimuth + 90, 10),
  ]
}

/** A track with the ILL check applied: the line, its violation and an 'ill' event. */
export function withIll(track: Track, ill: IllPoint[] | undefined): Track {
  if (!isIllUsable(ill)) return track.ill ? { ...track, ill: undefined, events: track.events.filter((e) => e.kind !== 'ill') } : track
  const violation = findIllViolation(track.samples, ill)
  const events = track.events.filter((e) => e.kind !== 'ill')
  if (violation) events.push({ kind: 'ill', t: violation.t })
  events.sort((a, b) => a.t - b.t)
  return { ...track, events, ill: { points: ill, violation } }
}
