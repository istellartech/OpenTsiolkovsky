import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { CaseContext } from '../lib/case'
import type { Config } from '../lib/config'
import { tr } from '../lib/i18n'
import { NumberInput } from './primitives'
import { optButton, optInput } from './optimization/styles'

export function CaseDetails({
  context,
  config,
  onChange,
  onClose,
}: {
  context: CaseContext
  config?: Config
  onChange?: (context: CaseContext) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = dialog.current
    el?.showModal()
    return () => el?.close()
  }, [])
  const mass = context.carriedMass
  const [stage, setStage] = useState(Math.min(mass?.stage ?? (config?.stages.length ?? 1) - 1, (config?.stages.length ?? 1) - 1))
  const [payloadKg, setPayload] = useState(mass?.payloadKg ?? 0)
  const [adapterKg, setAdapter] = useState(mass?.adapterKg ?? 0)
  const [error, setError] = useState('')
  const save = () => {
    const s = config?.stages[stage]
    if (!s || payloadKg < 0 || adapterKg < 0 || s.mass_dry_kg === undefined || payloadKg + adapterKg > s.mass_dry_kg) {
      setError(
        tr(
          '衛星・PAFの合計は、この区間の乾燥質量以下の非負の値にしてください。',
          'Payload plus adapter must be nonnegative and no greater than this interval’s dry mass.',
        ),
      )
      return
    }
    onChange?.({ ...context, carriedMass: { stage, stageCount: config!.stages.length, payloadKg, adapterKg } })
    onClose()
  }
  return (
    <dialog
      ref={dialog}
      aria-label={tr('ケース情報', 'Case details')}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center bg-black/35 p-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <section className="scroll-quiet max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-[10px] border border-line bg-surface p-4 text-ink shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-[15px] font-semibold">{context.name}</h2>
            <p className="num mt-1 break-all text-[11px] text-ink-3">
              {tr('ケース', 'Case')} {context.id} · r{context.revision}
            </p>
          </div>
          <button type="button" autoFocus onClick={onClose} aria-label={tr('閉じる', 'Close')} className={optButton}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-[12px] text-ink-2">
          {tr(
            'ケース保存にはこの情報を含めます。ソルバー用JSONには含めません。',
            'Case files retain this information. Solver JSON exports contain only solver inputs.',
          )}
        </p>
        {config ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-[11px]">
              <caption className="mb-2 text-left text-[13px] font-semibold">
                {tr('現在の質量内訳（kg）', 'Current mass breakdown (kg)')}
              </caption>
              <thead className="text-ink-3">
                <tr>
                  <th className="text-left">{tr('区間', 'Interval')}</th>
                  <th>{tr('構造等', 'Structure')}</th>
                  <th>{tr('推進剤', 'Propellant')}</th>
                  <th>{tr('投棄物', 'Jettisons')}</th>
                  <th>{tr('衛星・PAF', 'Payload/adapter')}</th>
                </tr>
              </thead>
              <tbody>
                {config.stages.map((s, i) => {
                  const carried = mass && !mass.needsReview && mass.stage === i ? mass.payloadKg + mass.adapterKg : 0
                  const jettisons = (s.jettisons ?? []).reduce((sum, j) => sum + j.mass_kg, 0)
                  const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 3 })
                  return (
                    <tr key={i} className="num border-t border-line">
                      <th className="py-2 text-left font-normal">{i + 1}</th>
                      <td>{s.mass_dry_kg === undefined ? '—' : format(s.mass_dry_kg - carried - jettisons)}</td>
                      <td>{s.mass_dry_kg === undefined ? '—' : format(s.mass_initial_kg - s.mass_dry_kg)}</td>
                      <td>{format(jettisons)}</td>
                      <td>{format(carried)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {config && onChange ? (
          <div className="mt-4 space-y-3 border-t border-line pt-3">
            <h3 className="text-[13px] font-semibold">
              {tr('段の質量に含まれる衛星・PAF', 'Payload and adapter included in stage masses')}
            </h3>
            <p className="text-[12px] text-ink-2">
              {tr(
                'ここで指定する質量は現在の乾燥質量・全備質量に含まれる分です。最適化に渡す際に差し引き、別枠で数えます。段の総質量は変更しません。',
                'These masses are already included in the current dry and wet masses. They are subtracted and counted separately when creating an optimization case. Stage totals are unchanged.',
              )}
            </p>
            {mass?.needsReview ? (
              <p role="alert" className="text-[12px] text-danger">
                {tr(
                  '計算区間の構成が変わりました。搭載区間と内訳を確認して保存してください。',
                  'The interval layout changed. Review and save the carrying interval and breakdown.',
                )}
              </p>
            ) : null}
            <label className="block text-[12px]">
              {tr('搭載する計算区間', 'Carrying interval')}
              <select className={`${optInput} mt-1`} value={stage} onChange={(e) => setStage(Number(e.target.value))}>
                {config.stages.map((_, i) => (
                  <option key={i} value={i}>
                    {tr(`区間${i + 1}`, `Interval ${i + 1}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[12px]">
                {tr('衛星（含まれている分）', 'Included payload')}
                <NumberInput
                  ariaLabel={tr('含まれる衛星質量', 'Included payload mass')}
                  value={payloadKg}
                  onChange={setPayload}
                  unit="kg"
                />
              </label>
              <label className="text-[12px]">
                {tr('PAF（含まれている分）', 'Included adapter')}
                <NumberInput ariaLabel={tr('含まれるPAF質量', 'Included adapter mass')} value={adapterKg} onChange={setAdapter} unit="kg" />
              </label>
            </div>
            <p className="num text-[12px] text-ink-2">
              {tr('衛星・PAFを除く乾燥質量', 'Dry mass excluding payload/adapter')}:{' '}
              {((config.stages[stage]?.mass_dry_kg ?? 0) - payloadKg - adapterKg).toLocaleString()} kg
            </p>
            {error ? (
              <p role="alert" className="text-[12px] text-danger">
                {error}
              </p>
            ) : null}
            <button type="button" className={optButton} onClick={save}>
              {tr('質量内訳を保存', 'Save mass breakdown')}
            </button>
          </div>
        ) : null}
        <h3 className="mt-4 border-t border-line pt-3 text-[13px] font-semibold">
          {tr('変換履歴', 'Conversion history')} · {context.history.length}
        </h3>
        {!context.history.length ? (
          <p className="mt-2 text-[12px] text-ink-3">
            {tr('このケースはまだ変換されていません。', 'This case has not been converted yet.')}
          </p>
        ) : null}
        <ol className="mt-2 space-y-4">
          {context.history.map((h, i) => (
            <li key={i} className="border-l-2 border-line pl-3 text-[12px]">
              <p className="font-medium">
                {h.sourceName} · r{h.sourceRevision}
              </p>
              <p className="mt-1 text-ink-3">
                {h.to === 'simulate'
                  ? tr('最適化 → 軌道計算', 'Optimization → simulation')
                  : tr('軌道計算 → 最適化', 'Simulation → optimization')}{' '}
                · {new Date(h.at).toLocaleString()}
              </p>
              {h.runId ? <p className="num mt-1 break-all text-[11px] text-ink-3">Run: {h.runId}</p> : null}
              <ul className="mt-1 list-disc space-y-1 pl-4 text-ink-2">
                {h.notes.map((n, j) => (
                  <li key={j}>{n}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </dialog>
  )
}
