// Sample vehicles built from published figures. Each preset lists its
// sources and the simplifications made, which the overview tab shows.
import type { ClientConfig } from '../lib/simulation'
import { tr } from '../lib/i18n'
import { siteById } from './sites'
import { CA_SLENDER, exitAreaFromDiameter, exitAreaFromThrust, parallelPhase, pitchProgram, stage, vehicle } from './build'

export interface PresetSource {
  label: string
  url: string
}

export type PresetCategory = 'sounding' | 'orbital'

export interface PresetOption {
  id: string
  label: string
  /** What kind of vehicle / flight this is */
  kind: string
  category: PresetCategory
  site: string
  description: string
  /** Simplifications and estimates made when modelling */
  modelNotes: string[]
  sources: PresetSource[]
  create: () => ClientConfig
}

export const PRESET_CATEGORIES: { id: PresetCategory; label: string }[] = [
  { id: 'sounding', get label() { return tr('観測ロケット（弾道飛行）', 'Sounding rockets (suborbital)') } },
  { id: 'orbital', get label() { return tr('人工衛星打上げロケット', 'Orbital launch vehicles') } },
]

/* ------------------------------------------------------------ Launch sites */

const SITES = {
  ksc39a: siteById('ksc-39a'),
  ela3: siteById('csg-ela3'),
  uchinouraKS: siteById('uchinoura-ks'),
  taiki: siteById('taiki'),
  uchinouraMV: siteById('uchinoura-m'),
  yoshinobu: siteById('tanegashima'),
}


/* ---------------------------------------------------------- Sounding rockets */

// Calibrated total-impulse factors: thrust is scaled so that the simulated
// apogee matches the published flight record (see the notes on each preset).
export const CAL = {
  s310: 1.2213, // apogee 180 km
  s520: 0.9116, // apogee 304 km
  momoIsp: 206.72, // apogee 113.4 km
  momoElevation: 86.71, // splashdown 37 km
  ss520Stage1: 1.3752, // 2.0 km/s at 26 km at stage-1 burnout
  saturnIsp1: 315.96, // S-IC vacuum Isp; tuned to the S-IC cutoff / S-II cutoff / parking orbit
  saturnPitch: [[30, 82.08], [70, 60.42], [120, 31.62], [161, 29.04], [300, 18.86], [450, 15.48], [550, 13.19], [700, 1.07]] as [number, number][],
  saturnAzimuth: 74.85, // published flight azimuth 72.058°; adjusted to the 32.52° inclination
  ariane5Pitch: [[20, 82.85], [60, 63.19], [137, 41.03], [300, 10.54], [520, 6.2], [1000, 1.24], [1500, -1.32]] as [number, number][], // GTO 250 × 35,786 km
  ariane5Azimuth: 90,
  ariane5Cutoff: 978, // full ESC-A burn
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
        shape: [[0, 1.6], [0.25, 1.2], [0.5, 0.9], [0.95, 0.6], [1, 0]],
        freeMode: 0,
      }),
    ],
    diameter: 0.31,
    ca: CA_SLENDER,
    attitude: { azimuth: 135, elevation: 76 },
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
        shape: [[0, 1.3], [0.3, 1.1], [0.9, 0.85], [1, 0]],
        freeMode: 0,
      }),
    ],
    diameter: 0.52,
    ca: CA_SLENDER,
    attitude: { azimuth: 135, elevation: 79 },
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
        shape: [[0, 160], [10 / 31.8, 100], [30 / 31.8, 50], [31.7 / 31.8, 20], [1, 0]],
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
        shape: [[0, 45500], [23.7 / 24.5, 24500], [1, 0]],
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
        shape: [[0, 13000], [25.6 / 25.7, 2000], [1, 0]],
        freeMode: 1,
      }),
    ],
    diameter: 0.52,
    ca: CA_SLENDER,
    // Launch elevation and the attitudes for stages 2 and 3 (after the
    // rhumb-line manoeuvre, 70.5–117.6 s) tuned to the planned orbit.
    attitude: [
      [0, 90.8, 60.14],
      [70.5, 90.8, 60.14],
      [117.6, 90.8, 43.58],
      [236, 90.8, 43.58],
      [238, 90.8, -10.73],
      [3000, 90.8, -10.73],
    ],
    duration: 3000,
    step: 1,
  })
}

function momo(): ClientConfig {
  // MOMO F3, 2019-05-04: 1150 kg, 12 kN, burn 116 s, apogee 113.4 km at 240 s,
  // splashdown 37 km ESE of the pad, 515 s flight.
  // Thrust is held at the published 12 kN at sea level; Isp and launch
  // elevation are calibrated to the published apogee and splashdown range.
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
    attitude: { azimuth: 112.5, elevation: CAL.momoElevation },
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
  const sicShape: [number, number][] = [[0, 1], [ceco, 1], [ceco + 0.0005, 0.8], [1, 0.8]]
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
        shape: [[0, 5141.5], [siiCeco, 5141.5], [siiCeco + 0.0005, 4093.1], [1, 4093.1]],
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
    attitude: pitchProgram(CAL.saturnAzimuth, CAL.saturnPitch),
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
    attitude: pitchProgram(CAL.ariane5Azimuth, CAL.ariane5Pitch),
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
    // Pitch program tuned to the achieved orbit (954 × 1157 km)
    attitude: pitchProgram(90, [[40, 70], [112, 51], [266, 31], [620, 3], [720, -12]]),
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
        cutoff: 433.8,
        exitArea: exitAreaFromDiameter(1.6),
        freeMode: 1,
      }),
    ],
    diameter: 4.0,
    ca: CA_SLENDER,
    // Pitch program and SECO tuned to a 660 × 672 km, 98° orbit
    attitude: pitchProgram(191.2, [[30, 82.12], [70, 70.63], [124, 55.89], [200, 50.07], [300, 46.61], [400, 34.19], [550, 5.7], [700, -4.08]]),
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
        cutoff: 545.2,
        exitArea: exitAreaFromDiameter(1.6),
        freeMode: 1,
      }),
    ],
    diameter: 5.2,
    ca: CA_SLENDER,
    // Pitch program and SECO tuned to a 669 × 681 km, 98.1° orbit
    attitude: pitchProgram(191.3, [[30, 78.76], [70, 63.01], [116, 48.46], [200, 40.52], [303, 23.86], [450, 5.33], [650, 3.17], [850, -5.97]]),
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

const ISAS_HANDBOOK = src('JAXA/ISAS 観測ロケット ユーザーハンドブック（3章 機体概要、付録B 飛行実績）', 'JAXA/ISAS Sounding Rocket User Handbook (Ch. 3 Vehicle Overview, App. B Flight Record)', 'https://www.isas.jaxa.jp/home/kansoku/images/pdf/RSL-2018012H_%E8%A6%B3%E6%B8%AC%E3%83%AD%E3%82%B1%E3%83%83%E3%83%88_%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%BC%E3%83%8F%E3%83%B3%E3%83%89%E3%83%96%E3%83%83%E3%82%AF(%E5%85%AC%E9%96%8B%E7%94%A8).pdf')
const ISAS_S310 = src('JAXA/ISAS S-310 主要諸元', 'JAXA/ISAS S-310 Specifications', 'https://www.isas.jaxa.jp/home/kansoku/rocket/s310.html')
const ISAS_S520 = src('JAXA/ISAS S-520 主要諸元', 'JAXA/ISAS S-520 Specifications', 'https://www.isas.jaxa.jp/home/kansoku/rocket/s520.html')
const JAXA_SROCKETS = src('JAXA 観測ロケット（諸元一覧）', 'JAXA Sounding Rockets (specifications)', 'https://global.jaxa.jp/projects/rockets/s_rockets/index.html')
const MEXT_SS520_5 = src('文部科学省 SS-520 5号機のミッション概要（飛行シーケンス・目標軌道）', 'MEXT, SS-520-5 Mission Overview (flight sequence, target orbit)', 'https://www.mext.go.jp/b_menu/shingi/gijyutu/gijyutu2/060/shiryo/__icsFiles/afieldfile/2017/10/12/1396928_13.pdf')
const JAXA_SS520_5 = src('JAXA SS-520 5号機 説明資料（全備質量・衛星）', 'JAXA, SS-520-5 Briefing Material (gross mass, satellite)', 'https://www.isas.jaxa.jp/topics/files/20180202_ss-520-5.pdf')
const OT_SS520_4 = src('OpenTsiolkovsky 同梱 SS-520-4 設定例（推力履歴・比推力）', 'OpenTsiolkovsky bundled SS-520-4 example (thrust curve, Isp)', 'https://github.com/istellartech/OpenTsiolkovsky/tree/master/examples/SS-520-4')
const IST_MOMO_F3 = src('インターステラテクノロジズ MOMO3号機（主要諸元）', 'Interstellar Technologies, MOMO F3 (specifications)', 'https://www.istellartech.com/technology/momo_f3/')
const IST_MOMO_F3_PR = src('インターステラテクノロジズ プレスリリース 2019-05-05（到達高度・飛行時間）', 'Interstellar Technologies press release, 2019-05-05 (apogee, flight time)', 'https://www.istellartech.com/7hbym/wp-content/uploads/2019/05/IST-PressRelease_2019050501.pdf')

const soundingNotes = () => [
  tr(
    '推力・比推力・推進薬量は公開されていないため、比推力を仮定し、全備質量・燃焼時間・発射上下角を飛行実績に合わせたうえで、最高到達高度が実績と一致するよう総力積を調整しています。',
    'Thrust, Isp and propellant mass are not published, so Isp is assumed, gross mass, burn time and launch elevation are set to the flight record, and total impulse is tuned so the apogee matches the record.',
  ),
  tr('打上げ方位角は公開値が見当たらないため仮定値です。', 'The launch azimuth is assumed, as no published value was found.'),
]

const NASA_AS506 = { label: 'NASA MSFC Saturn V Launch Vehicle Flight Evaluation Report AS-506 Apollo 11 Mission (MPR-SAT-FE-69-9)', url: 'https://ibiblio.org/apollo/Documents/lvfea-AS506-Apollo11.pdf' }
const A5_UM = src("Arianespace Ariane 5 User's Manual Issue 5 Rev 2（Fig. 1-7 主要諸元）", "Arianespace Ariane 5 User's Manual Issue 5 Rev 2 (Fig. 1-7, main characteristics)", 'https://courses.edx.org/asset-v1:DelftX%2BAEASM1x%2B1T2022%2Btype%40asset%2Bblock/Ariane5_Users-Manual_October2016_Red.pdf')
const A5_VA247 = src('Arianespace VA247 Launch Kit（機体構成・飛行シーケンス・目標軌道）', 'Arianespace VA247 Launch Kit (vehicle configuration, flight sequence, target orbit)', 'https://www.arianespace.com/wp-content/uploads/2019/01/VA247-launchkit-EN.pdf')
const JAXA_EPSILON_PRESSKIT = src('JAXA イプシロンロケット試験機 プレスキット（主要諸元）', 'JAXA, Epsilon Launch Vehicle Test Flight Press Kit (specifications)', 'https://fanfun.jaxa.jp/countdown/epsilon/files/presskit_epsilon_j.pdf')
const JAXA_EPSILON_RESULT = src('JAXA イプシロンロケット試験機の打上げ結果（飛行シーケンス・軌道）', 'JAXA, Epsilon Test Flight Launch Results (flight sequence, orbit)', 'https://www.jaxa.jp/press/2013/12/20131224_epsilon_j.pdf')
const JAXA_HISAKI = src('JAXA 惑星分光観測衛星「ひさき」パンフレット（衛星質量）', 'JAXA, Spectroscopic Planet Observatory "Hisaki" brochure (satellite mass)', 'https://www.jaxa.jp/projects/pr/brochure/pdf/04/sat35.pdf')
const MHI_H2A_MANUAL = src('三菱重工 H-IIA ユーザーズマニュアル Ver.4.0（Table 1.3-1）', "Mitsubishi Heavy Industries, H-IIA User's Manual Ver. 4.0 (Table 1.3-1)", 'https://www.mhi.com/jp/products/pdf/manual.pdf')
const JAXA_H2A_LEAFLET = src('JAXA H-IIAロケット リーフレット（主要諸元）', 'JAXA, H-IIA Launch Vehicle leaflet (specifications)', 'https://www.jaxa.jp/projects/pr/model/files/p_h2a_2025.pdf')
const MEXT_H2A_F50 = src('文部科学省 宇宙開発利用部会 資料 H-IIA 50号機 打上げ結果（飛行シーケンス）', 'MEXT Space Development and Utilization Committee, H-IIA F50 Launch Results (flight sequence)', 'https://www.mext.go.jp/content/20250703-mxt_uchukai01-000043486_000002.pdf')
const MELCO_GOSATGW = src('三菱電機 GOSAT-GW（衛星質量）', 'Mitsubishi Electric, GOSAT-GW (satellite mass)', 'https://www.mitsubishielectric.co.jp/society/space/satellite/observation/gosat_gw.html')
const MEXT_H3_TF1 = src('文部科学省 H3試験機1号機 調査報告（主要諸元・計画シーケンス）', 'MEXT, H3 Test Flight No. 1 Investigation Report (specifications, planned sequence)', 'https://www.mext.go.jp/content/20231026-mxt_uchukai01-000030341_3.pdf')
const JAXA_H3_LEAFLET = src('JAXA H3ロケット リーフレット', 'JAXA, H3 Launch Vehicle leaflet', 'https://www.jaxa.jp/projects/pr/model/files/p_h3_2025.pdf')

const orbitalNotes = () => [
  tr('ノズル出口面積（地上での推力低下に効く）は公開値が見当たらないため推定値です。', 'Nozzle exit areas (which set the thrust loss at low altitude) are estimated, as no published values were found.'),
  tr('姿勢は時刻テーブルで与えた簡易プログラムで、実機の誘導則ではありません。', 'Attitude is a simple time-tabled program, not the actual guidance law.'),
]

export const PRESET_OPTIONS: PresetOption[] = [
  {
    id: 'momo',
    label: 'MOMO',
    get kind() {
      return tr('単段 液体 観測ロケット', 'Single-stage liquid sounding rocket')
    },
    category: 'sounding',
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
          '公表推力 12 kN（地上推力として扱う）・燃焼時間 116 s・全備質量 1,150 kg を固定し、最高到達高度 113.4 km と着水点までの距離 37 km に合うよう比推力（206.7 s）と発射上下角（86.7°）を調整しています。推進薬は約 870 kg になります。',
          'The published thrust of 12 kN (treated as sea-level thrust), 116 s burn time and 1,150 kg gross mass are fixed; Isp (206.7 s) and launch elevation (86.7°) are tuned to the 113.4 km apogee and 37 km splashdown range. This gives about 870 kg of propellant.',
        ),
        tr(
          '計算上の最高到達時刻は T+244 s（公表 T+240 s）、着水点までの距離は 37.9 km（公表 37 km）。計算上の飛行時間は 407 s で公表の 515 s より短く、降下中の空気抵抗の違いによるものと考えられます。',
          'Simulated apogee is at T+244 s (published T+240 s) and splashdown range is 37.9 km (published 37 km). The simulated flight time of 407 s is shorter than the published 515 s, likely due to differences in drag during descent.',
        ),
        tr('ノズル出口径と発射地点の座標は推定・概略です。', 'The nozzle exit diameter is estimated and the launch coordinates are approximate.'),
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
          '比推力 250 s を仮定し、推進薬は約 464 kg に調整。計算上の飛行時間は 410 s（ハンドブックの着水 約400 s）です。',
          'Isp is assumed to be 250 s and propellant is tuned to about 464 kg. The simulated flight time is 410 s (handbook splashdown about 400 s).',
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
          '比推力 265 s を仮定し、推進薬は約 1,550 kg に調整。計算上の飛行時間は 539 s（ハンドブックの着水 約550 s）です。',
          'Isp is assumed to be 265 s and propellant is tuned to about 1,550 kg. The simulated flight time is 539 s (handbook splashdown about 550 s).',
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
          '発射上下角と1段分離後の姿勢変更（ラムライン制御）は公開値がないため、目標軌道（近地点 180 km × 遠地点 1,500 km、傾斜角 31°）に合うよう調整した簡易な姿勢プログラムで表しています。',
          'Launch elevation and the attitude change after stage 1 separation (rhumb-line manoeuvre) are not published, so a simple attitude program tuned to the target orbit (perigee 180 km × apogee 1,500 km, inclination 31°) is used.',
        ),
        tr(
          '計算上の3段燃焼終了速度は 8.13 km/s（公表値 8.1 km/s）、衛星分離時刻（450 s）の高度は 185 km（公表値 205 km）です。',
          'Simulated stage 3 burnout velocity is 8.13 km/s (published 8.1 km/s); altitude at satellite separation (450 s) is 185 km (published 205 km).',
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
        tr('各段の推力は推進薬質量・比推力・燃焼時間から求めた平均値（一定推力）です。', 'Each stage uses a constant average thrust derived from propellant mass, Isp and burn time.'),
        tr(
          '3段にはPBS（ポスト・ブースト・ステージ）付き形態の質量を使い、PBSの噴射は省略しています。',
          'Stage 3 uses the mass of the configuration with the PBS (post-boost stage); PBS firings are omitted.',
        ),
        tr(
          'フェアリング（0.8 t）は投棄時刻（150 s）ではなく1段分離（161 s）まで機体に含めています。',
          'The fairing (0.8 t) is carried until stage 1 separation (161 s) rather than its jettison time (150 s).',
        ),
        tr(
          '姿勢プログラムは実績軌道に合うよう調整したもので、計算上の軌道は 953 × 1,157 km・傾斜角 30.1°（実績 954 × 1,157 km・29.7°）です。',
          'The attitude program is tuned to the achieved orbit; the simulated orbit is 953 × 1,157 km at 30.1° inclination (actual 954 × 1,157 km, 29.7°).',
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
          '実機は種子島から南向きの軌道に入れるためドッグレッグ（ヨー方向の旋回）を行いますが、本モデルは真南寄りに直接打ち上げるため必要な増速が少なく、目標軌道（660 × 672 km・98°）に達した T+854 s で第2段を停止しています（実績のSECOは T+916 s）。',
          'The real vehicle flies a dogleg (yaw turn) to reach a southbound orbit from Tanegashima. This model launches directly toward the south and needs less delta-v, so the second stage is cut off at T+854 s on reaching the target orbit (660 × 672 km, 98°); the actual SECO was at T+916 s.',
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
        tr('SRB-3 と第1段の同時燃焼は「SRB分離までの段」として近似しています。', 'The combined burn of the SRB-3s and the first stage is approximated as a separate stage ending at SRB separation.'),
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
          '姿勢は簡易ピッチプログラムで、報告書の待機軌道（183.2 × 186.0 km、傾斜角 32.52°）と S-II 燃焼終了高度（187.3 km）に合うよう調整しています。方位角は報告書の飛行方位角 72.058° ではなく、傾斜角が合うよう 74.85° としています（3自由度の簡易モデルのため）。',
          "Attitude is a simple pitch program tuned to the report's parking orbit (183.2 × 186.0 km, 32.52° inclination) and S-II burnout altitude (187.3 km). The azimuth is set to 74.85° to match the inclination rather than the reported 72.058° flight azimuth (a consequence of the simplified 3DoF model).",
        ),
        tr(
          '計算上の S-IC 燃焼終了時の速度は 2,857 m/s（報告書 2,764 m/s）、高度は 66.3 km（同 66.1 km）です。',
          'Simulated S-IC burnout velocity is 2,857 m/s (report 2,764 m/s) and altitude is 66.3 km (report 66.1 km).',
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
      ? [launch.datetime_utc.year, launch.datetime_utc.month, launch.datetime_utc.day, launch.datetime_utc.hour, launch.datetime_utc.minute, launch.datetime_utc.second]
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
