import { useState } from 'react'
import type React from 'react'
import { runSimulation, runSimulationFromPath, uploadAndRun } from '../lib/simulation'
import type { SimulationState } from '../lib/types'

type Props = {
  onResult: (trajectory: SimulationState[]) => void
}

export function SimulationPanel({ onResult }: Props) {
  const SAMPLE_CONFIG_JSON = `{
  "name(str)": "sample",
  "calculate condition": {
    "end time[s]": 120,
    "time step for output[s]": 1,
    "air density variation file exist?(bool)": false,
    "air density variation file name(str)": "",
    "variation ratio of air density[%](-100to100, default=0)": 0
  },
  "launch": {
    "position LLH[deg,deg,m]": [35.0, 139.0, 0.0],
    "velocity NED[m/s]": [0.0, 0.0, 0.0],
    "time(UTC)[y,m,d,h,min,sec]": [2023, 1, 1, 12, 0, 0]
  },
  "stage1": {
    "power flight mode(int)": 0,
    "free flight mode(int)": 2,
    "mass initial[kg]": 1000.0,
    "thrust": {
      "Isp vac file exist?(bool)": false,
      "Isp vac file name(str)": "",
      "Isp coefficient[-]": 1.0,
      "const Isp vac[s]": 200.0,
      "thrust vac file exist?(bool)": false,
      "thrust vac file name(str)": "",
      "thrust coefficient[-]": 1.0,
      "const thrust vac[N]": 50000.0,
      "burn start time(time of each stage)[s]": 0.0,
      "burn end time(time of each stage)[s]": 30.0,
      "forced cutoff time(time of each stage)[s]": 30.0,
      "throat diameter[m]": 0.1,
      "nozzle expansion ratio[-]": 5.0,
      "nozzle exhaust pressure[Pa]": 101300.0
    },
    "aero": {
      "body diameter[m]": 0.5,
      "normal coefficient file exist?(bool)": false,
      "normal coefficient file name(str)": "",
      "normal multiplier[-]": 1.0,
      "const normal coefficient[-]": 0.2,
      "axial coefficient file exist?(bool)": false,
      "axial coefficient file name(str)": "",
      "axial multiplier[-]": 1.0,
      "const axial coefficient[-]": 0.2,
      "ballistic coefficient(ballistic flight mode)[kg/m2]": 100.0
    },
    "attitude": {
      "attitude file exist?(bool)": false,
      "attitude file name(str)": "",
      "const elevation[deg]": 83.0,
      "const azimuth[deg]": 113.0,
      "pitch offset[deg]": 0.0,
      "yaw offset[deg]": 0.0,
      "roll offset[deg]": 0.0,
      "gyro bias x[deg/h]": 0.0,
      "gyro bias y[deg/h]": 0.0,
      "gyro bias z[deg/h]": 0.0
    },
    "dumping product": {
      "dumping product exist?(bool)": false,
      "dumping product separation time[s]": 130.0,
      "dumping product mass[kg]": 10.0,
      "dumping product ballistic coefficient[kg/m2]": 100.0,
      "additional speed at dumping NED[m/s,m/s,m/s]": [0.0, 0.0, 0.0]
    },
    "attitude neutrality(3DoF)": {
      "considering neutrality?(bool)": false,
      "CG, Controller position file(str)": "",
      "CP file(str)": ""
    },
    "6DoF": {
      "CG,CP,Controller position file(str)": "",
      "moment of inertia file name(str)": ""
    },
    "stage": {
      "following stage exist?(bool)": false,
      "separation time[s]": 1e6
    }
  },
  "wind": {
    "wind file exist?(bool)": false,
    "wind file name(str)": "",
    "const wind[m/s,deg]": [0.0, 270.0]
  }
}`
  const [loading, setLoading] = useState(false)
  const [path, setPath] = useState('bin/param_sample_01.json')
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'api' | 'wasm'>('api')

  async function runFromPath() {
    setLoading(true)
    setError(null)
    try {
      const traj = await runSimulationFromPath(path)
      onResult(traj)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally { setLoading(false) }
  }

  async function runFromJson(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const ta = form.elements.namedItem('configJson') as HTMLTextAreaElement
    if (!ta?.value) return
    setLoading(true)
    setError(null)
    try {
      const cfg = JSON.parse(ta.value)
      let traj: SimulationState[]
      if (mode === 'wasm') {
        const { runSimulationWasm } = await import('../lib/wasm')
        traj = await runSimulationWasm(cfg)
      } else {
        traj = await runSimulation(cfg)
      }
      onResult(traj)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally { setLoading(false) }
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    setLoading(true)
    setError(null)
    try {
      const traj = await uploadAndRun(formData)
      onResult(traj)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <h3>Execution mode</h3>
        <label>
          <input type="radio" name="mode" value="api" checked={mode==='api'} onChange={()=>setMode('api')} />
          <span style={{ marginLeft: 6 }}>Server API</span>
        </label>
        <label style={{ marginLeft: 16 }}>
          <input type="radio" name="mode" value="wasm" checked={mode==='wasm'} onChange={()=>setMode('wasm')} />
          <span style={{ marginLeft: 6 }}>Browser (WASM)</span>
        </label>
      </div>
      <div>
        <h3>Run from server path</h3>
        <input
          value={path}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPath(e.target.value)}
          style={{ width: 480 }}
        />
        <button onClick={runFromPath} disabled={loading || mode==='wasm'} style={{ marginLeft: 8 }}>Run</button>
        {mode==='wasm' && <div style={{ color: '#6b7280' }}>WASMではパス入力は使用できません（サーバAPIをご利用ください）。</div>}
      </div>

      <form onSubmit={runFromJson}>
        <h3>Run from JSON</h3>
        <textarea
          name="configJson"
          rows={8}
          style={{ width: 640 }}
          defaultValue={SAMPLE_CONFIG_JSON}
          placeholder={'C++互換キーのRocketConfig JSONを貼り付けてください（例: "calculate condition" や "end time[s]" など）'}
        ></textarea>
        <div>
          <button type="submit" disabled={loading}>Run JSON ({mode.toUpperCase()})</button>
          <button type="button" disabled={loading} style={{ marginLeft: 8 }} onClick={(e)=>{
            const form = (e.currentTarget as HTMLButtonElement).form as HTMLFormElement
            const ta = form.elements.namedItem('configJson') as HTMLTextAreaElement
            if (ta) ta.value = SAMPLE_CONFIG_JSON
          }}>Reset to sample</button>
        </div>
      </form>

      <form onSubmit={onUpload}>
        <h3>Upload config + CSVs</h3>
        <div>config (JSON): <input type="file" name="config" accept="application/json" required /></div>
        <div>thrust: <input type="file" name="thrust" accept="text/csv" /></div>
        <div>isp: <input type="file" name="isp" accept="text/csv" /></div>
        <div>cn: <input type="file" name="cn" accept="text/csv" /></div>
        <div>ca: <input type="file" name="ca" accept="text/csv" /></div>
        <div>attitude: <input type="file" name="attitude" accept="text/csv" /></div>
        <div>wind: <input type="file" name="wind" accept="text/csv" /></div>
        <button type="submit" disabled={loading || mode==='wasm'}>Upload & Run</button>
        {mode==='wasm' && <div style={{ color: '#6b7280' }}>WASMではファイルアップロード実行は未対応です（サーバAPIをご利用ください）。</div>}
        <div style={{ marginTop: 8, color: '#6b7280' }}>
          サンプルファイルの場所: <code>bin/param_sample_01.json</code>、<code>bin/sample/thrust.csv</code>、
          <code>bin/sample/Isp.csv</code>、<code>bin/sample/CN.csv</code>、<code>bin/sample/CA.csv</code>、
          <code>bin/sample/attitude.csv</code>、<code>bin/sample/wind.csv</code>
        </div>
        <div style={{ marginTop: 4 }}>
          サンプルをすぐ試すには <b>Run from server path</b> のパスに
          <code>bin/param_sample_01.json</code> を指定して Run してください（既定値）。
        </div>
      </form>

      {loading && <div>Running...</div>}
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
    </div>
  )
}
