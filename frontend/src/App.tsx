import { lazy, Suspense, useState } from 'react'
import type { ClientConfig, SimulationState } from './lib/simulation'
import { SimulationPanel } from './components/SimulationPanel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui'

const GraphPanel = lazy(() => import('./components/GraphPanel').then((m) => ({ default: m.GraphPanel })))

export default function App() {
  const [result, setResult] = useState<{ trajectory: SimulationState[]; config: ClientConfig; executionTime?: number } | null>(null)

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
            onResult={(trajectory: SimulationState[], config: ClientConfig, executionTime: number) => setResult({ trajectory, config, executionTime })}
          />

          <div className="flex flex-col gap-8">
            <Card className="panel-card">
              <CardHeader className="border-b border-slate-200/80 bg-white/60">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>出力</CardTitle>
                    <CardDescription>結果はステージ別に整理され、主要指標を比較できます。</CardDescription>
                  </div>
                  {result?.executionTime && (
                    <div className="text-sm text-slate-600">
                      <strong>計算時間:</strong> {result.executionTime}ms
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {result ? (
                  <Suspense fallback={<div className="py-12 text-sm text-slate-500">分析中…</div>}>
                    <GraphPanel data={result.trajectory} stagePlanConfig={result.config} result={result} />
                  </Suspense>
                ) : (
                  <div className="py-8 text-sm text-slate-500">シミュレーションを実行してグラフと集計を表示。</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
