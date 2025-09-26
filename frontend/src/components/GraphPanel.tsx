import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'
import { Chart, type ChartConfiguration } from 'chart.js/auto'
import { Download, PackageOpen, MapPin } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Button } from './ui'
import { useChartData, formatValue } from '../hooks/useChartData'
import {
  eventMarkerPlugin,
  createAltitudeChart,
  createVelocityChart,
  createMachChart,
  createThrustChart,
  createAccelerationChart,
  createDynamicPressureChart,
  createAttitudeChart,
  createAoAChart,
  createTrajectoryChart,
  createMassChart
} from '../lib/charts'
import { downloadChartAsImage, getChartFilename, downloadAllChartsAsZip } from '../lib/charts'
import { downloadKML } from '../lib/utils'
import type { SimulationState, ClientConfig } from '../lib/simulation'

Chart.register(eventMarkerPlugin)

interface ChartCardProps {
  config: ChartConfiguration
  title: string
  height?: number
}

export interface ChartCardHandle {
  getChart: () => Chart | null
  getTitle: () => string
}

const ChartCard = forwardRef<ChartCardHandle, ChartCardProps>(
  ({ config, title, height = 260 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const chartRef = useRef<Chart | null>(null)

    useImperativeHandle(ref, () => ({
      getChart: () => chartRef.current,
      getTitle: () => title,
    }))

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

    const handleDownload = () => {
      if (chartRef.current) {
        const filename = getChartFilename(title)
        downloadChartAsImage(chartRef.current, filename)
      }
    }

    return (
      <div className="rounded-lg border border-slate-200/80 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-700">{title}</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="h-7 w-7 p-0"
            title="Download chart as PNG"
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
        <div style={{ height: `${height}px`, position: 'relative' }}>
          <canvas ref={canvasRef} />
        </div>
      </div>
    )
  }
)

interface GraphPanelProps {
  data: SimulationState[]
  stagePlanConfig?: ClientConfig
  result?: { trajectory: SimulationState[]; config: ClientConfig }
}

export function GraphPanel({ data, stagePlanConfig, result }: GraphPanelProps) {
  const chartData = useChartData(data, stagePlanConfig)
  const [velocityFrame, setVelocityFrame] = useState<'eci' | 'ecef'>('ecef')

  // Chart refs for bulk download
  const altitudeChartRef = useRef<ChartCardHandle>(null)
  const velocityChartRef = useRef<ChartCardHandle>(null)
  const machChartRef = useRef<ChartCardHandle>(null)
  const thrustChartRef = useRef<ChartCardHandle>(null)
  const accelerationChartRef = useRef<ChartCardHandle>(null)
  const dynamicPressureChartRef = useRef<ChartCardHandle>(null)
  const massChartRef = useRef<ChartCardHandle>(null)
  const attitudeChartRef = useRef<ChartCardHandle>(null)
  const aoaChartRef = useRef<ChartCardHandle>(null)
  const trajectoryChartRef = useRef<ChartCardHandle>(null)

  const handleDownloadAllCharts = async () => {
    const chartRefs = [
      altitudeChartRef,
      velocityChartRef,
      machChartRef,
      thrustChartRef,
      accelerationChartRef,
      dynamicPressureChartRef,
      massChartRef,
      attitudeChartRef,
      aoaChartRef,
      trajectoryChartRef,
    ]

    const charts = chartRefs
      .map(ref => ref.current)
      .filter((chartHandle): chartHandle is ChartCardHandle => chartHandle !== null)
      .map(chartHandle => ({
        chart: chartHandle.getChart(),
        title: chartHandle.getTitle(),
      }))
      .filter((item): item is { chart: Chart; title: string } => item.chart !== null)

    if (charts.length === 0) {
      console.warn('No charts available for download')
      return
    }

    const rocketName = stagePlanConfig?.name || 'rocket'
    await downloadAllChartsAsZip(charts, rocketName)
  }

  const handleDownloadKML = () => {
    if (!result || result.trajectory.length === 0) {
      console.warn('No trajectory data available for KML download')
      return
    }
    downloadKML({ trajectory: result.trajectory, config: result.config })
  }

  // Enhanced data validation
  if (!data || data.length === 0) {
    return (
      <div className="py-8 text-center text-slate-500">
        シミュレーションデータがありません。まずシミュレーションを実行してください。
      </div>
    )
  }

  if (data.length === 1) {
    return (
      <div className="py-8 text-center text-orange-500">
        <div className="text-lg font-semibold">⚠️ データポイント不足</div>
        <div className="mt-2 text-sm">
          {data.length} データポイントのみあります。シミュレーションが早期終了した可能性があります。
          <br />
          詳細はブラウザコンソールを確認してください。
        </div>
      </div>
    )
  }

  if (!chartData) {
    return (
      <div className="py-8 text-center text-red-500">
        <div className="text-lg font-semibold">❌ データ処理エラー</div>
        <div className="mt-2 text-sm">
          {data.length} シミュレーションデータポイントの処理に失敗しました。
          <br />
          エラー詳細はブラウザコンソールを確認してください。
        </div>
      </div>
    )
  }

  const { data: displayData, stageSummaries, stageBands, eventMarkers } = chartData

  // Summary cards
  const overallSummary = [
    {
      key: 'max-altitude',
      label: '最高高度',
      value: formatValue(Math.max(...displayData.map(d => d.altitude || 0)) / 1000, 'km'),
      detail: `at t = ${formatValue(displayData.find(d => d.altitude === Math.max(...displayData.map(s => s.altitude || 0)))?.time || 0, 's')}`
    },
    {
      key: 'max-velocity',
      label: '最高速度',
      value: formatValue(Math.max(...displayData.map(d => d.velocity_magnitude || 0)), 'm/s'),
      detail: `Mach ${formatValue(Math.max(...displayData.map(d => d.mach_number || 0)), '')}`
    },
    {
      key: 'final-downrange',
      label: '最終到達距離',
      value: formatValue(displayData[displayData.length - 1]?.downrange_km || 0, 'km')
    },
    {
      key: 'flight-time',
      label: '飛行時間',
      value: formatValue(displayData[displayData.length - 1]?.time || 0, 's')
    }
  ]

  return (
    <div className="space-y-6">
      {/* Download Buttons */}
      <div className="flex justify-end gap-2">
        <Button
          onClick={handleDownloadAllCharts}
          className="flex items-center gap-2"
          variant="outline"
        >
          <PackageOpen className="h-4 w-4" />
          すべてのグラフをダウンロード
        </Button>
        <Button
          onClick={handleDownloadKML}
          className="flex items-center gap-2"
          variant="outline"
          disabled={!result || result.trajectory.length === 0}
        >
          <MapPin className="h-4 w-4" />
          KMLをダウンロード
        </Button>
      </div>

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

      {/* Velocity Coordinate System Toggle - Compact */}
      <div className="mb-2 flex items-center justify-end gap-2 text-xs">
        <span className="text-slate-500">Velocity frame:</span>
        <Button
          variant={velocityFrame === 'ecef' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setVelocityFrame('ecef')}
          className="h-6 px-2 text-xs"
        >
          ECEF
        </Button>
        <Button
          variant={velocityFrame === 'eci' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setVelocityFrame('eci')}
          className="h-6 px-2 text-xs"
        >
          ECI
        </Button>
      </div>

      {/* Main Charts */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard ref={altitudeChartRef} title="Altitude" config={createAltitudeChart(displayData, stageBands, eventMarkers)} />
        <ChartCard ref={velocityChartRef} title={`Velocity (${velocityFrame.toUpperCase()})`} config={createVelocityChart(displayData, stageBands, eventMarkers, velocityFrame)} />
        <ChartCard ref={machChartRef} title="Mach Number" config={createMachChart(displayData, stageBands, eventMarkers)} />
        <ChartCard ref={thrustChartRef} title="Thrust & Drag" config={createThrustChart(displayData, stageBands, eventMarkers)} />
        <ChartCard ref={accelerationChartRef} title="Acceleration (ECI & Body)" config={createAccelerationChart(displayData, stageBands, eventMarkers)} />
        <ChartCard ref={dynamicPressureChartRef} title="Dynamic Pressure" config={createDynamicPressureChart(displayData, stageBands, eventMarkers)} />
        <ChartCard ref={massChartRef} title="Mass" config={createMassChart(displayData, stageBands, eventMarkers)} />
      </div>

      {/* Secondary Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard ref={attitudeChartRef} title="Attitude" config={createAttitudeChart(displayData, stageBands, eventMarkers)} />
        <ChartCard ref={aoaChartRef} title="Angle of Attack (AoA)" config={createAoAChart(displayData, stageBands, eventMarkers)} />
      </div>

      {/* Trajectory Chart */}
      <ChartCard ref={trajectoryChartRef} title="Trajectory" config={createTrajectoryChart(displayData)} height={400} />

      {/* Stage Details */}
      {stageSummaries.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-lg font-semibold">ステージ性能</h4>
          <Accordion type="multiple" defaultValue={['stage-0']}>
            {stageSummaries.map((summary, idx) => (
              <AccordionItem key={`stage-${idx}`} value={`stage-${idx}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: summary.accentColor }}
                    />
                    <span>ステージ {summary.stage}</span>
                    <Badge variant="secondary">{formatValue(summary.duration, 's')}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200/60 bg-slate-50/80 p-4">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        最高高度
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
                        最大推力
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
