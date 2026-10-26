/**
 * The Action center's dictionary entries (docs/PLAN.md 12; the template app's metrics test): they
 * pass the catalog checks, sit at home on the page, carry exactly the frozen ids, name only schema
 * fields, and register exactly the settings `PARAM` names, with `DEFAULTS` equal to their defaults.
 * Plain wording: no em dash between words and no exclamation mark.
 */
import { describe, expect, it } from 'vitest'
import { METRIC_IDS } from '@/access/ids'
import { invalidRefs } from '@/data/quality/fieldRef'
import { validateCatalog } from '@/metrics/registry'
import { DEFAULTS, ID, ITEM_USES, metrics, PARAM } from '../metrics'

describe('the Action center entries', () => {
  it('pass the catalog checks, at home on the page, with exactly the frozen ids', () => {
    expect(validateCatalog(metrics)).toEqual([])
    expect(metrics.map((d) => d.id)).toEqual(Object.values(ID))
    for (const d of metrics) {
      expect(d.views[0], d.id).toBe('actions')
      expect(d.owner, d.id).toBe(metrics[0].owner)
      expect(d.unit, d.id).toBe('int')
      expect(invalidRefs(d.uses), d.id).toEqual([])
      expect(METRIC_IDS, d.id).toContain(d.id)
      for (const t of [d.definition, d.formula ?? '', d.population ?? '', d.window ?? '']) {
        expect(t, d.id).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
        expect(t, d.id).not.toContain('!')
      }
    }
    expect(invalidRefs(ITEM_USES)).toEqual([])
  })

  it('register exactly the settings PARAM names, with DEFAULTS as their defaults', () => {
    const registered = metrics.flatMap((d) => d.params.map((p) => `${d.id}#${p.key}`)).sort()
    expect(registered).toEqual(
      Object.values(PARAM)
        .map((p) => `${p.metricId}#${p.key}`)
        .sort(),
    )
    for (const [role, ref] of Object.entries(PARAM)) {
      const p = metrics.find((d) => d.id === ref.metricId)?.params.find((x) => x.key === ref.key)
      expect(p?.default, role).toBe(DEFAULTS[role as keyof typeof DEFAULTS])
      expect(p?.locked ?? false, role).toBe(false)
    }
  })
})
