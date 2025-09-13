export type SimulationState = {
  time: number
  position: { x: number, y: number, z: number }
  velocity: { x: number, y: number, z: number }
  mass: number
  stage: number
  altitude: number
  velocity_magnitude: number
  mach_number: number
  dynamic_pressure: number
  thrust: number
  drag_force: number
}

export type RocketConfig = any // For now, use server-side Rust schema

