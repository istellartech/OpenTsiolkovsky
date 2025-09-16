import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SimulationState } from '../lib/types'
import { vec3ToObject } from '../lib/types'

export function TrajectoryViewer({ data }: { data: SimulationState[] }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const infoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (infoRef.current && (!data || data.length === 0)) {
      infoRef.current.innerText = 'No trajectory data'
    }
    if (!mountRef.current || !data || data.length === 0) return

    const w = 640, h = 480
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x020617)
    const cameraFar = 1_000_000
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, cameraFar)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    if (typeof window !== 'undefined') {
      renderer.setPixelRatio(window.devicePixelRatio || 1)
    }
    mountRef.current.appendChild(renderer.domElement)

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
          `Lat: ${latLonAlt.lat.toFixed(2)}°, Lon: ${latLonAlt.lon.toFixed(2)}°, Alt: ${(latLonAlt.alt_km).toFixed(1)} km`
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
    }
  }, [data])

  return (
    <div style={{ position: 'relative', width: 640, height: 480 }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div
        ref={infoRef}
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          padding: '4px 8px',
          background: 'rgba(15, 23, 42, 0.75)',
          color: '#f1f5f9',
          fontSize: 12,
          fontFamily: 'monospace',
          borderRadius: 4,
        }}
      />
    </div>
  )
}

function eciToLatLon(pos: { x: number, y: number, z: number }) {
  const rad2deg = 180 / Math.PI
  const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z)
  const lat = Math.atan2(pos.z, Math.sqrt(pos.x * pos.x + pos.y * pos.y)) * rad2deg
  let lon = Math.atan2(pos.y, pos.x) * rad2deg
  if (lon > 180) lon -= 360
  if (lon < -180) lon += 360
  return { lat, lon, alt_km: r / 1000 - 6371 }
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
