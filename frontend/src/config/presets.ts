// Sample vehicles built from published figures. Each preset lists its
// sources and the simplifications made, which the overview tab shows.
import type { ClientConfig } from '../lib/simulation'
import { tr } from '../lib/i18n'
import { siteById } from './sites'
import { CA_SLENDER, exitAreaFromDiameter, exitAreaFromThrust, parallelPhase, stage, vehicle } from './build'

export interface PresetSource {
  label: string
  url: string
}

export type PresetCategory = 'sounding' | 'orbital'

export type PresetCountry = 'jp' | 'us' | 'eu' | 'ru' | 'cn'

export interface PresetOption {
  id: string
  label: string
  /** What kind of vehicle / flight this is */
  kind: string
  category: PresetCategory
  country: PresetCountry
  /** Other names the picker's search matches (native spellings, designations) */
  aliases?: string[]
  site: string
  description: string
  /** Simplifications and estimates made when modelling */
  modelNotes: string[]
  sources: PresetSource[]
  create: () => ClientConfig
}

export const PRESET_CATEGORIES: { id: PresetCategory; label: string }[] = [
  {
    id: 'sounding',
    get label() {
      return tr('観測ロケット（弾道飛行）', 'Sounding rockets (suborbital)')
    },
  },
  {
    id: 'orbital',
    get label() {
      return tr('人工衛星打上げロケット', 'Orbital launch vehicles')
    },
  },
]

export const PRESET_COUNTRIES: { id: PresetCountry; label: string }[] = [
  {
    id: 'jp',
    get label() {
      return tr('日本', 'Japan')
    },
  },
  {
    id: 'us',
    get label() {
      return tr('米国', 'USA')
    },
  },
  {
    id: 'eu',
    get label() {
      return tr('欧州', 'Europe')
    },
  },
  {
    id: 'ru',
    get label() {
      return tr('ロシア', 'Russia')
    },
  },
  {
    id: 'cn',
    get label() {
      return tr('中国', 'China')
    },
  },
]

/* ------------------------------------------------------------ Launch sites */

const SITES = {
  ksc39a: siteById('ksc-39a'),
  ela3: siteById('csg-ela3'),
  uchinouraKS: siteById('uchinoura-ks'),
  taiki: siteById('taiki'),
  uchinouraMV: siteById('uchinoura-m'),
  yoshinobu: siteById('tanegashima'),
  slc40: siteById('ccsfs-40'),
  baikonur31: siteById('baikonur-31'),
  xichang: siteById('xichang-lc2'),
}

/* ---------------------------------------------------------- Sounding rockets */

// Calibrated total-impulse factors: thrust is scaled so that the simulated
// apogee matches the published flight record (see the notes on each preset).
export const CAL = {
  s310: 1.2508, // apogee 180 km
  s520: 0.9288, // apogee 304 km
  momoIsp: 207.14, // apogee 113.4 km
  ss520Stage1: 1.3682, // 2.0 km/s at 26 km at stage-1 burnout
  saturnIsp1: 319.06, // S-IC vacuum Isp; tuned to the S-IC cutoff / S-II cutoff / parking orbit
  ariane5Cutoff: 978, // full ESC-A burn
  falcon9S2Cutoff: 356.47, // stage 2 burn to SECO-1 at full thrust
  // [t, azimuth, elevation]: south-southeast off the Florida coast (stage 1
  // IIP offshore), gravity turn, dogleg south by stage 2 (PACE 676.5 km, 98°)
  falcon9Attitude: [
    [0, 152, 90],
    [10, 152, 90],
    [20, 152, 88.11],
    [24, 154.38, 87.8],
    [28, 155, 87.08],
    [32, 155.46, 86.29],
    [36, 155.84, 85.45],
    [40, 156.15, 84.57],
    [44, 156.43, 83.66],
    [48, 156.66, 82.75],
    [52, 156.88, 81.82],
    [56, 157.07, 80.89],
    [60, 157.24, 79.97],
    [64, 157.4, 79.07],
    [68, 157.55, 78.18],
    [72, 157.7, 77.32],
    [76, 157.83, 76.48],
    [80, 157.95, 75.67],
    [84, 158.08, 74.89],
    [88, 158.19, 74.13],
    [92, 158.3, 73.42],
    [96, 158.41, 72.73],
    [100, 158.51, 72.07],
    [104, 158.61, 71.45],
    [108, 158.71, 70.85],
    [112, 158.81, 70.29],
    [116, 158.9, 69.76],
    [120, 159, 69.26],
    [124, 159.09, 68.78],
    [128, 159.18, 68.34],
    [132, 159.27, 67.93],
    [200, 183, 55.59],
    [250, 189.31, 49.89],
    [300, 196.57, 39.98],
    [400, 198.2, 0.98],
    [460, 193.37, -14.13],
    [520, 197.26, -25.1],
    [5520, 197.26, -25.1],
  ] as [number, number, number][],
  lm3bCutoff: 1095.11, // stage 3 time from first ignition to guidance cutoff
  // Fin-stabilised: the axis follows the velocity from the launcher (weathercocking)
  s310Attitude: [
    [0, 135, 76],
    [2, 135.04, 72.73],
    [4, 135.08, 71.25],
    [6, 135.12, 70.29],
    [8, 135.15, 69.56],
    [10, 135.19, 68.97],
    [12, 135.23, 68.46],
    [14, 135.26, 68.02],
    [16, 135.3, 67.62],
    [18, 135.34, 67.26],
    [20, 135.37, 66.94],
    [22, 135.41, 66.65],
    [24, 135.45, 66.39],
    [26, 135.48, 66.15],
    [28, 135.52, 65.91],
    [5028, 135.52, 65.91],
  ] as [number, number, number][],
  s520Attitude: [
    [0, 135, 79],
    [2, 135.04, 75.7],
    [4, 135.09, 74.17],
    [6, 135.13, 73.19],
    [8, 135.17, 72.45],
    [10, 135.22, 71.86],
    [12, 135.26, 71.37],
    [14, 135.3, 70.95],
    [16, 135.34, 70.59],
    [18, 135.38, 70.27],
    [20, 135.42, 70],
    [22, 135.46, 69.76],
    [24, 135.5, 69.54],
    [26, 135.54, 69.36],
    [28, 135.58, 69.2],
    [30, 135.62, 69.03],
    [5030, 135.62, 69.03],
  ] as [number, number, number][],
  // Guided, slow off the pad: near-vertical, pitching over gently (small α at max-Q)
  momoAttitude: [
    [0, 112.5, 89.66],
    [20, 112.5, 89.51],
    [40, 112.5, 89.19],
    [60, 112.5, 87.69],
    [80, 112.5, 85.8],
    [116, 112.5, 84.87],
    [5116, 112.5, 84.87],
  ] as [number, number, number][],
  ss520Attitude: [
    [0, 91.4, 70.3],
    [2, 91.41, 65.56],
    [4, 91.42, 63.4],
    [6, 91.43, 62],
    [8, 91.44, 60.92],
    [10, 91.45, 60.04],
    [12, 91.47, 59.27],
    [14, 91.48, 58.6],
    [16, 91.5, 57.99],
    [18, 91.51, 57.43],
    [20, 91.53, 56.92],
    [22, 91.54, 56.45],
    [24, 91.56, 56.02],
    [26, 91.58, 55.61],
    [28, 91.6, 55.23],
    [30, 91.62, 54.87],
    [32, 91.64, 54.51],
    [34, 91.66, 54.15],
    [36, 91.68, 53.8],
    [38, 91.7, 53.44],
    [40, 91.72, 53.08],
    [42, 91.74, 52.7],
    [44, 91.76, 52.33],
    [46, 91.78, 51.94],
    [48, 91.8, 51.55],
    [50, 91.82, 51.15],
    [52, 91.84, 50.74],
    [54, 91.86, 50.32],
    [56, 91.88, 49.9],
    [58, 91.9, 49.47],
    [60, 91.92, 49.03],
    [70.5, 91.4, 49.03],
    [117.6, 91.4, 46.27],
    [236, 91.4, 46.27],
    [238, 91.4, -7.71],
    [5238, 91.4, -7.71],
  ] as [number, number, number][],
  h2aCutoff: 438.43, // stage 2 time from ignition to guidance cutoff
  h3Cutoff: 549.39,
  // Attitude tables [t, azimuth, elevation]: vertical rise, pitch kick, zero-angle-of-attack
  // gravity turn through the atmosphere, then a pitch (and yaw) program tuned to the orbit
  epsilonAttitude: [
    [0, 94.2, 90],
    [8, 94.2, 90],
    [18, 94.2, 80.75],
    [22, 94.27, 80.75],
    [26, 94.3, 78.58],
    [30, 94.32, 76.37],
    [34, 94.35, 74.19],
    [38, 94.38, 72.06],
    [42, 94.4, 69.99],
    [46, 94.43, 68],
    [50, 94.45, 66.09],
    [54, 94.48, 64.28],
    [58, 94.51, 62.58],
    [62, 94.54, 60.97],
    [66, 94.57, 59.48],
    [70, 94.6, 58.09],
    [74, 94.63, 56.8],
    [78, 94.66, 55.61],
    [82, 94.69, 54.51],
    [86, 94.73, 53.5],
    [90, 94.77, 52.57],
    [94, 94.81, 51.72],
    [98, 94.85, 50.95],
    [102, 94.9, 50.24],
    [106, 94.94, 49.6],
    [110, 94.99, 49.02],
    [161, 94.2, 48.69],
    [266, 94.2, 34.02],
    [620, 94.2, -4.12],
    [720, 94.2, -10.77],
    [5720, 94.2, -10.77],
  ] as [number, number, number][],
  h2aAttitude: [
    [0, 189.52, 90],
    [8, 189.52, 90],
    [20, 189.52, 89.76],
    [24, 198.21, 89.31],
    [28, 199.64, 88.75],
    [32, 200.55, 87.97],
    [36, 201.16, 86.96],
    [40, 201.59, 85.72],
    [44, 201.91, 84.25],
    [48, 202.16, 82.58],
    [52, 202.36, 80.74],
    [56, 202.53, 78.76],
    [60, 202.68, 76.66],
    [64, 202.8, 74.49],
    [68, 202.91, 72.27],
    [72, 203.01, 70.02],
    [76, 203.09, 67.78],
    [80, 203.17, 65.56],
    [84, 203.25, 63.39],
    [88, 203.32, 61.27],
    [92, 203.38, 59.23],
    [96, 203.44, 57.26],
    [100, 203.49, 55.39],
    [104, 203.55, 53.6],
    [108, 203.6, 51.91],
    [112, 203.64, 50.3],
    [116, 203.69, 48.79],
    [120, 203.73, 47.36],
    [124, 203.77, 46.02],
    [200, 189.52, 51.43],
    [300, 189.52, 48.83],
    [400, 189.52, 38.9],
    [550, 189.52, 5.76],
    [700, 189.52, -3.85],
    [5700, 189.52, -3.85],
  ] as [number, number, number][],
  h3Attitude: [
    [0, 190.43, 90],
    [8, 190.43, 90],
    [20, 190.43, 89.08],
    [24, 193.63, 88.17],
    [28, 194.29, 87.16],
    [32, 194.75, 85.92],
    [36, 195.09, 84.46],
    [40, 195.35, 82.81],
    [44, 195.56, 80.98],
    [48, 195.73, 79.01],
    [52, 195.87, 76.93],
    [56, 196, 74.77],
    [60, 196.11, 72.56],
    [64, 196.21, 70.32],
    [68, 196.3, 68.08],
    [72, 196.38, 65.86],
    [76, 196.45, 63.67],
    [80, 196.52, 61.53],
    [84, 196.59, 59.46],
    [88, 196.65, 57.47],
    [92, 196.71, 55.56],
    [96, 196.76, 53.73],
    [100, 196.81, 51.99],
    [104, 196.86, 50.35],
    [108, 196.9, 48.79],
    [112, 196.95, 47.31],
    [116, 196.99, 45.92],
    [200, 190.43, 38.71],
    [303, 190.43, 24.38],
    [450, 190.43, 12.58],
    [650, 190.43, 0.36],
    [850, 190.43, -3.92],
    [5850, 190.43, -3.92],
  ] as [number, number, number][],
  saturnAttitude: [
    [0, 75.12, 90],
    [12, 75.12, 90],
    [25, 75.12, 88.49],
    [29, 74.52, 87.12],
    [33, 74.41, 85.59],
    [37, 74.35, 83.71],
    [41, 74.31, 81.5],
    [45, 74.28, 79],
    [49, 74.26, 76.26],
    [53, 74.25, 73.35],
    [57, 74.24, 70.32],
    [61, 74.24, 67.24],
    [65, 74.24, 64.16],
    [69, 74.24, 61.11],
    [73, 74.25, 58.13],
    [77, 74.25, 55.26],
    [81, 74.26, 52.5],
    [85, 74.28, 49.88],
    [89, 74.29, 47.4],
    [93, 74.31, 45.06],
    [97, 74.32, 42.88],
    [101, 74.34, 40.83],
    [105, 74.37, 38.92],
    [109, 74.39, 37.14],
    [113, 74.42, 35.48],
    [117, 74.44, 33.94],
    [121, 74.47, 32.51],
    [125, 74.51, 31.19],
    [129, 74.54, 29.96],
    [133, 74.58, 28.82],
    [137, 74.62, 27.73],
    [141, 74.66, 26.72],
    [145, 74.71, 25.79],
    [149, 74.75, 24.91],
    [153, 74.8, 24.08],
    [157, 74.86, 23.31],
    [200, 75.12, 26.75],
    [300, 75.12, 22.83],
    [450, 75.12, 16.06],
    [550, 75.12, 12.2],
    [700, 75.12, -2.24],
    [5700, 75.12, -2.24],
  ] as [number, number, number][],
  ariane5Attitude: [
    [0, 90, 90],
    [8, 90, 90],
    [18, 90, 89.45],
    [22, 89.98, 88.77],
    [26, 89.98, 87.88],
    [30, 89.99, 86.68],
    [34, 89.99, 85.19],
    [38, 89.99, 83.41],
    [42, 89.99, 81.38],
    [46, 90, 79.15],
    [50, 90, 76.76],
    [54, 90, 74.26],
    [58, 90.01, 71.7],
    [62, 90.01, 69.12],
    [66, 90.01, 66.56],
    [70, 90.02, 64.03],
    [74, 90.02, 61.58],
    [78, 90.02, 59.21],
    [82, 90.03, 56.95],
    [86, 90.03, 54.79],
    [90, 90.04, 52.76],
    [94, 90.04, 50.84],
    [98, 90.05, 49.04],
    [102, 90.05, 47.35],
    [106, 90.06, 45.78],
    [110, 90.06, 44.32],
    [114, 90.07, 42.96],
    [118, 90.07, 41.7],
    [122, 90.08, 40.53],
    [126, 90.09, 39.45],
    [130, 90.09, 38.45],
    [134, 90.1, 37.54],
    [300, 90, 12.11],
    [520, 90, 6.75],
    [1000, 90, -0.57],
    [1500, 90, -3.57],
    [6500, 90, -3.57],
  ] as [number, number, number][],
  soyuzAttitude: [
    [0, 65.39, 90],
    [8, 65.39, 90],
    [18, 65.39, 84.45],
    [22, 65.2, 82.27],
    [26, 65.16, 79.3],
    [30, 65.14, 76.02],
    [34, 65.13, 72.56],
    [38, 65.13, 69.01],
    [42, 65.14, 65.45],
    [46, 65.15, 61.94],
    [50, 65.16, 58.53],
    [54, 65.17, 55.27],
    [58, 65.19, 52.16],
    [62, 65.22, 49.24],
    [66, 65.24, 46.49],
    [70, 65.27, 43.94],
    [74, 65.3, 41.56],
    [78, 65.34, 39.36],
    [82, 65.38, 37.32],
    [86, 65.42, 35.44],
    [90, 65.46, 33.7],
    [94, 65.51, 32.1],
    [98, 65.57, 30.62],
    [102, 65.63, 29.26],
    [106, 65.69, 28.01],
    [110, 65.76, 26.86],
    [114, 65.83, 25.8],
    [160, 65.39, 30.93],
    [200, 65.39, 30.48],
    [287, 65.39, 19.29],
    [400, 65.39, 10.77],
    [530, 65.39, -3.53],
    [5530, 65.39, -3.53],
  ] as [number, number, number][],
  lm3bAttitude: [
    [0, 97.5, 90],
    [10, 97.5, 90],
    [20, 97.5, 84.48],
    [24, 97.63, 82.96],
    [28, 97.67, 80.41],
    [32, 97.71, 77.56],
    [36, 97.74, 74.51],
    [40, 97.77, 71.33],
    [44, 97.8, 68.09],
    [48, 97.82, 64.83],
    [52, 97.85, 61.6],
    [56, 97.88, 58.45],
    [60, 97.9, 55.39],
    [64, 97.93, 52.46],
    [68, 97.96, 49.67],
    [72, 97.98, 47.02],
    [76, 98.01, 44.53],
    [80, 98.04, 42.19],
    [84, 98.07, 40],
    [88, 98.1, 37.95],
    [92, 98.13, 36.04],
    [96, 98.17, 34.27],
    [100, 98.2, 32.62],
    [104, 98.24, 31.09],
    [108, 98.28, 29.67],
    [112, 98.32, 28.36],
    [116, 98.36, 27.14],
    [120, 98.41, 26.02],
    [124, 98.46, 24.98],
    [128, 98.51, 24.03],
    [132, 98.56, 23.15],
    [136, 98.62, 22.35],
    [140, 98.68, 21.62],
    [159, 97.5, 26.19],
    [250, 97.5, 9.74],
    [345, 97.5, 2.6],
    [500, 97.5, 1.73],
    [630, 97.5, 0.83],
    [1276, 120.28, -1.92],
    [1470, 122.49, 6.31],
    [6470, 122.49, 6.31],
  ] as [number, number, number][],
}

function s310(): ClientConfig {
  // S-310-40 flight record: elevation 76°, apogee 180 km, 727 kg, burnout ~28 s.
  const isp = 250 // assumed
  const burn = 28
  const propellant = 380 * CAL.s310
  return vehicle({
    name: tr('S-310（40号機の飛行実績）', 'S-310 (Flight 40 record)'),
    site: SITES.uchinouraKS,
    date: [2020, 1, 15, 3, 0, 0],
    stages: [
      stage({
        mass: 727,
        propellant,
        isp,
        burn,
        exitArea: exitAreaFromDiameter(0.27),
        // "Early high thrust, later low thrust" (ISAS); shape is illustrative
        shape: [
          [0, 1.6],
          [0.25, 1.2],
          [0.5, 0.9],
          [0.95, 0.6],
          [1, 0],
        ],
        freeMode: 0,
      }),
    ],
    diameter: 0.31,
    ca: CA_SLENDER,
    attitude: CAL.s310Attitude,
    duration: 600,
    step: 0.5,
  })
}

function s520(): ClientConfig {
  // S-520-33 flight record: elevation 79°, apogee 304 km, 2273 kg; burnout 31 s.
  const isp = 265 // assumed (unverified public figure)
  const burn = 31
  const propellant = 1700 * CAL.s520
  return vehicle({
    name: tr('S-520（33号機の飛行実績）', 'S-520 (Flight 33 record)'),
    site: SITES.uchinouraKS,
    date: [2020, 1, 15, 3, 0, 0],
    stages: [
      stage({
        mass: 2273,
        propellant,
        isp,
        burn,
        // Expansion ratio 8 (ISAS); exit diameter estimated
        exitArea: exitAreaFromDiameter(0.42),
        shape: [
          [0, 1.3],
          [0.3, 1.1],
          [0.9, 0.85],
          [1, 0],
        ],
        freeMode: 0,
      }),
    ],
    diameter: 0.52,
    ca: CA_SLENDER,
    attitude: CAL.s520Attitude,
    duration: 800,
    step: 0.5,
  })
}

function ss520_5(): ClientConfig {
  // SS-520-5 / TRICOM-1R, 2018-02-03. Event times (MEXT): 1st burnout 31.7 s,
  // 1/2 sep 68 s, 2nd 180–204.4 s, 2/3 sep 235 s, 3rd 238–263.6 s.
  // Thrust curves and Isp from OpenTsiolkovsky's bundled SS-520-4 example.
  const payload = 3
  const sep1 = 68
  const sep2 = 235
  return vehicle({
    name: 'SS-520-5（TRICOM-1R）',
    site: SITES.uchinouraKS,
    date: [2018, 2, 3, 5, 3, 0],
    stages: [
      stage({
        // Total 2.6 t (JAXA); stages 2 and 3 from the example, stage 1 the rest
        mass: 2600 - 510 - (86 + payload),
        // Example thrust curve scaled so burnout matches MEXT (2.0 km/s at
        // 26 km, 31.7 s); Isp assumed as for S-520. The curve is already a
        // ground-level thrust, so no extra back-pressure loss is applied.
        propellant: (2860500 * CAL.ss520Stage1) / (265 * 9.80665),
        isp: 265,
        burn: 31.8,
        separation: sep1,
        // Negligible: the solver needs a positive nozzle, the curve already
        // includes back-pressure.
        exitArea: 1e-4,
        shape: [
          [0, 160],
          [10 / 31.8, 100],
          [30 / 31.8, 50],
          [31.7 / 31.8, 20],
          [1, 0],
        ],
        freeMode: 1,
      }),
      stage({
        mass: 510,
        propellant: 841575 / (264.8 * 9.80665),
        isp: 264.8,
        ignition: 180 - sep1,
        burn: 24.5,
        separation: sep2 - sep1,
        exitArea: exitAreaFromDiameter(0.1) * 10,
        shape: [
          [0, 45500],
          [23.7 / 24.5, 24500],
          [1, 0],
        ],
        freeMode: 1,
      }),
      stage({
        // 78 kg propellant (JAXA SS-520-4 briefing, as reported); the example
        // thrust curve is scaled to that impulse at the example Isp.
        mass: 86 + payload,
        propellant: 78,
        isp: 264.8,
        ignition: 238 - sep2,
        burn: 25.7,
        exitArea: exitAreaFromDiameter(0.05) * 10,
        shape: [
          [0, 13000],
          [25.6 / 25.7, 2000],
          [1, 0],
        ],
        freeMode: 1,
      }),
    ],
    diameter: 0.52,
    ca: CA_SLENDER,
    attitude: CAL.ss520Attitude,
    duration: 3000,
    step: 1,
  })
}

function momo(): ClientConfig {
  // MOMO F3, 2019-05-04: 1150 kg, 12 kN, burn 116 s, apogee 113.4 km at 240 s,
  // splashdown 37 km ESE of the pad, 515 s flight.
  // Thrust is held at the published 12 kN at sea level; Isp and the attitude
  // program are calibrated to the published apogee and splashdown range.
  const exitArea = exitAreaFromDiameter(0.2) // estimated
  const fVac = 12000 + exitArea * 101325
  const isp = CAL.momoIsp
  const burn = 116
  return vehicle({
    name: tr('MOMO（3号機の飛行実績）', 'MOMO (Flight 3 record)'),
    site: SITES.taiki,
    date: [2019, 5, 3, 20, 45, 0],
    stages: [
      stage({
        mass: 1150,
        propellant: (fVac * burn) / (isp * 9.80665),
        isp,
        burn,
        exitArea,
        freeMode: 0,
      }),
    ],
    diameter: 0.5,
    ca: CA_SLENDER,
    attitude: CAL.momoAttitude,
    duration: 700,
    step: 0.5,
  })
}

/* ---------------------------------------------------------------- Saturn V */

function saturnV(): ClientConfig {
  // Apollo 11 (AS-506), 1969-07-16, from the Saturn V flight evaluation report
  // (MPR-SAT-FE-69-9). Times are from liftoff (holddown release, range 0.3 s).
  const t0 = 0.3
  const liftoff = 2899008 // vehicle at holddown release
  const atSII = 479706 + 174365 // S-II at ignition + everything above it
  const atSIVB = 166571 // vehicle at S-IVB ignition

  // S-IC: centre engine cutoff 135.20, outboard cutoff 161.63, separation 162.3
  const sicBurn = 161.63 - t0
  const ceco = (135.2 - t0) / sicBurn
  const sicShape: [number, number][] = [
    [0, 1],
    [ceco, 1],
    [ceco + 0.0005, 0.8],
    [1, 0.8],
  ]
  const sicProp = 2278688 - 39307 - 168015 // ignition→OECO minus hold-down burn
  // Exit area from the published sea-level thrust (sum of five F-1, 33,596 kN)
  const shapeArea = ceco + (1 - ceco) * 0.8
  const fVac0 = (sicProp * CAL.saturnIsp1 * 9.80665) / sicBurn / shapeArea
  const sicExit = Math.max(fVac0 - 33596e3, 0) / 101325

  // S-II: start 163.0, OECO 548.22 (385.2 s), CECO 460.6, separation 549.0
  const sep1 = 162.3 - t0
  const siiBurn = 548.22 - 163.0
  const siiCeco = (460.6 - 163.0) / siiBurn
  const sep2 = 549.0 - t0 - sep1

  return vehicle({
    name: tr('サターンV（アポロ11号）', 'Saturn V (Apollo 11)'),
    site: SITES.ksc39a,
    date: [1969, 7, 16, 13, 32, 0],
    stages: [
      stage({
        mass: liftoff - atSII,
        propellant: sicProp,
        isp: CAL.saturnIsp1,
        burn: sicBurn,
        separation: sep1,
        exitArea: sicExit,
        shape: sicShape,
        freeMode: 1,
      }),
      stage({
        mass: atSII - atSIVB,
        propellant: 479706 - 43564,
        isp: 423.2,
        ignition: 163.0 - t0 - sep1,
        burn: siiBurn,
        separation: sep2,
        exitArea: 5 * exitAreaFromDiameter(1.96),
        // 5,141.5 kN, then 4,093.1 kN after centre engine cutoff (report §6.3)
        shape: [
          [0, 5141.5],
          [siiCeco, 5141.5],
          [siiCeco + 0.0005, 4093.1],
          [1, 4093.1],
        ],
        freeMode: 1,
      }),
      stage({
        mass: atSIVB,
        propellant: 118939 - 87550,
        isp: 428.7,
        ignition: 552.2 - t0 - sep1 - sep2,
        burn: 699.34 - 552.2,
        exitArea: exitAreaFromDiameter(1.96),
        freeMode: 1,
      }),
    ],
    diameter: 10.06,
    ca: CA_SLENDER,
    // Rolled to a 72.058° flight azimuth; pitch program tuned to the report
    attitude: CAL.saturnAttitude,
    duration: 1500,
    step: 1,
  })
}

/* ------------------------------------------------------------------ Kourou */

function ariane5(): ClientConfig {
  // VA247 (HS-4/SGS-1 + GSAT-31), 2019-02-05. Times after liftoff (H0+7.3 s):
  // EAP separation 136.7, EPC end of thrust 513.7, separation 519.7,
  // ESC-A ignition 523.7, extinction 1501.7.
  const jettison = 136.7
  const eapBurn = 130
  // EPC: 174 t (kit) burned from H0+1 to H0+521; 6.3 s of it before liftoff
  const epcFlow = 174000 / 520
  const epcAtLiftoff = 174000 - epcFlow * 6.3
  const { phase, coreUsed } = parallelPhase({
    booster: { mass: 2 * 277000, propellant: 2 * 240000, isp: 274.5, burn: eapBurn, exitArea: 2 * exitAreaFromDiameter(3.0) },
    // Exit area from Vulcain 2's published vacuum / sea-level thrust (1390 / 960 kN)
    core: { propellant: epcAtLiftoff, isp: 432, burn: 513.7, exitArea: exitAreaFromThrust(1390e3, 960e3) },
    jettison,
  })
  const payload = 10052 // both satellites with carrying structures (kit)
  return vehicle({
    name: tr('アリアン5 ECA（VA247）', 'Ariane 5 ECA (VA247)'),
    site: SITES.ela3,
    date: [2019, 2, 5, 21, 1, 0],
    stages: [
      stage({ ...phase, freeMode: 1 }),
      stage({
        // EPC 188 t (kit) less what burned before EAP separation, + fairing 2.4 t
        mass: 188000 - (174000 - epcAtLiftoff) - coreUsed + 2400,
        propellant: epcAtLiftoff - coreUsed,
        isp: 432,
        burn: 513.7 - jettison,
        separation: 519.7 - jettison,
        exitArea: exitAreaFromThrust(1390e3, 960e3),
        freeMode: 1,
      }),
      stage({
        // ESC-A 19 t + vehicle equipment bay 0.97 t + payload
        mass: 19000 + 970 + payload,
        propellant: 14900,
        isp: 446,
        ignition: 523.7 - 519.7,
        burn: 1501.7 - 523.7,
        cutoff: CAL.ariane5Cutoff,
        exitArea: exitAreaFromDiameter(1.0),
        freeMode: 1,
      }),
    ],
    diameter: 5.4,
    ca: CA_SLENDER,
    attitude: CAL.ariane5Attitude,
    duration: 2400,
    step: 2,
  })
}

/* ----------------------------------------------------------------- Epsilon */

function epsilon(): ClientConfig {
  // Epsilon test flight / SPRINT-A (Hisaki), 2013-09-14.
  // Event times from the flight results (planned values), converted to
  // stage-local times: 1/2 sep 161, 2nd ign 165, 2/3 sep 624, 3rd ign 628.
  const payload = 348
  return vehicle({
    name: tr('Epsilon（試験機 / ひさき）', 'Epsilon (test flight / Hisaki)'),
    site: SITES.uchinouraMV,
    date: [2013, 9, 14, 5, 0, 0],
    stages: [
      stage({
        // SRB-A 75.0 t (+0.8 t fairing carried until stage separation)
        mass: 75000 + 800,
        propellant: 66300,
        isp: 284,
        burn: 112.6,
        separation: 161,
        exitArea: exitAreaFromDiameter(1.6),
        freeMode: 1,
      }),
      stage({
        mass: 12300,
        propellant: 10800,
        isp: 300,
        ignition: 4,
        burn: 101.3,
        separation: 463,
        exitArea: exitAreaFromDiameter(1.1),
        freeMode: 1,
      }),
      stage({
        // KM-V2b + PBS (3.3 t in the optional configuration) + satellite
        mass: 3300 + payload,
        propellant: 2500,
        isp: 301,
        ignition: 4,
        burn: 88.7,
        exitArea: exitAreaFromDiameter(0.8),
        freeMode: 1,
      }),
    ],
    diameter: 2.6,
    ca: CA_SLENDER,
    attitude: CAL.epsilonAttitude,
    duration: 2400,
    step: 2,
  })
}

/* ------------------------------------------------------------------- H-IIA */

function h2a202(): ClientConfig {
  // H-IIA F50 / GOSAT-GW, 2025-06-29. SRB-A separation 124 s, MECO 400 s,
  // 1/2 separation 408 s, SELI 417 s, SECO 916 s (actual values).
  const meco = 400
  const jettison = 124
  const sep = 408
  const { phase, coreUsed } = parallelPhase({
    // Two SRB-A (H2A202 type): 77 t / 65 t each, Isp 283 s, ~100 s burn
    booster: { mass: 2 * 77000, propellant: 2 * 65000, isp: 283, burn: 100, exitArea: 2 * exitAreaFromDiameter(1.6) },
    // LE-7A core: 114 t, 100 t usable propellant, Isp 440 s, burns until MECO
    core: { propellant: 100000, isp: 440, burn: meco, exitArea: exitAreaFromDiameter(1.8) },
    jettison,
  })
  const payload = 2600
  // LE-5B: 137 kN, Isp 448 s; SELI→SECO 499 s burns 137 kN × 499 s / (448 s · g0)
  const s2burn = 916 - 417
  const s2prop = (137000 * s2burn) / (448 * 9.80665)
  return vehicle({
    name: tr('H-IIA 202（50号機 / いぶきGW）', 'H-IIA 202 (F50 / IBUKI GW)'),
    site: SITES.yoshinobu,
    date: [2025, 6, 28, 16, 33, 3],
    stages: [
      stage({ ...phase, freeMode: 1 }),
      stage({
        mass: 114000 - coreUsed,
        propellant: 100000 - coreUsed,
        isp: 440,
        burn: meco - jettison,
        separation: sep - jettison,
        exitArea: exitAreaFromDiameter(1.8),
        freeMode: 1,
      }),
      stage({
        mass: 20000 + payload,
        propellant: s2prop,
        isp: 448,
        ignition: 417 - sep,
        burn: s2burn,
        // The real flight doglegs to reach 98° from Tanegashima, which this
        // direct trajectory does not; stage 2 is cut off on reaching orbit.
        cutoff: CAL.h2aCutoff,
        exitArea: exitAreaFromDiameter(1.6),
        freeMode: 1,
      }),
    ],
    diameter: 4.0,
    ca: CA_SLENDER,
    attitude: CAL.h2aAttitude,
    duration: 2400,
    step: 2,
  })
}

/* ---------------------------------------------------------------------- H3 */

function h3_22s(): ClientConfig {
  // H3 test flight 1 (H3-22S / ALOS-3) planned sequence: SRB-3 separation
  // 116 s, MECO 296 s, 1/2 separation 303 s, SELI 315 s, SECO 982 s.
  const meco = 296
  const jettison = 116
  const sep = 303
  // 2× LE-9: 2942 kN vac, Isp 425 s → propellant burned until MECO
  const coreProp = (2942000 * meco) / (425 * 9.80665)
  const { phase, coreUsed } = parallelPhase({
    // Two SRB-3: 152.4 t / 134.4 t total, ~110 s burn; Isp assumed 283 s
    booster: { mass: 152400, propellant: 134400, isp: 283, burn: 110, exitArea: 2 * exitAreaFromDiameter(1.6) },
    core: { propellant: coreProp, isp: 425, burn: meco, exitArea: 2 * exitAreaFromDiameter(1.8) },
    jettison,
  })
  const payload = 3000
  const s2burn = 982 - 315
  const s2prop = (137000 * s2burn) / (448 * 9.80665)
  return vehicle({
    name: tr('H3-22S（試験機1号機の計画値）', 'H3-22S (Test Flight 1, planned)'),
    site: SITES.yoshinobu,
    date: [2023, 3, 7, 1, 37, 55],
    stages: [
      stage({ ...phase, freeMode: 1 }),
      stage({
        // Core 240 t + fairing ~1.8 t carried until stage separation
        mass: 240000 + 1800 - coreUsed,
        propellant: coreProp - coreUsed,
        isp: 425,
        burn: meco - jettison,
        separation: sep - jettison,
        exitArea: 2 * exitAreaFromDiameter(1.8),
        freeMode: 1,
      }),
      stage({
        mass: 28000 + payload,
        propellant: s2prop,
        isp: 448,
        ignition: 315 - sep,
        burn: s2burn,
        // Cut off on reaching orbit (see the H-IIA note on the dogleg).
        cutoff: CAL.h3Cutoff,
        exitArea: exitAreaFromDiameter(1.6),
        freeMode: 1,
      }),
    ],
    diameter: 5.2,
    ca: CA_SLENDER,
    attitude: CAL.h3Attitude,
    duration: 2400,
    step: 2,
  })
}

/* ---------------------------------------------------------------- Falcon 9 */

function falcon9(): ClientConfig {
  // NASA PACE, 2024-02-08 from SLC-40, booster returned to LZ-1. Timeline
  // (SpaceX / NASA, approximate): MECO 2:19, stage separation 2:23, SES-1
  // 2:30, fairing deploy 4:15, SECO-1 10:20.
  const meco = 139
  const sep = 143
  // 9× Merlin 1D: 8,227 kN vacuum / 7,607 kN sea level (SpaceX), Isp 311 s
  // vacuum. Burning all 410.9 t at full thrust would take ~152 s; the rest is
  // kept for the boostback, entry and landing burns.
  const s1prop = 410900
  const s1burn = (s1prop * 311 * 9.80665) / 8227e3
  const ses1 = 150
  const s2prop = 107500
  const payload = 1700
  const fairing = 2000
  const s2 = stage({
    // Stage 2 111.5 t + fairing + PACE
    mass: 111500 + fairing + payload,
    propellant: s2prop,
    isp: 348,
    ignition: ses1 - sep,
    // MVac at full thrust (981 kN), shut down on reaching orbit
    burn: (s2prop * 348 * 9.80665) / 981e3,
    cutoff: CAL.falcon9S2Cutoff,
    exitArea: exitAreaFromDiameter(3.3),
    freeMode: 1,
  })
  return vehicle({
    name: tr('ファルコン9（PACE）', 'Falcon 9 (PACE)'),
    site: SITES.slc40,
    date: [2024, 2, 8, 6, 33, 32],
    stages: [
      stage({
        mass: 433100,
        propellant: s1prop,
        isp: 311,
        burn: s1burn,
        cutoff: meco,
        separation: sep,
        exitArea: exitAreaFromThrust(8227e3, 7607e3),
        freeMode: 1,
      }),
      {
        ...s2,
        dumping_product: {
          separation_time_s: 255 - sep,
          mass_kg: fairing,
          ballistic_coefficient: 50,
          additional_velocity_ned_mps: [0, 0, 0],
        },
      },
    ],
    diameter: 3.66,
    ca: CA_SLENDER,
    attitude: CAL.falcon9Attitude,
    duration: 2400,
    step: 2,
  })
}

/* ------------------------------------------------------------------- Soyuz */

function soyuz21a(): ClientConfig {
  // Progress MS-30, 2025-02-27 from Baikonur Site 31. Telemetry times after
  // liftoff: booster separation 117.85, core separation 287.42, third-stage
  // cutoff 525.45, spacecraft separation 528.75 s.
  const jettison = 117.85
  const coreSep = 287.42
  // RD-107A / RD-108A: vacuum / sea-level thrust 1021.3 / 838.5 kN and
  // 990.2 / 792.5 kN, both at Isp 319 s vacuum (Soyuz user's manual)
  const boosterExit = exitAreaFromThrust(1021.3e3, 838.5e3)
  const coreExit = exitAreaFromThrust(990.2e3, 792.5e3)
  const { phase, coreUsed } = parallelPhase({
    booster: { mass: 4 * 44413, propellant: 4 * 39160, isp: 319, burn: 118, exitArea: 4 * boosterExit },
    core: { propellant: 90100, isp: 319, burn: coreSep, exitArea: coreExit },
    jettison,
  })
  // Block I (RD-0110): 297.9 kN, Isp 325 s, burning from core separation to cutoff
  const s3burn = 525.45 - coreSep
  const s3prop = (297900 * s3burn) / (325 * 9.80665)
  const payload = 7280
  return vehicle({
    name: tr('ソユーズ2.1a（プログレスMS-30）', 'Soyuz-2.1a (Progress MS-30)'),
    site: SITES.baikonur31,
    date: [2025, 2, 27, 21, 24, 27],
    stages: [
      stage({ ...phase, freeMode: 1 }),
      {
        ...stage({
          // Block A 99.8 t + fairing 1.7 t, released at its jettison (183.08 s)
          mass: 99765 + 1700 - coreUsed,
          propellant: 90100 - coreUsed,
          isp: 319,
          burn: coreSep - jettison,
          separation: coreSep - jettison,
          exitArea: coreExit,
          freeMode: 1,
        }),
        dumping_product: {
          separation_time_s: 183.08 - jettison,
          mass_kg: 1700,
          ballistic_coefficient: 50,
          additional_velocity_ned_mps: [0, 0, 0],
        },
      },
      stage({
        mass: 25300 + payload,
        propellant: s3prop,
        isp: 325,
        burn: s3burn,
        exitArea: 4 * exitAreaFromDiameter(0.5),
        freeMode: 1,
      }),
    ],
    diameter: 2.95,
    ca: CA_SLENDER,
    attitude: CAL.soyuzAttitude,
    duration: 2400,
    step: 2,
  })
}

/* ------------------------------------------------------------- Long March */

function longMarch3b(): ClientConfig {
  // LM-3B/E standard GTO mission (LM-3A Series User's Manual, Table 3-7).
  // Times after liftoff: booster cutoff 140.1 / separation 141.6, stage 1
  // cutoff 157.5 / separation 159.0, stage 2 main cutoff 339.4, vernier cutoff
  // 344.4, stage 3 burns 345.4–628.6 and 1276.1–1470.5 s.
  const g0 = 9.80665
  // First-stage engines: the manual gives ground thrust and Isp only. Vacuum
  // Isp assumed 289 s (YF-20 family); vacuum thrust follows from the flow.
  const ispVac = 289
  const boosterFlow = 740.4e3 / 2556.2
  const coreFlow = 2961.6e3 / 2556.5
  const boosterExit = exitAreaFromThrust(boosterFlow * ispVac * g0, 740.4e3)
  const coreExit = exitAreaFromThrust(coreFlow * ispVac * g0, 2961.6e3)
  const jettison = 141.6
  const sep1 = 159.0
  const { phase, coreUsed } = parallelPhase({
    booster: { mass: 4 * 44300, propellant: 4 * 41100, isp: ispVac, burn: 140.1, exitArea: 4 * boosterExit },
    core: { propellant: 186200, isp: ispVac, burn: 157.5, exitArea: coreExit },
    jettison,
  })
  // Stage 2: YF-24E main chamber 742 kN (2922.57 N·s/kg) + verniers 47.1 kN
  // (2910.5 N·s/kg); the verniers run 5 s longer.
  const mainBurn = 339.4 - sep1
  const s2burn = 344.4 - sep1
  const mainFlow = 742e3 / 2922.57
  const vernFlow = 47.1e3 / 2910.5
  const s2prop = (mainFlow + vernFlow) * mainBurn + vernFlow * (s2burn - mainBurn)
  const s2isp = (742e3 * mainBurn + 47.1e3 * s2burn) / (s2prop * g0)
  // Stage 3: 2×YF-75, Isp 4295 N·s/kg, 18.2 t burned over two burns with a coast
  const s3ign = 345.4
  const span = 1470.5 - s3ign
  const b1 = (628.6 - s3ign) / span
  const b2 = (1276.1 - s3ign) / span
  const payload = 5500
  return vehicle({
    name: tr('長征3B/E（標準GTOミッション）', 'Long March 3B/E (standard GTO mission)'),
    site: SITES.xichang,
    date: [2024, 3, 1, 16, 0, 0],
    stages: [
      stage({ ...phase, freeMode: 1 }),
      stage({
        mass: 198800 - coreUsed,
        propellant: 186200 - coreUsed,
        isp: ispVac,
        burn: 157.5 - jettison,
        separation: sep1 - jettison,
        exitArea: coreExit,
        freeMode: 1,
      }),
      stage({
        // Stage 2 53.5 t + 4.0 m fairing 1.5 t carried until stage separation
        mass: 53453 + 1500,
        propellant: s2prop,
        isp: s2isp,
        burn: s2burn,
        separation: s3ign - sep1,
        exitArea: exitAreaFromDiameter(1.5),
        shape: [
          [0, 789.1],
          [mainBurn / s2burn, 789.1],
          [mainBurn / s2burn + 0.0005, 47.1],
          [1, 47.1],
        ],
        freeMode: 1,
      }),
      stage({
        mass: 20933 + payload,
        propellant: 18200,
        isp: 4295 / g0,
        burn: span,
        cutoff: CAL.lm3bCutoff,
        exitArea: 2 * exitAreaFromDiameter(0.8),
        // First burn, coast (no thrust), second burn
        shape: [
          [0, 1],
          [b1, 1],
          [b1 + 0.0005, 0],
          [b2 - 0.0005, 0],
          [b2, 1],
          [1, 1],
        ],
        freeMode: 1,
      }),
    ],
    diameter: 3.35,
    ca: CA_SLENDER,
    attitude: CAL.lm3bAttitude,
    duration: 2400,
    step: 2,
  })
}

/* ---------------------------------------------------------------- Registry */

/** A source whose label is shown in the current language. */
const src = (ja: string, en: string, url: string): PresetSource => ({
  get label() {
    return tr(ja, en)
  },
  url,
})

const ISAS_HANDBOOK = src(
  'JAXA/ISAS 観測ロケット ユーザーハンドブック（3章 機体概要、付録B 飛行実績）',
  'JAXA/ISAS Sounding Rocket User Handbook (Ch. 3 Vehicle Overview, App. B Flight Record)',
  'https://www.isas.jaxa.jp/home/kansoku/images/pdf/RSL-2018012H_%E8%A6%B3%E6%B8%AC%E3%83%AD%E3%82%B1%E3%83%83%E3%83%88_%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%BC%E3%83%8F%E3%83%B3%E3%83%89%E3%83%96%E3%83%83%E3%82%AF(%E5%85%AC%E9%96%8B%E7%94%A8).pdf',
)
const ISAS_S310 = src(
  'JAXA/ISAS S-310 主要諸元',
  'JAXA/ISAS S-310 Specifications',
  'https://www.isas.jaxa.jp/home/kansoku/rocket/s310.html',
)
const ISAS_S520 = src(
  'JAXA/ISAS S-520 主要諸元',
  'JAXA/ISAS S-520 Specifications',
  'https://www.isas.jaxa.jp/home/kansoku/rocket/s520.html',
)
const JAXA_SROCKETS = src(
  'JAXA 観測ロケット（諸元一覧）',
  'JAXA Sounding Rockets (specifications)',
  'https://global.jaxa.jp/projects/rockets/s_rockets/index.html',
)
const MEXT_SS520_5 = src(
  '文部科学省 SS-520 5号機のミッション概要（飛行シーケンス・目標軌道）',
  'MEXT, SS-520-5 Mission Overview (flight sequence, target orbit)',
  'https://www.mext.go.jp/b_menu/shingi/gijyutu/gijyutu2/060/shiryo/__icsFiles/afieldfile/2017/10/12/1396928_13.pdf',
)
const JAXA_SS520_5 = src(
  'JAXA SS-520 5号機 説明資料（全備質量・衛星）',
  'JAXA, SS-520-5 Briefing Material (gross mass, satellite)',
  'https://www.isas.jaxa.jp/topics/files/20180202_ss-520-5.pdf',
)
const OT_SS520_4 = src(
  'OpenTsiolkovsky 同梱 SS-520-4 設定例（推力履歴・比推力）',
  'OpenTsiolkovsky bundled SS-520-4 example (thrust curve, Isp)',
  'https://github.com/istellartech/OpenTsiolkovsky/tree/master/examples/SS-520-4',
)
const IST_MOMO_F3 = src(
  'インターステラテクノロジズ MOMO3号機（主要諸元）',
  'Interstellar Technologies, MOMO F3 (specifications)',
  'https://www.istellartech.com/technology/momo_f3/',
)
const IST_MOMO_F3_PR = src(
  'インターステラテクノロジズ プレスリリース 2019-05-05（到達高度・飛行時間）',
  'Interstellar Technologies press release, 2019-05-05 (apogee, flight time)',
  'https://www.istellartech.com/7hbym/wp-content/uploads/2019/05/IST-PressRelease_2019050501.pdf',
)

const soundingNotes = () => [
  tr(
    '推力・比推力・推進薬量は公開されていないため、比推力を仮定し、全備質量・燃焼時間・発射上下角を飛行実績に合わせたうえで、最高到達高度が実績と一致するよう総力積を調整しています。',
    'Thrust, Isp and propellant mass are not published, so Isp is assumed, gross mass, burn time and launch elevation are set to the flight record, and total impulse is tuned so the apogee matches the record.',
  ),
  tr('打上げ方位角は公開値が見当たらないため仮定値です。', 'The launch azimuth is assumed, as no published value was found.'),
  tr(
    'ランチャを離れた後は尾翼による風見安定で機軸が速度方向に沿うものとし、姿勢テーブルは迎角がゼロになるよう作っています。',
    'After leaving the launcher the fins keep the axis along the velocity (weathercock stability); the attitude table is built for zero angle of attack.',
  ),
]

const NASA_AS506 = {
  label: 'NASA MSFC Saturn V Launch Vehicle Flight Evaluation Report AS-506 Apollo 11 Mission (MPR-SAT-FE-69-9)',
  url: 'https://ibiblio.org/apollo/Documents/lvfea-AS506-Apollo11.pdf',
}
const A5_UM = src(
  "Arianespace Ariane 5 User's Manual Issue 5 Rev 2（Fig. 1-7 主要諸元）",
  "Arianespace Ariane 5 User's Manual Issue 5 Rev 2 (Fig. 1-7, main characteristics)",
  'https://courses.edx.org/asset-v1:DelftX%2BAEASM1x%2B1T2022%2Btype%40asset%2Bblock/Ariane5_Users-Manual_October2016_Red.pdf',
)
const A5_VA247 = src(
  'Arianespace VA247 Launch Kit（機体構成・飛行シーケンス・目標軌道）',
  'Arianespace VA247 Launch Kit (vehicle configuration, flight sequence, target orbit)',
  'https://www.arianespace.com/wp-content/uploads/2019/01/VA247-launchkit-EN.pdf',
)
const JAXA_EPSILON_PRESSKIT = src(
  'JAXA イプシロンロケット試験機 プレスキット（主要諸元）',
  'JAXA, Epsilon Launch Vehicle Test Flight Press Kit (specifications)',
  'https://fanfun.jaxa.jp/countdown/epsilon/files/presskit_epsilon_j.pdf',
)
const JAXA_EPSILON_RESULT = src(
  'JAXA イプシロンロケット試験機の打上げ結果（飛行シーケンス・軌道）',
  'JAXA, Epsilon Test Flight Launch Results (flight sequence, orbit)',
  'https://www.jaxa.jp/press/2013/12/20131224_epsilon_j.pdf',
)
const JAXA_HISAKI = src(
  'JAXA 惑星分光観測衛星「ひさき」パンフレット（衛星質量）',
  'JAXA, Spectroscopic Planet Observatory "Hisaki" brochure (satellite mass)',
  'https://www.jaxa.jp/projects/pr/brochure/pdf/04/sat35.pdf',
)
const MHI_H2A_MANUAL = src(
  '三菱重工 H-IIA ユーザーズマニュアル Ver.4.0（Table 1.3-1）',
  "Mitsubishi Heavy Industries, H-IIA User's Manual Ver. 4.0 (Table 1.3-1)",
  'https://www.mhi.com/jp/products/pdf/manual.pdf',
)
const JAXA_H2A_LEAFLET = src(
  'JAXA H-IIAロケット リーフレット（主要諸元）',
  'JAXA, H-IIA Launch Vehicle leaflet (specifications)',
  'https://www.jaxa.jp/projects/pr/model/files/p_h2a_2025.pdf',
)
const MEXT_H2A_F50 = src(
  '文部科学省 宇宙開発利用部会 資料 H-IIA 50号機 打上げ結果（飛行シーケンス）',
  'MEXT Space Development and Utilization Committee, H-IIA F50 Launch Results (flight sequence)',
  'https://www.mext.go.jp/content/20250703-mxt_uchukai01-000043486_000002.pdf',
)
const MELCO_GOSATGW = src(
  '三菱電機 GOSAT-GW（衛星質量）',
  'Mitsubishi Electric, GOSAT-GW (satellite mass)',
  'https://www.mitsubishielectric.co.jp/society/space/satellite/observation/gosat_gw.html',
)
const MEXT_H3_TF1 = src(
  '文部科学省 H3試験機1号機 調査報告（主要諸元・計画シーケンス）',
  'MEXT, H3 Test Flight No. 1 Investigation Report (specifications, planned sequence)',
  'https://www.mext.go.jp/content/20231026-mxt_uchukai01-000030341_3.pdf',
)
const JAXA_H3_LEAFLET = src(
  'JAXA H3ロケット リーフレット',
  'JAXA, H3 Launch Vehicle leaflet',
  'https://www.jaxa.jp/projects/pr/model/files/p_h3_2025.pdf',
)

const SPACEX_F9 = src(
  'SpaceX Falcon 9（推力・全備質量）',
  'SpaceX, Falcon 9 (thrust, liftoff mass)',
  'https://www.spacex.com/vehicles/falcon-9/',
)
const SPACEX_UG = src(
  "SpaceX Falcon User's Guide（2025年5月版）",
  "SpaceX Falcon User's Guide (May 2025)",
  'https://www.spacex.com/assets/media/falcon-users-guide-2025-05-09.pdf',
)
const SPACEX_PACE = src(
  'SpaceX PACE ミッションページ（タイムライン、打上げ前の版）',
  'SpaceX PACE mission page (timeline, pre-launch version)',
  'https://web.archive.org/web/20240205020817/https://content.spacex.com/api/spacex-website/missions/pace',
)
const NASA_PACE_TIMELINE = src(
  'NASA PACE ブログ: 打上げの主要イベント',
  'NASA PACE blog: key milestones for launch',
  'https://science.nasa.gov/blogs/pace/2024/02/08/key-milestones-for-launch-of-tonights-pace-mission-from-florida',
)
const NASA_PACE_SC = src(
  'NASA PACE ブログ: 衛星と観測機器（衛星質量）',
  'NASA PACE blog: spacecraft and instruments (spacecraft mass)',
  'https://science.nasa.gov/blogs/pace/2024/02/08/meet-nasas-pace-spacecraft-science-instruments/',
)
const NASA_PACE_ORBIT = src(
  'NASA PACE ミッション（目標軌道）',
  'NASA PACE mission (target orbit)',
  'https://pace.oceansciences.org/gallery_more.htm?id=2084',
)
const SFN_SAOCOM1B = src(
  'Spaceflight Now: フロリダから数十年ぶりの極軌道打上げ（SAOCOM 1B、南向きコリドーの経路）',
  'Spaceflight Now: first polar launch from Florida in decades (SAOCOM 1B, the southbound corridor path)',
  'https://spaceflightnow.com/2020/08/31/spacex-launches-first-polar-orbit-mission-from-florida-in-decades/',
)
const WP_F9B5 = src(
  'Wikipedia: Falcon 9 Block 5（各段の質量の推定値）',
  'Wikipedia: Falcon 9 Block 5 (stage mass estimates)',
  'https://en.wikipedia.org/wiki/Falcon_9_Block_5',
)

const SOYUZ_UM_CSG = src(
  "Arianespace Soyuz at the Guiana Space Centre User's Manual Issue 2 Rev 0（1.5章 機体諸元）",
  "Arianespace Soyuz at the Guiana Space Centre User's Manual Issue 2 Rev 0 (Sec. 1.5, vehicle data)",
  'https://courses.edx.org/asset-v1:DelftX+AEASM1x+1T2023+type@asset+block/Soyuz-Users-Manual-March-2012.pdf',
)
const SOYUZ_UM_STARSEM = src(
  "Starsem Soyuz User's Manual Issue 3（Table 1-3、RD-0110 第3段）",
  "Starsem Soyuz User's Manual Issue 3 (Table 1-3, RD-0110 third stage)",
  'https://www.starsem.com/services/images/soyuz_users_manual_190401.pdf',
)
const RSW_PROGRESS_MS30 = src(
  'RussianSpaceWeb: Progress MS-30（飛行シーケンス・投入軌道）',
  'RussianSpaceWeb: Progress MS-30 (flight sequence, insertion orbit)',
  'https://russianspaceweb.com/progress-ms-30.html',
)
const WP_PROGRESS_MS30 = src(
  'Wikipedia: Progress MS-30（打上げ日時・宇宙船質量）',
  'Wikipedia: Progress MS-30 (launch time, spacecraft mass)',
  'https://en.wikipedia.org/wiki/Progress_MS-30',
)

const CALT_LM3A_UM = src(
  "CALT／中国長城工業 LM-3A Series Launch Vehicle User's Manual Issue 2011（2章 諸元、3章 標準GTO・飛行シーケンス）",
  "CALT / CGWIC LM-3A Series Launch Vehicle User's Manual Issue 2011 (Ch. 2 specifications, Ch. 3 standard GTO and flight sequence)",
  'https://web.archive.org/web/20161220124025/http://www.cgwic.com/LaunchServices/Download/manual/LM-3A%20Series%20Launch%20Vehicles%20User%27s%20Manual%20Issue%202011.pdf',
)
const CGWIC_LM3B = src('中国長城工業 LM-3B（主要諸元）', 'CGWIC, LM-3B (specifications)', 'https://cgwic.com/Launchservice/LM3B.html')
const SF_LM3BE = src(
  'Spaceflight101: Long March 3B/E（各段の質量・フェアリング質量）',
  'Spaceflight101: Long March 3B/E (stage masses, fairing mass)',
  'https://web.archive.org/web/20151012065826/http://spaceflight101.com/spacerockets/long-march-3be/',
)

const orbitalNotes = () => [
  tr(
    'ノズル出口面積（地上での推力低下に効く）は公開値が見当たらないため推定値です。',
    'Nozzle exit areas (which set the thrust loss at low altitude) are estimated, as no published values were found.',
  ),
  tr(
    '姿勢は時刻テーブルです。垂直上昇のあと小さくピッチオーバーし、濃い大気の中では迎角ゼロの重力ターン（機軸を対気速度の向きに合わせた値をテーブル化）、大気圏外では目標軌道に合うよう調整した簡易プログラムに従います。実機の誘導則ではありません。',
    'Attitude is a time table: a vertical rise and a small pitch-over, then a zero-angle-of-attack gravity turn through the dense atmosphere (the axis set along the air-relative velocity, tabulated), then a simple program tuned to the target orbit above it. It is not the actual guidance law.',
  ),
]

export const PRESET_OPTIONS: PresetOption[] = [
  {
    id: 'momo',
    label: 'MOMO',
    get kind() {
      return tr('単段 液体 観測ロケット', 'Single-stage liquid sounding rocket')
    },
    category: 'sounding',
    country: 'jp',
    aliases: ['モモ'],
    get site() {
      return tr('北海道 大樹町', 'Taiki, Hokkaido')
    },
    get description() {
      return tr(
        'インターステラテクノロジズの観測ロケット。民間単独開発として国内初の宇宙空間到達を果たした3号機（2019年、最高到達高度 113.4 km）の実績で構成。',
        "Interstellar Technologies' sounding rocket. Built from the record of Flight 3 (2019, apogee 113.4 km), the first privately developed Japanese rocket to reach space.",
      )
    },
    get modelNotes() {
      return [
        tr(
          '公表推力 12 kN（地上推力として扱う）・燃焼時間 116 s・全備質量 1,150 kg を固定し、最高到達高度 113.4 km と着水点までの距離 37 km に合うよう比推力（207.1 s）と姿勢を調整しています。推進薬は約 870 kg になります。',
          'The published thrust of 12 kN (treated as sea-level thrust), 116 s burn time and 1,150 kg gross mass are fixed; Isp (207.1 s) and the attitude are tuned to the 113.4 km apogee and 37 km splashdown range. This gives about 870 kg of propellant.',
        ),
        tr(
          '計算上の最高到達時刻は T+244 s（公表 T+240 s）、着水点までの距離は 37.0 km（公表 37 km）。計算上の飛行時間は 407 s で公表の 515 s より短く、降下中の空気抵抗の違いによるものと考えられます。',
          'Simulated apogee is at T+244 s (published T+240 s) and splashdown range is 37.0 km (published 37 km). The simulated flight time of 407 s is shorter than the published 515 s, likely due to differences in drag during descent.',
        ),
        tr(
          '推力重量比が約1.06と小さく離床直後は速度が遅いため、ほぼ垂直（89.7°）で発射し、燃焼終了（84.9°）まで少しずつ傾ける姿勢プログラムとして、最大動圧付近の迎角を 2° 以下に抑えています。',
          'With a thrust-to-weight ratio of only about 1.06 the vehicle is slow off the pad, so it launches nearly vertically (89.7°) and pitches over gradually to 84.9° at burnout, keeping the angle of attack below 2° around max-Q.',
        ),
        tr(
          'ノズル出口径と発射地点の座標は推定・概略です。',
          'The nozzle exit diameter is estimated and the launch coordinates are approximate.',
        ),
      ]
    },
    sources: [IST_MOMO_F3, IST_MOMO_F3_PR],
    create: momo,
  },
  {
    id: 's310',
    label: 'S-310',
    get kind() {
      return tr('単段 固体 観測ロケット', 'Single-stage solid sounding rocket')
    },
    category: 'sounding',
    country: 'jp',
    aliases: ['S310'],
    get site() {
      return tr('鹿児島 内之浦', 'Uchinoura, Kagoshima')
    },
    get description() {
      return tr(
        'JAXAの小型観測ロケット（直径31 cm）。40号機の実績（上下角76°、全備727 kg、最高到達高度 約180 km）で構成。',
        "JAXA's small sounding rocket (31 cm diameter). Built from the record of Flight 40 (elevation 76°, gross mass 727 kg, apogee about 180 km).",
      )
    },
    get modelNotes() {
      return [
        ...soundingNotes(),
        tr(
          '推力の時間変化は「前半大推力・後半小推力」という公開情報に沿った形で、数値は例示です。',
          'The thrust curve follows the published description (high thrust early, low thrust later); the values are illustrative.',
        ),
        tr(
          '比推力 250 s を仮定し、推進薬は約 475 kg に調整。計算上の飛行時間は 412 s（ハンドブックの着水 約400 s）です。',
          'Isp is assumed to be 250 s and propellant is tuned to about 475 kg. The simulated flight time is 412 s (handbook splashdown about 400 s).',
        ),
      ]
    },
    sources: [ISAS_HANDBOOK, ISAS_S310, JAXA_SROCKETS],
    create: s310,
  },
  {
    id: 's520',
    label: 'S-520',
    get kind() {
      return tr('単段 固体 観測ロケット', 'Single-stage solid sounding rocket')
    },
    category: 'sounding',
    country: 'jp',
    aliases: ['S520'],
    get site() {
      return tr('鹿児島 内之浦', 'Uchinoura, Kagoshima')
    },
    get description() {
      return tr(
        'JAXAの主力観測ロケット（直径52 cm）。33号機の実績（上下角79°、全備2,273 kg、最高到達高度 約304 km）で構成。',
        "JAXA's mainstay sounding rocket (52 cm diameter). Built from the record of Flight 33 (elevation 79°, gross mass 2,273 kg, apogee about 304 km).",
      )
    },
    get modelNotes() {
      return [
        ...soundingNotes(),
        tr('ノズル膨張比 8 は公開値、出口径は推定です。', 'The nozzle expansion ratio of 8 is published; the exit diameter is estimated.'),
        tr(
          '比推力 265 s を仮定し、推進薬は約 1,580 kg に調整。計算上の飛行時間は 542 s（ハンドブックの着水 約550 s）です。',
          'Isp is assumed to be 265 s and propellant is tuned to about 1,580 kg. The simulated flight time is 542 s (handbook splashdown about 550 s).',
        ),
      ]
    },
    sources: [ISAS_HANDBOOK, ISAS_S520, JAXA_SROCKETS],
    create: s520,
  },
  {
    id: 'ss520-5',
    label: 'SS-520-5',
    get kind() {
      return tr('3段 固体 超小型衛星打上げ', 'Three-stage solid nanosatellite launcher')
    },
    category: 'orbital',
    country: 'jp',
    aliases: ['SS520', 'TRICOM-1R'],
    get site() {
      return tr('鹿児島 内之浦', 'Uchinoura, Kagoshima')
    },
    get description() {
      return tr(
        '2018年に約3 kgの超小型衛星 TRICOM-1R を軌道に投入した、世界最小級の衛星打上げロケット。公表された飛行シーケンス（1段燃焼 0–31.7 s、2段 180–204.4 s、3段 238–263.6 s）で構成。',
        'One of the smallest orbital launchers ever, which placed the ~3 kg nanosatellite TRICOM-1R in orbit in 2018. Built from the published flight sequence (stage 1 burn 0–31.7 s, stage 2 180–204.4 s, stage 3 238–263.6 s).',
      )
    },
    get modelNotes() {
      return [
        tr(
          '推力履歴の形と2・3段の質量・比推力は OpenTsiolkovsky 同梱の SS-520-4 設定例の値です。',
          "Thrust curve shapes and the stage 2 and 3 masses and Isp are taken from OpenTsiolkovsky's bundled SS-520-4 example.",
        ),
        tr(
          '1段は比推力を S-520 と同じ 265 s と仮定し、燃焼終了時（31.7 s）の高度 26 km・速度 2.0 km/s に合うよう総力積を調整しています。1段の質量は全備 2.6 t に合うよう設定しています。',
          'Stage 1 Isp is assumed to be 265 s, as for the S-520, and total impulse is tuned to 26 km altitude and 2.0 km/s at burnout (31.7 s). Stage 1 mass is set so the gross mass is 2.6 t.',
        ),
        tr('3段の推進薬量は 78 kg（JAXA 説明会の報道値）です。', 'Stage 3 propellant is 78 kg (as reported from a JAXA briefing).'),
        tr(
          '発射上下角と1段分離後の姿勢変更（ラムライン制御）は公開値がないため、目標軌道（近地点 180 km × 遠地点 1,500 km、傾斜角 31°）に合うよう調整した簡易な姿勢プログラムで表しています。発射上下角は 70.3° となり、1段の燃焼とその後の惰性飛行では機軸が速度方向に沿う（尾翼による安定）としています。',
          'Launch elevation and the attitude change after stage 1 separation (rhumb-line manoeuvre) are not published, so a simple attitude program tuned to the target orbit (perigee 180 km × apogee 1,500 km, inclination 31°) is used. Launch elevation comes out at 70.3°; through stage 1 and the coast that follows, the axis stays along the velocity (fin-stabilised).',
        ),
        tr(
          '計算上の3段燃焼終了速度は 8.13 km/s（公表値 8.1 km/s）、衛星分離時刻（450 s）の高度は 247 km（公表値 205 km）です。',
          'Simulated stage 3 burnout velocity is 8.13 km/s (published 8.1 km/s); altitude at satellite separation (450 s) is 247 km (published 205 km).',
        ),
      ]
    },
    sources: [MEXT_SS520_5, JAXA_SS520_5, OT_SS520_4],
    create: ss520_5,
  },
  {
    id: 'epsilon',
    get label() {
      return tr('イプシロン', 'Epsilon')
    },
    get kind() {
      return tr('3段式 固体ロケット', 'Three-stage solid launch vehicle')
    },
    category: 'orbital',
    country: 'jp',
    aliases: ['Epsilon', 'イプシロン'],
    get site() {
      return tr('鹿児島 内之浦', 'Uchinoura, Kagoshima')
    },
    get description() {
      return tr(
        '試験機（2013年、惑星分光観測衛星「ひさき」）の主要諸元と飛行シーケンスで構成。近地点 約950 km・遠地点 約1,150 km の軌道を狙った飛行。',
        'Built from the specifications and flight sequence of the test flight (2013, Spectroscopic Planet Observatory "Hisaki"), targeting an orbit of about 950 km perigee × 1,150 km apogee.',
      )
    },
    get modelNotes() {
      return [
        tr(
          '各段の推力は推進薬質量・比推力・燃焼時間から求めた平均値（一定推力）です。',
          'Each stage uses a constant average thrust derived from propellant mass, Isp and burn time.',
        ),
        tr(
          '3段にはPBS（ポスト・ブースト・ステージ）付き形態の質量を使い、PBSの噴射は省略しています。',
          'Stage 3 uses the mass of the configuration with the PBS (post-boost stage); PBS firings are omitted.',
        ),
        tr(
          'フェアリング（0.8 t）は投棄時刻（150 s）ではなく1段分離（161 s）まで機体に含めています。',
          'The fairing (0.8 t) is carried until stage 1 separation (161 s) rather than its jettison time (150 s).',
        ),
        tr(
          '姿勢プログラムは実績軌道に合うよう調整したもので、計算上の軌道は 954 × 1,157 km・傾斜角 29.8°（実績 954 × 1,157 km・29.7°）です。',
          'The attitude program is tuned to the achieved orbit; the simulated orbit is 954 × 1,157 km at 29.8° inclination (actual 954 × 1,157 km, 29.7°).',
        ),
        ...orbitalNotes(),
      ]
    },
    sources: [JAXA_EPSILON_PRESSKIT, JAXA_EPSILON_RESULT, JAXA_HISAKI],
    create: epsilon,
  },
  {
    id: 'h2a202',
    label: 'H-IIA 202',
    get kind() {
      return tr('2段式 液体ロケット + 固体ブースタ2本', 'Two-stage liquid launch vehicle + 2 solid boosters')
    },
    category: 'orbital',
    country: 'jp',
    aliases: ['H2A', 'H-2A', 'いぶきGW', 'GOSAT-GW'],
    get site() {
      return tr('鹿児島 種子島', 'Tanegashima, Kagoshima')
    },
    get description() {
      return tr(
        '50号機（2025年、温室効果ガス・水循環観測技術衛星「いぶきGW」）の実績シーケンスで構成。高度 約666 km の太陽同期軌道へ。',
        'Built from the actual sequence of Flight 50 (2025, Global Observing SATellite for Greenhouse gases and Water cycle "IBUKI GW"), to a sun-synchronous orbit at about 666 km.',
      )
    },
    get modelNotes() {
      return [
        tr(
          'SRB-A と第1段の同時燃焼は「SRB分離までの段」として近似しています（推進薬質量と総力積は一致させています）。',
          'The combined burn of the SRB-As and the first stage is approximated as a separate stage ending at SRB separation (propellant mass and total impulse are preserved).',
        ),
        tr(
          '第2段の推進薬はSELIからSECOまでの燃焼時間と推力・比推力から算出しています。',
          'Second-stage propellant is computed from the SELI-to-SECO burn time, thrust and Isp.',
        ),
        tr('フェアリング質量は公開値が見当たらないため含めていません。', 'Fairing mass is not included, as no published value was found.'),
        tr(
          '実機は種子島から南向きの軌道に入れるためドッグレッグ（ヨー方向の旋回）を行いますが、本モデルは真南寄りに直接打ち上げるため必要な増速が少なく、目標軌道（660 × 672 km・98°）に達した T+855 s で第2段を停止しています（実績のSECOは T+916 s）。',
          'The real vehicle flies a dogleg (yaw turn) to reach a southbound orbit from Tanegashima. This model launches directly toward the south and needs less delta-v, so the second stage is cut off at T+855 s on reaching the target orbit (660 × 672 km, 98°); the actual SECO was at T+916 s.',
        ),
        ...orbitalNotes(),
      ]
    },
    sources: [MHI_H2A_MANUAL, JAXA_H2A_LEAFLET, MEXT_H2A_F50, MELCO_GOSATGW],
    create: h2a202,
  },
  {
    id: 'h3-22s',
    label: 'H3-22S',
    get kind() {
      return tr('2段式 液体ロケット + 固体ブースタ2本', 'Two-stage liquid launch vehicle + 2 solid boosters')
    },
    category: 'orbital',
    country: 'jp',
    aliases: ['H3', 'ALOS-3'],
    get site() {
      return tr('鹿児島 種子島', 'Tanegashima, Kagoshima')
    },
    get description() {
      return tr(
        '試験機1号機（ALOS-3）の主要諸元と計画シーケンスで構成した、計画どおり飛んだ場合の飛行。高度 約675 km の太陽同期軌道へ。',
        'The flight as planned, built from the specifications and planned sequence of Test Flight 1 (ALOS-3), to a sun-synchronous orbit at about 675 km.',
      )
    },
    get modelNotes() {
      return [
        tr(
          '実際の試験機1号機は第2段が着火せず失敗しています。ここでは公表された計画値を使っています。',
          'The actual Test Flight 1 failed when the second stage did not ignite. The published planned values are used here.',
        ),
        tr(
          'SRB-3 の比推力は公開値が見当たらないため SRB-A と同程度（283 s）と仮定しています。',
          'SRB-3 Isp is assumed to be similar to the SRB-A (283 s), as no published value was found.',
        ),
        tr(
          'SRB-3 と第1段の同時燃焼は「SRB分離までの段」として近似しています。',
          'The combined burn of the SRB-3s and the first stage is approximated as a separate stage ending at SRB separation.',
        ),
        tr(
          'フェアリング（約1.8 t）は投棄時刻（211 s）ではなく1/2段分離（303 s）まで機体に含めています。',
          'The fairing (about 1.8 t) is carried until stage 1/2 separation (303 s) rather than its jettison time (211 s).',
        ),
        tr(
          'H-IIA と同じ理由（ドッグレッグなし）で、目標軌道（約 670 × 680 km・98°）に達した T+864 s で第2段を停止しています（計画のSECOは T+982 s）。',
          'For the same reason as the H-IIA (no dogleg), the second stage is cut off at T+864 s on reaching the target orbit (about 670 × 680 km, 98°); the planned SECO was at T+982 s.',
        ),
        ...orbitalNotes(),
      ]
    },
    sources: [MEXT_H3_TF1, JAXA_H3_LEAFLET],
    create: h3_22s,
  },
  {
    id: 'saturn-v',
    get label() {
      return tr('サターンV', 'Saturn V')
    },
    get kind() {
      return tr('3段式 液体ロケット（アポロ11号）', 'Three-stage liquid launch vehicle (Apollo 11)')
    },
    category: 'orbital',
    country: 'us',
    aliases: ['Saturn V', 'サターン', 'Apollo 11', 'アポロ'],
    get site() {
      return tr('米国 ケネディ宇宙センター', 'Kennedy Space Center, USA')
    },
    get description() {
      return tr(
        '1969年に人類初の月着陸へ向かったアポロ11号の打上げ。NASA の飛行評価報告書の実測値（各段の質量・推力・比推力・燃焼時刻）で構成し、第3段の1回目の燃焼で高度約185 kmの待機軌道に入るまで。',
        "The 1969 launch of Apollo 11, the first crewed Moon landing mission. Built from measured values in NASA's flight evaluation report (stage masses, thrust, Isp and burn times), up to parking-orbit insertion at about 185 km by the third stage's first burn.",
      )
    },
    get modelNotes() {
      return [
        tr(
          '質量はすべて報告書の実測値です（離昇時 2,899 t、S-II 点火時 654 t、S-IVB 点火時 167 t）。',
          'All masses are measured values from the report (2,899 t at liftoff, 654 t at S-II ignition, 167 t at S-IVB ignition).',
        ),
        tr(
          'S-IC は中央エンジン停止（T+134.9 s）で推力が 4/5 になる形、S-II は中央エンジン停止前後の推力（5,142 kN → 4,093 kN）を使っています。',
          'S-IC thrust drops to 4/5 at center engine cutoff (T+134.9 s); the S-II uses the thrust before and after center engine cutoff (5,142 kN → 4,093 kN).',
        ),
        tr(
          'S-IC の真空比推力は報告書にないため、S-IC 燃焼終了時（高度 66.1 km、速度 2,764 m/s）に合うよう調整し、ノズル出口面積は公表の海面推力（33,596 kN）から逆算しています。',
          'S-IC vacuum Isp is not in the report, so it is tuned to S-IC burnout (66.1 km altitude, 2,764 m/s); the nozzle exit area is back-calculated from the published sea-level thrust (33,596 kN).',
        ),
        tr(
          '大気中は迎角ゼロの重力ターン、その後は簡易ピッチプログラムで、報告書の待機軌道（183.2 × 186.0 km、傾斜角 32.52°）と S-IC・S-II 燃焼終了高度（66.1 km・187.3 km）に合うよう調整しています。方位角は報告書の飛行方位角 72.058° ではなく、傾斜角が合うよう 75.1° としています（3自由度の簡易モデルのため）。',
          "Attitude is a zero-angle-of-attack gravity turn through the atmosphere, then a simple pitch program, tuned to the report's parking orbit (183.2 × 186.0 km, 32.52° inclination) and the S-IC and S-II burnout altitudes (66.1 km, 187.3 km). The azimuth is set to 75.1° to match the inclination rather than the reported 72.058° flight azimuth (a consequence of the simplified 3DoF model).",
        ),
        tr(
          '計算上の S-IC 燃焼終了時の速度は 2,875 m/s（報告書 2,764 m/s）、高度は 67.8 km（同 66.1 km）、S-II 燃焼終了高度は 186.0 km（同 187.3 km）です。',
          'Simulated S-IC burnout velocity is 2,875 m/s (report 2,764 m/s) and altitude is 67.8 km (report 66.1 km); S-II burnout altitude is 186.0 km (report 187.3 km).',
        ),
        tr(
          '脱出塔（約4 t）と段間部の投棄は分離時刻までまとめて扱っています。機体直径 10.06 m は一般的な公称値です。',
          'The launch escape tower (about 4 t) and interstage jettisons are lumped in until stage separation. The 10.06 m vehicle diameter is the commonly quoted nominal value.',
        ),
      ]
    },
    sources: [NASA_AS506],
    create: saturnV,
  },
  {
    id: 'ariane5',
    get label() {
      return tr('アリアン5 ECA', 'Ariane 5 ECA')
    },
    get kind() {
      return tr('2段式 液体ロケット + 固体ブースタ2本', 'Two-stage liquid launch vehicle + 2 solid boosters')
    },
    category: 'orbital',
    country: 'eu',
    aliases: ['Ariane 5', 'アリアン', 'VA247'],
    get site() {
      return tr('仏領ギアナ ギアナ宇宙センター', 'Guiana Space Centre, French Guiana')
    },
    get description() {
      return tr(
        '欧州の大型ロケット。VA247（2019年、静止衛星2機・計約10 t）の打上げキットの機体構成と飛行シーケンスで構成し、静止トランスファ軌道（近地点 250 km × 遠地点 35,786 km）へ。',
        "Europe's heavy launcher. Built from the vehicle configuration and flight sequence in the VA247 launch kit (2019, two geostationary satellites totalling about 10 t), to geostationary transfer orbit (perigee 250 km × apogee 35,786 km).",
      )
    },
    get modelNotes() {
      return [
        tr(
          '固体ブースタ EAP（各 277 t・推進薬 240 t・比推力 274.5 s・燃焼 130 s）と主段 EPC の同時燃焼は「EAP 分離（離昇後 136.7 s）までの段」として近似しています。',
          'The combined burn of the EAP solid boosters (each 277 t, 240 t propellant, Isp 274.5 s, 130 s burn) and the EPC main stage is approximated as a separate stage ending at EAP separation (136.7 s after liftoff).',
        ),
        tr(
          '主段 EPC は打上げキットの推進薬 174 t を H0+1 s〜H0+521 s で燃やす扱いで、離昇前（6.3 s）の消費分を差し引いています。ノズル出口面積はマニュアルの真空／海面推力（1,390 / 960 kN）から求めています。',
          "The EPC main stage burns the launch kit's 174 t of propellant from H0+1 s to H0+521 s, less what is consumed before liftoff (6.3 s). The nozzle exit area is derived from the manual's vacuum / sea-level thrust (1,390 / 960 kN).",
        ),
        tr(
          '上段 ESC-A（19 t・推進薬 14.9 t・比推力 446 s）は打上げキットの点火〜停止（離昇後 523.7〜1,501.7 s）をそのまま使い、搭載物 約10 t と機器搭載部 0.97 t を加えています。',
          "The ESC-A upper stage (19 t, 14.9 t propellant, Isp 446 s) uses the launch kit's ignition-to-cutoff times (523.7–1,501.7 s after liftoff) as is, with about 10 t of payload and the 0.97 t vehicle equipment bay added.",
        ),
        tr(
          'EAP のノズル出口径は公開値がないため推定（各 3.0 m）です。フェアリング 2.4 t は投棄時刻ではなく主段分離まで機体に含めています。',
          'The EAP nozzle exit diameter is not published and is estimated (3.0 m each). The 2.4 t fairing is carried until main stage separation rather than its jettison time.',
        ),
        tr(
          '姿勢プログラムは目標軌道に合うよう調整したもので、計算上の軌道は 250 × 35,786 km です。軌道傾斜角は計算で 4.4°（目標 3°）で、射場の緯度（5.2°）より小さくする実機のヨー方向の誘導は再現していません。',
          "The attitude program is tuned to the target orbit; the simulated orbit is 250 × 35,786 km. The simulated inclination is 4.4° (target 3°): the real vehicle's yaw steering that brings it below the launch site latitude (5.2°) is not modelled.",
        ),
        tr('離昇時の総質量は計算で 772 t（打上げキット 780 t）です。', 'Simulated liftoff mass is 772 t (launch kit 780 t).'),
      ]
    },
    sources: [A5_UM, A5_VA247],
    create: ariane5,
  },
  {
    id: 'falcon9',
    get label() {
      return tr('ファルコン9', 'Falcon 9')
    },
    get kind() {
      return tr('2段式 液体ロケット（1段回収）', 'Two-stage liquid launch vehicle (reusable first stage)')
    },
    category: 'orbital',
    country: 'us',
    aliases: ['Falcon 9', 'F9', 'SpaceX', 'スペースX', 'PACE', 'Block 5'],
    get site() {
      return tr('米国 ケープカナベラル', 'Cape Canaveral, USA')
    },
    get description() {
      return tr(
        'スペースXの再使用型ロケット（ブロック5）。NASAの海洋・大気観測衛星 PACE（2024年、約1.7 t）を高度 676.5 km・傾斜角 98° の太陽同期軌道へ送った打上げを、公式の推力・タイムラインで構成。第1段は射場に戻って着陸したため、燃焼を早めに終えています。',
        "SpaceX's reusable launcher (Block 5). The 2024 launch of NASA's ocean and atmosphere satellite PACE (about 1.7 t) to a 676.5 km, 98° sun-synchronous orbit, built from official thrust figures and the mission timeline. The first stage flew back to the launch site, so it shuts down early.",
      )
    },
    get modelNotes() {
      return [
        tr(
          '推力（第1段 真空 8,227 kN／海面 7,607 kN、第2段 981 kN）・比推力（Merlin 1D 真空 311 s、MVac 348 s）・タイムライン・衛星質量・目標軌道は公式値です（Merlin 1D の比推力は2013年時点の公表値）。各段の質量（第1段 433.1 t・推進薬 410.9 t、第2段 111.5 t）は公式発表がないため二次資料の推定値、フェアリング 2 t も推定値です。',
          'Thrust (stage 1 8,227 kN vacuum / 7,607 kN sea level, stage 2 981 kN), Isp (Merlin 1D 311 s vacuum, MVac 348 s), the timeline, satellite mass and target orbit are official (the Merlin 1D Isp is the 2013 published figure). Stage masses (stage 1 433.1 t with 410.9 t propellant, stage 2 111.5 t) are not published and are secondary-source estimates, as is the 2 t fairing.',
        ),
        tr(
          '第1段は全推力で燃焼し、MECO（T+139 s）で停止します。残る約36 tの推進薬は帰還用で、機体とともに分離されます。Max-Q付近のスロットリングと、帰還飛行（ブーストバック・着陸燃焼）は扱っていません。',
          'Stage 1 runs at full thrust and shuts down at MECO (T+139 s); the roughly 36 t of propellant left for the return flight is separated with it. Throttling around max-Q and the return flight (boostback and landing burns) are not modelled.',
        ),
        tr(
          '第2段は全推力（981 kN）で燃焼し、目標軌道に達した T+506 s で停止します（公表の SECO-1 は T+620 s）。実機は軽い衛星に合わせて推力を絞って長く燃焼していると考えられますが、推力履歴は公開されていません。停止時には約5 tの推進薬が残ります。',
          'Stage 2 burns at full thrust (981 kN) and shuts down at T+506 s on reaching the target orbit (published SECO-1: T+620 s). The real stage likely throttles down and burns longer with such a light satellite, but its thrust history is not published. About 5 t of propellant remains at shutdown.',
        ),
        tr(
          '第2段の姿勢プログラムは目標軌道に合うよう調整したもので、射場帰還のため第1段は高めに上昇します（計算上の MECO は高度 92 km・2.12 km/s、Max-Q は T+60 s で公表 T+67 s）。計算上の軌道は 660 × 676 km・傾斜角 98.00°（目標 676.5 km 円軌道・98°）です。',
          'The stage 2 attitude program is tuned to the target orbit; stage 1 climbs steeply, as for a return to the launch site (simulated MECO at 92 km and 2.12 km/s; max-Q at T+60 s, published T+67 s). The simulated orbit is 660 × 676 km at 98.00° (target 676.5 km circular, 98°).',
        ),
        tr(
          'フェアリングは公表の分離時刻（T+255 s）に投棄物として切り離し、キューバ南方の海上に落ちるよう経路を調整しています。',
          'The fairing is released as a jettisoned product at the published deploy time (T+255 s); the path is tuned so it comes down at sea south of Cuba.',
        ),
        tr(
          '経路はケープカナベラルの南向き極軌道コリドーに沿わせています。方位角 152° で南南東の沖合へ打ち上げ（第1段の瞬間落下点がフロリダ沿岸の沖に留まるよう設定）、第2段で右へ旋回するドッグレッグを行ってフロリダ東岸の沖を南下し、高高度でキューバ上空を通過して 98° の軌道に入ります。旋回のタイミングと量は推定です。',
          "The path follows Cape Canaveral's southbound polar corridor: launch at a 152° azimuth to the south-southeast, offshore (set so the stage 1 instantaneous impact point stays off the Florida coast), then a dogleg to the right by stage 2 to run south off Florida's east coast and cross Cuba at high altitude into the 98° orbit. The timing and size of the turn are estimates.",
        ),
        ...orbitalNotes(),
      ]
    },
    sources: [SPACEX_F9, SPACEX_UG, SPACEX_PACE, NASA_PACE_TIMELINE, NASA_PACE_SC, NASA_PACE_ORBIT, SFN_SAOCOM1B, WP_F9B5],
    create: falcon9,
  },
  {
    id: 'soyuz-2.1a',
    get label() {
      return tr('ソユーズ2.1a', 'Soyuz-2.1a')
    },
    get kind() {
      return tr('3段式 液体ロケット（ブースタ4本）', 'Three-stage liquid launch vehicle (4 strap-on boosters)')
    },
    category: 'orbital',
    country: 'ru',
    aliases: ['Soyuz', 'Союз', 'ソユーズ', 'Progress', 'プログレス', 'R-7'],
    get site() {
      return tr('カザフスタン バイコヌール', 'Baikonur, Kazakhstan')
    },
    get description() {
      return tr(
        'R-7 の系譜を引くロシアの主力ロケット。国際宇宙ステーションへの補給船プログレスMS-30（2025年）の打上げを、ユーザーズマニュアルの各段諸元とテレメトリによる飛行シーケンスで構成し、近地点 193 km × 遠地点 240 km・傾斜角 51.67° の軌道へ。',
        "Russia's workhorse, descended from the R-7. The 2025 launch of the Progress MS-30 cargo ship to the ISS, built from user's manual stage data and the telemetry flight sequence, to a 193 × 240 km orbit at 51.67°.",
      )
    },
    get modelNotes() {
      return [
        tr(
          '第1・2段（ブースタ 各44.4 t・推進薬 39.2 t／コア 99.8 t・推進薬 90.1 t、いずれも真空比推力 319 s）はクールー版ユーザーズマニュアルの値です。ブースタとコアの同時燃焼は「ブースタ分離（117.85 s）までの段」として近似し、ノズル出口面積は真空／海面推力の差から求めています。',
          "Stages 1 and 2 (boosters 44.4 t each with 39.2 t propellant; core 99.8 t with 90.1 t; both 319 s vacuum Isp) are from the Kourou user's manual. The combined booster and core burn is approximated as a separate stage ending at booster separation (117.85 s); nozzle exit areas come from the vacuum / sea-level thrust difference.",
        ),
        tr(
          '2.1a の第3段（RD-0110、297.9 kN・325 s、全備 25.3 t）は Starsem 版マニュアル（Soyuz/ST）の値で、推進薬はコア分離から第3段停止（287.4〜525.5 s）までの燃焼量としています。実機のホットステージング（コア停止の約2 s前に点火）と後部スカートの投棄は省略しています。',
          'The 2.1a third stage (RD-0110, 297.9 kN, 325 s, 25.3 t gross) uses the Starsem manual (Soyuz/ST) figures; its propellant is what burns from core separation to third-stage cutoff (287.4–525.5 s). Hot staging (ignition about 2 s before core shutdown) and the aft skirt jettison are omitted.',
        ),
        tr(
          'プログレス用フェアリングの質量は公開値が見当たらないため、商業用 ST フェアリングの 1.7 t を使い、テレメトリの分離時刻（T+183.08 s）に投棄物として切り離しています。宇宙船質量 7,280 kg は二次資料の値です。地上での約20 sの予備燃焼は含めていません。',
          'No published mass was found for the Progress fairing, so the 1.7 t commercial ST fairing is used, released as a jettisoned product at the telemetry separation time (T+183.08 s). The 7,280 kg spacecraft mass is from a secondary source. The roughly 20 s of engine running on the pad before liftoff is not included.',
        ),
        tr(
          '大気圏外の姿勢プログラムと方位角（65.4°）は投入軌道とブースタ分離・コア分離時の高度（約43 km・約143 km）に合うよう調整したものです。計算上はブースタ分離 44 km、コア分離 149 km・4.03 km/s、軌道 193 × 240 km・傾斜角 51.67°（実績 193.1 × 240.0 km・51.67°）です。',
          'The attitude program above the atmosphere and the azimuth (65.4°) are tuned to the insertion orbit and to the altitudes at booster and core separation (about 43 km and 143 km). Simulated: booster separation at 44 km, core separation at 149 km and 4.03 km/s, orbit 193 × 240 km at 51.67° (actual 193.1 × 240.0 km, 51.67°).',
        ),
        ...orbitalNotes(),
      ]
    },
    sources: [SOYUZ_UM_CSG, SOYUZ_UM_STARSEM, RSW_PROGRESS_MS30, WP_PROGRESS_MS30],
    create: soyuz21a,
  },
  {
    id: 'long-march-3b',
    get label() {
      return tr('長征3B/E', 'Long March 3B/E')
    },
    get kind() {
      return tr('3段式 液体ロケット（ブースタ4本）', 'Three-stage liquid launch vehicle (4 strap-on boosters)')
    },
    category: 'orbital',
    country: 'cn',
    aliases: ['CZ-3B', 'LM-3B', '长征三号乙', '長征三号乙', 'Chang Zheng'],
    get site() {
      return tr('中国 西昌', 'Xichang, China')
    },
    get description() {
      return tr(
        '中国の静止衛星打上げの主力。中国長城工業の公式ユーザーズマニュアル（2011年版）にある標準の静止トランスファ軌道ミッション（近地点 200 km × 遠地点 35,958 km・傾斜角 28.5°、衛星 5.5 t）を、その飛行シーケンスで再現。第3段は2回燃焼です。',
        "China's workhorse for geostationary launches. The standard geostationary transfer mission in the official CGWIC user's manual (2011): 200 × 35,958 km at 28.5° with a 5.5 t satellite, flown with the manual's flight sequence. The third stage fires twice.",
      )
    },
    get modelNotes() {
      return [
        tr(
          '推進薬量・推力・比推力・飛行シーケンスはマニュアルの値です。各段の全備質量（ブースタ 44.3 t、第1段 198.8 t、第2段 53.5 t、第3段 20.9 t）とフェアリング質量 1.5 t はマニュアルにないため二次資料（Spaceflight101）の値です。',
          'Propellant masses, thrust, Isp and the flight sequence are from the manual. Stage gross masses (boosters 44.3 t, stage 1 198.8 t, stage 2 53.5 t, stage 3 20.9 t) and the 1.5 t fairing are not in the manual and come from a secondary source (Spaceflight101).',
        ),
        tr(
          'ブースタと第1段のエンジンはマニュアルに地上推力・地上比推力しかないため、真空比推力を YF-20 系の 289 s と仮定し、真空推力とノズル出口面積を推進薬流量から求めています。ブースタと第1段の同時燃焼は「ブースタ分離（141.6 s）までの段」として近似しています。',
          'For the booster and first-stage engines the manual gives only ground thrust and Isp, so vacuum Isp is assumed to be 289 s (YF-20 family) and vacuum thrust and nozzle exit area follow from the propellant flow. The combined booster and first-stage burn is approximated as a separate stage ending at booster separation (141.6 s).',
        ),
        tr(
          '第2段は主エンジン停止後に補助エンジン（47.1 kN）だけが5秒燃える推力履歴にしています。第3段は推力履歴に推力ゼロの区間を入れて、1回目の燃焼・慣性飛行・2回目の燃焼を表しています。推進薬 18.2 t をマニュアルの燃焼時間で使い切るため、平均推力は 163.6 kN（マニュアル 167.2 kN）になります。最後の20秒の速度調整は省略しています。',
          "Stage 2's thrust curve has the verniers (47.1 kN) burning alone for 5 s after main engine cutoff. Stage 3's thrust curve has a zero-thrust stretch for the first burn, coast and second burn. Burning 18.2 t over the manual's burn times gives a mean thrust of 163.6 kN (manual 167.2 kN). The final 20 s velocity adjustment is omitted.",
        ),
        tr(
          '打上げ方位角はマニュアルの 97.5° です。姿勢プログラムと2回目燃焼の方位角（遠方で進行方向が変わるため別に与える）は、標準GTOとマニュアルの軌道上の高度（ブースタ分離 57 km、1/2段分離 72 km、3段1回目停止 178.8 km）に合うよう調整しました。計算上はそれぞれ 62 km・79 km・179 km で、軌道は 200 × 35,959 km・傾斜角 28.50° です。大気中は迎角ゼロの重力ターンに固定しているため、序盤の高度はマニュアルよりやや高めです。',
          "The launch azimuth is the manual's 97.5°. The attitude program and the second-burn heading (given separately, as the direction of travel has turned that far downrange) are tuned to the standard GTO and to the manual's altitudes (booster separation 57 km, stage 1/2 separation 72 km, end of the first stage 3 burn 178.8 km). Simulated: 62 km, 79 km and 179 km, and an orbit of 200 × 35,959 km at 28.50°. The zero-angle-of-attack gravity turn through the atmosphere leaves the early altitudes somewhat above the manual's.",
        ),
        tr(
          '本モデルは性能に余裕があるため、第3段の2回目燃焼は目標軌道に達した T+1,441 s で停止しています（マニュアルでは T+1,470.5 s）。',
          'The model has some performance to spare, so the second stage 3 burn is cut off at T+1,441 s on reaching the target orbit (manual: T+1,470.5 s).',
        ),
        tr(
          '打上げ日時は例示です（マニュアルの標準ミッションで、特定の打上げではありません）。',
          "The launch date is illustrative: this is the manual's standard mission, not a particular launch.",
        ),
        ...orbitalNotes(),
      ]
    },
    sources: [CALT_LM3A_UM, CGWIC_LM3B, SF_LM3BE],
    create: longMarch3b,
  },
]

/**
 * A minimal single-stage rocket to start from scratch, at the given launch
 * point (or Taiki): 1 t, 70 % propellant, 20 kN, Isp 250 s.
 */
export function createBlankConfig(launch?: ClientConfig['launch']): ClientConfig {
  const c = vehicle({
    name: tr('新しいロケット', 'New rocket'),
    site: launch ? { lat: launch.latitude_deg, lon: launch.longitude_deg, alt: launch.altitude_m } : SITES.taiki,
    date: launch
      ? [
          launch.datetime_utc.year,
          launch.datetime_utc.month,
          launch.datetime_utc.day,
          launch.datetime_utc.hour,
          launch.datetime_utc.minute,
          launch.datetime_utc.second,
        ]
      : [2025, 1, 1, 0, 0, 0],
    stages: [stage({ mass: 1000, propellant: 700, isp: 250, burn: (700 * 250 * 9.80665) / 20000, exitArea: exitAreaFromDiameter(0.25) })],
    diameter: 0.5,
    ca: 0.4,
    attitude: { azimuth: 90, elevation: 85 },
    duration: 600,
    step: 0.5,
  })
  return c
}
