import { useState } from 'react'
import { runSimulationFromPath, uploadAndRun } from './lib/simulation'
import type { SimulationState } from './lib/types'
import { TrajectoryViewer } from './components/TrajectoryViewer'
import { GraphPanel } from './components/GraphPanel'

export default function App() {
  const [trajectory, setTrajectory] = useState<SimulationState[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [path, setPath] = useState('bin/param_sample_01.json')

  async function runFromPath() {
    setLoading(true)
    try {
      const traj = await runSimulationFromPath(path)
      setTrajectory(traj)
    } finally {
      setLoading(false)
    }
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    setLoading(true)
    try {
      const traj = await uploadAndRun(formData)
      setTrajectory(traj)
    } finally { setLoading(false) }
  }

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h1>OpenTsiolkovsky</h1>

      <section style={{ marginBottom: 16 }}>
        <h2>Run from server path</h2>
        <input value={path} onChange={e=>setPath(e.target.value)} style={{ width: 400 }} />
        <button onClick={runFromPath} disabled={loading} style={{ marginLeft: 8 }}>Run</button>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2>Upload config + CSVs</h2>
        <form onSubmit={onUpload}>
          <div>config (JSON): <input type="file" name="config" required /></div>
          <div>thrust: <input type="file" name="thrust" /></div>
          <div>isp: <input type="file" name="isp" /></div>
          <div>cn: <input type="file" name="cn" /></div>
          <div>ca: <input type="file" name="ca" /></div>
          <div>attitude: <input type="file" name="attitude" /></div>
          <div>wind: <input type="file" name="wind" /></div>
          <button type="submit" disabled={loading}>Upload & Run</button>
        </form>
      </section>

      <section>
        <h2>Trajectory</h2>
        {loading && <div>Running...</div>}
        {trajectory && <TrajectoryViewer data={trajectory} />}
      </section>

      <section>
        <h2>Graphs</h2>
        {trajectory && <GraphPanel data={trajectory} />}
      </section>
    </div>
  )
}
