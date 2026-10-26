/**
 * What the help content checks need to know about the app, for tests only: the pages and their tabs,
 * the Data room's addresses, the metric catalog, the articles and tours (`HELP_WORLD`), and the
 * app's source (`HELP_SOURCE`), where each tour step's `data-tour` target must be drawn.
 * Nothing in the app imports it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_TABS, VIEW_TABS } from '@/access/ids'
import { isListId } from '@/data/lists/defs'
import { DATASET_KEYS } from '@/data/schema'
import { CATALOG } from '@/metrics/catalog'
import { DATASET_PANELS, parseDataTab } from '@/views/data/engine/links'
import { articleById } from './articles'
import type { LinkWorld } from './links'
import { tourById } from './tours'

/** A Data room address the page reads as written (no address falls back to Datasets unnoticed). */
export function isDataAddress(tab: string): boolean {
  if (DATA_TABS.some((t) => t.key === tab)) return true
  const r = parseDataTab(tab)
  if (r.dataset) {
    const [key, panel] = tab.split('-')
    return (
      (DATASET_KEYS as readonly string[]).includes(key) &&
      (!panel || (DATASET_PANELS as string[]).includes(panel))
    )
  }
  if (r.tab === 'metrics') return !!r.item && CATALOG.byId.has(r.item)
  if (r.tab === 'lists') return !!r.item && isListId(r.item)
  return false
}

export const HELP_WORLD: LinkWorld = {
  viewTabs: new Map(Object.entries(VIEW_TABS).map(([v, tabs]) => [v, tabs.map((t) => t.key)])),
  isDataTab: isDataAddress,
  hasMetric: (id) => CATALOG.byId.has(id),
  hasArticle: (id) => !!articleById(id),
  hasTour: (id) => !!tourById(id),
}

const SRC = fileURLToPath(new URL('..', import.meta.url))

/**
 * Every .ts and .tsx file under src but tests, test kits and the help content: the components draw
 * the `data-tour` names (help's own UI included: `masthead-help`), and the views' figure-id modules
 * name the Figures (`whatif-levers`). The articles and tours are left out, so a tour never counts
 * as drawing its own target.
 */
function sourceFiles(dir: string = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (p === join(SRC, 'help', 'articles') || p === join(SRC, 'testkit')) continue
      sourceFiles(p, out)
    } else if (
      /\.tsx?$/.test(name) &&
      !/\.(test|testkit)\./.test(name) &&
      p !== join(SRC, 'help', 'tours.ts')
    )
      out.push(p)
  }
  return out
}

/** The app's source, joined: where tour targets are looked for. */
export const HELP_SOURCE: string = sourceFiles()
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n')
