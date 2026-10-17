import { useEffect, useRef, useState } from 'react'
import {
  BoundingSphere,
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  Entity,
  HeadingPitchRange,
  HorizontalOrigin,
  ImageryLayer,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  PerspectiveFrustum,
  PolylineDashMaterialProperty,
  ScreenSpaceEventType,
  TileMapServiceImageryProvider,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  buildModuleUrl,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { indexAt, readStageColor, sampleAt, type Track } from '../lib/trajectory'
import { playback } from '../lib/playback'
import { Segmented } from './primitives'

;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = CESIUM_BASE_URL

export type CameraMode = 'overview' | 'follow'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const ESRI_CREDIT = 'Tiles © Esri'

export type Basemap = 'map' | 'terrain' | 'satellite'

const BASEMAPS: Record<Basemap, { layers: { path: string; max: number }[]; credit: string }> = {
  map: {
    layers: [
      { path: 'Canvas/World_Light_Gray_Base', max: 16 },
      { path: 'Canvas/World_Light_Gray_Reference', max: 16 },
    ],
    credit: `${ESRI_CREDIT} — Esri, HERE, Garmin, © OpenStreetMap contributors`,
  },
  terrain: {
    layers: [{ path: 'World_Terrain_Base', max: 9 }],
    credit: `${ESRI_CREDIT} — Source: USGS, Esri, TANA, DeLorme, NPS`,
  },
  satellite: {
    layers: [{ path: 'World_Imagery', max: 17 }],
    credit: `${ESRI_CREDIT} — Esri, Maxar, Earthstar Geographics`,
  },
}

const PAPER = '#f2f1ed'
const INK = '#1d1c1a'

function setBasemap(viewer: Viewer, basemap: Basemap) {
  // Keep layer 0 (offline Natural Earth fallback), replace the rest.
  while (viewer.imageryLayers.length > 1) viewer.imageryLayers.remove(viewer.imageryLayers.get(1), true)
  const spec = BASEMAPS[basemap]
  for (const l of spec.layers) {
    viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: `${ESRI}/${l.path}/MapServer/tile/{z}/{y}/{x}`,
        maximumLevel: l.max,
        credit: spec.credit,
      }),
    )
  }
}

function createViewer(container: HTMLElement, basemap: Basemap): Viewer {
  const viewer = new Viewer(container, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    skyBox: false,
    skyAtmosphere: false,
    // Offline fallback that ships with Cesium; online tiles are layered on top.
    baseLayer: ImageryLayer.fromProviderAsync(
      TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII')),
      {},
    ),
  })
  setBasemap(viewer, basemap)
  const { scene } = viewer
  // A flat, map-like globe on paper rather than a planet in space.
  scene.backgroundColor = Color.fromCssColorString(PAPER)
  scene.globe.baseColor = Color.fromCssColorString('#e6e8e4')
  scene.globe.enableLighting = false
  scene.globe.showGroundAtmosphere = false
  scene.fog.enabled = false
  if (scene.sun) scene.sun.show = false
  if (scene.moon) scene.moon.show = false
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
  return viewer
}

interface Built {
  vehicle: Entity
  sphere: BoundingSphere
  heading: number
}

function buildScene(viewer: Viewer, track: Track, reference: Track | null): Built {
  viewer.entities.removeAll()
  const { samples } = track

  // Pinned earlier result, for comparison.
  if (reference) {
    viewer.entities.add({
      polyline: {
        positions: reference.samples.map((s) => Cartesian3.fromDegrees(s.lon, s.lat, Math.max(s.alt, 0))),
        width: 2,
        material: new PolylineDashMaterialProperty({ color: Color.fromCssColorString(INK).withAlpha(0.35), dashLength: 6 }),
      },
    })
  }

  const positions = samples.map((s) => Cartesian3.fromDegrees(s.lon, s.lat, Math.max(s.alt, 0)))
  const ground = samples.map((s) => Cartesian3.fromDegrees(s.lon, s.lat, 0))

  // Full path, faint and dashed: where the vehicle is going.
  viewer.entities.add({
    polyline: {
      positions,
      width: 1.5,
      material: new PolylineDashMaterialProperty({
        color: Color.fromCssColorString(INK).withAlpha(0.45),
        dashLength: 10,
      }),
    },
  })

  // Ground track on the surface.
  viewer.entities.add({
    polyline: {
      positions: ground,
      width: 1.5,
      clampToGround: true,
      material: Color.fromCssColorString(INK).withAlpha(0.3),
    },
  })

  // Flown path, coloured per stage, revealed up to the playhead.
  for (const span of track.stages) {
    const i0 = indexAt(samples, span.t0)
    const i1 = indexAt(samples, span.t1)
    const segment = positions.slice(i0, i1 + 1)
    let cachedIdx = -1
    let cached: Cartesian3[] = []
    viewer.entities.add({
      polyline: {
        positions: new CallbackProperty(() => {
          const idx = indexAt(samples, playback.get().t)
          if (idx !== cachedIdx) {
            cachedIdx = idx
            cached = idx < i0 ? [] : segment.slice(0, Math.min(idx, i1) - i0 + 1)
          }
          return cached
        }, false),
        width: 3,
        material: Color.fromCssColorString(readStageColor(span.stage)),
      },
    })
  }

  const current = () => {
    const s = sampleAt(track, playback.get().t)
    return { s, pos: Cartesian3.fromDegrees(s.lon, s.lat, Math.max(s.alt, 0)) }
  }

  // Vertical drop line from the vehicle to the ground.
  viewer.entities.add({
    polyline: {
      positions: new CallbackProperty(() => {
        const { s, pos } = current()
        return [pos, Cartesian3.fromDegrees(s.lon, s.lat, 0)]
      }, false),
      width: 1,
      material: new PolylineDashMaterialProperty({ color: Color.fromCssColorString(INK).withAlpha(0.55), dashLength: 6 }),
    },
  })

  const vehicle = viewer.entities.add({
    position: new CallbackPositionProperty(() => current().pos, false),
    point: {
      pixelSize: 11,
      color: Color.fromCssColorString(readStageColor(1)),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })
  vehicle.viewFrom = new ConstantProperty(new Cartesian3(-30000, -60000, 30000)) as unknown as Entity['viewFrom']

  const marker = (s: (typeof samples)[number], text: string) =>
    viewer.entities.add({
      position: Cartesian3.fromDegrees(s.lon, s.lat, 0),
      point: {
        pixelSize: 7,
        color: Color.fromCssColorString(INK),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text,
        font: '500 12px "IBM Plex Sans JP", sans-serif',
        fillColor: Color.fromCssColorString(INK),
        outlineColor: Color.WHITE,
        outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: HorizontalOrigin.LEFT,
        verticalOrigin: VerticalOrigin.CENTER,
        pixelOffset: new Cartesian2(9, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        translucencyByDistance: new NearFarScalar(2e6, 1, 2e7, 0),
      },
    })

  const first = samples[0]
  const last = samples[samples.length - 1]
  marker(first, '発射点')
  if (track.summary.landed) marker(last, '落下点')

  // Look at the arc side-on: heading perpendicular to the launch→end bearing.
  const from = Cartesian3.fromDegrees(first.lon, first.lat)
  const to = Cartesian3.fromDegrees(last.lon, last.lat)
  const bearing = bearingDeg(first.lat, first.lon, last.lat, last.lon)
  const heading = CesiumMath.toRadians(Cartesian3.distance(from, to) < 1000 ? 0 : bearing - 90)

  return { vehicle, sphere: BoundingSphere.fromPoints(positions), heading }
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number) {
  const φ1 = CesiumMath.toRadians(lat1)
  const φ2 = CesiumMath.toRadians(lat2)
  const Δλ = CesiumMath.toRadians(lon2 - lon1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return CesiumMath.toDegrees(Math.atan2(y, x))
}

function frameOverview(viewer: Viewer, built: Built, duration = 1.2) {
  viewer.trackedEntity = undefined
  const radius = Math.max(built.sphere.radius, 20000)
  // Fit the whole trajectory into the narrower field of view, with margin.
  const frustum = viewer.camera.frustum as PerspectiveFrustum
  const aspect = viewer.canvas.clientWidth / Math.max(viewer.canvas.clientHeight, 1)
  const fov = frustum.fov ?? CesiumMath.toRadians(60)
  // Cesium's fov is horizontal on landscape canvases and vertical on portrait ones.
  const fovNarrow = 2 * Math.atan(Math.tan(fov / 2) * (aspect >= 1 ? 1 / aspect : aspect))
  const range = (radius / Math.sin(fovNarrow / 2)) * 1.12
  viewer.camera.flyToBoundingSphere(built.sphere, {
    offset: new HeadingPitchRange(built.heading, CesiumMath.toRadians(-20), range),
    duration,
  })
}

interface GlobeProps {
  track: Track | null
  reference?: Track | null
}

export default function Globe({ track, reference = null }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const builtRef = useRef<Built | null>(null)
  const launchKeyRef = useRef<string>('')
  const [mode, setMode] = useState<CameraMode>('overview')
  const [basemap, setBasemapState] = useState<Basemap>(() => {
    try {
      const v = localStorage.getItem('ot.basemap')
      return v === 'terrain' || v === 'satellite' ? v : 'map'
    } catch {
      return 'map'
    }
  })

  const changeBasemap = (next: Basemap) => {
    setBasemapState(next)
    if (viewerRef.current) setBasemap(viewerRef.current, next)
    try {
      localStorage.setItem('ot.basemap', next)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!containerRef.current) return
    const viewer = createViewer(containerRef.current, basemap)
    viewerRef.current = viewer
    if (import.meta.env.DEV) (window as unknown as { __viewer: Viewer }).__viewer = viewer
    return () => {
      viewer.destroy()
      viewerRef.current = null
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !track) return
    const built = buildScene(viewer, track, reference)
    builtRef.current = built

    // Only move the camera when the flight itself moved somewhere else;
    // tweaking a parameter should not yank the view around.
    const f = track.samples[0]
    const l = track.samples[track.samples.length - 1]
    const key = `${f.lat.toFixed(2)},${f.lon.toFixed(2)},${Math.round(l.downrange / 50)},${Math.round(track.summary.apogee / 50000)}`
    if (key !== launchKeyRef.current) {
      const isFirst = launchKeyRef.current === ''
      launchKeyRef.current = key
      if (mode === 'follow') viewer.trackedEntity = built.vehicle
      else frameOverview(viewer, built, isFirst ? 0 : 1.4)
    } else if (mode === 'follow') {
      viewer.trackedEntity = built.vehicle
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, reference])


  // Re-fit the overview when the map area is resized (layout switch, divider drag).
  const modeRef = useRef(mode)
  modeRef.current = mode
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let timer: number | undefined
    let last = { w: el.clientWidth, h: el.clientHeight }
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (Math.abs(w - last.w) < 24 && Math.abs(h - last.h) < 24) return
      last = { w, h }
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const viewer = viewerRef.current
        const built = builtRef.current
        if (viewer && built && modeRef.current === 'overview') frameOverview(viewer, built, 0.6)
      }, 350)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      window.clearTimeout(timer)
    }
  }, [])

  const changeMode = (next: CameraMode) => {
    setMode(next)
    const viewer = viewerRef.current
    const built = builtRef.current
    if (!viewer || !built) return
    if (next === 'follow') viewer.trackedEntity = built.vehicle
    else frameOverview(viewer, built)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute bottom-7 left-3 flex flex-row items-end gap-1.5 md:bottom-auto md:left-auto md:right-3 md:top-3 md:flex-col">
        <Segmented
          tone="map"
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'overview', label: '全体', title: '軌道全体が見える視点' },
            { value: 'follow', label: '追従', title: '機体を追いかける視点' },
          ]}
        />
        <Segmented
          tone="map"
          size="sm"
          value={basemap}
          onChange={changeBasemap}
          options={[
            { value: 'map', label: '地図' },
            { value: 'terrain', label: '地形' },
            { value: 'satellite', label: '衛星' },
          ]}
        />
      </div>
    </div>
  )
}
