import type { Plugin } from 'chart.js'
import type { EventMarker, StageBand } from './config'

export const eventMarkerPlugin: Plugin = {
  id: 'eventMarkers',
  beforeDraw(chart) {
    const opts = (chart.options.plugins as any)?.eventMarkers as {
      stageBands?: StageBand[]
    } | undefined
    if (!opts?.stageBands || opts.stageBands.length === 0) return
    const xScale = chart.scales.x as any
    if (!xScale) return
    const { top, bottom, left, right } = chart.chartArea
    const ctx = chart.ctx
    ctx.save()
    opts.stageBands.forEach((band) => {
      const start = Math.max(band.start, xScale.min)
      const end = Math.min(band.end, xScale.max)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return
      }
      const xStart = xScale.getPixelForValue(start)
      const xEnd = xScale.getPixelForValue(end)
      if (!Number.isFinite(xStart) || !Number.isFinite(xEnd)) {
        return
      }
      ctx.fillStyle = band.color
      ctx.fillRect(xStart, top, xEnd - xStart, bottom - top)
      if (band.label) {
        const labelX = Math.min(Math.max(xStart + 6, left + 4), right - 24)
        ctx.fillStyle = band.labelColor
        ctx.font = '10px "Helvetica Neue", Arial, sans-serif'
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'
        ctx.fillText(band.label, labelX, top + 4)
      }
    })
    ctx.restore()
  },
  afterDraw(chart) {
    const opts = (chart.options.plugins as any)?.eventMarkers as {
      markers?: EventMarker[]
    } | undefined
    if (!opts?.markers || opts.markers.length === 0) return
    const xScale = chart.scales.x as any
    if (!xScale) return
    const { top, bottom } = chart.chartArea
    const ctx = chart.ctx
    opts.markers.forEach((marker, idx) => {
      if (!Number.isFinite(marker.time)) return
      if (marker.time < xScale.min || marker.time > xScale.max) return
      const x = xScale.getPixelForValue(marker.time)
      if (!Number.isFinite(x)) return
      ctx.save()
      ctx.strokeStyle = marker.color
      ctx.lineWidth = 1
      if (marker.dashed) {
        ctx.setLineDash([4, 4])
      } else {
        ctx.setLineDash([])
      }
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
      ctx.stroke()
      if (marker.label) {
        ctx.fillStyle = marker.color
        ctx.font = '9px "Helvetica Neue", Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        const labelY = top - 2
        ctx.fillText(marker.label, x, labelY)
      }
      ctx.restore()
    })
  },
}