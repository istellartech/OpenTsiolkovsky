import { AlertTriangle } from 'lucide-react'
import type { PresetOption, PresetReviewPoint } from '../config/presets'
import { tr } from '../lib/i18n'

const basisLabel = (basis: PresetReviewPoint['basis']) =>
  ({
    assumed: tr('推定・仮定', 'Estimated / assumed'),
    secondary: tr('二次資料', 'Secondary source'),
    borrowed: tr('別機体・別号機の値', 'Other vehicle / flight'),
    simplified: tr('モデルの簡略化', 'Model simplification'),
  })[basis]

/** Data uncertainty is distinct from whether the numerical solver succeeds. */
export function PresetReview({ preset }: { preset: PresetOption }) {
  return (
    <section className="mt-3 rounded-[8px] border border-line-strong bg-surface-2 px-3 py-2.5">
      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold">
        <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {tr('このテンプレートで確認が必要な情報', 'Information to check in this template')}
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
        {tr(
          '公表資料に基づく値に加え、推定値や計算用の仮定を含みます。以下の項目は実機の資料・実測データとの照合が必要です。',
          'Published data is combined with estimates and modelling assumptions. Check the items below against vehicle records or measured data.',
        )}
      </p>
      <dl className="mt-2 space-y-2 text-[11px] leading-relaxed">
        {preset.reviewPoints.map((point) => (
          <div key={point.label}>
            <dt className="font-medium text-ink">
              {point.label}
              <span className="ml-1.5 font-normal text-ink-3">{basisLabel(point.basis)}</span>
            </dt>
            <dd className="mt-0.5 text-ink-2">{point.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
