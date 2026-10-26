/**
 * Settings as data: Formulas lists the metrics a mode shows, with their settings in force and never a
 * money setting where the mode shows no amount (docs/PLAN.md 7.6 and 12: the Manager crawl reads
 * Settings > Formulas); Official lists names every list in force; the sheet's description and the
 * import line read as sentences.
 */
import { describe, expect, it } from 'vitest'
import { accessFor } from '@/access/context'
import { listsInForce } from '@/access/lists'
import { MODES } from '@/access/modes'
import { EMPTY_LISTS } from '@/data/lists/edit'
import { cachedSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import type { SourceMeta } from '@/data/store'
import { DASH } from '@/lib/format'
import { defaultMetrics } from '@/metrics/api'
import { describeSections, formulaSections, importedText, listRows } from './model'

const metrics = defaultMetrics()
const formulas = (mode: (typeof MODES)[number], showCost: boolean) =>
  formulaSections({ metrics, access: accessFor(mode, null, metrics), showCost })

describe('Settings > Formulas', () => {
  it('lists the metrics each mode shows, by home view, the rules last', () => {
    for (const mode of MODES) {
      const access = accessFor(mode, null, metrics)
      const sections = formulas(mode, mode !== 'manager')
      const ids = sections.flatMap((s) => s.rows.map((r) => r.id))
      expect(ids.length, mode).toBeGreaterThan(0)
      for (const id of ids) expect(access.can(`metric:${id}`), `${mode} ${id}`).toBe(true)
      if (sections.some((s) => s.key === 'rules')) expect(sections.at(-1)?.key).toBe('rules')
    }
  })

  it('hides every money metric in Manager mode, and never prints a money setting there', () => {
    const manager = formulas('manager', false).flatMap((s) => s.rows)
    const ids = manager.map((r) => r.id)
    for (const id of ids) {
      expect(id.startsWith('plan.cost.'), id).toBe(false)
      expect(id.startsWith('requests.chain.'), id).toBe(false)
    }
    for (const r of manager) for (const p of r.settings) expect(p.value, `${r.id} ${p.key}`).not.toMatch(/\$/)
    // Even if a money setting were listed, a mode without amounts reads "—" for it.
    const hrAdmin = formulas('hr-admin', false).flatMap((s) => s.rows)
    const threshold = hrAdmin.find((r) => r.id === 'requests.chain.leaderThreshold')
    expect(threshold?.settings.every((p) => p.value === DASH)).toBe(true)
    const shown = formulas('hr-admin', true)
      .flatMap((s) => s.rows)
      .find((r) => r.id === 'requests.chain.leaderThreshold')
    expect(shown?.settings[0]?.value).toMatch(/250,000/)
  })
})

describe('Settings > Official lists', () => {
  it('names every list in force with its status and how many values it holds', () => {
    const sample = cachedSample()
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample.datasets[k].length }]),
    ) as Record<DatasetKey, SourceMeta>
    const rows = listRows(listsInForce(EMPTY_LISTS, sample.datasets, sources))
    const units = rows.find((r) => r.id === 'businessUnit')
    expect(units).toMatchObject({
      label: 'Business units',
      status: 'Official',
      source: 'Sample company',
      values: 6,
    })
    expect(rows.every((r) => r.label && r.status)).toBe(true)
  })
})

describe('the sheet’s words', () => {
  it('lists the sections in a sentence and says what an import applied', () => {
    expect(describeSections(['mode', 'display', 'device'])).toBe('Mode, display and this device.')
    expect(describeSections(['mode'])).toBe('Mode.')
    expect(describeSections([])).toBe('')
    expect(importedText(['theme', 'textSize', 'dataStandard'])).toBe(
      'Applied the theme, text size and data standard from the file.',
    )
    expect(importedText([])).toBe('Nothing in the file could be applied.')
  })
})
