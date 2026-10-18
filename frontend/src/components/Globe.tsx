import type { FlightPresentation } from '../lib/presentation'
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
import { indexAt, sampleAt, type FallSample, type FallTrack, type Track } from '../lib/trajectory'
import { playback } from '../lib/playback'
import { Segmented } from './primitives'
import { cssVar, readStageColor, useTheme, type Theme } from '../lib/theme'
import { tr, useLang } from '../lib/i18n'
import { fallBodyLabel, mcBodyLabel } from '../lib/events'
import {
  bodyStage,
  ellipseAxes,
  ellipseLabel,
  ellipsePoints,
  type CaseResult,
  type EllipseLevel,
  type ImpactStatistics,
} from '../lib/montecarlo'
import { cn } from '../lib/cn'
import { useDismiss } from '../hooks/useDismiss'
import { Layers as LayersIcon } from 'lucide-react'

;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = CESIUM_BASE_URL

export type CameraMode = 'overview' | 'follow'

/** Optional overlays on the globe */
export interface Layers {
  /** Instantaneous impact point: its ground track and the current point */
  iip: boolean
  /** Spent stages and dumping products */
  falls: boolean
  /** Monte Carlo impact scatter and error ellipses */
  dispersion: boolean
}

const DEFAULT_LAYERS: Layers = { iip: true, falls: true, dispersion: true }

/** Monte Carlo result to draw on the globe */
export interface DispersionOverlay {
  presentation?: FlightPresentation
  cases: CaseResult[]
  statistics: ImpactStatistics[]
  /** Stage number of the vehicle's last stage (colours the vehicle's points) */
  lastStage: number
  /** Error ellipse to draw */
  ellipse: EllipseLevel
}

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

/** Scene colours from the current theme's CSS tokens. */
function palette() {
  return {
    paper: Color.fromCssColorString(cssVar('--bg') || '#f2f1ed'),
    ink: Color.fromCssColorString(cssVar('--ink') || '#1d1c1a'),
    halo: Color.fromCssColorString(cssVar('--surface') || '#ffffff'),
  }
}

function setBasemap(viewer: Viewer, basemap: Basemap, theme: Theme) {
  // Keep layer 0 (offline Natural Earth fallback), replace the rest.
  while (viewer.imageryLayers.length > 1) viewer.imageryLayers.remove(viewer.imageryLayers.get(1), true)
  const spec = BASEMAPS[basemap]
  for (const l of spec.layers) {
    // The plain map has a matching dark canvas.
    const path = theme === 'dark' ? l.path.replace('Light_Gray', 'Dark_Gray') : l.path
    viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: `${ESRI}/${path}/MapServer/tile/{z}/{y}/{x}`,
        maximumLevel: l.max,
        credit: spec.credit,
      }),
    )
  }
}

function applySceneTheme(viewer: Viewer, theme: Theme) {
  const { scene } = viewer
  // A flat, map-like globe on paper rather than a planet in space.
  scene.backgroundColor = palette().paper
  scene.globe.baseColor = Color.fromCssColorString(theme === 'dark' ? '#2b2c2a' : '#e6e8e4')
}

function createViewer(container: HTMLElement, basemap: Basemap, theme: Theme): Viewer {
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
    baseLayer: ImageryLayer.fromProviderAsync(TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII')), {}),
  })
  setBasemap(viewer, basemap, theme)
  applySceneTheme(viewer, theme)
  const { scene } = viewer
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

/** Position of a falling body at time t (linear between samples). */
function fallAt(samples: FallSample[], t: number): FallSample | null {
  if (samples.length === 0 || t < samples[0].t || t > samples[samples.length - 1].t) return null
  let i = 0
  while (i < samples.length - 2 && samples[i + 1].t < t) i++
  const a = samples[i]
  const b = samples[Math.min(i + 1, samples.length - 1)]
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0
  if (Math.abs(b.lon - a.lon) > 180) return f < 0.5 ? a : b
  return { t, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, alt: a.alt + (b.alt - a.alt) * f }
}

/** Split a ground path where it crosses the antimeridian or has gaps. */
function splitPath(points: ({ lat: number; lon: number } | null)[]): Cartesian3[][] {
  const out: Cartesian3[][] = []
  let cur: Cartesian3[] = []
  let prev: { lat: number; lon: number } | null = null
  for (const p of points) {
    if (!p || (prev && Math.abs(p.lon - prev.lon) > 180)) {
      if (cur.length > 1) out.push(cur)
      cur = []
    }
    if (p) cur.push(Cartesian3.fromDegrees(p.lon, p.lat, 0))
    prev = p
  }
  if (cur.length > 1) out.push(cur)
  return out
}

function buildScene(viewer: Viewer, track: Track, reference: Track | null, layers: Layers, dispersion: DispersionOverlay | null): Built {
  viewer.entities.removeAll()
  const { samples } = track
  const { ink, halo } = palette()
  const signal = Color.fromCssColorString(cssVar('--signal') || '#e2491b')

  // Pinned earlier result, for comparison.
  if (reference) {
    viewer.entities.add({
      polyline: {
        positions: reference.samples.map((s) => Cartesian3.fromDegrees(s.lon, s.lat, Math.max(s.alt, 0))),
        width: 2,
        material: new PolylineDashMaterialProperty({ color: ink.withAlpha(0.35), dashLength: 6 }),
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
        color: ink.withAlpha(0.45),
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
      material: ink.withAlpha(0.3),
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
      material: new PolylineDashMaterialProperty({ color: ink.withAlpha(0.55), dashLength: 6 }),
    },
  })

  const vehicle = viewer.entities.add({
    position: new CallbackPositionProperty(() => current().pos, false),
    point: {
      pixelSize: 11,
      color: Color.fromCssColorString(readStageColor(1)),
      outlineColor: halo,
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
        color: ink,
        outlineColor: halo,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text,
        font: '500 12px "IBM Plex Sans JP", sans-serif',
        fillColor: ink,
        outlineColor: halo,
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
  marker(first, tr('発射点', 'Launch site'))
  if (track.summary.landed) marker(last, tr('落下点', 'Impact point'))

  // Instantaneous impact point: where the vehicle would land if the engine
  // stopped now (vacuum Kepler arc), along the flight and at the playhead.
  if (layers.iip) {
    for (const part of splitPath(samples.map((s) => (s.iipLat === null || s.iipLon === null ? null : { lat: s.iipLat, lon: s.iipLon })))) {
      viewer.entities.add({
        polyline: {
          positions: part,
          width: 2,
          clampToGround: true,
          material: new PolylineDashMaterialProperty({ color: signal.withAlpha(0.7), dashLength: 8 }),
        },
      })
    }
    viewer.entities.add({
      position: new CallbackPositionProperty(() => {
        const s = sampleAt(track, playback.get().t)
        return s.iipLat === null || s.iipLon === null ? undefined : Cartesian3.fromDegrees(s.iipLon, s.iipLat, 0)
      }, false),
      point: {
        pixelSize: 9,
        color: Color.TRANSPARENT,
        outlineColor: signal,
        outlineWidth: 2.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'IIP',
        font: '600 11px "IBM Plex Sans JP", sans-serif',
        fillColor: signal,
        outlineColor: halo,
        outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: HorizontalOrigin.LEFT,
        verticalOrigin: VerticalOrigin.CENTER,
        pixelOffset: new Cartesian2(9, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  }

  // Spent stages and dumping products: fall path, moving point, impact point.
  if (layers.falls) {
    for (const body of track.fallBodies) addFallBody(viewer, body, halo, ink, track.presentation)
  }

  // Monte Carlo: every case's impact and each body's error ellipse.
  if (layers.dispersion && dispersion) addDispersion(viewer, dispersion, halo, ink)

  // Look at the arc side-on: heading perpendicular to the launch→end bearing.
  const from = Cartesian3.fromDegrees(first.lon, first.lat)
  const to = Cartesian3.fromDegrees(last.lon, last.lat)
  const bearing = bearingDeg(first.lat, first.lon, last.lat, last.lon)
  const heading = CesiumMath.toRadians(Cartesian3.distance(from, to) < 1000 ? 0 : bearing - 90)

  return { vehicle, sphere: BoundingSphere.fromPoints(positions), heading }
}

function addFallBody(viewer: Viewer, body: FallTrack, halo: Color, ink: Color, presentation?: FlightPresentation) {
  const color = Color.fromCssColorString(readStageColor(body.stage))
  const label = fallBodyLabel(body, presentation)
  if (body.samples.length > 1) {
    viewer.entities.add({
      polyline: {
        positions: body.samples.map((s) => Cartesian3.fromDegrees(s.lon, s.lat, Math.max(s.alt, 0))),
        width: 2,
        material: new PolylineDashMaterialProperty({ color: color.withAlpha(0.75), dashLength: 12 }),
      },
    })
    viewer.entities.add({
      position: new CallbackPositionProperty(() => {
        const s = fallAt(body.samples, playback.get().t)
        return s ? Cartesian3.fromDegrees(s.lon, s.lat, Math.max(s.alt, 0)) : undefined
      }, false),
      point: {
        pixelSize: 8,
        color,
        outlineColor: halo,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  }
  if (body.impact) {
    viewer.entities.add({
      position: Cartesian3.fromDegrees(body.impact.lon, body.impact.lat, 0),
      point: {
        pixelSize: 8,
        color,
        outlineColor: halo,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: tr(`${label} 落下点`, `${label} impact`),
        font: '500 11px "IBM Plex Sans JP", sans-serif',
        fillColor: ink,
        outlineColor: halo,
        outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: HorizontalOrigin.LEFT,
        verticalOrigin: VerticalOrigin.CENTER,
        pixelOffset: new Cartesian2(9, 0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        translucencyByDistance: new NearFarScalar(2e6, 1, 2e7, 0),
      },
    })
  }
}

function addDispersion(viewer: Viewer, mc: DispersionOverlay, halo: Color, ink: Color) {
  const colorOf = (body: string) => Color.fromCssColorString(readStageColor(bodyStage(body) ?? mc.lastStage))
  for (const c of mc.cases) {
    for (const i of c.impacts) {
      if (!i.impact) continue
      viewer.entities.add({
        position: Cartesian3.fromDegrees(i.impact.longitude_deg, i.impact.latitude_deg, 0),
        point: { pixelSize: 4, color: colorOf(i.body).withAlpha(0.7), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      })
    }
  }
  for (const s of mc.statistics) {
    if (s.mean_latitude_deg === null || s.mean_longitude_deg === null || s.impacts < 2) continue
    const color = colorOf(s.body)
    const { major, minor } = ellipseAxes(s, mc.ellipse)
    const outline = ellipsePoints(s.mean_latitude_deg, s.mean_longitude_deg, major, minor, s.ellipse_azimuth_deg)
    for (const part of splitPath(outline)) {
      viewer.entities.add({ polyline: { positions: part, width: 2, clampToGround: true, material: color } })
    }
    viewer.entities.add({
      position: Cartesian3.fromDegrees(s.mean_longitude_deg, s.mean_latitude_deg, 0),
      label: {
        text: `${mcBodyLabel(s.body, mc.presentation)} ${ellipseLabel(mc.ellipse)}`,
        font: '500 11px "IBM Plex Sans JP", sans-serif',
        fillColor: ink,
        outlineColor: halo,
        outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.TOP,
        pixelOffset: new Cartesian2(0, 8),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        translucencyByDistance: new NearFarScalar(2e6, 1, 2e7, 0),
      },
    })
  }
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
  // A hidden canvas has no view to fit (Cesium throws on the zero-size frustum).
  if (viewer.canvas.clientWidth === 0 || viewer.canvas.clientHeight === 0) return
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

/** Turn the view so north is up, keeping the point being looked at (or the tracked vehicle) in place. */
function faceNorth(viewer: Viewer) {
  const camera = viewer.camera
  if (viewer.trackedEntity) {
    // Tracking: the camera orbits the vehicle in its local east-north-up frame.
    camera.rotateRight(camera.heading)
    return
  }
  const canvas = viewer.canvas
  const ray = camera.getPickRay(new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2))
  const center = ray && viewer.scene.globe.pick(ray, viewer.scene)
  if (!center) {
    camera.flyTo({ destination: camera.positionWC.clone(), orientation: { heading: 0, pitch: camera.pitch, roll: 0 }, duration: 0.6 })
    return
  }
  const range = Cartesian3.distance(camera.positionWC, center)
  camera.flyToBoundingSphere(new BoundingSphere(center, 0), { offset: new HeadingPitchRange(0, camera.pitch, range), duration: 0.6 })
}

interface GlobeProps {
  track: Track | null
  reference?: Track | null
  dispersion?: DispersionOverlay | null
}

function loadLayers(): Layers {
  try {
    const raw = JSON.parse(localStorage.getItem('ot.layers') ?? 'null') as Partial<Layers> | null
    return { ...DEFAULT_LAYERS, ...raw }
  } catch {
    return DEFAULT_LAYERS
  }
}

export default function Globe({ track, reference = null, dispersion = null }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const builtRef = useRef<Built | null>(null)
  const launchKeyRef = useRef<string>('')
  const [mode, setMode] = useState<CameraMode>('overview')
  // Camera heading [deg] for the compass, updated only when it moves noticeably
  const [heading, setHeading] = useState(0)
  const theme = useTheme()
  const lang = useLang()
  const themeRef = useRef(theme)
  themeRef.current = theme
  const [basemap, setBasemapState] = useState<Basemap>(() => {
    try {
      const v = localStorage.getItem('ot.basemap')
      return v === 'terrain' || v === 'satellite' ? v : 'map'
    } catch {
      return 'map'
    }
  })

  const basemapRef = useRef(basemap)
  basemapRef.current = basemap

  const [layers, setLayers] = useState<Layers>(loadLayers)
  const toggleLayer = (key: keyof Layers) => {
    const next = { ...layers, [key]: !layers[key] }
    setLayers(next)
    try {
      localStorage.setItem('ot.layers', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  const hasFalls = !!track && track.fallBodies.length > 0
  const hasIip = !!track && track.samples.some((s) => s.iipLat !== null)

  const changeBasemap = (next: Basemap) => {
    setBasemapState(next)
    if (viewerRef.current) setBasemap(viewerRef.current, next, themeRef.current)
    try {
      localStorage.setItem('ot.basemap', next)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!containerRef.current) return
    const viewer = createViewer(containerRef.current, basemapRef.current, themeRef.current)
    viewerRef.current = viewer
    let shown = 0
    const removeHeading = viewer.scene.postRender.addEventListener(() => {
      const h = CesiumMath.toDegrees(viewer.camera.heading)
      if (Math.abs(((h - shown + 540) % 360) - 180) > 0.5) {
        shown = h
        setHeading(h)
      }
    })
    if (import.meta.env.DEV) (window as unknown as { __viewer: Viewer }).__viewer = viewer
    return () => {
      removeHeading()
      viewer.destroy()
      viewerRef.current = null
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !track) return
    const built = buildScene(viewer, track, reference, layers, dispersion)
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
  }, [track, reference, theme, lang, layers, dispersion])

  // Restyle the scene when the colour theme changes (track entities are rebuilt above).
  const styledTheme = useRef(theme)
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || styledTheme.current === theme) return
    styledTheme.current = theme
    applySceneTheme(viewer, theme)
    setBasemap(viewer, basemapRef.current, theme)
  }, [theme])

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
      // Hidden (another view is showing on phones/tablets): nothing to frame.
      if (w === 0 || h === 0) return
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

  const [layersOpen, setLayersOpen] = useState(false)
  const layersRef = useRef<HTMLDivElement>(null)
  useDismiss(layersRef, layersOpen, () => setLayersOpen(false))
  const overlays = (
    [
      {
        key: 'iip',
        label: tr('IIP（瞬間落下予測点）', 'IIP (instantaneous impact point)'),
        title: tr(
          '瞬間落下予測点：いまエンジンが止まったら落ちる地点（真空の楕円軌道）',
          'Instantaneous impact point: where the vehicle would land if thrust stopped now (vacuum orbit)',
        ),
        show: hasIip,
      },
      {
        key: 'falls',
        label: tr('落下物', 'Falling bodies'),
        title: tr('使用済みの段と投棄物の落下軌道・落下点', 'Fall paths and impact points of spent stages and jettisoned parts'),
        show: hasFalls,
      },
      {
        key: 'dispersion',
        label: tr('分散解析', 'Dispersion'),
        title: tr('分散解析の落下点と誤差楕円', 'Dispersion run impacts and error ellipses'),
        show: !!dispersion && dispersion.cases.length > 0,
      },
    ] as const
  ).filter((l) => l.show)

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
      <div className="absolute bottom-7 left-3 flex flex-row items-end gap-1.5 md:bottom-auto md:left-auto md:right-3 md:top-3 md:flex-row md:items-start">
        <Segmented
          tone="map"
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'overview', label: tr('全体', 'Overview'), title: tr('軌道全体が見える視点', 'Show the whole trajectory') },
            { value: 'follow', label: tr('追従', 'Follow'), title: tr('機体を追いかける視点', 'Follow the vehicle') },
          ]}
        />
        <button
          type="button"
          onClick={() => viewerRef.current && faceNorth(viewerRef.current)}
          title={tr('北を上にする', 'Face north')}
          aria-label={tr('北を上にする', 'Face north')}
          className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-surface text-ink-2 ring-1 ring-line-strong shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" style={{ transform: `rotate(${-heading}deg)` }} aria-hidden="true">
            <path d="M12 2.5 15.5 12h-7Z" fill="var(--signal)" />
            <path d="M12 21.5 8.5 12h7Z" fill="currentColor" opacity="0.45" />
          </svg>
        </button>
        <div ref={layersRef} className="relative">
          <button
            type="button"
            onClick={() => setLayersOpen((v) => !v)}
            aria-expanded={layersOpen}
            aria-haspopup="dialog"
            title={tr('背景地図と表示する情報', 'Basemap and overlays')}
            className={cn(
              'flex h-8 items-center gap-1 rounded-[7px] px-2 text-[12px] font-medium ring-1 ring-line-strong shadow-[0_1px_2px_rgba(0,0,0,0.06)]',
              layersOpen ? 'bg-ink text-surface' : 'bg-surface text-ink-2 hover:text-ink',
            )}
          >
            <LayersIcon className="h-3.5 w-3.5" />
            {tr('表示', 'Layers')}
          </button>
          {layersOpen && (
            <div
              role="dialog"
              aria-label={tr('背景地図と表示する情報', 'Basemap and overlays')}
              className="absolute bottom-full left-0 z-10 mb-1.5 w-[13rem] rounded-[8px] bg-surface p-2.5 text-[12px] ring-1 ring-line-strong shadow-[0_6px_20px_-8px_rgba(0,0,0,0.3)] md:bottom-auto md:left-auto md:right-0 md:top-full md:mb-0 md:mt-1.5"
            >
              <p className="mb-1 text-[11px] text-ink-3">{tr('背景地図', 'Basemap')}</p>
              <Segmented
                size="sm"
                value={basemap}
                onChange={changeBasemap}
                className="w-full"
                options={[
                  { value: 'map', label: tr('地図', 'Map') },
                  { value: 'terrain', label: tr('地形', 'Terrain') },
                  { value: 'satellite', label: tr('衛星', 'Satellite') },
                ]}
              />
              {overlays.length > 0 && (
                <>
                  <p className="mb-0.5 mt-2.5 text-[11px] text-ink-3">{tr('表示する情報', 'Overlays')}</p>
                  {overlays.map((l) => (
                    <label key={l.key} title={l.title} className="flex min-h-8 cursor-pointer items-center gap-2 text-ink-2 hover:text-ink">
                      <input
                        type="checkbox"
                        checked={layers[l.key]}
                        onChange={() => toggleLayer(l.key)}
                        className="h-3.5 w-3.5 accent-[var(--signal)]"
                      />
                      {l.label}
                    </label>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
