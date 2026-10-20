import { describe, expect, it } from 'vite-plus/test'
import { pointOnPath } from './globe-path'
const point = (time: number, lon = 0, stage = 1) => ({ time, lat: 0, lon, alt: 100, stage, powered: true })
describe('map path interpolation', () => {
  it('crosses the antimeridian without sweeping through Greenwich', () => {
    const p = pointOnPath([point(0, 179), point(10, -179)], 5)
    expect(Math.abs(p!.lon)).toBeCloseTo(180)
  })
  it('selects the after-event state at duplicate timestamps', () => {
    expect(pointOnPath([point(0), point(10, 1, 1), point(10, 1, 2), point(20, 2, 2)], 10)?.stage).toBe(2)
  })
  it('clamps at path ends and handles empty paths', () => {
    expect(pointOnPath([], 0)).toBeNull()
    expect(pointOnPath([point(0), point(10)], 100)?.time).toBe(10)
    expect(pointOnPath([point(0), point(10)], -100)?.time).toBe(0)
  })
})
