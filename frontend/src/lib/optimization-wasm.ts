/** Shared by the browser Worker and the Bun parity test. No Node/WASI runtime. */
export interface OptimizerExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory
  opt_alloc: (length: number) => number
  opt_free: (pointer: number, length: number) => void
  opt_solve: (pointer: number, length: number) => number
}

export async function instantiateOptimizer(bytes: BufferSource, onProgress: (record: unknown) => void) {
  let wasm: OptimizerExports
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const errnoNosys = 52
  const { instance } = await WebAssembly.instantiate(bytes, {
    optimization_host: {
      progress(ptr: number, len: number) {
        onProgress(JSON.parse(decoder.decode(new Uint8Array(wasm.memory.buffer, ptr, len))))
      },
    },
    wasi_snapshot_preview1: {
      clock_time_get(clock: number, _precision: bigint, ptr: number) {
        // WASI clock 0 = realtime; 1 = monotonic. Use nanoseconds, not ms.
        const milliseconds = clock === 0 ? Date.now() : performance.now()
        new DataView(wasm.memory.buffer).setBigUint64(ptr, BigInt(Math.floor(milliseconds * 1e6)), true)
        return 0
      },
      fd_write(fd: number, iov: number, count: number, written: number) {
        if (fd !== 1 && fd !== 2) return 8 // BADF
        const view = new DataView(wasm.memory.buffer)
        let total = 0
        for (let i = 0; i < count; i++) {
          const ptr = view.getUint32(iov + 8 * i, true)
          const len = view.getUint32(iov + 8 * i + 4, true)
          // Keep advisory derivative-check output visible without corrupting JSON.
          const line = decoder.decode(new Uint8Array(wasm.memory.buffer, ptr, len))
          if (line.trim()) console.info(`[optimizer fd ${fd}] ${line.trim()}`)
          total += len
        }
        view.setUint32(written, total, true)
        return 0
      },
      environ_sizes_get(count: number, size: number) {
        const view = new DataView(wasm.memory.buffer)
        view.setUint32(count, 0, true)
        view.setUint32(size, 0, true)
        return 0
      },
      environ_get: () => 0,
      fd_close: () => 8,
      fd_seek: () => 8,
      fd_fdstat_get: () => 8,
      fd_prestat_get: () => 8,
      fd_prestat_dir_name: () => 8,
      path_create_directory: () => errnoNosys,
      path_filestat_get: () => 44, // NOENT: this module has no filesystem
      path_open: () => 44,
      sched_yield: () => 0,
      random_get(ptr: number, length: number) {
        const bytes = new Uint8Array(wasm.memory.buffer, ptr, length)
        for (let offset = 0; offset < length; offset += 65536) {
          crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 65536, length)))
        }
        return 0
      },
      proc_exit(code: number) {
        throw new Error(`optimizer exited: ${code}`)
      },
    },
  })
  wasm = instance.exports as OptimizerExports
  return {
    solve(input: unknown): unknown {
      const payload = new TextEncoder().encode(JSON.stringify(input))
      const ptr = wasm.opt_alloc(payload.length)
      if (!ptr) throw new Error('最適化入力が大きすぎるか、空です。')
      let output = 0
      let length = 0
      try {
        new Uint8Array(wasm.memory.buffer, ptr, payload.length).set(payload)
        output = wasm.opt_solve(ptr, payload.length)
        length = new DataView(wasm.memory.buffer).getUint32(output, true)
        return JSON.parse(decoder.decode(new Uint8Array(wasm.memory.buffer, output + 4, length)))
      } finally {
        wasm.opt_free(ptr, payload.length)
        if (output) wasm.opt_free(output, length + 4)
      }
    },
    memoryBytes: () => wasm.memory.buffer.byteLength,
  }
}
