/**
 * The wording of the Plan and Forecast metrics, from the metric dictionary (`ctx.metrics`) with your
 * changes, for KPI info popovers, Figure "Definitions" datasheets and readout findings (the template
 * app's wording.ts). When a calculation setting behind a metric differs from its default, the
 * definition says so, so the default wording never describes a number calculated another way
 * without a note.
 */
import type { Definition } from '@/charts/types'
import { definitionOf } from '@/metrics/api'
import { formatParam } from '@/metrics/params'
import type { MetricsApi } from '@/metrics/types'

type Wording = Pick<MetricsApi, 'def' | 'changedFields' | 'paramDef' | 'param'>

/** The metrics whose settings change `id`: itself and those it depends on. */
const sourcesOf = (m: Wording, id: string): string[] => [id, ...(m.def(id)?.dependsOn ?? [])]

/** "Changed setting: Days before start 30 d (default 45 d)." or '' when every setting is at its default. */
export function changedSettingsText(m: Wording, id: string): string {
  const parts: string[] = []
  for (const source of sourcesOf(m, id)) {
    for (const field of m.changedFields(source)) {
      if (!field.startsWith('params.')) continue
      const key = field.slice('params.'.length)
      const def = m.paramDef(source, key)
      if (!def) continue
      parts.push(
        `${def.label} ${formatParam(def, m.param(source, key))} (default ${formatParam(def, def.default)})`,
      )
    }
  }
  if (!parts.length) return ''
  return `${parts.length === 1 ? 'Changed setting' : 'Changed settings'}: ${parts.join('; ')}.`
}

/** A metric's definition as the dictionary has it, plus any changed setting; '' when not registered. */
export function definitionText(m: Wording, id: string): string {
  const d = m.def(id)
  if (!d) return ''
  const note = changedSettingsText(m, id)
  return note ? `${d.definition} ${note}` : d.definition
}

/** Figure "Definitions" rows for these metrics, in order, from the dictionary. */
export function definitionsOf(m: Wording, ...ids: string[]): Definition[] {
  const out: Definition[] = []
  for (const id of ids) {
    const d = definitionOf(m, id)
    if (d) out.push({ ...d, text: definitionText(m, id) })
  }
  return out
}
