// Sample vehicles built from published figures. Each preset lists its
// sources and the simplifications made, which the overview tab shows.
import type { ClientConfig } from '../lib/simulation'
import { CA_SLENDER, exitAreaFromDiameter, parallelPhase, pitchProgram, stage, vehicle } from './build'

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
  { id: 'sounding', label: '観測ロケット（弾道飛行）' },
  { id: 'orbital', label: '人工衛星打上げロケット' },
]

/* ------------------------------------------------------------ Launch sites */

const SITES = {
  // Uchinoura Space Center, KS launcher (sounding rockets)
  uchinouraKS: { lat: 31.2518, lon: 131.079, alt: 276 },
  // Interstellar Technologies launch site, Taiki, Hokkaido (approximate)
  taiki: { lat: 42.5, lon: 143.44, alt: 15 },
  // Uchinoura Space Center, M-V / Epsilon launcher
  uchinouraMV: { lat: 31.251, lon: 131.082, alt: 270 },
  // Tanegashima Space Center, Yoshinobu launch complex
  yoshinobu: { lat: 30.4022, lon: 130.975, alt: 20 },
}


/* ---------------------------------------------------------- Sounding rockets */

// Calibrated total-impulse factors: thrust is scaled so that the simulated
// apogee matches the published flight record (see the notes on each preset).
const CAL = {
  s310: 1.2213, // apogee 180 km
  s520: 0.9116, // apogee 304 km
  momoIsp: 206.72, // apogee 113.4 km
  momoElevation: 86.71, // splashdown 37 km
  ss520Stage1: 1.3752, // 2.0 km/s at 26 km at stage-1 burnout
}

function s310(): ClientConfig {
  // S-310-40 flight record: elevation 76°, apogee 180 km, 727 kg, burnout ~28 s.
  const isp = 250 // assumed
  const burn = 28
  const propellant = 380 * CAL.s310
  return vehicle({
    name: 'S-310（40号機の飛行実績）',
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
    name: 'S-520（33号機の飛行実績）',
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
    name: 'MOMO（3号機の飛行実績）',
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

/* ----------------------------------------------------------------- Epsilon */

function epsilon(): ClientConfig {
  // Epsilon test flight / SPRINT-A (Hisaki), 2013-09-14.
  // Event times from the flight results (planned values), converted to
  // stage-local times: 1/2 sep 161, 2nd ign 165, 2/3 sep 624, 3rd ign 628.
  const payload = 348
  return vehicle({
    name: 'Epsilon（試験機 / ひさき）',
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
    name: 'H-IIA 202（50号機 / いぶきGW）',
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
    name: 'H3-22S（試験機1号機の計画値）',
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

const ISAS_HANDBOOK = { label: 'JAXA/ISAS 観測ロケット ユーザーハンドブック（3章 機体概要、付録B 飛行実績）', url: 'https://www.isas.jaxa.jp/home/kansoku/images/pdf/RSL-2018012H_%E8%A6%B3%E6%B8%AC%E3%83%AD%E3%82%B1%E3%83%83%E3%83%88_%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%BC%E3%83%8F%E3%83%B3%E3%83%89%E3%83%96%E3%83%83%E3%82%AF(%E5%85%AC%E9%96%8B%E7%94%A8).pdf' }
const ISAS_S310 = { label: 'JAXA/ISAS S-310 主要諸元', url: 'https://www.isas.jaxa.jp/home/kansoku/rocket/s310.html' }
const ISAS_S520 = { label: 'JAXA/ISAS S-520 主要諸元', url: 'https://www.isas.jaxa.jp/home/kansoku/rocket/s520.html' }
const JAXA_SROCKETS = { label: 'JAXA 観測ロケット（諸元一覧）', url: 'https://global.jaxa.jp/projects/rockets/s_rockets/index.html' }
const MEXT_SS520_5 = { label: '文部科学省 SS-520 5号機のミッション概要（飛行シーケンス・目標軌道）', url: 'https://www.mext.go.jp/b_menu/shingi/gijyutu/gijyutu2/060/shiryo/__icsFiles/afieldfile/2017/10/12/1396928_13.pdf' }
const JAXA_SS520_5 = { label: 'JAXA SS-520 5号機 説明資料（全備質量・衛星）', url: 'https://www.isas.jaxa.jp/topics/files/20180202_ss-520-5.pdf' }
const OT_SS520_4 = { label: 'OpenTsiolkovsky 同梱 SS-520-4 設定例（推力履歴・比推力）', url: 'https://github.com/istellartech/OpenTsiolkovsky/tree/master/examples/SS-520-4' }
const IST_MOMO_F3 = { label: 'インターステラテクノロジズ MOMO3号機（主要諸元）', url: 'https://www.istellartech.com/technology/momo_f3/' }
const IST_MOMO_F3_PR = { label: 'インターステラテクノロジズ プレスリリース 2019-05-05（到達高度・飛行時間）', url: 'https://www.istellartech.com/7hbym/wp-content/uploads/2019/05/IST-PressRelease_2019050501.pdf' }

const SOUNDING_NOTES = [
  '推力・比推力・推進薬量は公開されていないため、比推力を仮定し、全備質量・燃焼時間・発射上下角を飛行実績に合わせたうえで、最高到達高度が実績と一致するよう総力積を調整しています。',
  '打上げ方位角は公開値が見当たらないため仮定値です。',
]

const JAXA_EPSILON_PRESSKIT = { label: 'JAXA イプシロンロケット試験機 プレスキット（主要諸元）', url: 'https://fanfun.jaxa.jp/countdown/epsilon/files/presskit_epsilon_j.pdf' }
const JAXA_EPSILON_RESULT = { label: 'JAXA イプシロンロケット試験機の打上げ結果（飛行シーケンス・軌道）', url: 'https://www.jaxa.jp/press/2013/12/20131224_epsilon_j.pdf' }
const JAXA_HISAKI = { label: 'JAXA 惑星分光観測衛星「ひさき」パンフレット（衛星質量）', url: 'https://www.jaxa.jp/projects/pr/brochure/pdf/04/sat35.pdf' }
const MHI_H2A_MANUAL = { label: '三菱重工 H-IIA ユーザーズマニュアル Ver.4.0（Table 1.3-1）', url: 'https://www.mhi.com/jp/products/pdf/manual.pdf' }
const JAXA_H2A_LEAFLET = { label: 'JAXA H-IIAロケット リーフレット（主要諸元）', url: 'https://www.jaxa.jp/projects/pr/model/files/p_h2a_2025.pdf' }
const MEXT_H2A_F50 = { label: '文部科学省 宇宙開発利用部会 資料 H-IIA 50号機 打上げ結果（飛行シーケンス）', url: 'https://www.mext.go.jp/content/20250703-mxt_uchukai01-000043486_000002.pdf' }
const MELCO_GOSATGW = { label: '三菱電機 GOSAT-GW（衛星質量）', url: 'https://www.mitsubishielectric.co.jp/society/space/satellite/observation/gosat_gw.html' }
const MEXT_H3_TF1 = { label: '文部科学省 H3試験機1号機 調査報告（主要諸元・計画シーケンス）', url: 'https://www.mext.go.jp/content/20231026-mxt_uchukai01-000030341_3.pdf' }
const JAXA_H3_LEAFLET = { label: 'JAXA H3ロケット リーフレット', url: 'https://www.jaxa.jp/projects/pr/model/files/p_h3_2025.pdf' }

const ORBITAL_NOTES = [
  'ノズル出口面積（地上での推力低下に効く）は公開値が見当たらないため推定値です。',
  '姿勢は時刻テーブルで与えた簡易プログラムで、実機の誘導則ではありません。',
]

export const PRESET_OPTIONS: PresetOption[] = [
  {
    id: 'momo',
    label: 'MOMO',
    kind: '単段 液体 観測ロケット',
    category: 'sounding',
    site: '北海道 大樹町',
    description: 'インターステラテクノロジズの観測ロケット。民間単独開発として国内初の宇宙空間到達を果たした3号機（2019年、最高到達高度 113.4 km）の実績で構成。',
    modelNotes: [
      '公表推力 12 kN（地上推力として扱う）・燃焼時間 116 s・全備質量 1,150 kg を固定し、最高到達高度 113.4 km と着水点までの距離 37 km に合うよう比推力（206.7 s）と発射上下角（86.7°）を調整しています。推進薬は約 870 kg になります。',
      '計算上の最高到達時刻は T+244 s（公表 T+240 s）。計算上の飛行時間は 394 s で公表の 515 s より短く、降下中の空気抵抗の違いによるものと考えられます。',
      'ノズル出口径と発射地点の座標は推定・概略です。',
    ],
    sources: [IST_MOMO_F3, IST_MOMO_F3_PR],
    create: momo,
  },
  {
    id: 's310',
    label: 'S-310',
    kind: '単段 固体 観測ロケット',
    category: 'sounding',
    site: '鹿児島 内之浦',
    description: 'JAXAの小型観測ロケット（直径31 cm）。40号機の実績（上下角76°、全備727 kg、最高到達高度 約180 km）で構成。',
    modelNotes: [
      ...SOUNDING_NOTES,
      '推力の時間変化は「前半大推力・後半小推力」という公開情報に沿った形で、数値は例示です。',
      '比推力 250 s を仮定し、推進薬は約 464 kg に調整。計算上の飛行時間は 406 s（ハンドブックの着水 約400 s）です。',
    ],
    sources: [ISAS_HANDBOOK, ISAS_S310, JAXA_SROCKETS],
    create: s310,
  },
  {
    id: 's520',
    label: 'S-520',
    kind: '単段 固体 観測ロケット',
    category: 'sounding',
    site: '鹿児島 内之浦',
    description: 'JAXAの主力観測ロケット（直径52 cm）。33号機の実績（上下角79°、全備2,273 kg、最高到達高度 約304 km）で構成。',
    modelNotes: [
      ...SOUNDING_NOTES,
      'ノズル膨張比 8 は公開値、出口径は推定です。',
      '比推力 265 s を仮定し、推進薬は約 1,550 kg に調整。計算上の飛行時間は 536 s（ハンドブックの着水 約550 s）です。',
    ],
    sources: [ISAS_HANDBOOK, ISAS_S520, JAXA_SROCKETS],
    create: s520,
  },
  {
    id: 'ss520-5',
    label: 'SS-520-5',
    kind: '3段 固体 超小型衛星打上げ',
    category: 'orbital',
    site: '鹿児島 内之浦',
    description: '2018年に約3 kgの超小型衛星 TRICOM-1R を軌道に投入した、世界最小級の衛星打上げロケット。公表された飛行シーケンス（1段燃焼 0–31.7 s、2段 180–204.4 s、3段 238–263.6 s）で構成。',
    modelNotes: [
      '推力履歴の形と2・3段の質量・比推力は OpenTsiolkovsky 同梱の SS-520-4 設定例の値です。',
      '1段は比推力を S-520 と同じ 265 s と仮定し、燃焼終了時（31.7 s）の高度 26 km・速度 2.0 km/s に合うよう総力積を調整しています。1段の質量は全備 2.6 t に合うよう設定しています。',
      '3段の推進薬量は 78 kg（JAXA 説明会の報道値）です。',
      '発射上下角と1段分離後の姿勢変更（ラムライン制御）は公開値がないため、目標軌道（近地点 180 km × 遠地点 1,500 km、傾斜角 31°）に合うよう調整した簡易な姿勢プログラムで表しています。',
      '計算上の3段燃焼終了速度は 8.13 km/s（公表値 8.1 km/s）、衛星分離時刻（450 s）の高度は 185 km（公表値 205 km）です。',
    ],
    sources: [MEXT_SS520_5, JAXA_SS520_5, OT_SS520_4],
    create: ss520_5,
  },
  {
    id: 'epsilon',
    label: 'イプシロン',
    kind: '3段式 固体ロケット',
    category: 'orbital',
    site: '鹿児島 内之浦',
    description: '試験機（2013年、惑星分光観測衛星「ひさき」）の主要諸元と飛行シーケンスで構成。近地点 約950 km・遠地点 約1,150 km の軌道を狙った飛行。',
    modelNotes: [
      '各段の推力は推進薬質量・比推力・燃焼時間から求めた平均値（一定推力）です。',
      '3段にはPBS（ポスト・ブースト・ステージ）付き形態の質量を使い、PBSの噴射は省略しています。',
      'フェアリング（0.8 t）は投棄時刻（150 s）ではなく1段分離（161 s）まで機体に含めています。',
      '姿勢プログラムは実績軌道に合うよう調整したもので、計算上の軌道は 953 × 1,157 km・傾斜角 30.1°（実績 954 × 1,157 km・29.7°）です。',
      ...ORBITAL_NOTES,
    ],
    sources: [JAXA_EPSILON_PRESSKIT, JAXA_EPSILON_RESULT, JAXA_HISAKI],
    create: epsilon,
  },
  {
    id: 'h2a202',
    label: 'H-IIA 202',
    kind: '2段式 液体ロケット + 固体ブースタ2本',
    category: 'orbital',
    site: '鹿児島 種子島',
    description: '50号機（2025年、温室効果ガス・水循環観測技術衛星「いぶきGW」）の実績シーケンスで構成。高度 約666 km の太陽同期軌道へ。',
    modelNotes: [
      'SRB-A と第1段の同時燃焼は「SRB分離までの段」として近似しています（推進薬質量と総力積は一致させています）。',
      '第2段の推進薬はSELIからSECOまでの燃焼時間と推力・比推力から算出しています。',
      'フェアリング質量は公開値が見当たらないため含めていません。',
      '実機は種子島から南向きの軌道に入れるためドッグレッグ（ヨー方向の旋回）を行いますが、本モデルは真南寄りに直接打ち上げるため必要な増速が少なく、目標軌道（660 × 672 km・98°）に達した T+854 s で第2段を停止しています（実績のSECOは T+916 s）。',
      ...ORBITAL_NOTES,
    ],
    sources: [MHI_H2A_MANUAL, JAXA_H2A_LEAFLET, MEXT_H2A_F50, MELCO_GOSATGW],
    create: h2a202,
  },
  {
    id: 'h3-22s',
    label: 'H3-22S',
    kind: '2段式 液体ロケット + 固体ブースタ2本',
    category: 'orbital',
    site: '鹿児島 種子島',
    description: '試験機1号機（ALOS-3）の主要諸元と計画シーケンスで構成した、計画どおり飛んだ場合の飛行。高度 約675 km の太陽同期軌道へ。',
    modelNotes: [
      '実際の試験機1号機は第2段が着火せず失敗しています。ここでは公表された計画値を使っています。',
      'SRB-3 の比推力は公開値が見当たらないため SRB-A と同程度（283 s）と仮定しています。',
      'SRB-3 と第1段の同時燃焼は「SRB分離までの段」として近似しています。',
      'フェアリング（約1.8 t）は投棄時刻（211 s）ではなく1/2段分離（303 s）まで機体に含めています。',
      'H-IIA と同じ理由（ドッグレッグなし）で、目標軌道（約 670 × 680 km・98°）に達した T+864 s で第2段を停止しています（計画のSECOは T+982 s）。',
      ...ORBITAL_NOTES,
    ],
    sources: [MEXT_H3_TF1, JAXA_H3_LEAFLET],
    create: h3_22s,
  },
]
