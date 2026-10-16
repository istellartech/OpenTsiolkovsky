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

const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

function createViewer(container: HTMLElement): Viewer {
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
    // Offline fallback that ships with Cesium; satellite imagery is layered on top.
    baseLayer: ImageryLayer.fromProviderAsync(
      TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII')),
      {},
    ),
  })
  viewer.imageryLayers.addImageryProvider(
    new UrlTemplateImageryProvider({
      url: SATELLITE_URL,
      maximumLevel: 17,
      credit: 'Imagery © Esri, Maxar, Earthstar Geographics',
    }),
  )
  viewer.scene.globe.enableLighting = false
  viewer.scene.backgroundColor = Color.BLACK
  // Shown until imagery tiles arrive, so the globe is never an empty void.
  viewer.scene.globe.baseColor = Color.fromCssColorString('#1d2733')
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
  return viewer
}

interface Built {
  vehicle: Entity
  sphere: BoundingSphere
  heading: number
}

function buildScene(viewer: Viewer, track: Track): Built {
  viewer.entities.removeAll()
  const { samples } = track

  const positions = samples.map((s) => Cartesian3.fromDegrees(s.lon, s.lat, Math.max(s.alt, 0)))
  const ground = samples.map((s) => Cartesian3.fromDegrees(s.lon, s.lat, 0))

  // Full path, faint and dashed: where the vehicle is going.
  viewer.entities.add({
    polyline: {
      positions,
      width: 1.5,
      material: new PolylineDashMaterialProperty({
        color: Color.WHITE.withAlpha(0.55),
        dashLength: 12,
      }),
    },
  })

  // Ground track on the surface.
  viewer.entities.add({
    polyline: {
      positions: ground,
      width: 1.5,
      clampToGround: true,
      material: Color.WHITE.withAlpha(0.35),
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
      material: new PolylineDashMaterialProperty({ color: Color.WHITE.withAlpha(0.7), dashLength: 6 }),
    },
  })

  const vehicle = viewer.entities.add({
    position: new CallbackPositionProperty(() => current().pos, false),
    point: {
      pixelSize: 11,
      color: Color.fromCssColorString('#ff4f00'),
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
        pixelSize: 6,
        color: Color.WHITE,
        outlineColor: Color.BLACK.withAlpha(0.6),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text,
        font: '500 12px "IBM Plex Sans JP", sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK.withAlpha(0.8),
        outlineWidth: 3,
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
  const fovNarrow = aspect >= 1 ? 2 * Math.atan(Math.tan(fov / 2) / aspect) : fov
  const range = (radius / Math.sin(fovNarrow / 2)) * 1.12
  viewer.camera.flyToBoundingSphere(built.sphere, {
    offset: new HeadingPitchRange(built.heading, CesiumMath.toRadians(-20), range),
    duration,
  })
}

interface GlobeProps {
  track: Track | null
}

export default function Globe({ track }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const builtRef = useRef<Built | null>(null)
  const launchKeyRef = useRef<string>('')
  const [mode, setMode] = useState<CameraMode>('overview')

  useEffect(() => {
    if (!containerRef.current) return
    const viewer = createViewer(containerRef.current)
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
    const built = buildScene(viewer, track)
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
  }, [track])

  const changeMode = (next: CameraMode) => {
    setMode(next)
    const viewer = viewerRef.current
    const built = builtRef.current
    if (!viewer || !built) return
    if (next === 'follow') viewer.trackedEntity = built.vehicle
    else frameOverview(viewer, built)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute right-3 top-3">
        <Segmented
          tone="dark"
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'overview', label: '全体' },
            { value: 'follow', label: '追従' },
          ]}
        />
      </div>
    </div>
  )
}
