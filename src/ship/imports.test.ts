/**
 * Dependency direction (docs/PLAN.md 4), written as a deny-list so it applies to every folder as it
 * appears. Each rule names the files it covers and the imports it refuses; the source scan reads
 * every import of every .ts and .tsx file but tests (static, side-effect, re-export and dynamic
 * `import()`), and the rules are first checked against made-up files so they cannot pass by finding
 * nothing.
 *
 * Kinds: 'type' is `import type` / `export type` (erased); 'value' is any other static import,
 * including `import { type A }`, which verbatimModuleSyntax keeps as a load of the module;
 * 'dynamic' is `import('…')`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

type Kind = 'type' | 'value' | 'dynamic'

interface Imp {
  /** What the source wrote. */
  spec: string
  kind: Kind
  /** A src path without extension or trailing /index ("src/plan/engine/heads"), or "pkg:<name>". */
  target: string
}

/** The file's imports, comments removed first. */
function importsOf(file: string, text: string): Imp[] {
  const code = text.replace(/(^|\s)\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
  const out: Imp[] = []
  const add = (spec: string, kind: Kind) => out.push({ spec, kind, target: resolveSpec(file, spec) })
  for (const m of code.matchAll(
    /^\s*(import|export)\s+(type\s+)?(?:[\w*{}\s,$]*?)\s*from\s*['"]([^'"]+)['"]/gm,
  ))
    add(m[3], m[2] ? 'type' : 'value')
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) add(m[1], 'value')
  for (const m of code.matchAll(/(typeof\s+)?\bimport\(\s*['"]([^'"]+)['"]\s*\)/g))
    add(m[2], m[1] ? 'type' : 'dynamic')
  return out
}

/** Where an import points: a src path (no extension, no /index) or a package. */
function resolveSpec(file: string, spec: string): string {
  let p: string
  if (spec.startsWith('@/')) p = `src/${spec.slice(2)}`
  else if (spec.startsWith('.')) p = posix.join(posix.dirname(file), spec)
  else {
    const parts = spec.split('/')
    return `pkg:${spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]}`
  }
  return p.replace(/\.(tsx?|mjs|js)$/, '').replace(/\/index$/, '')
}

const isTest = (file: string) => /\.test\.tsx?$/.test(file)
const under = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`)
const inPlanOrCost = (f: string) => under(f, 'src/plan') || under(f, 'src/cost')

interface Rule {
  id: string
  /** Why, in the plan's words. */
  why: string
  /** Whether the rule covers this file (a src-relative path such as "src/plan/engine/heads.ts"). */
  covers: (file: string) => boolean
  /** Whether it refuses this import from this file. */
  refuses: (imp: Imp, file: string) => boolean
}

/** Whether a folder under src/views/ is a view (a directory), so `@/views/plan` is its index. */
type IsViewDir = (name: string) => boolean

function rules(isViewDir: IsViewDir): Rule[] {
  return [
    {
      id: 'plan-cost-layers',
      why: 'plan/ and cost/ never import access/ at runtime, nor views/, app/, drill/, components/ or charts/ (cost/ may import type from access/scopes/types; app/brand is plain constants)',
      covers: (f) => inPlanOrCost(f) && !isTest(f),
      refuses: (imp, f) => {
        if (imp.target === 'src/app/brand') return false
        if (
          ['access', 'views', 'app', 'drill', 'components', 'charts'].every(
            (d) => !under(imp.target, `src/${d}`),
          )
        )
          return false
        if (under(f, 'src/cost') && imp.kind === 'type' && imp.target === 'src/access/scopes/types')
          return false
        return true
      },
    },
    {
      id: 'plan-cost-data',
      why: 'plan/ and cost/ read data/schema, data/fiscal and data/scope (types only); plan/store/ also data/idb and data/tabSync',
      covers: (f) => inPlanOrCost(f) && !isTest(f),
      refuses: (imp, f) => {
        if (!under(imp.target, 'src/data')) return false
        if (under(imp.target, 'src/data/schema') || under(imp.target, 'src/data/fiscal')) return false
        if (imp.target === 'src/data/scope' && imp.kind === 'type') return false
        if (under(f, 'src/plan/store') && ['src/data/idb', 'src/data/tabSync'].includes(imp.target))
          return false
        return true
      },
    },
    {
      id: 'views-cross',
      why: 'a view imports another view only through its engine/ or metrics.ts, never its index.tsx or ui/',
      covers: (f) => under(f, 'src/views') && f.split('/').length > 3 && !isTest(f),
      refuses: (imp, f) => {
        const from = f.split('/')[2]
        const parts = imp.target.split('/')
        if (parts[0] !== 'src' || parts[1] !== 'views' || parts.length < 3) return false
        const view = parts[2]
        if (view === from) return false
        // src/views/types and src/views/registry are files beside the view folders, not views.
        if (parts.length === 3 && !isViewDir(view)) return false
        const rest = parts.slice(3).join('/')
        return !(rest === 'metrics' || rest === 'engine' || rest.startsWith('engine/'))
      },
    },
    {
      id: 'policy-registry',
      why: 'access/policy/ never imports the view registry',
      covers: (f) => under(f, 'src/access/policy') && !isTest(f),
      refuses: (imp) => imp.target === 'src/views/registry',
    },
    {
      id: 'lazy-libraries',
      why: 'ExcelJS, pptxgenjs and SheetJS load only through import() (type imports are fine)',
      covers: (f) => !isTest(f) && !under(f, 'src/testkit'),
      refuses: (imp) =>
        imp.kind === 'value' && ['pkg:exceljs', 'pkg:pptxgenjs', 'pkg:xlsx'].includes(imp.target),
    },
    {
      id: 'export-barrel',
      why: 'app code never imports the @/lib/export barrel statically, only single modules or import()',
      covers: (f) => !isTest(f) && !under(f, 'src/lib/export'),
      refuses: (imp) => imp.kind === 'value' && imp.target === 'src/lib/export',
    },
    {
      id: 'idb-keyval',
      why: 'src/data/idb.ts is the only importer of idb-keyval (tests mock @/data/idb)',
      covers: (f) => f !== 'src/data/idb.ts' && f !== 'src/data/idb.test.ts',
      refuses: (imp) => imp.target === 'pkg:idb-keyval',
    },
    {
      id: 'dropped-packages',
      why: 'motion, date-fns, the Anthropic SDK and d3-sankey are not dependencies (docs/PLAN.md 3.2)',
      covers: () => true,
      refuses: (imp) =>
        [
          'pkg:motion',
          'pkg:framer-motion',
          'pkg:date-fns',
          'pkg:@anthropic-ai/sdk',
          'pkg:d3-sankey',
        ].includes(imp.target),
    },
  ]
}

/** "file: rule-id (spec)" for every refused import in one file. */
function violations(file: string, text: string, isViewDir: IsViewDir): string[] {
  const out: string[] = []
  const imps = importsOf(file, text)
  for (const rule of rules(isViewDir)) {
    if (!rule.covers(file)) continue
    for (const imp of imps) if (rule.refuses(imp, file)) out.push(`${file}: ${rule.id} (${imp.spec})`)
  }
  return out
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const realViewDir: IsViewDir = (name) => {
  const p = join(ROOT, 'src/views', name)
  return existsSync(p) && statSync(p).isDirectory()
}
const fakeViewDir: IsViewDir = (name) => !['types', 'registry'].includes(name)
const ids = (file: string, code: string) =>
  violations(file, code, fakeViewDir).map((v) => v.replace(/^.*?: (\S+) .*$/, '$1'))

describe('the import rules', () => {
  it('read every kind of import', () => {
    const imps = importsOf(
      'src/plan/engine/heads.ts',
      [
        "import { a } from '@/data/schema'",
        "import type { B } from '../types'",
        "import {\n  c,\n  type D,\n} from './cost'",
        "export { e } from '@/lib/dates'",
        "export type { F } from '@/data/scope'",
        "import '@/styles/index.css'",
        "const x = await import('exceljs')",
        "type M = typeof import('pptxgenjs')",
        "// import { z } from '@/views/plan'",
        "/* import { y } from '@/app/App' */",
        "import ExcelJS from 'exceljs'",
        "import * as XLSX from 'xlsx'",
      ].join('\n'),
    )
    expect(imps.map((i) => `${i.kind} ${i.target}`).sort()).toEqual(
      [
        'value src/data/schema',
        'type src/plan/types',
        'value src/plan/engine/cost',
        'value src/lib/dates',
        'type src/data/scope',
        'value src/styles/index.css',
        'dynamic pkg:exceljs',
        'type pkg:pptxgenjs',
        'value pkg:exceljs',
        'value pkg:xlsx',
      ].sort(),
    )
    expect(resolveSpec('src/a/b.ts', '@base-ui/react/menu')).toBe('pkg:@base-ui/react')
    expect(resolveSpec('src/a/b.ts', '@/lib/export/index')).toBe('src/lib/export')
  })

  it('refuse what the plan forbids', () => {
    const cases: [string, string, string[]][] = [
      ['src/plan/engine/heads.ts', "import { decide } from '@/access/policy'", ['plan-cost-layers']],
      ['src/plan/engine/heads.ts', "import type { Mode } from '@/access/modes'", ['plan-cost-layers']],
      ['src/cost/guard.ts', "import { x } from '@/views/plan/engine'", ['plan-cost-layers']],
      ['src/cost/fit.ts', "import { ScopeLock } from '@/access/scopes/types'", ['plan-cost-layers']],
      ['src/plan/engine/cost.ts', "import { cx } from '@/components/ui'", ['plan-cost-layers']],
      ['src/plan/engine/cost.ts', "const m = await import('@/charts/Figure')", ['plan-cost-layers']],
      ['src/plan/engine/forecast.ts', "import { useStore } from '@/data/store'", ['plan-cost-data']],
      ['src/plan/engine/forecast.ts', "import { periodWindows } from '@/data/scope'", ['plan-cost-data']],
      ['src/plan/engine/forecast.ts', "import { idbGet } from '@/data/idb'", ['plan-cost-data']],
      ['src/cost/atoms.ts', "import { acquireWriter } from '@/data/tabSync'", ['plan-cost-data']],
      ['src/views/plan/ui/Overview.tsx', "import { view } from '@/views/forecast'", ['views-cross']],
      [
        'src/views/plan/ui/Overview.tsx',
        "import { Tab } from '@/views/forecast/ui/Overview'",
        ['views-cross'],
      ],
      [
        'src/views/home/engine/index.ts',
        "import { ActionList } from '@/views/actions/index'",
        ['views-cross'],
      ],
      ['src/access/policy/kit.ts', "import { VIEWS } from '@/views/registry'", ['policy-registry']],
      ['src/lib/export/xlsx.ts', "import ExcelJS from 'exceljs'", ['lazy-libraries']],
      ['src/data/import/parse.ts', "import * as XLSX from 'xlsx'", ['lazy-libraries']],
      ['src/views/finance/ui/Export.tsx', "import PptxGenJS from 'pptxgenjs'", ['lazy-libraries']],
      ['src/app/ExportMenu.tsx', "import { exportView } from '@/lib/export'", ['export-barrel']],
      ['src/data/store.ts', "import { get, set } from 'idb-keyval'", ['idb-keyval']],
      ['src/app/Mark.tsx', "import { motion } from 'motion/react'", ['dropped-packages']],
      ['src/lib/dates.ts', "import { addDays } from 'date-fns'", ['dropped-packages']],
    ]
    for (const [file, code, want] of cases) expect(ids(file, code), `${file}: ${code}`).toEqual(want)
  })

  it('allow what the plan allows', () => {
    const cases: [string, string][] = [
      ['src/plan/engine/heads.ts', "import { MODES, type Mode } from '@/data/schema'"],
      ['src/plan/engine/heads.ts', "import { fyRange } from '@/data/fiscal'"],
      ['src/plan/engine/heads.ts', "import type { Filters } from '@/data/scope'"],
      ['src/plan/engine/heads.ts', "import { sha256 } from '@/lib/sha256'"],
      ['src/plan/workspace/file.ts', "import { APP_NAME } from '@/app/brand'"],
      ['src/plan/engine/heads.ts', "import { atomsOf } from '@/cost/atoms'"],
      ['src/cost/guard.ts', "import { heads } from '@/plan/engine/heads'"],
      ['src/cost/fit.ts', "import type { ScopeLock } from '@/access/scopes/types'"],
      ['src/plan/store/browser.ts', "import { idbGet } from '@/data/idb'"],
      ['src/plan/store/browser.ts', "import { acquireWriter } from '@/data/tabSync'"],
      ['src/plan/engine/heads.test.ts', "import { buildContext } from '@/data/context'"],
      ['src/views/plan/ui/Overview.tsx', "import { forecastModel } from '@/views/forecast/engine'"],
      ['src/views/plan/ui/Overview.tsx', "import { forecastModel } from '@/views/forecast/engine/index'"],
      ['src/views/plan/ui/Overview.tsx', "import { ID } from '@/views/forecast/metrics'"],
      ['src/views/plan/ui/Overview.tsx', "import type { ViewDef } from '@/views/types'"],
      ['src/views/plan/index.tsx', "import { Overview } from './ui/Overview'"],
      ['src/views/registry.ts', "import { view } from './plan'"],
      ['src/access/policy/kit.ts', "import type { ViewKey } from '@/views/types'"],
      ['src/lib/export/xlsx.ts', "import type { Workbook } from 'exceljs'"],
      ['src/lib/export/xlsx.ts', "const m = await import('exceljs')"],
      ['src/app/ExportMenu.tsx', "const lib = await import('@/lib/export')"],
      ['src/app/ExportMenu.tsx', "import type { ExportMeta } from '@/lib/export'"],
      ['src/app/Figure.tsx', "import { toCsv } from '@/lib/export/csv'"],
      ['src/lib/export/view.ts', "import { toCsv } from '.'"],
      ['src/data/idb.ts', "import { createStore, get } from 'idb-keyval'"],
      ['src/testkit/raw.ts', "import * as XLSX from 'xlsx'"],
    ]
    for (const [file, code] of cases) expect(ids(file, code), `${file}: ${code}`).toEqual([])
  })
})

describe('the source', () => {
  const files = sources(join(ROOT, 'src')).map((p) => relative(ROOT, p).replace(/\\/g, '/'))

  it('follows every import rule', () => {
    let seen = 0
    const found: string[] = []
    for (const f of files) {
      const text = readFileSync(join(ROOT, f), 'utf8')
      seen += importsOf(f, text).length
      found.push(...violations(f, text, realViewDir))
    }
    expect(seen).toBeGreaterThan(20)
    expect(found).toEqual([])
  })
})
