import type { SimulationState, RocketConfig } from './types'

export async function runSimulation(config: RocketConfig): Promise<SimulationState[]> {
  const res = await fetch('/api/simulation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function runSimulationFromPath(configPath: string): Promise<SimulationState[]> {
  const res = await fetch('/api/simulation/path', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config_path: configPath })
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function uploadAndRun(formData: FormData): Promise<SimulationState[]> {
  const res = await fetch('/api/upload', { method: 'POST', body: formData })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

