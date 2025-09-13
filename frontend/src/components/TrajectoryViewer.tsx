import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { SimulationState } from '../lib/types'

export function TrajectoryViewer({ data }: { data: SimulationState[] }) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mountRef.current || !data || data.length === 0) return

    const w = 640, h = 480
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 10000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    mountRef.current.appendChild(renderer.domElement)

    // Basic light
    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.set(10, 10, 10)
    scene.add(light)

    // Earth sphere (scaled down)
    const earthR = 6371 // km scale
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(earthR, 48, 32),
      new THREE.MeshLambertMaterial({ color: 0x3a6ea5, wireframe: false })
    )
    scene.add(earth)

    // Build trajectory line (convert meters to km and reorder axes for nicer view)
    const pts = data.map(s => new THREE.Vector3(
      s.position.x / 1000,
      s.position.z / 1000,
      -s.position.y / 1000,
    ))
    const geom = new THREE.BufferGeometry().setFromPoints(pts)
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xff5533 }))
    scene.add(line)

    camera.position.set(earthR * 3, earthR * 1.2, earthR * 3)
    camera.lookAt(0, 0, 0)

    renderer.render(scene, camera)

    return () => {
      try { mountRef.current?.removeChild(renderer.domElement) } catch {}
      renderer.dispose()
      geom.dispose()
    }
  }, [data])

  return <div ref={mountRef} />
}

