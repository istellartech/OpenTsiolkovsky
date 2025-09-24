import { useEffect, useRef } from 'react'
import { Chart, type ChartConfiguration } from 'chart.js/auto'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion'
import { Badge } from './ui/badge'
import { useChartData, formatValue } from '../hooks/useChartData'
import { eventMarkerPlugin } from '../charts/plugins'
import {
  createAltitudeChart,
  createVelocityChart,
  createMachChart,
  createThrustChart,
  createAccelerationChart,
  createDynamicPressureChart,
  createAttitudeChart,
  createTrajectoryChart
} from '../charts/config'
import type { SimulationState, ClientConfig } from '../lib/types'

Chart.register(eventMarkerPlugin)

interface ChartCardProps {
  config: ChartConfiguration
  height?: number
}

function ChartCard({ config, height = 260 }: ChartCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    // Create new chart
    chartRef.current = new Chart(canvasRef.current, config)

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [config])

  return (
    <div className="rounded-lg border border-slate-200/80 bg-white p-4">
      <canvas ref={canvasRef} style={{ height }} />
    </div>
  )
}

interface GraphPanelProps {
  data: SimulationState[]
  stagePlanConfig?: ClientConfig
}

export function GraphPanel({ data, stagePlanConfig }: GraphPanelProps) {
  const chartData = useChartData(data, stagePlanConfig)

  // Enhanced data validation
  if (!data || data.length === 0) {
    return (
      <div className="py-8 text-center text-slate-500">
        No simulation data available. Please run a simulation first.
      </div>
    )
  }

  if (data.length === 1) {
    return (
      <div className="py-8 text-center text-orange-500">
        <div className="text-lg font-semibold">⚠️ Insufficient Data Points</div>
        <div className="mt-2 text-sm">
          Only {data.length} data point available. Simulation may have terminated early.
          <br />
          Check the browser console for simulation details.
        </div>
      </div>
    )
  }

  if (!chartData) {
    return (
      <div className="py-8 text-center text-red-500">
        <div className="text-lg font-semibold">❌ Data Processing Error</div>
        <div className="mt-2 text-sm">
          Failed to process {data.length} simulation data points.
          <br />
          Check the browser console for error details.
        </div>
      </div>
    )
  }

  const { data: displayData, stageSummaries, stageBands, eventMarkers } = chartData

  // Summary cards
  const overallSummary = [
    {
      key: 'max-altitude',
      label: 'Max Altitude',
      value: formatValue(Math.max(...displayData.map(d => d.altitude || 0)) / 1000, 'km'),
      detail: `at t = ${formatValue(displayData.find(d => d.altitude === Math.max(...displayData.map(s => s.altitude || 0)))?.time || 0, 's')}`
    },
    {
      key: 'max-velocity',
      label: 'Max Velocity',
      value: formatValue(Math.max(...displayData.map(d => d.velocity_magnitude || 0)), 'm/s'),
      detail: `Mach ${formatValue(Math.max(...displayData.map(d => d.mach_number || 0)), '')}`
    },
    {
      key: 'final-downrange',
      label: 'Final Downrange',
      value: formatValue(displayData[displayData.length - 1]?.downrange_km || 0, 'km')
    },
    {
      key: 'flight-time',
      label: 'Flight Time',
      value: formatValue(displayData[displayData.length - 1]?.time || 0, 's')
    }
  ]

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overallSummary.map((card) => (
          <div key={card.key} className="rounded-lg border border-slate-200/80 bg-white/95 p-4 shadow-xs">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {card.label}
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {card.value}
            </div>
            {card.detail && (
              <div className="mt-1 text-xs text-slate-600">
                {card.detail}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Main Charts */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard config={createAltitudeChart(displayData, stageBands, eventMarkers)} />
        <ChartCard config={createVelocityChart(displayData, stageBands, eventMarkers)} />
        <ChartCard config={createMachChart(displayData, stageBands, eventMarkers)} />
        <ChartCard config={createThrustChart(displayData, stageBands, eventMarkers)} />
        <ChartCard config={createAccelerationChart(displayData, stageBands, eventMarkers)} />
        <ChartCard config={createDynamicPressureChart(displayData, stageBands, eventMarkers)} />
      </div>

      {/* Secondary Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard config={createAttitudeChart(displayData, stageBands, eventMarkers)} />
        <div></div> {/* Empty space for better layout */}
      </div>

      {/* Trajectory Chart */}
      <ChartCard config={createTrajectoryChart(displayData)} height={400} />

      {/* Stage Details */}
      {stageSummaries.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-lg font-semibold">Stage Performance</h4>
          <Accordion type="multiple" defaultValue={['stage-0']}>
            {stageSummaries.map((summary, idx) => (
              <AccordionItem key={`stage-${idx}`} value={`stage-${idx}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: summary.accentColor }}
                    />
                    <span>Stage {summary.stage}</span>
                    <Badge variant="secondary">{formatValue(summary.duration, 's')}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200/60 bg-slate-50/80 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Max Altitude
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {formatValue(summary.maxAltitude / 1000, 'km')}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200/60 bg-slate-50/80 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Max Mach
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {formatValue(summary.maxMach, '')}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200/60 bg-slate-50/80 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Max Thrust
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {formatValue(summary.maxThrust / 1000, 'kN')}
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
    </div>
  )
}
