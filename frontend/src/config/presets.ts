// Sample vehicles built from published figures (configurations in
// examples/*.json). Each preset lists its sources and the simplifications
// made, which the overview tab shows.
import type { Config } from '../lib/config'
import { tr } from '../lib/i18n'
import { siteById } from './sites'

export interface PresetSource {
  label: string
  url: string
}

export interface PresetReviewPoint {
  label: string
  basis: 'assumed' | 'secondary' | 'borrowed' | 'simplified'
  detail: string
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
  /** Specific values and modelling choices that still need checking. */
  reviewPoints: PresetReviewPoint[]
  sources: PresetSource[]
  create: () => Config
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

/* ------------------------------------------------------------ Vehicle data */

// The configurations live in examples/<id>.json, shared with the CLI; this
// file adds what the picker and the overview tab show about them.
const EXAMPLES = import.meta.glob<Config>('../../../examples/*.json', { eager: true, import: 'default' })

/** Fresh copy of examples/<id>.json, named in the current language */
const example = (id: string, name: () => string) => (): Config => {
  const config = EXAMPLES[`../../../examples/${id}.json`]
  if (!config) throw new Error(`examples/${id}.json not found`)
  return { ...structuredClone(config), name: name() }
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
const JAXA_H3_TF1_PLAN = src(
  'JAXA 令和4年度ロケット打上げ計画書 ALOS-3/H3・TF1（飛行計画・方位角・落下予想区域）',
  'JAXA, FY2022 launch plan ALOS-3 / H3 TF1 (flight plan, azimuth, expected drop zones)',
  'https://www.jaxa.jp/press/2022/12/files/jaxa20221223-1-1a.pdf',
)
const JCG_H3_TF1 = src(
  '第十管区海上保安本部 水路通報 令和5年第6号（H3試験機1号機の落下予想区域）',
  'Japan Coast Guard 10th Region Notice to Mariners 2023 No. 6 (H3 TF1 drop zones)',
  'https://www1.kaiho.mlit.go.jp/KAN10/koukai/PDF/2306.pdf',
)
const JCG_H2A_F50 = src(
  '第十管区海上保安本部 水路通報 令和7年第21号（H-IIA 50号機 固体ロケットブースタの落下予想区域）',
  'Japan Coast Guard 10th Region Notice to Mariners 2025 No. 21 (H-IIA F50 SRB-A drop zone)',
  'https://www1.kaiho.mlit.go.jp/KAN10/koukai/PDF/2521.pdf',
)
const JAXA_H2A_F40_PLAN = src(
  'JAXA 平成30年度ロケット打上げ計画書 GOSAT-2/H-IIA F40（方位角・飛行計画・落下予想区域、J. McDowell 氏のミラー）',
  "JAXA, FY2018 launch plan GOSAT-2 / H-IIA F40 (azimuth, flight plan, expected drop zones; Jonathan McDowell's mirror)",
  'https://planet4589.org/space/misc/h40.pdf',
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
const NGA_NAVAREA4_PACE = src(
  'NGA 航行警報 NAVAREA IV 133/24（PACE打上げの危険区域。過去の警報は MSI の API で取得）',
  'NGA broadcast warning NAVAREA IV 133/24 (PACE launch hazard areas; past warnings via the MSI API)',
  'https://msi.nga.mil/api/publications/broadcast-warn?msgYear=2024&navArea=4&status=all&output=json',
)
const NSF_PACE = src(
  'NASASpaceflight: PACE 打上げ（フェアリングを回収船 Bob が回収）',
  'NASASpaceflight: PACE launch (fairing halves retrieved by the support ship Bob)',
  'https://www.nasaspaceflight.com/2024/02/pace-launch/',
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

const review = (ja: string, en: string, basis: PresetReviewPoint['basis'], detailJa: string, detailEn: string): PresetReviewPoint => ({
  label: tr(ja, en),
  basis,
  detail: tr(detailJa, detailEn),
})

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
    get reviewPoints() {
      return [
        review(
          '比推力・推進薬量',
          'Isp and propellant mass',
          'assumed',
          '最高高度と着水距離に合うよう調整した値です。実測の推進データとの照合が必要です。',
          'Tuned to match apogee and splashdown range; measured propulsion data is needed to check them.',
        ),
        review(
          'ノズル出口径・射場座標',
          'Nozzle exit and launch coordinates',
          'assumed',
          '出口径は推定、座標は概略です。機体図面と射点の位置情報で確認が必要です。',
          'The exit diameter is estimated and coordinates are approximate; check against drawings and launch-point coordinates.',
        ),
        review(
          '姿勢・降下中の空気抵抗',
          'Guidance and descent drag',
          'assumed',
          '姿勢は実績に合わせた計算用の設定です。飛行時間は公表値と差があり、降下中の抗力も確認が必要です。',
          'Guidance is tuned for this model. Flight duration differs from the published value, so descent drag also needs checking.',
        ),
      ]
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
    create: example('momo', () => tr('MOMO（3号機の飛行実績）', 'MOMO (Flight 3 record)')),
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
    get reviewPoints() {
      return [
        review(
          '推力履歴・比推力・推進薬量',
          'Thrust history, Isp and propellant',
          'assumed',
          '非公表の値を仮定し、最高高度に合うよう調整しています。実際の推力・質量データで確認が必要です。',
          'Unpublished values are assumed and tuned to apogee; actual thrust and mass data is needed to check them.',
        ),
        review(
          '打上げ方位・姿勢',
          'Launch azimuth and attitude',
          'assumed',
          '方位角は仮定値です。姿勢も迎角ゼロを仮定しており、実際の飛行経路との照合が必要です。',
          'Azimuth is assumed and attitude follows a zero-angle-of-attack approximation; check against the actual flight path.',
        ),
      ]
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
    create: example('s310', () => tr('S-310（40号機の飛行実績）', 'S-310 (Flight 40 record)')),
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
    get reviewPoints() {
      return [
        review(
          '比推力・推進薬量',
          'Isp and propellant mass',
          'assumed',
          '比推力を仮定し、最高高度に合うよう推進薬量を調整しています。実際の推進データで確認が必要です。',
          'Isp is assumed and propellant is tuned to apogee; actual propulsion data is needed to check them.',
        ),
        review(
          'ノズル出口径',
          'Nozzle exit diameter',
          'assumed',
          '膨張比は公表値ですが、出口径は推定です。ノズル形状の確認が必要です。',
          'Expansion ratio is published, but exit diameter is estimated; nozzle geometry needs checking.',
        ),
        review(
          '打上げ方位・姿勢',
          'Launch azimuth and attitude',
          'assumed',
          '方位角は仮定値、姿勢は迎角ゼロを仮定した設定です。実際の飛行経路との照合が必要です。',
          'Azimuth is assumed and attitude follows a zero-angle-of-attack approximation; check against the actual flight path.',
        ),
      ]
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
    create: example('s520', () => tr('S-520（33号機の飛行実績）', 'S-520 (Flight 33 record)')),
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
    get reviewPoints() {
      return [
        review(
          '第2・3段の諸元',
          'Stage 2 and 3 specifications',
          'borrowed',
          '同梱のSS-520-4設定例から転用した値です。5号機にも適用できるか確認が必要です。',
          'Taken from the bundled SS-520-4 example; applicability to Flight 5 needs checking.',
        ),
        review(
          '第1段の比推力・推力履歴',
          'Stage 1 Isp and thrust history',
          'assumed',
          '比推力はS-520と同じと仮定し、推力は燃焼終了時の高度・速度に合わせています。実測値との照合が必要です。',
          'Isp is assumed equal to S-520 and thrust is tuned to burnout altitude and speed; check against measured data.',
        ),
        review(
          '発射角・姿勢変更',
          'Launch elevation and attitude changes',
          'assumed',
          '公開値が見当たらないため、目標軌道に合うよう調整しています。実際の姿勢履歴の確認が必要です。',
          'No published values were found, so these are tuned to the target orbit; the actual attitude history is needed.',
        ),
      ]
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
    create: example('ss520-5', () => 'SS-520-5（TRICOM-1R）'),
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
    get reviewPoints() {
      return [
        review(
          '推力の時間変化',
          'Thrust history',
          'simplified',
          '推進薬量・比推力・燃焼時間から一定の平均推力を求めています。実際の推力履歴との違いを確認する必要があります。',
          'Constant average thrust is derived from propellant, Isp and burn time; differences from the real thrust history need checking.',
        ),
        review(
          'PBS・フェアリングの扱い',
          'PBS and fairing modelling',
          'simplified',
          'PBSの噴射を省略し、フェアリング投棄を段分離まで遅らせています。投入軌道と質量への影響を確認する必要があります。',
          'PBS firings are omitted and fairing release is delayed to stage separation; check the effects on insertion and mass.',
        ),
        review(
          '姿勢・ノズル出口面積',
          'Attitude and nozzle exit areas',
          'assumed',
          '姿勢は実績軌道に合わせた設定、出口面積は推定です。実際の誘導とエンジン形状の確認が必要です。',
          'Attitude is tuned to the achieved orbit and nozzle areas are estimated; actual guidance and engine geometry need checking.',
        ),
      ]
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
    create: example('epsilon', () => tr('Epsilon（試験機 / ひさき）', 'Epsilon (test flight / Hisaki)')),
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
    get reviewPoints() {
      return [
        review(
          'ブースタ燃焼終了時刻',
          'Booster burnout time',
          'borrowed',
          '別号機の計画値を使っています。50号機の実績値と一致するか確認が必要です。',
          'Uses a planned value from another flight; consistency with Flight 50 needs checking.',
        ),
        review(
          '発射方位・旋回経路',
          'Launch azimuth and dogleg',
          'assumed',
          '落下予想区域に合うよう推定・調整した経路です。50号機の実際の誘導履歴との照合が必要です。',
          'Estimated and tuned to published drop zones; check against Flight 50’s actual guidance history.',
        ),
        review(
          'フェアリング質量',
          'Fairing mass',
          'simplified',
          '公開値が見当たらず、モデルには含めていません。実際の質量と投棄による変化の確認が必要です。',
          'Not included because no published value was found; actual mass and its release need checking.',
        ),
      ]
    },
    get modelNotes() {
      return [
        tr(
          'SRB-A と第1段の同時燃焼は「SRB分離までの計算区間」として近似し、SRB-A の燃焼終了（108 s、41号機計画書の値）までは両方、その後は第1段だけの推力・比推力にしています（推進薬質量と総力積は一致）。',
          'The combined burn of the SRB-As and the first stage is approximated as a separate calculation interval ending at SRB separation, with both burning until SRB-A burnout (108 s, from the F40 launch plan) and the first stage alone after that (propellant mass and total impulse are preserved).',
        ),
        tr(
          '第2段の推進薬はSELIからSECOまでの燃焼時間と推力・比推力から算出しています。',
          'Second-stage propellant is computed from the SELI-to-SECO burn time, thrust and Isp.',
        ),
        tr('フェアリング質量は公開値が見当たらないため含めていません。', 'Fairing mass is not included, as no published value was found.'),
        tr(
          '計算上の SRB-A 分離時の高度は 52.8 km（41号機計画 54 km）、MECO 時は 270 km（同 271 km）。第1段の落下点は北緯 9.9°・東経 132.5° で、41号機の第1段落下予想区域（北緯 10.5〜14.3°）の約70 km 南です（50号機の区域は見つかっていません）。目標軌道（660 × 672 km・98°）には T+902 s で達し、第2段を停止します（実績のSECOは T+916 s）。',
          'Simulated altitude at SRB-A separation is 52.8 km (F40 plan 54 km) and 270 km at MECO (271 km). The first stage comes down at 9.9°N 132.5°E, about 70 km south of the F40 first-stage drop zone (10.5–14.3°N; no F50 zone was found). The target orbit (660 × 672 km, 98°) is reached at T+902 s, when stage 2 is cut off (actual SECO T+916 s).',
        ),
        tr(
          '種子島からの太陽同期軌道打上げは、瞬間落下点（IIP）が南大東島・北大東島や沖縄、フィリピンにかからないよう、東南東へ打ち上げてから南へ旋回するドッグレッグ経路をとります。50号機の方位角は公開されていないため、海上保安庁の水路通報にある50号機の固体ロケットブースタ落下予想区域に落下点が入るよう 114.3° と推定しました（同型の41号機（GOSAT-2）の計画書では 106°）。SRB分離後に右へ旋回し、計算上の経路は東経約133°まで張り出して大東諸島の約2°東、フィリピンの東方を南下します。',
          "Sun-synchronous launches from Tanegashima fly a dogleg: east-southeast first, then a turn south, so that the instantaneous impact point (IIP) stays clear of the Daito Islands, Okinawa and the Philippines. F50's azimuth is not published, so it is estimated at 114.3° to put the boosters' impact inside the F50 SRB drop zone in the Japan Coast Guard notice (the F40 / GOSAT-2 launch plan of the same type gives 106°). The vehicle turns right after SRB separation; the simulated track reaches about 133°E, passing about 2° east of the Daito Islands and east of the Philippines.",
        ),
        ...orbitalNotes(),
      ]
    },
    sources: [MHI_H2A_MANUAL, JAXA_H2A_LEAFLET, MEXT_H2A_F50, JCG_H2A_F50, JAXA_H2A_F40_PLAN, MELCO_GOSATGW],
    create: example('h2a202', () => tr('H-IIA 202（50号機 / いぶきGW）', 'H-IIA 202 (F50 / IBUKI GW)')),
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
    get reviewPoints() {
      return [
        review(
          'SRB-3の比推力',
          'SRB-3 Isp',
          'assumed',
          '公開値が見当たらないためSRB-Aと同程度と仮定しています。SRB-3の実測値で確認が必要です。',
          'Assumed similar to SRB-A because no published value was found; measured SRB-3 data is needed.',
        ),
        review(
          '飛行結果・姿勢プログラム',
          'Flight outcome and guidance',
          'assumed',
          '第2段が正常に着火した場合の計算例です。実際の試験機1号機は第2段が着火せず、軌道投入していません。',
          'Models successful stage 2 ignition. The actual Test Flight 1 did not ignite stage 2 or reach orbit.',
        ),
        review(
          'ノズル出口面積',
          'Nozzle exit areas',
          'assumed',
          '公開値が見当たらないため推定しています。実際のエンジン形状との照合が必要です。',
          'Estimated because no published values were found; check against actual engine geometry.',
        ),
      ]
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
          'SRB-3 と第1段の同時燃焼は「SRB分離までの計算区間」として近似し、SRB-3 の燃焼中（約110 s）は両方、その後は第1段だけの推力・比推力にしています。',
          'The combined burn of the SRB-3s and the first stage is approximated as a separate calculation interval ending at SRB separation, with both burning for the SRB-3 burn (about 110 s) and the first stage alone after that.',
        ),
        tr(
          'フェアリング（約1.8 t）は計画の分離時刻（211 s）に投棄物として切り離しています。',
          'The fairing (about 1.8 t) is released as a jettisoned product at the planned separation time (211 s).',
        ),
        tr(
          '経路は JAXA の打上げ計画書に合わせています。公表の方位角 90.8° で真東へ打ち上げ、SRB分離後に右へ旋回して南下するドッグレッグで、瞬間落下点は大東諸島の東方を通ります。固体ロケットブースタ・フェアリング・第1段の落下点がいずれも計画書の落下予想区域に入るよう、また計画書の飛行経路図の位置（フェアリング分離・MECO）に合うよう調整し、計算上の位置の差は約20〜30 km です。第2段は計画どおり T+982 s まで燃焼し、計算上の軌道は 669 × 683 km・傾斜角 98.10° です。',
          "The path follows JAXA's launch plan: due east at the published 90.8° azimuth, then a turn to the right after SRB separation into a southbound dogleg, which keeps the instantaneous impact point east of the Daito Islands. It is tuned so the SRB-3s, the fairing and the first stage all land inside the plan's expected drop zones and so the track passes the plan's positions at fairing separation and MECO (within about 20–30 km). Stage 2 burns to the planned SECO at T+982 s; the simulated orbit is 669 × 683 km at 98.10°.",
        ),
        ...orbitalNotes(),
      ]
    },
    sources: [JAXA_H3_TF1_PLAN, MEXT_H3_TF1, JCG_H3_TF1, JAXA_H3_LEAFLET],
    create: example('h3-22s', () => tr('H3-22S（試験機1号機の計画値）', 'H3-22S (Test Flight 1, planned)')),
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
    get reviewPoints() {
      return [
        review(
          '第1段の真空比推力',
          'Stage 1 vacuum Isp',
          'assumed',
          '飛行評価報告書に値がないため、燃焼終了時の高度・速度に合わせています。エンジンの実測値との照合が必要です。',
          'Not given in the flight report, so tuned to burnout altitude and speed; check against measured engine data.',
        ),
        review(
          '打上げ方位・姿勢',
          'Launch azimuth and attitude',
          'assumed',
          '報告書の方位角をそのまま使わず、投入軌道に合うよう調整しています。実際の誘導履歴との照合が必要です。',
          'Azimuth and attitude are tuned to insertion rather than copied from the report; check against actual guidance history.',
        ),
        review(
          '脱出塔・段間部の投棄',
          'Escape tower and interstage release',
          'simplified',
          '個別の投棄を段分離にまとめています。投棄時刻と飛行中の質量変化を確認する必要があります。',
          'Individual releases are lumped into stage separation; release times and in-flight mass changes need checking.',
        ),
      ]
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
    create: example('saturn-v', () => tr('サターンV（アポロ11号）', 'Saturn V (Apollo 11)')),
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
    get reviewPoints() {
      return [
        review(
          'EAPのノズル出口径',
          'EAP nozzle exit diameter',
          'assumed',
          '公開値が見当たらないため推定しています。ブースタの形状資料で確認が必要です。',
          'Estimated because no published value was found; check against booster geometry data.',
        ),
        review(
          '姿勢プログラム',
          'Attitude program',
          'assumed',
          '目標軌道に合わせた設定です。傾斜角は計算4.4°・目標3°と差があり、実際の誘導の確認が必要です。',
          'Tuned to the target orbit. Simulated inclination is 4.4° versus the 3° target; actual guidance needs checking.',
        ),
        review(
          '全備質量・フェアリング投棄',
          'Liftoff mass and fairing release',
          'simplified',
          '全備質量は公表値と差があり、フェアリング投棄も段分離まで遅らせています。質量内訳と投棄時刻の確認が必要です。',
          'Liftoff mass differs from the published value and fairing release is delayed; mass breakdown and release time need checking.',
        ),
      ]
    },
    get modelNotes() {
      return [
        tr(
          '固体ブースタ EAP（各 277 t・推進薬 240 t・比推力 274.5 s・燃焼 130 s）と主段 EPC の同時燃焼は「EAP 分離（離昇後 136.7 s）までの計算区間」として近似しています。',
          'The combined burn of the EAP solid boosters (each 277 t, 240 t propellant, Isp 274.5 s, 130 s burn) and the EPC main stage is approximated as a separate calculation interval ending at EAP separation (136.7 s after liftoff).',
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
    create: example('ariane5', () => tr('アリアン5 ECA（VA247）', 'Ariane 5 ECA (VA247)')),
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
    get reviewPoints() {
      return [
        review(
          '段質量・推進薬量・フェアリング',
          'Stage, propellant and fairing masses',
          'secondary',
          '公式に公表された段別の値がなく、二次資料の推定値を使っています。機体の実測値との照合が必要です。',
          'Uses secondary-source estimates because official stage data is unavailable; check against measured vehicle data.',
        ),
        review(
          '推力調整・燃焼終了時刻',
          'Throttling and engine cutoff',
          'simplified',
          '実際の推力履歴は未確認です。一定の全推力を使うため、上段の停止時刻が公表値より早くなっています。',
          'Actual thrust history is unconfirmed. Constant full thrust makes upper-stage cutoff earlier than the published time.',
        ),
        review(
          '旋回経路・落下区域の解釈',
          'Dogleg and drop-zone interpretation',
          'assumed',
          '航行警報の区域に合うよう経路を調整しています。旋回の時刻・量と、区域の用途の解釈は確認が必要です。',
          'The path is tuned to navigation-warning areas; turn timing, magnitude and the interpretation of zone purposes need checking.',
        ),
      ]
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
          '第2段の姿勢プログラムは目標軌道に合うよう調整したもので、射場帰還のため第1段は高めに上昇します（計算上の MECO は高度 94 km・2.10 km/s、Max-Q は T+60 s で公表 T+67 s）。計算上の軌道は 662 × 679 km・傾斜角 98.00°（目標 676.5 km 円軌道・98°）です。',
          'The stage 2 attitude program is tuned to the target orbit; stage 1 climbs steeply, as for a return to the launch site (simulated MECO at 94 km and 2.10 km/s; max-Q at T+60 s, published T+67 s). The simulated orbit is 662 × 679 km at 98.00° (target 676.5 km circular, 98°).',
        ),
        tr(
          'フェアリングは公表の分離時刻（T+255 s）に投棄物として切り離しています。経路は、NGA の航行警報（NAVAREA IV 133/24）にある PACE 打上げの危険区域に合うよう調整しました。フェアリングは射点から約470 km、ケイサル・バンク北方の区域Cに落ち（回収船 Bob が約475 km 先で回収したとの報道と一致）、帰還しなかった場合の第1段は約280 km 先、グランドバハマ島西方の区域Bに落ちます（区域Bの用途は警報に明記されておらず、第1段用と推定）。',
          'The fairing is released as a jettisoned product at the published deploy time (T+255 s). The path is tuned to the PACE launch hazard areas in the NGA broadcast warning NAVAREA IV 133/24: the fairing comes down about 470 km out in area C, north of Cay Sal Bank (matching reports that the ship Bob recovered it about 475 km downrange), and a stage 1 that did not fly back would fall about 280 km out in area B, west of Grand Bahama (the warning does not say what area B is for; a first-stage area is assumed).',
        ),
        tr(
          '経路はケープカナベラルの南向き極軌道コリドーに沿わせています。方位角 131.5° で南東の沖合へ打ち上げ（危険区域A・Bの方向。第1段の瞬間落下点はフロリダ沿岸の沖に留まります）、第2段で右へ旋回するドッグレッグを行ってフロリダ東岸の沖を南下し、高高度でキューバ上空を通過して 98° の軌道に入ります。旋回のタイミングと量は推定です。',
          "The path follows Cape Canaveral's southbound polar corridor: launch at a 131.5° azimuth to the southeast, offshore (toward hazard areas A and B; the stage 1 instantaneous impact point stays off the Florida coast), then a dogleg to the right by stage 2 to run south off Florida's east coast and cross Cuba at high altitude into the 98° orbit. The timing and size of the turn are estimates.",
        ),
        ...orbitalNotes(),
      ]
    },
    sources: [
      SPACEX_F9,
      SPACEX_UG,
      SPACEX_PACE,
      NASA_PACE_TIMELINE,
      NASA_PACE_SC,
      NASA_PACE_ORBIT,
      NGA_NAVAREA4_PACE,
      NSF_PACE,
      SFN_SAOCOM1B,
      WP_F9B5,
    ],
    create: example('falcon9', () => tr('ファルコン9（PACE）', 'Falcon 9 (PACE)')),
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
    get reviewPoints() {
      return [
        review(
          '段諸元・フェアリング質量',
          'Stage specifications and fairing mass',
          'borrowed',
          'クールー版・Soyuz/ST版の資料と商業用フェアリングの値を使っています。プログレス打上げへの適用を確認する必要があります。',
          'Uses Kourou/Soyuz-ST data and a commercial fairing mass; applicability to the Progress launch needs checking.',
        ),
        review(
          '宇宙船質量',
          'Spacecraft mass',
          'secondary',
          '宇宙船質量は二次資料の値です。打上げ時の正式な質量との照合が必要です。',
          'Spacecraft mass comes from a secondary source; check against the official launch mass.',
        ),
        review(
          '姿勢・段間の点火',
          'Attitude and stage ignition',
          'simplified',
          '姿勢は投入軌道に合わせ、実機のホットステージングを省略しています。姿勢履歴と点火・分離の重なりを確認する必要があります。',
          'Attitude is tuned to insertion and hot staging is omitted; attitude history and ignition/separation overlap need checking.',
        ),
      ]
    },
    get modelNotes() {
      return [
        tr(
          '第1・2段（ブースタ 各44.4 t・推進薬 39.2 t／コア 99.8 t・推進薬 90.1 t、いずれも真空比推力 319 s）はクールー版ユーザーズマニュアルの値です。ブースタとコアの同時燃焼は「ブースタ分離（117.85 s）までの計算区間」として近似し、ノズル出口面積は真空／海面推力の差から求めています。',
          "Stages 1 and 2 (boosters 44.4 t each with 39.2 t propellant; core 99.8 t with 90.1 t; both 319 s vacuum Isp) are from the Kourou user's manual. The combined booster and core burn is approximated as a separate calculation interval ending at booster separation (117.85 s); nozzle exit areas come from the vacuum / sea-level thrust difference.",
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
    create: example('soyuz-2.1a', () => tr('ソユーズ2.1a（プログレスMS-30）', 'Soyuz-2.1a (Progress MS-30)')),
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
    get reviewPoints() {
      return [
        review(
          '段質量・フェアリング質量',
          'Stage and fairing masses',
          'secondary',
          '公式マニュアルにない質量を二次資料で補っています。機体構成に対応する一次資料との照合が必要です。',
          'Masses absent from the official manual are taken from secondary sources; check against primary data for this configuration.',
        ),
        review(
          'ブースタ・第1段の真空性能',
          'Booster and stage 1 vacuum performance',
          'assumed',
          '真空比推力を仮定し、真空推力とノズル出口面積を求めています。真空での実測性能の確認が必要です。',
          'Vacuum Isp is assumed to derive vacuum thrust and nozzle areas; measured vacuum performance needs checking.',
        ),
        review(
          '姿勢・上段停止時刻',
          'Attitude and upper-stage cutoff',
          'assumed',
          '標準GTOに合うよう姿勢を調整し、上段をマニュアルより早く停止しています。実際の誘導・燃焼履歴との照合が必要です。',
          'Attitude is tuned to the standard GTO and the upper stage stops earlier than in the manual; check against actual guidance and burn histories.',
        ),
      ]
    },
    get modelNotes() {
      return [
        tr(
          '推進薬量・推力・比推力・飛行シーケンスはマニュアルの値です。各段の全備質量（ブースタ 44.3 t、第1段 198.8 t、第2段 53.5 t、第3段 20.9 t）とフェアリング質量 1.5 t はマニュアルにないため二次資料（Spaceflight101）の値です。',
          'Propellant masses, thrust, Isp and the flight sequence are from the manual. Stage gross masses (boosters 44.3 t, stage 1 198.8 t, stage 2 53.5 t, stage 3 20.9 t) and the 1.5 t fairing are not in the manual and come from a secondary source (Spaceflight101).',
        ),
        tr(
          'ブースタと第1段のエンジンはマニュアルに地上推力・地上比推力しかないため、真空比推力を YF-20 系の 289 s と仮定し、真空推力とノズル出口面積を推進薬流量から求めています。ブースタと第1段の同時燃焼は「ブースタ分離（141.6 s）までの計算区間」として近似しています。',
          'For the booster and first-stage engines the manual gives only ground thrust and Isp, so vacuum Isp is assumed to be 289 s (YF-20 family) and vacuum thrust and nozzle exit area follow from the propellant flow. The combined booster and first-stage burn is approximated as a separate calculation interval ending at booster separation (141.6 s).',
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
    create: example('long-march-3b', () => tr('長征3B/E（標準GTOミッション）', 'Long March 3B/E (standard GTO mission)')),
  },
]

/**
 * A minimal single-stage rocket to start from scratch, at the given launch
 * point (or Taiki): 1 t, 70 % propellant, 20 kN, Isp 250 s.
 */
export function createBlankConfig(launch?: Config['launch']): Config {
  const taiki = siteById('taiki')
  return {
    name: tr('新しいロケット', 'New rocket'),
    presentation: { stage_count: 1, booster_count: 0 },
    simulation: { end_time_s: 600, output_step_s: 0.5, integrator: { method: 'rk45' } },
    launch: launch
      ? { latitude_deg: launch.latitude_deg, longitude_deg: launch.longitude_deg, altitude_m: launch.altitude_m, time_utc: launch.time_utc }
      : { latitude_deg: taiki.lat, longitude_deg: taiki.lon, altitude_m: taiki.alt, time_utc: '2025-01-01T00:00:00Z' },
    attitude: { azimuth_deg: 90, elevation_deg: 85 },
    stages: [
      {
        mass_initial_kg: 1000,
        mass_dry_kg: 300,
        engine: { thrust_vac_n: 20000, isp_vac_s: 250, burn_start_s: 0, burn_end_s: 85.81, nozzle_exit_area_m2: 0.04909 },
        aero: { diameter_m: 0.5, ca: 0.4, cn_alpha_per_rad: 0.2, ballistic_coefficient_kg_m2: 100 },
        free_flight: 'aero_stable',
      },
    ],
  }
}
