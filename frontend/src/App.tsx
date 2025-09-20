import { lazy, Suspense, useState } from 'react'
import type { ClientConfig, SimulationState } from './lib/types'
import { SimulationPanel } from './components/SimulationPanel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card'
import { Badge } from './components/ui/badge'

const TrajectoryViewer = lazy(() => import('./components/TrajectoryViewer').then((m) => ({ default: m.TrajectoryViewer })))
const GraphPanel = lazy(() => import('./components/GraphPanel').then((m) => ({ default: m.GraphPanel })))

export default function App() {
  const [result, setResult] = useState<{ trajectory: SimulationState[]; config: ClientConfig } | null>(null)

  return (
    <div className="relative min-h-screen bg-white">
      <div className="pointer-events-none absolute inset-x-0 -top-32 h-72 bg-gradient-to-b from-brand/25 via-brand/5 to-transparent blur-3xl" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pb-16 pt-12 md:px-8">
        <header className="space-y-4">
          <Badge className="bg-brand/15 text-brand-700">OpenTsiolkovsky</Badge>
          <div className="max-w-2xl space-y-3">
            <h1>Mission Designer Console</h1>
            <p className="text-sm text-slate-600">
              Configure launch conditions, iterate on vehicle stages, and visualize trajectories across the web API and in-browser WASM simulator.
            </p>
          </div>
        </header>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,420px)_1fr]">
          <SimulationPanel
            onResult={(trajectory: SimulationState[], config: ClientConfig) => setResult({ trajectory, config })}
          />

          <div className="flex flex-col gap-8">
            <Card className="panel-card">
              <CardHeader className="border-b border-slate-200/80 bg-white/60">
                <CardTitle>Trajectory</CardTitle>
                <CardDescription>Inspect the 3D flight path once a simulation is executed.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center bg-slate-50/60">
                {result ? (
                  <Suspense fallback={<div className="py-24 text-sm text-slate-500">Loading 3D viewer…</div>}>
                    <TrajectoryViewer data={result.trajectory} />
                  </Suspense>
                ) : (
                  <div className="py-16 text-sm text-slate-500">Run a simulation to generate a trajectory.</div>
                )}
              </CardContent>
            </Card>

            <Card className="panel-card">
              <CardHeader className="border-b border-slate-200/80 bg-white/60">
                <CardTitle>Graphs</CardTitle>
                <CardDescription>Results are grouped by stages and key metrics for quick comparison.</CardDescription>
              </CardHeader>
              <CardContent>
                {result ? (
                  <Suspense fallback={<div className="py-12 text-sm text-slate-500">Loading analysis…</div>}>
                    <GraphPanel data={result.trajectory} stagePlanConfig={result.config} />
                  </Suspense>
                ) : (
                  <div className="py-8 text-sm text-slate-500">Run a simulation to unlock charts and summaries.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
