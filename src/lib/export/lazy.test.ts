/**
 * The export library loads on demand (docs/PLAN.md 4 and 14.1): the export menu, the drill panel
 * and the Data room import it with `import()`. One static value import of the barrel pulls it all
 * into the main chunk, so app code imports single modules (e.g. '@/lib/export/clipboard') when it
 * needs one up front. ExcelJS, pptxgenjs and SheetJS load only through `import()` everywhere: a
 * type import is fine, a static value import of any of them fails.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

const rel = (f: string) => relative(SRC, f).replace(/\\/g, '/')

/** Static value imports (and re-exports) of `target` in a source text: `import type` and `import()` are not. */
function staticValueImports(text: string, target: string): number {
  const esc = target.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const re = new RegExp(`^(?:import|export)\\s+(type\\s+)?[^'";]*?from\\s+'${esc}'`, 'gm')
  const bare = new RegExp(`^import\\s+'${esc}'`, 'gm')
  return [...text.matchAll(re)].filter((m) => !m[1]).length + [...text.matchAll(bare)].length
}

/** The heavy libraries that load only through `import()`. */
const LAZY_LIBRARIES = ['exceljs', 'pptxgenjs', 'xlsx'] as const

describe('the export library stays lazy', () => {
  const files = sources(SRC)

  it('has no static value import of the @/lib/export barrel in app code', () => {
    const offenders = files
      .filter((f) => !rel(f).startsWith('lib/export/'))
      .filter((f) => staticValueImports(readFileSync(f, 'utf8'), '@/lib/export') > 0)
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('imports ExcelJS, pptxgenjs and SheetJS only through import(), anywhere in src', () => {
    const offenders = files.flatMap((f) => {
      const text = readFileSync(f, 'utf8')
      return LAZY_LIBRARIES.filter((lib) => staticValueImports(text, lib) > 0).map(
        (lib) => `${rel(f)}: ${lib}`,
      )
    })
    expect(offenders).toEqual([])
  })

  it('tells a static value import from a type import and a dynamic one', () => {
    expect(staticValueImports("import ExcelJS from 'exceljs'", 'exceljs')).toBe(1)
    expect(staticValueImports("import { utils } from 'xlsx'", 'xlsx')).toBe(1)
    expect(staticValueImports("export * from '@/lib/export'", '@/lib/export')).toBe(1)
    expect(staticValueImports("import 'pptxgenjs'", 'pptxgenjs')).toBe(1)
    expect(staticValueImports("import type { Workbook } from 'exceljs'", 'exceljs')).toBe(0)
    expect(staticValueImports("import type PptxGenJS from 'pptxgenjs'", 'pptxgenjs')).toBe(0)
    expect(staticValueImports("const m = await import('xlsx')", 'xlsx')).toBe(0)
    expect(staticValueImports("import { toCsv } from '@/lib/export/csv'", '@/lib/export')).toBe(0)
    expect(staticValueImports("import { a } from 'xlsx-extra'", 'xlsx')).toBe(0)
  })
})
