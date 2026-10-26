/**
 * The view registry (docs/PLAN.md 9.1; the template app's registry.test.ts): folder-tab order, labels,
 * tabs equal to the policy's `VIEW_TABS`, and `DATASETS[].usedBy` equal to the views that declare each
 * dataset. Written in the M2 freeze; the views-4 builder owns it and added the item sources (the views
 * the homes and My team hand the Action center, kept equal to the registry because they cannot import
 * it) and the views without items of their own.
 */
import { describe, expect, it } from 'vitest'
import { VIEW_TABS } from '@/access/ids'
import type { Mode } from '@/data/schema'
import { DATASET_KEYS, DATASETS, VIEW_KEYS, VIEW_LABEL, type ViewKey } from '@/data/schema'
import { ITEM_SOURCES } from './home/engine/sources'
import { folderViews, VIEWS, viewByKey, visibleViews } from './registry'

/** Views that declare a dataset in `ViewDef.datasets`, in folder-tab order. */
function readers(key: string): ViewKey[] {
  return VIEWS.filter((v) => v.datasets.includes(key as never)).map((v) => v.key)
}

describe('DATASETS[].usedBy', () => {
  it('names exactly the views that declare the dataset', () => {
    for (const def of DATASETS) {
      expect(new Set(def.usedBy), def.key).toEqual(new Set(readers(def.key)))
    }
  })

  it('lists each view once, in folder-tab order', () => {
    const order = VIEWS.map((v) => v.key)
    for (const def of DATASETS) {
      expect(new Set(def.usedBy).size, def.key).toBe(def.usedBy.length)
      expect(def.usedBy, def.key).toEqual([...def.usedBy].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    }
  })

  it('every view reads only known datasets, and every dataset is read by some view', () => {
    for (const v of VIEWS) for (const d of v.datasets) expect(DATASET_KEYS, v.key).toContain(d)
    for (const def of DATASETS) expect(readers(def.key).length, def.key).toBeGreaterThan(0)
  })
})

describe('folder tabs', () => {
  it('follow docs/PLAN.md 9.1, every view key once', () => {
    expect(VIEWS.map((v) => v.key)).toEqual([
      'home',
      'team',
      'plan',
      'requests',
      'forecast',
      'targets',
      'whatif',
      'finance',
    ])
    expect(VIEWS.map((v) => v.key)).toEqual([...VIEW_KEYS])
    for (const v of VIEWS) expect(v.label, v.key).toBe(VIEW_LABEL[v.key])
    for (const v of VIEWS) expect(viewByKey.get(v.key), v.key).toBe(v)
  })

  it('give each view its tabs as the policy lists them (src/access/ids.ts VIEW_TABS)', () => {
    for (const v of VIEWS) {
      expect(v.tabs.length, v.key).toBeGreaterThan(0)
      expect(new Set(v.tabs.map((t) => t.key)).size, v.key).toBe(v.tabs.length)
      expect(
        v.tabs.map((t) => ({ key: t.key, label: t.label })),
        v.key,
      ).toEqual(VIEW_TABS[v.key])
    }
  })

  it('mark the tabs with parts by address (Finance > Assumptions > Trade rates)', () => {
    const withParts = VIEWS.flatMap((v) => v.tabs.filter((t) => t.parts).map((t) => `${v.key}.${t.key}`))
    expect(withParts).toEqual(['finance.assumptions'])
  })
})

describe('visible views', () => {
  const access = (mode: Mode, hide: readonly string[] = []) => ({
    mode,
    can: (s: string) => !hide.includes(s),
  })

  it('keep the views and tabs a mode shows, the same view object when every tab shows', () => {
    const shown = visibleViews(access('hrbp', ['view:team', 'tab:finance.export']))
    expect(shown.map((v) => v.key)).not.toContain('team')
    const finance = shown.find((v) => v.key === 'finance')
    expect(finance?.tabs.map((t) => t.key)).toEqual(['versions', 'assumptions', 'freezes', 'reconcile'])
    expect(shown.find((v) => v.key === 'plan')).toBe(viewByKey.get('plan'))
  })

  it('show My team as a folder tab in Manager mode only', () => {
    expect(folderViews(access('manager')).map((v) => v.key)).toContain('team')
    for (const mode of ['hrbp', 'leader', 'finance', 'hr-admin'] as const)
      expect(
        folderViews(access(mode)).map((v) => v.key),
        mode,
      ).not.toContain('team')
  })
})

describe('the Action center’s item sources (src/views/home/engine/sources.ts)', () => {
  it('are the registry’s views, in folder-tab order, with the same labels, tabs, datasets and actions', () => {
    expect(ITEM_SOURCES.map((v) => v.key)).toEqual(VIEWS.map((v) => v.key))
    for (const src of ITEM_SOURCES) {
      const v = viewByKey.get(src.key)
      expect(v, src.key).toBeDefined()
      if (!v) continue
      expect(src.label, src.key).toBe(v.label)
      expect(
        src.tabs.map((t) => t.key),
        src.key,
      ).toEqual(v.tabs.map((t) => t.key))
      expect([...src.datasets].sort(), src.key).toEqual([...v.datasets].sort())
      expect(src.actions, src.key).toBe(v.actions)
    }
  })

  it('leave the homes and My team without items of their own (docs/PLAN.md 9.6)', () => {
    for (const key of ['home', 'team', 'forecast', 'whatif'] as const)
      expect(viewByKey.get(key)?.actions, key).toBeUndefined()
    expect(VIEWS.filter((v) => v.actions).map((v) => v.key)).toEqual([
      'plan',
      'requests',
      'targets',
      'finance',
    ])
  })
})

describe('every view', () => {
  it('has a headline and a View, and its datasets are known', () => {
    for (const v of VIEWS) {
      expect(typeof v.headline, v.key).toBe('function')
      expect(typeof v.View, v.key).toBe('function')
      expect(v.datasets.length, v.key).toBeGreaterThan(0)
    }
  })

  it('titles the Home view by the role home and leaves the others titled by their label', () => {
    const home = viewByKey.get('home')
    expect(home?.title).toBeTypeOf('function')
    for (const v of VIEWS.filter((x) => x.key !== 'home')) expect(v.title, v.key).toBeUndefined()
  })
})
