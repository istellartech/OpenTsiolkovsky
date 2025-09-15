import { useEffect, useRef } from 'react'
import { Chart, ChartConfiguration } from 'chart.js/auto'
import type { SimulationState } from '../lib/types'

export function GraphPanel({ data }: { data: SimulationState[] }) {
  const c1 = useRef<HTMLCanvasElement>(null)
  const c2 = useRef<HTMLCanvasElement>(null)
  const chart1 = useRef<Chart | null>(null)
  const chart2 = useRef<Chart | null>(null)

  useEffect(() => {
    if (!data || data.length === 0) return
    const labels = data.map(s => s.time)

    // Chart 1: Altitude, |Velocity|
    if (c1.current) {
      const alt = data.map(s => s.altitude)
      const vel = data.map(s => s.velocity_magnitude)
      const cfg1: ChartConfiguration = {
        type: 'line',
        data: { labels, datasets: [
          { label: 'Altitude [m]', data: alt, borderColor: '#1d4ed8', tension: 0.1 },
          { label: '|Velocity| [m/s]', data: vel, borderColor: '#059669', tension: 0.1 }
        ] },
        options: { responsive: true, animation: false, scales: { x: { title: { display: true, text: 't [s]' } } } }
      }
      const ctx1 = c1.current.getContext('2d')!
      if (chart1.current) chart1.current.destroy()
      chart1.current = new Chart(ctx1, cfg1)
    }

    // Chart 2: Mach, Dynamic Pressure
    if (c2.current) {
      const mach = data.map(s => s.mach_number)
      const qkpa = data.map(s => s.dynamic_pressure / 1000.0)
      const cfg2: ChartConfiguration = {
        type: 'line',
        data: { labels, datasets: [
          { label: 'Mach [-]', data: mach, borderColor: '#9333ea', tension: 0.1, yAxisID: 'y1' },
          { label: 'Q [kPa]', data: qkpa, borderColor: '#dc2626', tension: 0.1, yAxisID: 'y2' }
        ] },
        options: { responsive: true, animation: false, scales: {
          x: { title: { display: true, text: 't [s]' } },
          y1: { type: 'linear', position: 'left' },
          y2: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } },
        } }
      }
      const ctx2 = c2.current.getContext('2d')!
      if (chart2.current) chart2.current.destroy()
      chart2.current = new Chart(ctx2, cfg2)
    }

    return () => {
      chart1.current?.destroy(); chart1.current = null
      chart2.current?.destroy(); chart2.current = null
    }
  }, [data])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <canvas ref={c1} />
      <canvas ref={c2} />
    </div>
  )
}
