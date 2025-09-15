import { useState, lazy, Suspense } from 'react'
import type { SimulationState } from './lib/types'
import { SimulationPanel } from './components/SimulationPanel'

const TrajectoryViewer = lazy(() => import('./components/TrajectoryViewer').then(m => ({ default: m.TrajectoryViewer })))
const GraphPanel = lazy(() => import('./components/GraphPanel').then(m => ({ default: m.GraphPanel })))

export default function App() {
  const [trajectory, setTrajectory] = useState<SimulationState[] | null>(null)

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h1>OpenTsiolkovsky</h1>

      <section style={{ marginBottom: 16 }}>
        <SimulationPanel onResult={setTrajectory} />
      </section>

      <section>
        <h2>Trajectory</h2>
        {trajectory && (
          <Suspense fallback={<div>Loading 3D...</div>}>
            <TrajectoryViewer data={trajectory} />
          </Suspense>
        )}
      </section>

      <section>
        <h2>Graphs</h2>
        {trajectory && (
          <Suspense fallback={<div>Loading graphs...</div>}>
            <GraphPanel data={trajectory} />
          </Suspense>
        )}
      </section>
    </div>
  )
}
