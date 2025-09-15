// Type shim for dynamically imported wasm-pack output.
// This suppresses TS errors when `frontend/src/wasm` is not yet built.
declare module '../wasm/openTsiolkovsky_cli' {
  const mod: any
  export default mod
}
