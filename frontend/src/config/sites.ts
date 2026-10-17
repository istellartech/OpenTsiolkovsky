// Launch sites offered in the launch tab. Coordinates are approximate
// (pad positions rounded to ~100 m); the UI says so.

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
  { id: 'uchinoura-ks', name: '内之浦 KS発射台（観測ロケット）', region: '日本', lat: 31.2518, lon: 131.079, alt: 276 },
  { id: 'uchinoura-m', name: '内之浦 M台地（イプシロン）', region: '日本', lat: 31.251, lon: 131.082, alt: 270 },
  { id: 'tanegashima', name: '種子島 吉信射点（H-IIA / H3）', region: '日本', lat: 30.4022, lon: 130.975, alt: 20 },
  { id: 'taiki', name: '北海道 大樹町（MOMO）', region: '日本', lat: 42.5, lon: 143.44, alt: 15 },
  // United States
  { id: 'ksc-39a', name: 'ケネディ宇宙センター LC-39A', region: '米国', lat: 28.6084, lon: -80.6043, alt: 3 },
  { id: 'ccsfs-40', name: 'ケープカナベラル SLC-40', region: '米国', lat: 28.5619, lon: -80.5772, alt: 3 },
  { id: 'vandenberg-4e', name: 'ヴァンデンバーグ SLC-4E', region: '米国', lat: 34.632, lon: -120.6106, alt: 150 },
  // Europe
  // ELA-3 and ELS from the Ariane 5 / Soyuz user's manuals; ELV is ~1 km SW of ELA-3 (Vega manual)
  { id: 'csg-ela3', name: 'ギアナ宇宙センター ELA-3（アリアン5）', region: '仏領ギアナ', lat: 5.2322, lon: -52.7756, alt: 10 },
  { id: 'csg-elv', name: 'ギアナ宇宙センター ELV（ヴェガ）', region: '仏領ギアナ', lat: 5.2258, lon: -52.782, alt: 10 },
  { id: 'csg-els', name: 'ギアナ宇宙センター ELS（ソユーズ）', region: '仏領ギアナ', lat: 5.3044, lon: -52.8344, alt: 10 },
  // Others
  { id: 'sdsc-flp', name: 'サティシュ・ダワン宇宙センター 第1射点（PSLV）', region: 'インド', lat: 13.7199, lon: 80.2304, alt: 5 },
  { id: 'mahia-lc1', name: 'マヒア半島 LC-1（エレクトロン）', region: 'ニュージーランド', lat: -39.2615, lon: 177.8649, alt: 50 },
  { id: 'baikonur-31', name: 'バイコヌール 31番射点（ソユーズ）', region: 'カザフスタン', lat: 45.9962, lon: 63.5643, alt: 100 },
]

export const siteById = (id: string) => LAUNCH_SITES.find((s) => s.id === id)!

/** The listed site at these coordinates, if any. */
export const findSite = (lat: number, lon: number) =>
  LAUNCH_SITES.find((s) => Math.abs(s.lat - lat) < 0.002 && Math.abs(s.lon - lon) < 0.002)
