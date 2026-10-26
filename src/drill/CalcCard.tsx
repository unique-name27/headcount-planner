/**
 * The calculation card (docs/PLAN.md 9.5; the template app has none): a modeled number on one
 * sheet, with its inputs (label, value, where it came from, its fallback level), the arithmetic
 * step by step down to the number on screen, the comparison it is set against, and "Show the n
 * records" for the rows it adds up. It lives in the drill stack (`DrillEntry` `{ type: 'calc' }`),
 * so Back and focus return work as for records.
 *
 * The card renders the spec and computes nothing: its amounts come from the guard output of the
 * figure it explains (`costCalc` and the producing models), so a hidden input or step already reads
 * "—" here. `calcProblems` (./calc.ts) holds the card's rules for tests.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { fmt } from '@/lib/format'
import { type CalcInput, type CalcSpec, type CalcStep, calcResult } from './calc'
import { drillTarget } from './kinds'
import { pushDrill } from './store'
import { resolveDrill } from './types'

/** A card value as text: a string as given, a number in its format, null as "—". */
export const calcValueText = (v: number | string | null, format: CalcInput['format']): string =>
  typeof v === 'string' ? v : fmt(v, format)

const LEVEL_WORD: Record<NonNullable<CalcInput['level']>, string> = {
  org: 'Org value',
  unit: 'Unit value',
  company: 'Company value',
}

export function CalcCard({ spec }: { spec: CalcSpec }) {
  const ctx = useAnalytics()
  // "Show the n records" only for records the mode lists (a hidden kind is no button).
  const target = drillTarget(ctx.access, spec.rows)
  const rows = target ? resolveDrill(target) : null
  const result = calcResult(spec)
  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <BDialog.Title tabIndex={-1} className="cut-head text-section leading-tight font-semibold">
          {spec.title}
        </BDialog.Title>
        {spec.subtitle && (
          <BDialog.Description className="text-small text-ink-2">{spec.subtitle}</BDialog.Description>
        )}
        <p className="mt-2 cut-head text-page-title leading-none font-semibold tnum">
          {fmt(spec.value, spec.format)}
        </p>
        {spec.comparison && (
          <p className="text-meta text-muted">
            {spec.comparison.label}: {fmt(spec.comparison.value, spec.format)}
          </p>
        )}
      </header>

      {spec.inputs.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Inputs">
          <h3 className="eyebrow">Inputs</h3>
          <table className="w-full text-small">
            <tbody>
              {spec.inputs.map((x, i) => (
                <tr key={`${x.label}-${i}`} className="border-b border-rule align-top last:border-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                    {x.label}
                    <div className="text-meta text-muted">
                      {x.source}
                      {x.level ? ` · ${LEVEL_WORD[x.level]}` : ''}
                    </div>
                  </th>
                  <td className="py-1.5 text-right whitespace-nowrap tnum">
                    {calcValueText(x.value, x.format)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="flex flex-col gap-2" aria-label="Steps">
        <h3 className="eyebrow">How it is calculated</h3>
        <ol className="flex flex-col">
          {spec.steps.map((s, i) => (
            <Step key={`${s.label}-${i}`} step={s} last={i === spec.steps.length - 1} />
          ))}
        </ol>
        {result == null && spec.value == null && spec.steps.length > 0 && (
          <p className="text-meta text-muted">This number is not shown here, so the card shows no amount.</p>
        )}
      </section>

      {spec.note && <p className="max-w-[70ch] text-meta text-muted">{spec.note}</p>}

      {rows && rows.rows.length > 0 && (
        <div>
          <Button onClick={() => pushDrill(rows)}>
            {`Show the ${fmt(rows.rows.length, 'int')} ${rows.rows.length === 1 ? 'record' : 'records'}`}
          </Button>
        </div>
      )}
    </article>
  )
}

function Step({ step, last }: { step: CalcStep; last: boolean }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-rule py-2 last:border-0">
      <div className="min-w-0">
        <div className={last ? 'text-small font-semibold' : 'text-small'}>{step.label}</div>
        <div className="font-mono text-meta break-words text-ink-2">{step.expression}</div>
      </div>
      <div className={`self-end text-right whitespace-nowrap tnum ${last ? 'font-semibold' : ''}`}>
        {fmt(step.result, step.format)}
      </div>
    </li>
  )
}
