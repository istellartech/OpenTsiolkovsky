// Launch sites offered in the launch tab. Coordinates are approximate
// (pad positions rounded to ~100 m); the UI says so.
import { tr } from '../lib/i18n'

export interface LaunchSite {
  id: string
  name: string
  region: string
  lat: number
  lon: number
  alt: number
}

export const LAUNCH_SITES: LaunchSite[] = [
  // Japan
  {
    id: 'uchinoura-ks',
    get name() {
      return tr('内之浦 KS発射台（観測ロケット）', 'Uchinoura KS Launcher (sounding rockets)')
    },
    get region() {
      return tr('日本', 'Japan')
    },
    lat: 31.2518,
    lon: 131.079,
    alt: 276,
  },
  {
    id: 'uchinoura-m',
    get name() {
      return tr('内之浦 M台地（イプシロン）', 'Uchinoura Mu Center (Epsilon)')
    },
    get region() {
      return tr('日本', 'Japan')
    },
    lat: 31.251,
    lon: 131.082,
    alt: 270,
  },
  {
    id: 'tanegashima',
    get name() {
      return tr('種子島 吉信射点（H-IIA / H3）', 'Tanegashima Yoshinobu LC (H-IIA / H3)')
    },
    get region() {
      return tr('日本', 'Japan')
    },
    lat: 30.4022,
    lon: 130.975,
    alt: 20,
  },
  {
    id: 'taiki',
    get name() {
      return tr('北海道 大樹町（MOMO）', 'Taiki, Hokkaido (MOMO)')
    },
    get region() {
      return tr('日本', 'Japan')
    },
    lat: 42.5,
    lon: 143.44,
    alt: 15,
  },
  // United States
  {
    id: 'ksc-39a',
    get name() {
      return tr('ケネディ宇宙センター LC-39A', 'Kennedy Space Center LC-39A')
    },
    get region() {
      return tr('米国', 'United States')
    },
    lat: 28.6084,
    lon: -80.6043,
    alt: 3,
  },
  {
    id: 'ccsfs-40',
    get name() {
      return tr('ケープカナベラル SLC-40', 'Cape Canaveral SLC-40')
    },
    get region() {
      return tr('米国', 'United States')
    },
    lat: 28.5619,
    lon: -80.5772,
    alt: 3,
  },
  {
    id: 'vandenberg-4e',
    get name() {
      return tr('ヴァンデンバーグ SLC-4E', 'Vandenberg SLC-4E')
    },
    get region() {
      return tr('米国', 'United States')
    },
    lat: 34.632,
    lon: -120.6106,
    alt: 150,
  },
  // Europe
  // ELA-3 and ELS from the Ariane 5 / Soyuz user's manuals; ELV is ~1 km SW of ELA-3 (Vega manual)
  {
    id: 'csg-ela3',
    get name() {
      return tr('ギアナ宇宙センター ELA-3（アリアン5）', 'Guiana Space Centre ELA-3 (Ariane 5)')
    },
    get region() {
      return tr('仏領ギアナ', 'French Guiana')
    },
    lat: 5.2322,
    lon: -52.7756,
    alt: 10,
  },
  {
    id: 'csg-elv',
    get name() {
      return tr('ギアナ宇宙センター ELV（ヴェガ）', 'Guiana Space Centre ELV (Vega)')
    },
    get region() {
      return tr('仏領ギアナ', 'French Guiana')
    },
    lat: 5.2258,
    lon: -52.782,
    alt: 10,
  },
  {
    id: 'csg-els',
    get name() {
      return tr('ギアナ宇宙センター ELS（ソユーズ）', 'Guiana Space Centre ELS (Soyuz)')
    },
    get region() {
      return tr('仏領ギアナ', 'French Guiana')
    },
    lat: 5.3044,
    lon: -52.8344,
    alt: 10,
  },
  // Others
  {
    id: 'sdsc-flp',
    get name() {
      return tr('サティシュ・ダワン宇宙センター 第1射点（PSLV）', 'Satish Dhawan Space Centre FLP (PSLV)')
    },
    get region() {
      return tr('インド', 'India')
    },
    lat: 13.7199,
    lon: 80.2304,
    alt: 5,
  },
  {
    id: 'mahia-lc1',
    get name() {
      return tr('マヒア半島 LC-1（エレクトロン）', 'Mahia Peninsula LC-1 (Electron)')
    },
    get region() {
      return tr('ニュージーランド', 'New Zealand')
    },
    lat: -39.2615,
    lon: 177.8649,
    alt: 50,
  },
  {
    id: 'baikonur-31',
    get name() {
      return tr('バイコヌール 31番射点（ソユーズ）', 'Baikonur Site 31 (Soyuz)')
    },
    get region() {
      return tr('カザフスタン', 'Kazakhstan')
    },
    lat: 45.9962,
    lon: 63.5643,
    alt: 100,
  },
  {
    id: 'xichang-lc2',
    get name() {
      return tr('西昌 2号射点（長征3B）', 'Xichang LC-2 (Long March 3B)')
    },
    get region() {
      return tr('中国', 'China')
    },
    // LM-3A Series User's Manual (2011): 28.25° N, 102.025° E, 1,825 m
    lat: 28.2455,
    lon: 102.0267,
    alt: 1825,
  },
]

export const siteById = (id: string) => LAUNCH_SITES.find((s) => s.id === id)!

/** The listed site at these coordinates, if any. */
export const findSite = (lat: number, lon: number) =>
  LAUNCH_SITES.find((s) => Math.abs(s.lat - lat) < 0.002 && Math.abs(s.lon - lon) < 0.002)
