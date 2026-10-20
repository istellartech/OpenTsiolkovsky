import { describe, expect, it } from 'vite-plus/test'
import { createPlayback } from './playback'

describe('workspace playheads', () => {
  it('keeps simulation and optimization times independent and clamps each result separately', () => {
    const sim = createPlayback(),
      opt = createPlayback()
    sim.load(0, 400)
    opt.load(0, 2000)
    sim.seek(100)
    opt.seek(1500)
    opt.step(1000)
    expect(sim.get().t).toBe(100)
    expect(opt.get().t).toBe(2000)
    opt.load(10, 50, { keepTime: true })
    expect(opt.get().t).toBe(50)
    expect(sim.get().t1).toBe(400)
  })
})
