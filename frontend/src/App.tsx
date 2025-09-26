import { lazy, Suspense, useState } from 'react'
import type { ClientConfig, SimulationState } from './lib/simulation'
import { SimulationPanel } from './components/SimulationPanel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button } from './components/ui'
import { downloadKML } from './lib/utils'

const GraphPanel = lazy(() => import('./components/GraphPanel').then((m) => ({ default: m.GraphPanel })))

export default function App() {
  const [result, setResult] = useState<{ trajectory: SimulationState[]; config: ClientConfig } | null>(null)

  return (
    <div className="relative min-h-screen bg-white">
      <div className="pointer-events-none absolute inset-x-0 -top-32 h-72 bg-linear-to-b from-brand/25 via-brand/5 to-transparent blur-3xl" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pb-16 pt-12 md:px-8">
        <header className="space-y-4">
          <div className="max-w-2xl space-y-3">
            <h1>OpenTsiolkovsky</h1>
          </div>
        </header>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,420px)_1fr]">
          <SimulationPanel
            onResult={(trajectory: SimulationState[], config: ClientConfig) => setResult({ trajectory, config })}
          />

          <div className="flex flex-col gap-8">
            <Card className="panel-card">
              <CardHeader className="border-b border-slate-200/80 bg-white/60">
                <CardTitle>Output</CardTitle>
                <CardDescription>Results are grouped by stages and key metrics for quick comparison.</CardDescription>
              </CardHeader>
              <CardContent>
                {result ? (
                  <Suspense fallback={<div className="py-12 text-sm text-slate-500">Loading analysis…</div>}>
                    <GraphPanel data={result.trajectory} stagePlanConfig={result.config} result={result} />
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
