/**
 * Checks the Plan and Forecast tests share (test code only; it uses Vitest's `expect`): a tile's
 * records or card hold what its number says (9.5: a counted number opens exactly its rows, a
 * weighted one rows whose "Counts as" adds up to it, a card's last step is its value), and the copy
 * rules every model string keeps (14.3).
 */
import { expect } from 'vitest'
import { BANNED_MODE_WORDS } from '@/access/copy'
import type { Column } from '@/charts/types'
import type { Finding, Kpi } from '@/components/types'
import { type CalcSpec, calcProblems, isMoneyFormat, resolveCalc, weightSum } from '@/drill/calc'
import { type DrillSource, resolveDrill } from '@/drill/types'
import type { FigureData } from '../../types'

/** A tile's drill holds its number: counted rows, or weights that add up to it. */
export function expectDrillHolds(k: Pick<Kpi, 'id' | 'value' | 'drill'>, where = ''): void {
  const spec = resolveDrill(k.drill)
  if (!spec || k.value == null) return
  if (spec.weight) {
    const sum = weightSum(spec as never) ?? 0
    expect(Math.abs(sum - k.value), `${where} ${k.id}: Σ counts as ${sum} for ${k.value}`).toBeLessThan(1e-6)
  } else expect(spec.rows.length, `${where} ${k.id}`).toBe(k.value)
}

/** A card keeps its rules (`calcProblems`). */
export function expectCardHolds(
  src: CalcSpec | (() => CalcSpec | null) | null | undefined,
  where = '',
): CalcSpec | null {
  const spec = resolveCalc(src)
  if (!spec) return null
  expect(calcProblems(spec), `${where} ${spec.title}`).toEqual([])
  return spec
}

/** Every counted cell of a figure opens exactly its rows (weighted cells: the weights add up). */
export function expectCellsHold(
  fig: Pick<FigureData<object>, 'id' | 'rows'> & { columns: readonly Column[] },
  where = '',
): number {
  let checked = 0
  for (const c of fig.columns) {
    if (!c.drill) continue
    for (const r of fig.rows) {
      const v = (r as Record<string, unknown>)[c.key]
      const src = c.drill(r) as DrillSource
      const spec = resolveDrill(src)
      if (!spec || typeof v !== 'number') continue
      checked++
      if (spec.weight) {
        const sum = weightSum(spec as never) ?? 0
        expect(Math.abs(sum - v), `${where} ${fig.id} ${c.key}`).toBeLessThan(1e-6)
      } else expect(spec.rows.length, `${where} ${fig.id} ${c.key} ${JSON.stringify(r).slice(0, 80)}`).toBe(v)
    }
  }
  return checked
}

/** The words a model shows: titles, notes, labels, findings and items (not data values). */
export function wordsOf(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6 || value == null) return out
  if (typeof value === 'string') {
    out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    // Long row lists hold data, not copy: read the first rows only.
    for (const v of value.slice(0, 40)) wordsOf(v, out, depth + 1)
    return out
  }
  if (typeof value === 'object') for (const v of Object.values(value)) wordsOf(v, out, depth + 1)
  return out
}

const EM_DASH = /[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/
const NEEDLE = new RegExp(['cen', 'sus'].join(''), 'i')

/** The copy rules of 14.3 over a model's words. */
export function expectPlainCopy(words: readonly string[], where = ''): void {
  for (const w of words) {
    expect(EM_DASH.test(w), `${where}: em dash between words in "${w}"`).toBe(false)
    expect(w.includes('!'), `${where}: "!" in "${w}"`).toBe(false)
    expect(NEEDLE.test(w), `${where}: the template's name in "${w}"`).toBe(false)
    for (const b of BANNED_MODE_WORDS)
      expect(new RegExp(`\\b${b}\\b`, 'i').test(w), `${where}: "${b}" in "${w}"`).toBe(false)
  }
}

/** Money in a text (7.2 rule 6): a currency sign or code beside a number. */
export const MONEY_TEXT = /[$€£¥₹₪]\s?\d|\b\d[\d,.]*\s?(USD|EUR|GBP|INR|ILS|TWD|CNY|CAD|VND)\b/

/** No amount in a finding's title, detail or action, or a tile's note and formula. */
export function expectNoMoneyText(items: readonly (Finding | Kpi)[], where = ''): void {
  for (const x of items)
    for (const t of [
      'title' in x ? x.title : '',
      'detail' in x ? (x.detail ?? '') : '',
      'action' in x ? (x.action ?? '') : '',
      'note' in x ? (x.note ?? '') : '',
      'formula' in x ? (x.formula ?? '') : '',
    ])
      expect(MONEY_TEXT.test(t), `${where} ${x.id}: "${t}"`).toBe(false)
}

/** Whether a tile shows an amount. */
export const isMoneyTile = (k: Kpi): boolean => isMoneyFormat(k.format)
