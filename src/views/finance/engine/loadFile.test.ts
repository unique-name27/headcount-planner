/**
 * The FP&A load file (docs/PLAN.md 14.1 item 6, 9.4 Finance > Export; CONTRACTS-M4 3, finance-export):
 * the long CSV at Finance's rules (exact for 5 or more, each unit's one fold, loaded cost where C33 (b)
 * allows no split, suppressed flags), the whole company's whatever the screen's filters, for the
 * version picked; the unsuppressed file only from HR admin with Show pay amounts on, its first header
 * line "Contains individual pay"; hidden in every other mode; and the Finance > Export tab that offers
 * them.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { WHOLE_COMPANY } from '@/access/copy'
import { planHeaderOf } from '@/app/exportMeta'
import { peopleOf } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { INDIVIDUAL_PAY_LINE } from '@/lib/export/exportHeader'
import { isAmountRow, type LongRow } from '@/lib/export/longCsv'
import { hrAdminExportLine, modeMeta } from '@/lib/export/modeMeta'
import type { AnyVersion } from '@/plan/types'
import { leakSample, sampleCtx, withDatasets } from '@/testkit/sample'
import { gridMonths, shownLines } from '@/views/plan/engine/core'
import { foldsOf, guardFigure, membersOf } from '@/views/plan/engine/guarded'
import { EMPTY_EXPORT, FULL_LOAD_FILE_LABEL, LOAD_FILE_LABEL } from './export'
import { financeModel } from './index'
import { FILTERED_TEXT, type LoadFile, loadFileOf, loadFileText } from './loadFile'
import {
  componentCents,
  componentTotalLines,
  everyPosition,
  longCsvOf,
  longPeriodsOf,
  SPLIT_COMPONENTS,
} from './longCsv'

/** The rows as amounts by cell, for comparing two files. */
const amounts = (f: LoadFile | null) =>
  (f?.rows ?? []).map((r) => [
    r.period,
    r.org,
    r.costCenter,
    r.component,
    r.currency,
    r.amountUsd,
    r.suppressed,
  ])

const firstLines = (text: string, n: number) => text.replace(/^﻿/, '').split('\r\n').slice(0, n)

describe('the load file at Finance’s rules', () => {
  let fin: AnalyticsContext
  let file: LoadFile
  beforeAll(() => {
    fin = sampleCtx('finance')
    file = loadFileOf(fin) as LoadFile
  }, 120_000)

  it('is the whole company’s, for the version shown, named for it', () => {
    expect(file).not.toBeNull()
    expect(file.individualPay).toBe(false)
    expect(file.versionId).toBe('fy27-working')
    expect(file.fileName).toBe('headcount-planner-finance-load-file-fy27-working-2026-09-30')
    expect(file.rows.length).toBeGreaterThan(1000)
    for (const r of file.rows) expect(r.version).toBe('FY27 Working')
    const units = new Set(file.rows.map((r) => r.org))
    expect(units.size).toBe(6)
  })

  it('every amount is a shown cost center or its unit’s Other, over 5 or more costed people in its window', () => {
    const v = fin.version as AnyVersion
    const folds = foldsOf(fin, v)
    expect(folds).not.toBeNull()
    const lines = shownLines(fin, v)
    const periods = new Map(longPeriodsOf(fin, v).map((p) => [p.key, p.months]))
    const people = new Map<string, number>()
    for (const [key, months] of periods) {
      const members = membersOf(fin, lines, months, everyPosition(fin))
      const byCell = new Map<string, typeof members>()
      for (const m of members) {
        const f = folds?.get(m.seat.businessUnit)
        const cell = f?.shown.includes(m.seat.costCenter) ? m.seat.costCenter : 'Other'
        const k = `${key}|${m.seat.businessUnit}|${cell}`
        byCell.set(k, [...(byCell.get(k) ?? []), m])
      }
      for (const [k, list] of byCell) people.set(k, peopleOf(list).size)
    }
    let checked = 0
    for (const r of file.rows) {
      if (r.amountUsd == null) continue
      const other = r.costCenter.startsWith('Other (')
      const f = folds?.get(r.org)
      if (!other) expect(f?.shown, `${r.org} ${r.costCenter}`).toContain(r.costCenter)
      const n = people.get(`${r.period}|${r.org}|${other ? 'Other' : r.costCenter}`) ?? 0
      expect(n, `${r.period} ${r.org} ${r.costCenter}`).toBeGreaterThanOrEqual(fin.guard.rules.minCosted)
      checked++
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('shows loaded cost only, every row of a cell in one currency or in USD, the Other in USD', () => {
    for (const r of file.rows) {
      expect(r.component).toBe('loaded')
      if (r.costCenter.startsWith('Other (')) {
        expect(r.currency).toBe('USD')
        expect(r.amountLocal).toBeNull()
        expect(r.rate).toBeNull()
      }
      if (r.currency === 'USD' && r.amountLocal != null)
        expect(r.amountLocal).toBeCloseTo(r.amountUsd as number, 4)
    }
  })

  it('is never cut by the period, and is not written while an org filter narrows the screen', () => {
    for (const period of ['month', 'ytd', 'qtd'] as const)
      expect(amounts(loadFileOf(sampleCtx('finance', { filters: { period } }))), period).toEqual(
        amounts(file),
      )
    for (const filters of [
      { businessUnit: ['Corporate'] },
      { country: ['Taiwan'] },
      { costCenter: ['1320-SJC'] },
      { currency: ['EUR'] },
    ]) {
      const ctx = sampleCtx('finance', { filters })
      expect(loadFileOf(ctx), JSON.stringify(filters)).toBeNull()
      const e = financeModel(ctx).export
      expect(e.loadFile?.disabled, JSON.stringify(filters)).toBe(FILTERED_TEXT)
      expect(e.totals, JSON.stringify(filters)).toBeNull()
      expect(e.preview, JSON.stringify(filters)).toBeNull()
    }
  })

  it('reads the version picked', () => {
    const b = loadFileOf(fin, { versionId: 'fy27-budget' }) as LoadFile
    expect(b.fileName).toBe('headcount-planner-finance-load-file-fy27-budget-2026-09-30')
    expect(new Set(b.rows.map((r) => r.version))).toEqual(new Set(['FY27 Budget']))
    expect(b.rows.every((r) => r.lockHash.startsWith('sha256-'))).toBe(true)
  })

  it('writes the header, then a control total line per period, then the columns', () => {
    const text = loadFileText(fin, file)
    const lines = firstLines(text, 120)
    expect(lines[0]).toBe('Version: FY27 Working')
    expect(lines).not.toContain(INDIVIDUAL_PAY_LINE)
    expect(lines).toContain('Rounding: Exact for groups of 5 or more')
    const totals = lines.filter((l) => /^"?Control totals [^,]+:/.test(l))
    expect(totals.length).toBe(gridMonths(fin.version as AnyVersion).length + 3)
    // Then one line per component control total (review SB-1), before the blank line and the columns.
    const split = lines.filter(
      (l) => l.replace(/^"/, '').startsWith('Control totals ') && l.includes(', by component: '),
    )
    expect(split.length).toBe(file.componentTotals.length)
    const blank = lines.indexOf('')
    expect(blank).toBeGreaterThan(lines.indexOf(split.at(-1) as string))
    expect(text).toContain('period,org,costCenter,account,component,currency,amountLocal,rate,amountUsd')
  })

  it('HR admin with the switch off writes the same rows as Finance', () => {
    expect(amounts(loadFileOf(sampleCtx('hr-admin')))).toEqual(amounts(file))
  })
})

describe('each file’s header is its own context’s (D-MODELINE)', () => {
  it('names the mode and comparison it was written in, whichever mode wrote the same rows first', () => {
    const fin = sampleCtx('finance')
    const admin = sampleCtx('hr-admin')
    const finFile = loadFileOf(fin) as LoadFile
    const adminFile = loadFileOf(admin) as LoadFile
    // The same rows (Finance's rules), each under its own mode line.
    expect(amounts(adminFile)).toEqual(amounts(finFile))
    expect(finFile.meta.modeLine).toBe(modeMeta(fin.access).modeLine)
    expect(adminFile.meta.modeLine).toBe(hrAdminExportLine(false))
    expect(loadFileText(admin, adminFile)).toContain(hrAdminExportLine(false))
    expect(loadFileText(admin, adminFile)).not.toContain('Made in Finance mode.')
    expect(loadFileText(fin, loadFileOf(fin) as LoadFile)).toContain('Made in Finance mode.')
    // HR admin with the switch on: the file at Finance's rules keeps Finance's rows, and names the
    // mode it was made in, the switch included, as every switch-on output does (M4 recheck
    // D-PAYFILES-a).
    const on = sampleCtx('hr-admin', { showPay: true })
    expect(loadFileOf(on)?.meta.modeLine).toBe(hrAdminExportLine(true))
    expect(loadFileOf(on, { full: true })?.meta.modeLine).toBe(hrAdminExportLine(true))
    // A comparison picked after a file was written heads the next one.
    const vsRf = sampleCtx('finance', { compare: 'fy27-q1-reforecast' })
    expect(loadFileOf(vsRf)?.meta.plan?.comparison).toBe(planHeaderOf(vsRf).comparison)
    expect(planHeaderOf(vsRf).comparison).not.toBe(finFile.meta.plan?.comparison)
  })
})

describe('control totals by component at unit and company level, where C33 (b) allows (review SB-1)', () => {
  let fin: AnalyticsContext
  let file: LoadFile
  beforeAll(() => {
    fin = sampleCtx('finance')
    file = loadFileOf(fin) as LoadFile
  }, 120_000)

  /** The screen's guarded figure of a set of members (Plan's cost by unit, the company's total). */
  const screenOf = (ctx: AnalyticsContext, period: string, unit: string | null) => {
    const v = ctx.version as AnyVersion
    const months = longPeriodsOf(ctx, v).find((p) => p.key === period)?.months ?? []
    const members = membersOf(ctx, shownLines(ctx, v), months, everyPosition(ctx)).filter(
      (m) => unit == null || m.seat.businessUnit === unit,
    )
    return guardFigure(ctx, { members, version: v, fit: null, partial: false }).total
  }

  it('gives a unit or the company its split exactly where the screen shows it, and nowhere else', () => {
    const v = fin.version as AnyVersion
    const units = [...new Set(file.rows.map((r) => r.org))].sort()
    let shown = 0
    for (const p of longPeriodsOf(fin, v)) {
      for (const unit of [null, ...units]) {
        const screen = screenOf(fin, p.key, unit)
        const t = file.componentTotals.find((x) => x.period === p.key && x.org === (unit ?? ''))
        const where = `${p.key} ${unit ?? 'company'}`
        if (screen.hidden || screen.componentsHidden) {
          expect(t, where).toBeUndefined()
          continue
        }
        shown++
        if (!t) throw new Error(`${where}: no component control total where the screen splits`)
        // The screen's own numbers: each component of the filled part, the band part, the total.
        for (const c of SPLIT_COMPONENTS)
          expect(t.usdByComponent[c], `${where} ${c}`).toBeCloseTo(screen.amounts[c] as number, 2)
        expect(t.bandUsd ?? 0, where).toBeCloseTo(screen.bandUsd ?? 0, 2)
        expect(t.loadedUsd, where).toBeCloseTo(screen.totalUsd as number, 2)
        expect(t.costed, where).toBeGreaterThanOrEqual(fin.guard.rules.minCosted)
        // Components plus the band part are the loaded total, which is the sum of the unit's rows.
        const parts = SPLIT_COMPONENTS.reduce((a, c) => a + t.usdByComponent[c], 0) + (t.bandUsd ?? 0)
        expect(parts, where).toBeCloseTo(t.loadedUsd, 1)
        const rows = file.rows.filter((r) => r.period === p.key && (unit == null || r.org === unit))
        expect(
          rows.reduce((a, r) => a + (r.amountUsd ?? 0), 0),
          where,
        ).toBeCloseTo(t.loadedUsd, 1)
      }
    }
    // On the sample Operations splits in April 2026 (every component 5 or more), the company never.
    expect(shown).toBeGreaterThan(0)
    expect(file.componentTotals.map((t) => `${t.period} ${t.org || 'company'}`)).toContain(
      '2026-04 Operations',
    )
  })

  it('writes each one as a line after the control totals, in USD with the band part apart', () => {
    const t = file.componentTotals.find((x) => x.period === '2026-04' && x.org === 'Operations')
    if (!t) throw new Error('No April split for Operations.')
    const line = firstLines(loadFileText(fin, file), 120).find((l) =>
      l.includes('2026-04, Operations, by component'),
    )
    expect(line).toBeDefined()
    expect(line).toMatch(
      /^"?Control totals 2026-04, Operations, by component: base [\d,]+\.\d\d USD, bonus [\d,]+\.\d\d USD, burden [\d,]+\.\d\d USD, benefits [\d,]+\.\d\d USD, one-time -?[\d,]+\.\d\d USD, vacancy allowance -?[\d,]+\.\d\d USD, (Open and Planned at band estimate -?[\d,]+\.\d\d USD, )?loaded [\d,]+\.\d\d USD"?$/,
    )
    expect(line).toContain(
      `loaded ${t.loadedUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
    )
  })

  it('HR admin with the switch off gives the same; the open file, rounded modes and Manager none', () => {
    expect(loadFileOf(sampleCtx('hr-admin'))?.componentTotals).toEqual(file.componentTotals)
    const on = sampleCtx('hr-admin', { showPay: true })
    expect(loadFileOf(on, { full: true })?.componentTotals).toEqual([])
    expect(longCsvOf(on).componentTotals).toEqual([])
    for (const mode of ['hrbp', 'leader', 'manager'] as const)
      expect(longCsvOf(sampleCtx(mode)).componentTotals, mode).toEqual([])
    // Finance's long CSV of the version shown holds the same as its load file.
    expect(longCsvOf(fin).componentTotals).toEqual(file.componentTotals)
  })

  it('under a cost-center or country filter, no split shows (cost reads "—", C33 (a))', () => {
    for (const filters of [{ costCenter: ['1320-SJC'] }, { country: ['Taiwan'] }])
      expect(longCsvOf(sampleCtx('finance', { filters })).componentTotals, JSON.stringify(filters)).toEqual(
        [],
      )
  })
})

describe('each component control total adds up as written (M4 recheck SB-1-a)', () => {
  /** The amounts of a written component line, in whole cents: its parts, then its loaded total. */
  const centsOf = (line: string): number[] =>
    [...line.matchAll(/(-?[\d,]+\.\d{2}) USD/g)].map((x) => Math.round(Number(x[1].replace(/,/g, '')) * 100))

  it('its components and band part add to its loaded total to the cent, in every version and source', () => {
    let lines = 0
    for (const version of ['fy27-working', 'fy27-budget', 'fy27-q1-reforecast', 'fy28-working'])
      for (const source of ['version', 'forecast'] as const) {
        const m = longCsvOf(sampleCtx('finance', { version }), { source })
        const written = componentTotalLines(m.componentTotals)
        expect(written.length, `${version} ${source}`).toBe(m.componentTotals.length)
        written.forEach((l, i) => {
          const t = m.componentTotals[i]
          const cents = centsOf(l)
          const loaded = cents[cents.length - 1]
          const parts = cents.slice(0, -1)
          const where = `${version} ${source} ${t.period} ${t.label}`
          expect(
            parts.reduce((a, x) => a + x, 0),
            where,
          ).toBe(loaded)
          // The loaded total is the rows' own, to the cent; each part within a cent of its exact amount.
          expect(loaded, where).toBe(Math.round(t.loadedUsd * 100))
          const exact = [
            ...SPLIT_COMPONENTS.map((c) => t.usdByComponent[c]),
            ...(t.bandUsd != null ? [t.bandUsd] : []),
          ]
          exact.forEach((x, k) => {
            expect(Math.abs(parts[k] - x * 100), `${where} part ${k}`).toBeLessThanOrEqual(1)
          })
          lines++
        })
      }
    // Non-vacuous: the sample splits Operations and Executive Office in many months.
    expect(lines).toBeGreaterThan(50)
  })

  it('the unsuppressed file’s split lines add up as written too, equity apart', () => {
    let lines = 0
    for (const version of ['fy27-working', 'fy27-budget']) {
      const ctx = sampleCtx('hr-admin', { showPay: true, version })
      const full = loadFileOf(ctx, { full: true }) as LoadFile
      for (const l of firstLines(loadFileText(ctx, full), 400)) {
        if (!l.includes(', by component: ')) continue
        const c = centsOf(l)
        // base, bonus, burden, benefits, one-time, vacancy allowance, equity (SBC), loaded.
        expect(c.length, l).toBe(8)
        expect(
          c.slice(0, 6).reduce((a, x) => a + x, 0),
          `${version} ${l.slice(0, 60)}`,
        ).toBe(c[7])
        lines++
      }
    }
    expect(lines).toBeGreaterThan(100)
  })

  it('Finance > Export’s table of them shows the same cents as the file', () => {
    const ctx = sampleCtx('finance')
    const fig = financeModel(ctx).export.components
    const file = loadFileOf(ctx) as LoadFile
    const lines = componentTotalLines(file.componentTotals)
    expect(fig?.rows.length).toBe(lines.length)
    fig?.rows.forEach((r, i) => {
      const cents = centsOf(lines[i])
      const row = [r.usdBase, r.usdBonus, r.usdBurden, r.usdBenefits, r.usdOneTime, r.usdVacancy]
      if (r.bandUsd != null) row.push(r.bandUsd)
      row.push(r.loadedUsd)
      expect(
        row.map((x) => Math.round(x * 100)),
        `${r.period} ${r.org}`,
      ).toEqual(cents)
      expect(row.slice(0, -1).reduce((a, x) => a + Math.round(x * 100), 0)).toBe(
        Math.round(r.loadedUsd * 100),
      )
    })
  })
})

describe('the unsuppressed load file', () => {
  it('comes only from HR admin with Show pay amounts on', () => {
    for (const mode of ['finance', 'hrbp', 'leader', 'manager'] as const)
      expect(loadFileOf(sampleCtx(mode), { full: true }), mode).toBeNull()
    expect(loadFileOf(sampleCtx('hr-admin'), { full: true })).toBeNull()
    for (const mode of ['hrbp', 'leader', 'manager'] as const)
      expect(loadFileOf(sampleCtx(mode)), mode).toBeNull()
  })

  it('has no fold and no suppression, its first line "Contains individual pay"; the file at Finance’s rules is offered beside it', () => {
    const ctx = sampleCtx('hr-admin', { showPay: true })
    const full = loadFileOf(ctx, { full: true }) as LoadFile
    expect(full.individualPay).toBe(true)
    expect(full.fileName).toBe('headcount-planner-finance-load-file-full-fy27-working-2026-09-30')
    expect(firstLines(loadFileText(ctx, full), 1)).toEqual([INDIVIDUAL_PAY_LINE])
    expect(full.rows.every((r) => r.suppressed === '' && !r.costCenter.startsWith('Other ('))).toBe(true)
    expect(new Set(full.rows.map((r) => r.component)).has('base')).toBe(true)
    // Every amount of the version over the year, exactly: Σ of the loaded components is the lines' total.
    const v = ctx.version as AnyVersion
    const fy = longPeriodsOf(ctx, v).find((p) => p.key === 'FY')?.months ?? []
    const total = shownLines(ctx, v)
      .filter((l) => fy.includes(l.month) && l.positionId)
      .reduce((a, l) => a + l.usd.loaded, 0)
    expect(full.totals.find((t) => t.period === 'FY')?.loadedUsd).toBeCloseTo(total, 1)
    // The file at Finance's rules, written with the switch off, is Finance's own rows.
    const exact = loadFileOf(ctx) as LoadFile
    expect(exact.mode).toBe('exact')
    expect(amounts(exact)).toEqual(amounts(loadFileOf(sampleCtx('finance'))))
  })

  it('made with the switch on, the file at Finance’s rules starts as every switch-on output does (M4 recheck D-PAYFILES-a)', () => {
    const on = sampleCtx('hr-admin', { showPay: true })
    const exact = loadFileOf(on) as LoadFile
    const text = loadFileText(on, exact)
    // Its rows are Finance's, written as with the switch off ...
    expect(exact.mode).toBe('exact')
    expect(amounts(exact)).toEqual(amounts(loadFileOf(sampleCtx('finance'))))
    expect(text).not.toContain('Other (0)')
    // ... and, made with the switch on, it says so first, as Finance > Export's preview of the same
    // rows does, and names the mode it was made in.
    expect(exact.individualPay).toBe(true)
    expect(firstLines(text, 1)).toEqual([INDIVIDUAL_PAY_LINE])
    expect(text).toContain(hrAdminExportLine(true))
    expect(text).not.toContain(`${hrAdminExportLine(false)}
`)
    // The rounding fact is still Finance's rules, not the switch's.
    expect(exact.meta.plan?.rounding).toBe(loadFileOf(sampleCtx('hr-admin'))?.meta.plan?.rounding)
    // With the switch off, and in Finance, no file says it.
    for (const ctx of [sampleCtx('hr-admin'), sampleCtx('finance')]) {
      const f = loadFileOf(ctx) as LoadFile
      expect(f.individualPay, ctx.mode).toBe(false)
      expect(loadFileText(ctx, f), ctx.mode).not.toContain(INDIVIDUAL_PAY_LINE)
    }
  })

  it('names its split by component for the whole company, as the screen names the scope (review SB-1)', () => {
    const ctx = sampleCtx('hr-admin', { showPay: true })
    const full = loadFileOf(ctx, { full: true }) as LoadFile
    const fy = full.totals.find((t) => t.period === 'FY')
    expect(fy?.components?.[0]).toMatchObject({ org: '', label: WHOLE_COMPANY })
    expect(fy?.components?.[0].loadedUsd).toBe(fy?.loadedUsd)
    expect(loadFileText(ctx, full)).toContain(`Control totals FY, ${WHOLE_COMPANY}, by component: base `)
    // The long CSV under a department filter names the department.
    const dept = sampleCtx('hr-admin', { showPay: true, filters: { department: ['Architecture'] } })
    const long = longCsvOf(dept)
    expect(long.mode).toBe('open')
    expect(long.totals.find((t) => t.period === 'FY')?.components?.[0].label).toBe(dept.scopeLabel)
  })
})

describe('suppressed flags: a unit of 3 costed people', () => {
  it('is left out, its cells empty with "Yes" and the reason, and the note says how many', () => {
    const s = leakSample()
    const filled = s.datasets.positions.filter(
      (p) =>
        p.status === 'Filled' &&
        p.costCenter === '1320-SJC' &&
        !s.datasets.positions.some((q) => q.managerPositionId === p.positionId),
    )
    const three = new Set(filled.slice(0, 3).map((p) => p.positionId))
    expect(three.size).toBe(3)
    const positions = s.datasets.positions.map((p) =>
      three.has(p.positionId)
        ? { ...p, businessUnit: 'Ventures', costCenter: '9910-SJC', department: null }
        : p,
    )
    const ctx = sampleCtx('finance', { sample: withDatasets(s, { positions }) })
    const file = loadFileOf(ctx) as LoadFile
    const ventures = file.rows.filter((r) => r.org === 'Ventures')
    expect(ventures.length).toBeGreaterThan(0)
    for (const r of ventures) {
      expect(r.suppressed).toBe('Yes')
      expect(r.amountUsd).toBeNull()
      expect(r.amountLocal).toBeNull()
      expect(r.suppressedReason).toBe('Hidden to protect anonymity (n < 5)')
      expect(r.heads === null || r.heads >= 0).toBe(true)
    }
    expect(file.note).toBe('3 people in cost centers under 5 are left out')
    // Every other unit still shows, and the totals count the empty cells.
    expect(file.rows.some((r) => r.org !== 'Ventures' && r.amountUsd != null)).toBe(true)
    const fy = file.totals.find((t) => t.period === 'FY')
    expect(fy?.suppressedCells).toBe(ventures.filter((r) => r.period === 'FY').length)
  })
})

describe('Finance > Export', () => {
  it('offers the load file in Finance, both files in HR admin with the switch on, nothing elsewhere', () => {
    const fin = financeModel(sampleCtx('finance')).export
    expect(fin.versions.map((v) => v.label)).toEqual([
      'FY27 Budget (locked)',
      'FY27 Q1 Reforecast (locked)',
      'FY27 Working',
    ])
    expect(fin.loadFile?.label).toBe(LOAD_FILE_LABEL)
    expect(fin.loadFile?.disabled).toBeNull()
    expect(fin.fullLoadFile).toBeNull()
    const file = loadFileOf(sampleCtx('finance')) as LoadFile
    expect(fin.totals?.id).toBe('finance-export-totals')
    expect(fin.totals?.rows.map((r) => [r.period, r.loadedUsd])).toEqual(
      file.totals.map((t) => [t.period, t.loadedUsd]),
    )
    expect(fin.preview?.id).toBe('finance-export-preview')
    expect(fin.preview?.rows.map(({ costed: _c, ...r }) => r)).toEqual(
      file.rows.filter((r: LongRow) => r.period === 'FY'),
    )
    // The control totals by component (review SB-1): the file's as it writes them, in whole cents
    // (M4 recheck SB-1-a), each with its costed people.
    expect(fin.components?.id).toBe('finance-export-components')
    expect(fin.components?.rows.map((r) => [r.period, r.org, r.usdBase, r.loadedUsd])).toEqual(
      file.componentTotals.map((t) => {
        const w = componentCents(t)
        return [t.period, t.label, w.usdByComponent.base, w.loadedUsd]
      }),
    )
    expect(fin.components?.rows.length).toBeGreaterThan(0)
    for (const r of fin.components?.rows ?? []) expect(r.costed).toBeGreaterThanOrEqual(5)
    // Each preview row and total carries the costed people behind it (5 or more), for the leak tests.
    for (const r of fin.preview?.rows ?? []) expect(r.costed ?? 0).toBeGreaterThanOrEqual(5)
    for (const t of fin.totals?.rows ?? []) expect(t.costed ?? 0).toBeGreaterThanOrEqual(5)
    expect(financeModel(sampleCtx('hr-admin')).export.fullLoadFile).toBeNull()
    const on = financeModel(sampleCtx('hr-admin', { showPay: true })).export
    expect(on.loadFile?.label).toBe(LOAD_FILE_LABEL)
    expect(on.fullLoadFile?.label).toBe(FULL_LOAD_FILE_LABEL)
    expect(on.fullLoadFile?.individualPay).toBe(true)
    for (const mode of ['hrbp', 'leader', 'manager'] as const)
      expect(financeModel(sampleCtx(mode)).export, mode).toBe(EMPTY_EXPORT)
  })

  it('reads the version shown, and its preview rows are the file’s', () => {
    const ctx = sampleCtx('finance', { version: 'fy27-budget' })
    const e = financeModel(ctx).export
    expect(e.preview?.rows.every((r) => r.version === 'FY27 Budget')).toBe(true)
    expect(e.preview?.rows.every((r) => isAmountRow(r))).toBe(true)
  })
})
