/**
 * Coercers and vocabularies (docs/PLAN.md 16.2): dates without time-zone shifts, numbers in every
 * local style, yes and no, shares of full time, levels from codes and titles onto P1-P6, M1-M2 and
 * E1-E3, every enum field's vocabulary, fiscal years, assumption values, sites, legal entities and
 * currencies, and manual corrections read through the field type.
 */
import { describe, expect, it } from 'vitest'
import { type DatasetKey, datasetDef, REQUEST_STATES, REQUEST_TYPES } from '../schema'
import { canonicalText, normalizeCurrency } from './canonical'
import { readDate } from './dates'
import {
  coerceAssumptionValue,
  coerceBoolean,
  coerceDate,
  coerceDateTime,
  coerceFiscalYear,
  coerceId,
  coerceLevel,
  coerceMoney,
  coerceNumber,
  coercePercent,
  coerceShare,
  coerceValue,
  detectDateOrder,
  detectPercentWhole,
  readFiscalYear,
} from './normalize'
import { normalizeAssumptionTable, normalizeEnumValue, normalizeLevel } from './vocab'

const enumOf = (dataset: DatasetKey, field: string, raw: string) => {
  const f = datasetDef(dataset).fields.find((x) => x.key === field)!
  return normalizeEnumValue(dataset, field, f.values ?? [], raw)
}
const col = (valueMap?: Record<string, string | null>) => ({
  dateOrder: 'MDY' as const,
  percentWhole: false,
  ...(valueMap ? { valueMap } : {}),
})
const field = (ds: DatasetKey, key: string) => datasetDef(ds).fields.find((x) => x.key === key)!

describe('dates', () => {
  it('reads ISO, compact, slashed year-first and named-month dates', () => {
    expect(coerceDate('2026-09-30').value).toBe('2026-09-30')
    expect(coerceDate('2026-9-3').value).toBe('2026-09-03')
    expect(coerceDate('2026/09/30').value).toBe('2026-09-30')
    expect(coerceDate('20260930').value).toBe('2026-09-30')
    expect(coerceDate(20260930).value).toBe('2026-09-30')
    expect(coerceDate('30-Sep-2026').value).toBe('2026-09-30')
    expect(coerceDate('1-Mar-26').value).toBe('2026-03-01')
    expect(coerceDate('30 September 2026').value).toBe('2026-09-30')
    expect(coerceDate('Sep 30, 2026').value).toBe('2026-09-30')
    expect(coerceDate('Tue, 30 Sep 2026').value).toBe('2026-09-30')
  })

  it('never shifts a date by a time zone', () => {
    expect(coerceDate('2026-09-30T23:30:00Z').value).toBe('2026-09-30')
    expect(coerceDate('2026-09-30T00:30:00+05:30').value).toBe('2026-09-30')
    expect(coerceDate(new Date(Date.UTC(2026, 8, 30))).value).toBe('2026-09-30')
    // Spreadsheet float noise just before midnight rounds to the intended day.
    expect(coerceDate(new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999))).value).toBe('2026-10-01')
  })

  it('reads Excel serial numbers, including the 1900 leap-year quirk', () => {
    expect(coerceDate(46295).value).toBe('2026-09-30')
    expect(coerceDate('46295').value).toBe('2026-09-30')
    expect(coerceDate(45658.5).value).toBe('2025-01-01')
    expect(readDate(44927)).toEqual({ ok: true, parts: { y: 2023, m: 1, d: 1, hh: 0, mi: 0 } })
    // Serials from the early 1900s are numbers mapped by mistake, not HR dates.
    expect(readDate(61)).toEqual({ ok: false, reason: 'out-of-range' })
    expect(readDate(1)).toEqual({ ok: false, reason: 'out-of-range' })
    expect(coerceDate(5).code).toBe('out-of-range')
    expect(coerceDate(90000).code).toBe('unreadable')
  })

  it('applies the column day order only to ambiguous slashed dates', () => {
    expect(coerceDate('03/04/2026', 'MDY').value).toBe('2026-03-04')
    expect(coerceDate('03/04/2026', 'DMY').value).toBe('2026-04-03')
    expect(coerceDate('14/03/2026', 'MDY').value).toBe('2026-03-14')
    expect(coerceDate('03/14/2026', 'DMY').value).toBe('2026-03-14')
    expect(coerceDate('30.09.2026', 'DMY').value).toBe('2026-09-30')
    expect(coerceDate('3/4/26', 'MDY').value).toBe('2026-03-04')
  })

  it('detects the day order of a column', () => {
    expect(detectDateOrder(['03/04/2026', '14/03/2026', '01/02/2026'])).toEqual({
      order: 'DMY',
      certain: true,
    })
    expect(detectDateOrder(['03/04/2026', '03/14/2026'])).toEqual({ order: 'MDY', certain: true })
    expect(detectDateOrder(['03/04/2026', '01/02/2026'])).toEqual({ order: 'MDY', certain: false })
    expect(detectDateOrder(['03.04.2026', '01.02.2026'])).toEqual({ order: 'DMY', certain: false })
    expect(detectDateOrder([new Date(), 46295, null])).toEqual({ order: 'MDY', certain: false })
  })

  it('reports values that are not dates', () => {
    expect(coerceDate('soon')).toEqual({ value: null, issue: '"soon" is not a date.', code: 'unreadable' })
    expect(coerceDate('2026-02-30').code).toBe('unreadable')
    expect(coerceDate('13/13/2026').code).toBe('unreadable')
    expect(coerceDate('1890-01-01').code).toBe('out-of-range')
    expect(coerceDate('N/A')).toEqual({ value: null })
    expect(coerceDate('  ')).toEqual({ value: null })
  })

  it('reads date-times to the minute', () => {
    expect(coerceDateTime('2026-09-30 14:05').value).toBe('2026-09-30T14:05')
    expect(coerceDateTime('2026-09-30T14:05:59').value).toBe('2026-09-30T14:05')
    expect(coerceDateTime('9/30/2026 2:05 PM').value).toBe('2026-09-30T14:05')
    expect(coerceDateTime('9/30/2026 12:10 am').value).toBe('2026-09-30T00:10')
    expect(coerceDateTime('2026-09-30').value).toBe('2026-09-30T00:00')
    expect(coerceDateTime(new Date(Date.UTC(2026, 8, 30, 14, 4, 59, 999))).value).toBe('2026-09-30T14:05')
    expect(coerceDateTime(46295.25).value).toBe('2026-09-30T06:00')
    expect(coerceDateTime('later').issue).toBe('"later" is not a date and time.')
  })
})

describe('numbers', () => {
  it('strips currency, separators and codes', () => {
    expect(coerceNumber('$120,000').value).toBe(120000)
    expect(coerceNumber('€1.234,56').value).toBe(1234.56)
    expect(coerceNumber('1 234 567').value).toBe(1234567)
    expect(coerceNumber("1'234").value).toBe(1234)
    expect(coerceNumber('USD 95,000').value).toBe(95000)
    expect(coerceNumber('95000USD').value).toBe(95000)
    expect(coerceNumber('₹9,80,000').value).toBe(980000)
    expect(coerceNumber('1,23,45,678').value).toBe(12345678)
    expect(coerceNumber('NT$ 1,200,000').value).toBe(1200000)
    expect(coerceNumber('12,5').value).toBe(12.5)
    expect(coerceNumber('(1,234)').value).toBe(-1234)
    expect(coerceNumber('-42').value).toBe(-42)
    expect(coerceNumber('1e3').value).toBe(1000)
    expect(coerceNumber(7).value).toBe(7)
  })

  it('reads k and m suffixes on amounts only', () => {
    expect(coerceMoney('120k').value).toBe(120000)
    expect(coerceMoney('1.2M').value).toBe(1200000)
    expect(coerceMoney('$85K').value).toBe(85000)
    expect(coerceNumber('120k').code).toBe('unreadable')
  })

  it('treats placeholders as blank and words as unreadable', () => {
    expect(coerceNumber('-')).toEqual({ value: null })
    expect(coerceNumber('n/a')).toEqual({ value: null })
    expect(coerceNumber('lots').issue).toBe('"lots" is not a number.')
    expect(coerceMoney('lots').issue).toBe('"lots" is not an amount.')
    expect(coerceNumber(true).code).toBe('unreadable')
  })

  it('reads percentages as fractions', () => {
    expect(coercePercent('3.5%', false).value).toBeCloseTo(0.035)
    expect(coercePercent('3.5%', true).value).toBeCloseTo(0.035)
    expect(coercePercent(0.035, false).value).toBe(0.035)
    expect(coercePercent(3.5, true).value).toBeCloseTo(0.035)
    expect(coercePercent('12', true).value).toBeCloseTo(0.12)
  })

  it('detects whole-number percent columns by the median', () => {
    expect(detectPercentWhole([3, 3.5, 4, 0, 5])).toBe(true)
    expect(detectPercentWhole([0.03, 0.035, 0.04])).toBe(false)
    expect(detectPercentWhole([0.8, 1.1, 1.4])).toBe(false)
    expect(detectPercentWhole(['3%', '4%'])).toBe(false)
    expect(detectPercentWhole([])).toBe(false)
  })

  it('reads an FTE as a share of full time, value by value', () => {
    const fte = { value: 0, inclusive: false }
    expect(coerceShare(0.8, 'an FTE', fte).value).toBe(0.8)
    expect(coerceShare('80', 'an FTE', fte).value).toBe(0.8)
    expect(coerceShare('80%', 'an FTE', fte).value).toBe(0.8)
    expect(coerceShare('35%', 'an FTE', fte).value).toBe(0.35)
    expect(coerceShare(1, 'an FTE', fte).value).toBe(1)
    expect(coerceShare(1.25, 'an FTE', fte).value).toBe(1.25)
    expect(coerceShare(0, 'an FTE', fte)).toEqual({
      value: null,
      issue: '"0" is outside the range for an FTE.',
      code: 'out-of-range',
    })
    expect(coerceShare('200%', 'an FTE', fte).code).toBe('out-of-range')
    expect(coerceShare('half', 'an FTE', fte).issue).toBe('"half" is not an FTE.')
    expect(coerceValue('positions', field('positions', 'fte'), '60%', col()).value).toBe(0.6)
    expect(coerceValue('requests', field('requests', 'restFte'), 50, col()).value).toBe(0.5)
  })
})

describe('booleans', () => {
  it('reads yes and no in their common spellings', () => {
    for (const v of ['Yes', 'y', 'TRUE', '1', 'x', 'X', '✓', 'Required', 'on', true, 1, 2])
      expect(coerceBoolean(v).value, String(v)).toBe(true)
    for (const v of ['No', 'n', 'false', '0', 'Not required', 'Non-leader', 'Optional', false, 0])
      expect(coerceBoolean(v).value, String(v)).toBe(false)
    expect(coerceBoolean('')).toEqual({ value: null })
    expect(coerceBoolean(null)).toEqual({ value: null })
    expect(coerceBoolean('maybe').code).toBe('unknown-value')
  })
})

describe('levels', () => {
  const table: [unknown, string | null][] = [
    ['P1', 'P1'],
    ['p 4', 'P4'],
    ['P-6', 'P6'],
    ['L4', 'P4'],
    ['l 3', 'P3'],
    ['IC1', 'P1'],
    ['IC4', 'P4'],
    ['T5', 'P5'],
    ['Level 2', 'P2'],
    ['grade 3', 'P3'],
    [3, 'P3'],
    ['5', 'P5'],
    ['M1', 'M1'],
    ['M2 Director', 'M2'],
    ['E3', 'E3'],
    ['P4 Senior', 'P4'],
    ['E1 Vice president', 'E1'],
    ['Junior', 'P1'],
    ['Entry', 'P1'],
    ['Associate', 'P1'],
    ['Intern', 'P1'],
    ['Senior', 'P4'],
    ['Sr.', 'P4'],
    ['Staff', 'P5'],
    ['Senior Staff', 'P5'],
    ['Principal', 'P6'],
    ['Distinguished Engineer', 'P6'],
    ['Fellow', 'P6'],
    ['Manager', 'M1'],
    ['Senior Manager', 'M1'],
    ['6 Manager', 'M1'],
    ['Director', 'M2'],
    ['Sr Director', 'M2'],
    ['Associate Director', 'M2'],
    ['VP', 'E1'],
    ['Vice President', 'E1'],
    ['SVP', 'E2'],
    ['EVP', 'E2'],
    ['Senior Vice President', 'E2'],
    ['CEO', 'E3'],
    ['CFO', 'E3'],
    ['C-suite', 'E3'],
    ['Chief People Officer', 'E3'],
    ['Executive', 'E3'],
    ['M3', null],
    ['P7', null],
    ['L7', null],
    [7, null],
    ['Individual contributor', null],
    ['Technician 2', null],
    ['', null],
  ]
  it.each(table)('%s → %s', (raw, expected) => {
    expect(normalizeLevel(raw)).toBe(expected)
  })

  it('reports unknown levels instead of guessing', () => {
    expect(coerceLevel('Wizard')).toEqual({
      value: null,
      issue: '"Wizard" is not a recognized level (P1-P6, M1-M2, E1-E3).',
      code: 'unknown-value',
    })
  })
})

describe('enums', () => {
  it('reads seat statuses: eliminated and on hold first, "not filled" an Open seat', () => {
    const s = (v: string) => enumOf('positions', 'status', v)
    expect(['Filled', 'Occupied', 'Incumbent'].map(s)).toEqual(['Filled', 'Filled', 'Filled'])
    expect(['Open', 'Vacant', 'Not filled', 'Recruiting'].map(s)).toEqual(['Open', 'Open', 'Open', 'Open'])
    expect(['Planned', 'Budgeted', 'Not yet open', 'Future'].map(s)).toEqual([
      'Planned',
      'Planned',
      'Planned',
      'Planned',
    ])
    expect(['On hold', 'Frozen', 'Paused'].map(s)).toEqual(['On hold', 'On hold', 'On hold'])
    expect(['Eliminated', 'Closed', 'Inactive', 'Abolished'].map(s)).toEqual([
      'Eliminated',
      'Eliminated',
      'Eliminated',
      'Eliminated',
    ])
    expect(s('Reorganized')).toBe(null)
    expect(enumOf('positions', 'endReason', 'Headcount trade')).toBe('Traded')
    expect(enumOf('positions', 'endReason', 'Moved to another org')).toBe('Transferred')
    expect(enumOf('positions', 'endReason', 'RIF')).toBe('Eliminated')
  })

  it('normalizes worker types, contractor words before employee words', () => {
    for (const v of ['FTE', 'Regular', 'Full-time', 'Part time', 'Permanent', 'Employee', 'Salaried'])
      expect(enumOf('workers', 'workerType', v), v).toBe('Employee')
    for (const v of ['Contractor', 'Contingent worker', 'Temp', 'Consultant', 'Vendor', 'Contract employee'])
      expect(enumOf('workers', 'workerType', v), v).toBe('Contractor')
    for (const v of ['Intern', 'Co-op', 'Student', 'Apprentice', 'Summer intern'])
      expect(enumOf('workers', 'workerType', v), v).toBe('Intern')
    expect(enumOf('workers', 'workerType', 'Seasonal')).toBe(null)
    expect(enumOf('positions', 'workerType', 'Contingent')).toBe('Contractor')
  })

  it('normalizes requisition fields', () => {
    expect(enumOf('reqs', 'status', 'Approved')).toBe('Open')
    expect(enumOf('reqs', 'status', 'Sourcing')).toBe('Open')
    expect(enumOf('reqs', 'status', 'Paused')).toBe('On hold')
    expect(enumOf('reqs', 'status', 'Closed - Filled')).toBe('Filled')
    expect(enumOf('reqs', 'status', 'Closed')).toBe('Cancelled')
    expect(enumOf('reqs', 'status', 'Canceled')).toBe('Cancelled')
    expect(enumOf('reqs', 'status', 'Draft')).toBe(null)
    expect(enumOf('reqs', 'stage', 'Offer extended')).toBe('Interviewing')
    expect(enumOf('reqs', 'stage', 'Offer accepted')).toBe('Offer accepted')
    expect(enumOf('reqs', 'stage', 'Preboarding')).toBe('Offer accepted')
    expect(enumOf('reqs', 'stage', 'Onsite')).toBe('Interviewing')
    expect(enumOf('reqs', 'stage', 'Hired')).toBe('Started')
    expect(enumOf('reqs', 'stage', 'Approved')).toBe('Req opened')
    expect(enumOf('reqs', 'reqType', 'Replacement')).toBe('Backfill')
    expect(enumOf('reqs', 'reqType', 'Net new')).toBe('New')
  })

  it('normalizes request types, specific types first', () => {
    const t = (v: string) => enumOf('requests', 'type', v)
    expect(t('Headcount trade')).toBe('Trade')
    expect(t('Backfill trade')).toBe('Trade')
    expect(t('New hire backfill')).toBe('Backfill')
    expect(t('Open req')).toBe('Start recruiting')
    expect(t('Change start date')).toBe('Start date')
    expect(t('Promotion')).toBe('Level change')
    expect(t('Relocation')).toBe('Location change')
    expect(t('Internal move')).toBe('Transfer')
    expect(t('RIF')).toBe('Elimination')
    expect(t('Net new headcount')).toBe('New role')
    expect(t('Hire a llama')).toBe(null)
    for (const v of REQUEST_TYPES) expect(t(v)).toBe(v)
  })

  it('normalizes request states, negative words first', () => {
    const s = (v: string) => enumOf('requests', 'state', v)
    expect(s('Not approved')).toBe('Rejected')
    expect(s('Not submitted')).toBe('Draft')
    expect(s('Approved with edits')).toBe('Approved with changes')
    expect(s('Returned to requester')).toBe('Sent back')
    expect(s('Pending approval')).toBe('In review')
    expect(s('Awaiting finance')).toBe('In review')
    expect(s('Withdrew')).toBe('Withdrawn')
    expect(s('Lapsed')).toBe('Expired')
    expect(s('Raised')).toBe('Submitted')
    for (const v of REQUEST_STATES) expect(s(v)).toBe(v)
  })

  it('normalizes reason codes and transfer kinds', () => {
    const r = (v: string) => enumOf('requests', 'reasonCode', v)
    expect(r('Attrition')).toBe('Attrition backfill')
    expect(r('Cost neutral')).toBe('Cost-neutral mix')
    expect(r('Reorg')).toBe('Restructure')
    expect(r('Below cut line')).toBe('Below the cut line')
    expect(r('Budget cuts')).toBe('Cost reduction')
    expect(r('Scaling')).toBe('Growth')
    expect(r('Because')).toBe(null)
    expect(enumOf('requests', 'transferKind', 'Internal transfer')).toBe('Internal move')
    expect(enumOf('requests', 'transferKind', 'Seat move')).toBe('Position move')
  })

  it('reads assumption tables by code, label or a common name', () => {
    expect(normalizeAssumptionTable('bonustarget')).toBe('bonusTarget')
    expect(normalizeAssumptionTable('band midpoints')).toBe('band')
    expect(normalizeAssumptionTable('fx rate')).toBe('fx')
    expect(normalizeAssumptionTable('payroll tax')).toBe('burden')
    expect(normalizeAssumptionTable('days to fill')).toBe('timeToFill')
    expect(normalizeAssumptionTable('moon rocks')).toBe(null)
    expect(enumOf('assumptions', 'table', 'GL account')).toBe('glAccount')
  })

  it('reports unknown values with the allowed list', () => {
    expect(coerceValue('reqs', field('reqs', 'status'), 'Draft', col())).toEqual({
      value: null,
      issue: '"Draft" is not a recognized status (Open, On hold, Filled, Cancelled).',
      code: 'unknown-value',
    })
  })

  it('uses manual value corrections first', () => {
    const c = col({ 'awaiting budget': 'On hold', 'talent pool': null })
    expect(coerceValue('reqs', field('reqs', 'status'), 'Awaiting Budget', c).value).toBe('On hold')
    expect(coerceValue('reqs', field('reqs', 'status'), 'Talent pool', c)).toEqual({ value: null })
  })

  it('reads manual corrections through the field type, not as raw text', () => {
    const yesNo = col({ 'people leader': 'Yes', 'no reports': 'No', 'maybe later': 'false' })
    const leader = field('positions', 'leaderLevel')
    expect(coerceValue('positions', leader, 'People leader', yesNo)).toEqual({ value: true })
    expect(coerceValue('positions', leader, 'No reports', yesNo)).toEqual({ value: false })
    expect(coerceValue('positions', leader, 'Maybe later', yesNo)).toEqual({ value: false })
    // Numbers, levels and enums in their canonical spelling.
    expect(coerceValue('targets', field('targets', 'targetHeads'), 'a few', col({ 'a few': '3' }))).toEqual({
      value: 3,
    })
    const level = field('positions', 'level')
    expect(coerceValue('positions', level, 'Band 4', col({ 'band 4': 'l4' })).value).toBe('P4')
    const stage = field('reqs', 'stage')
    expect(coerceValue('reqs', stage, 'BG check', col({ 'bg check': 'offer accepted' })).value).toBe(
      'Offer accepted',
    )
    // Blanks stay blank; a correction the field can't read is reported, never stored as text.
    expect(coerceValue('positions', level, 'TBD', col({ tbd: null }))).toEqual({ value: null })
    expect(coerceValue('positions', level, 'TBD', col({ tbd: '' }))).toEqual({ value: null })
    const bad = coerceValue('positions', level, 'TBD', col({ tbd: 'Wizard' }))
    expect(bad.value).toBeNull()
    expect(bad.code).toBe('unknown-value')
    expect(bad.issue).toMatch(/^Your correction "Wizard" is not a recognized level/)
  })
})

describe('fiscal years and assumption values', () => {
  it('reads a fiscal year by the calendar year it ends in', () => {
    for (const v of ['FY28', 'fy 28', 'FY2028', 'FY 2028', '2027/28', '2027-28', 28, 2028])
      expect(readFiscalYear(v), String(v)).toBe('FY28')
    expect(readFiscalYear('2026/28')).toBe(null)
    expect(readFiscalYear('next year')).toBe(null)
    expect(readFiscalYear(2028.5)).toBe(null)
    expect(coerceFiscalYear('soon')).toEqual({
      value: null,
      issue: '"soon" is not a fiscal year such as FY28.',
      code: 'unknown-value',
    })
    expect(coerceValue('targets', field('targets', 'fiscalYear'), '2026/27', col()).value).toBe('FY27')
  })

  it('reads assumption values as numbers in their unit', () => {
    expect(coerceAssumptionValue('3.5%').value).toBeCloseTo(0.035)
    expect(coerceAssumptionValue('€110,000').value).toBe(110000)
    expect(coerceAssumptionValue('1.2m').value).toBe(1200000)
    expect(coerceAssumptionValue(0.000039).value).toBe(0.000039)
    expect(coerceAssumptionValue('2026-04-01').value).toBe(20260401)
    expect(coerceAssumptionValue(new Date(Date.UTC(2026, 3, 1))).value).toBe(20260401)
    expect(coerceAssumptionValue('01/04/2026', 'DMY').value).toBe(20260401)
    expect(coerceAssumptionValue('lots').issue).toBe('"lots" is not a number.')
    expect(coerceAssumptionValue(true).code).toBe('unreadable')
  })
})

describe('text fields with vocabularies', () => {
  it('canonicalizes known sites, legal entities and currencies', () => {
    expect(canonicalText('positions', 'location', 'bangalore')).toBe('Bengaluru')
    expect(canonicalText('workers', 'location', 'San Jose, CA')).toBe('San Jose')
    expect(canonicalText('requests', 'location', 'Saigon')).toBe('Ho Chi Minh City')
    expect(canonicalText('positions', 'location', 'München')).toBe('Munich')
    expect(canonicalText('positions', 'location', 'Phoenix')).toBe(null)
    expect(canonicalText('positions', 'legalEntity', 'northgate semiconductor gmbh')).toBe(
      'Northgate Semiconductor GmbH',
    )
    expect(canonicalText('workers', 'legalEntity', 'Acme Ltd')).toBe(null)
    expect(canonicalText('reqs', 'offerCurrency', 'NT$')).toBe('TWD')
    expect(canonicalText('positions', 'department', 'DV')).toBe(null)
    expect(normalizeCurrency('$')).toBe('USD')
    expect(normalizeCurrency('eur')).toBe('EUR')
    expect(normalizeCurrency('NT$')).toBe('TWD')
    expect(normalizeCurrency('Euro')).toBe('EUR')
    expect(normalizeCurrency('₪')).toBe('ILS')
    expect(normalizeCurrency('dollars please')).toBe(null)
  })

  it('keeps unknown text as written', () => {
    const f = field('positions', 'location')
    expect(coerceValue('positions', f, '  Phoenix  ', col()).value).toBe('Phoenix')
    expect(coerceValue('positions', f, 'bangalore', col()).value).toBe('Bengaluru')
  })

  it('reads IDs as text without spreadsheet decimals', () => {
    expect(coerceId(10234).value).toBe('10234')
    expect(coerceId('10234.0').value).toBe('10234')
    expect(coerceId(' E-0012 ').value).toBe('E-0012')
    expect(coerceId('00123').value).toBe('00123')
    expect(coerceId(new Date(Date.UTC(2026, 0, 1))).code).toBe('unreadable')
  })
})
