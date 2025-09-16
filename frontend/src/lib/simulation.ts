import type { SimulationState, RocketConfig, ApiError } from './types'

async function parseMaybeError(res: Response): Promise<never> {
  let raw = ''
  try {
    raw = await res.text()
  } catch (_err) {
    throw new Error(`${res.status} ${res.statusText}`)
  }

  if (raw.length > 0) {
    try {
      const data = JSON.parse(raw) as ApiError | any
      if (data && typeof data === 'object' && 'error' in data) {
        const msg = data.detail ? `${data.error}: ${data.detail}` : String(data.error)
        throw new Error(msg)
      }
      throw new Error(typeof data === 'string' ? data : JSON.stringify(data))
    } catch {
      throw new Error(raw)
    }
  }

  throw new Error(`${res.status} ${res.statusText}`)
}

export async function runSimulation(config: RocketConfig): Promise<SimulationState[]> {
  const res = await fetch('/api/simulation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
  if (!res.ok) return parseMaybeError(res)
  return res.json()
}

export async function runSimulationFromPath(configPath: string): Promise<SimulationState[]> {
  const res = await fetch('/api/simulation/path', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config_path: configPath })
  })
  if (!res.ok) return parseMaybeError(res)
  return res.json()
}

export async function uploadAndRun(formData: FormData): Promise<SimulationState[]> {
  const res = await fetch('/api/upload', { method: 'POST', body: formData })
  if (!res.ok) return parseMaybeError(res)
  return res.json()
}
