import { useEffect, useRef } from 'react'
import { Chart, ChartConfiguration } from 'chart.js/auto'
import type { SimulationState } from '../lib/types'

export function GraphPanel({ data }: { data: SimulationState[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current || !data || data.length === 0) return

    const labels = data.map(s => s.time)
    const alt = data.map(s => s.altitude)
    const vel = data.map(s => s.velocity_magnitude)

    const cfg: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Altitude [m]', data: alt, borderColor: '#1d4ed8', tension: 0.1 },
          { label: '|Velocity| [m/s]', data: vel, borderColor: '#059669', tension: 0.1 }
        ]
      },
      options: {
        responsive: true,
        animation: false,
        scales: { x: { title: { display: true, text: 't [s]' } } }
      }
    }

    const ctx = canvasRef.current.getContext('2d')!
    if (chartRef.current) chartRef.current.destroy()
    chartRef.current = new Chart(ctx, cfg)

    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [data])

  return <canvas ref={canvasRef} />
}

