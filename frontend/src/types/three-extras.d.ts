import * as THREE from 'three'

declare module 'three/examples/jsm/controls/OrbitControls.js' {
  class OrbitControls extends THREE.EventDispatcher {
    constructor(object: THREE.Camera, domElement?: HTMLElement)

    enabled: boolean
    target: THREE.Vector3
    minDistance: number
    maxDistance: number
    enablePan: boolean
    enableDamping: boolean
    dampingFactor: number

    update(): void
    dispose(): void
  }

  export { OrbitControls }
}
