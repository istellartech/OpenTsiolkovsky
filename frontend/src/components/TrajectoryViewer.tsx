import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SimulationState } from '../lib/types'
import { vec3ToObject } from '../lib/types'
import { eciToLatLon } from '../lib/geo'

export function TrajectoryViewer({ data }: { data: SimulationState[] }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const infoRef = useRef<HTMLDivElement>(null)
  const [isFullWidth, setIsFullWidth] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const fullWidthRef = useRef(isFullWidth)
  const fullscreenRef = useRef(isFullscreen)
  const applySizeRef = useRef<(() => void) | null>(null)

  const handleToggleFullWidth = () => {
    setIsFullWidth((prev) => !prev)
  }

  const handleToggleFullscreen = () => {
    if (typeof document === 'undefined') return
    const container = mountRef.current
    if (!container) return
    if (document.fullscreenElement === container) {
      document.exitFullscreen?.()
    } else {
      container.requestFullscreen?.().catch(() => {
        /* swallow */
      })
    }
  }

  useEffect(() => {
    fullWidthRef.current = isFullWidth
    applySizeRef.current?.()
  }, [isFullWidth])

  useEffect(() => {
    fullscreenRef.current = isFullscreen
    applySizeRef.current?.()
  }, [isFullscreen])

  useEffect(() => {
    if (infoRef.current && (!data || data.length === 0)) {
      infoRef.current.innerText = 'No trajectory data'
    }
    if (!mountRef.current || !data || data.length === 0) return

    const container = mountRef.current
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x020617)
    const cameraFar = 1_000_000
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, cameraFar)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    if (typeof window !== 'undefined') {
      renderer.setPixelRatio(window.devicePixelRatio || 1)
    }
    container.appendChild(renderer.domElement)

    const getParentWidth = () => {
      const parentWidth = container.parentElement?.getBoundingClientRect().width ?? 0
      const selfWidth = container.getBoundingClientRect().width
      if (parentWidth > 0) return parentWidth
      if (selfWidth > 0) return selfWidth
      if (typeof window !== 'undefined') {
        return Math.max(360, window.innerWidth - 48)
      }
      return 480
    }

    const applySize = () => {
      const fullscreen = fullscreenRef.current
      const fullWidth = fullWidthRef.current
      let width: number
      let height: number
      if (fullscreen && typeof window !== 'undefined') {
        width = window.innerWidth
        height = window.innerHeight
      } else {
        const available = getParentWidth()
        if (fullWidth) {
          width = Math.max(360, available)
          height = Math.max(340, Math.min(width * 0.6, 560))
        } else {
          width = Math.min(Math.max(360, available * 0.6), 520)
          height = Math.max(320, Math.min(width * 0.65, 460))
        }
      }

      renderer.setSize(width, height, false)
      if (fullscreen) {
        container.style.width = '100%'
        container.style.maxWidth = '100%'
      } else if (fullWidth) {
        container.style.width = '100%'
        container.style.maxWidth = '100%'
      } else {
        container.style.width = `${Math.round(width)}px`
        container.style.maxWidth = `${Math.round(width)}px`
      }
      container.style.height = `${Math.round(height)}px`
      container.style.margin = fullWidth || fullscreen ? '0' : '0 auto'
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    applySizeRef.current = applySize

    applySize()
    if (!(typeof ResizeObserver !== 'undefined')) {
      requestAnimationFrame(applySize)
    }

    const handleFullscreenChange = () => {
      if (typeof document === 'undefined') return
      const active = document.fullscreenElement === container
      fullscreenRef.current = active
      setIsFullscreen(active)
      applySize()
    }

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => applySize())
      resizeObserver.observe(container)
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', applySize)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('fullscreenchange', handleFullscreenChange)
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = true
    controls.minDistance = 200
    controls.maxDistance = cameraFar * 0.9
    controls.target.set(0, 0, 0)

    // Basic light
    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.set(10, 10, 10)
    scene.add(light)
    scene.add(new THREE.AmbientLight(0xffffff, 0.35))

    // Earth sphere (scaled down)
    const earthR = 6371 // km scale
    const earthGeom = new THREE.SphereGeometry(earthR, 128, 96)
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x75b9ff,
      emissive: 0x0d1b2a,
      shininess: 35,
      transparent: true,
      opacity: 0.55,
    })
    const earth = new THREE.Mesh(earthGeom, earthMat)
    scene.add(earth)

    const grid = createLatLonGrid(earthR * 1.001)
    scene.add(grid)

    const atmosphereGeom = new THREE.SphereGeometry(earthR * 1.02, 64, 48)
    const atmosphereMat = new THREE.MeshBasicMaterial({
      color: 0x90cdf4,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
    })
    const atmosphere = new THREE.Mesh(atmosphereGeom, atmosphereMat)
    scene.add(atmosphere)

    // Build trajectory line (convert meters to km and reorder axes for nicer view)
    const pts = data.map(s => {
      const pos = vec3ToObject(s.position)
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
        return null
      }
      return new THREE.Vector3(
        pos.x / 1000,
        pos.z / 1000,
        -pos.y / 1000,
      )
    }).filter((v): v is THREE.Vector3 => v !== null)

    let geom: THREE.BufferGeometry | null = null
    let line: THREE.Line | null = null
    let lineMaterial: THREE.LineBasicMaterial | null = null
    let marker: THREE.Mesh | null = null
    if (pts.length > 0) {
      lineMaterial = new THREE.LineBasicMaterial({ color: 0xff5533 })
      geom = new THREE.BufferGeometry().setFromPoints(pts)
      line = new THREE.Line(geom, lineMaterial)
      scene.add(line)

      const last = pts[pts.length - 1]
      marker = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(earthR * 0.01, 25), 32, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      )
      marker.position.copy(last)
      scene.add(marker)
    }

    if (infoRef.current) {
      if (pts.length === 0) {
        infoRef.current.innerText = 'No trajectory data'
      } else {
        const lastState = data[data.length - 1]
        const posEci = vec3ToObject(lastState.position)
        const latLonAlt = eciToLatLon(posEci)
        infoRef.current.innerText =
          `Lat: ${latLonAlt.lat.toFixed(2)}°, Lon: ${latLonAlt.lon.toFixed(2)}°, Alt: ${(latLonAlt.altKm).toFixed(1)} km`
      }
    }

    const boundingCenter = new THREE.Vector3()
    const boundingSize = new THREE.Vector3()
    if (pts.length > 0) {
      const box = new THREE.Box3().setFromPoints(pts)
      box.getCenter(boundingCenter)
      box.getSize(boundingSize)
    }
    const radius = pts.length > 0
      ? Math.max(boundingSize.length() / 2, earthR * 0.8)
      : earthR
    const distance = Math.max(radius * 2.8, earthR * 2.2)
    const viewDir = pts.length > 0
      ? boundingCenter.clone().normalize()
      : new THREE.Vector3(1, 0.8, 1)
    if (viewDir.lengthSq() < 1e-6) {
      viewDir.set(1, 0.8, 1)
    }
    viewDir.normalize()
    const clampedDistance = Math.min(distance, cameraFar * 0.9)
    camera.position.copy(boundingCenter.clone().add(viewDir.multiplyScalar(clampedDistance)))
    camera.lookAt(boundingCenter)
    camera.updateProjectionMatrix()
    controls.target.copy(boundingCenter)
    controls.update()

    let frame = 0
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      } else if (typeof window !== 'undefined') {
        window.removeEventListener('resize', applySize)
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('fullscreenchange', handleFullscreenChange)
      }
      try {
        container.style.height = ''
        container.style.width = ''
        container.style.maxWidth = ''
        container.style.margin = ''
      } catch {}
      try { mountRef.current?.removeChild(renderer.domElement) } catch {}
      cancelAnimationFrame(frame)
      controls.dispose()
      renderer.dispose()
      if (line) {
        scene.remove(line)
      }
      scene.remove(earth)
      scene.remove(grid)
      scene.remove(atmosphere)
      if (marker) scene.remove(marker)
      geom?.dispose()
      lineMaterial?.dispose()
      if (marker) {
        marker.geometry.dispose()
        const materials = Array.isArray(marker.material) ? marker.material : [marker.material]
        materials.forEach(m => m.dispose())
      }
      earthGeom.dispose()
      earthMat.dispose()
      disposeLatLonGrid(grid)
      atmosphereGeom.dispose()
      atmosphereMat.dispose()
      applySizeRef.current = null
    }
  }, [data])

  return (
    <div className="relative w-full min-h-[220px] max-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-950/95 shadow-soft">
      <div ref={mountRef} className="h-full w-full" />
      <div className="pointer-events-none absolute top-3 right-3 flex gap-2">
        <button
          type="button"
          onClick={handleToggleFullWidth}
          className="pointer-events-auto rounded-md border border-white/30 bg-slate-900/70 px-3 py-1 text-xs font-semibold text-slate-100 shadow-xs transition hover:border-white/60 hover:bg-slate-900/90"
        >
          {isFullWidth ? 'Default width' : 'Full width'}
        </button>
        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="pointer-events-auto rounded-md border border-white/30 bg-slate-900/70 px-3 py-1 text-xs font-semibold text-slate-100 shadow-xs transition hover:border-white/60 hover:bg-slate-900/90"
        >
          {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
      </div>
      <div
        ref={infoRef}
        className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/10 px-3 py-1 text-[11px] font-mono text-slate-100 shadow-inner backdrop-blur-xs"
      />
    </div>
  )
}

function createLatLonGrid(radius: number) {
  const group = new THREE.Group()
  const segments = 128
  const latSteps = [-60, -30, 0, 30, 60]
  for (const latDeg of latSteps) {
    const lat = THREE.MathUtils.degToRad(latDeg)
    const ringRadius = radius * Math.cos(lat)
    const y = radius * Math.sin(lat)
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2
      points.push(new THREE.Vector3(ringRadius * Math.cos(theta), y, ringRadius * Math.sin(theta)))
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ color: 0xcbd5f5, opacity: 0.4, transparent: true })
    group.add(new THREE.Line(geom, material))
  }

  const lonSteps = [0, 60, 120, 180, -60, -120]
  for (const lonDeg of lonSteps) {
    const lon = THREE.MathUtils.degToRad(lonDeg)
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= segments; i++) {
      const phi = (i / segments) * Math.PI - Math.PI / 2
      const r = radius * Math.cos(phi)
      const x = r * Math.cos(lon)
      const z = r * Math.sin(lon)
      const y = radius * Math.sin(phi)
      points.push(new THREE.Vector3(x, y, z))
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ color: 0xcbd5f5, opacity: 0.4, transparent: true })
    group.add(new THREE.Line(geom, material))
  }

  return group
}

function disposeLatLonGrid(group: THREE.Group) {
  group.traverse(obj => {
    if (obj instanceof THREE.Line) {
      obj.geometry.dispose()
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      materials.forEach(m => m.dispose())
    }
  })
}
