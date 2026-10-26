/**
 * Columnar line tables (docs/PLAN.md 5.3): a locked version's lines and a close's actual lines are
 * stored as one Float64Array per number column plus dictionary-coded string columns, so about 30,000
 * lines stay small and clone into IndexedDB as plain data. These functions convert both ways; a round
 * trip returns equal rows. Built by engines A in M1. Pure.
 */
import type {
  ActualLine,
  ActualLineNumber,
  ActualLineTable,
  CostBasis,
  LeaveState,
  Month,
  PlanLine,
  PlanLineNumber,
  PlanLineTable,
  PositionStatus,
  RowsOf,
  StringColumn,
} from '../types'

/** The number columns of a PlanLineTable, in storage order. */
export const PLAN_LINE_NUMBERS: readonly PlanLineNumber[] = [
  'heads',
  'fte',
  'active',
  'rate',
  'localBase',
  'localBonus',
  'localBurden',
  'localBenefits',
  'localOneTime',
  'localVacancy',
  'usdBase',
  'usdBonus',
  'usdBurden',
  'usdBenefits',
  'usdOneTime',
  'usdVacancy',
  'usdEquity',
  'usdLoaded',
]

/** The number columns of an ActualLineTable, in storage order (the same as plan lines). */
export const ACTUAL_LINE_NUMBERS: readonly ActualLineNumber[] = PLAN_LINE_NUMBERS

/** A dictionary-coded string column built one value at a time. */
class ColumnBuilder<T extends string> {
  readonly dict: T[] = []
  private readonly index = new Map<T, number>()
  readonly codes: Uint32Array
  constructor(length: number) {
    this.codes = new Uint32Array(length)
  }
  set(i: number, value: T): void {
    let code = this.index.get(value)
    if (code === undefined) {
      code = this.dict.length
      this.dict.push(value)
      this.index.set(value, code)
    }
    this.codes[i] = code
  }
  done(): StringColumn<T> {
    return { dict: this.dict, codes: this.codes }
  }
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** What the number columns hold of a line. */
interface LineNumbers {
  heads: number
  fte: number
  active: number
  rate: number
  local: PlanLine['local']
  usd: PlanLine['usd']
}

function numberColumns(length: number): Record<PlanLineNumber, Float64Array> {
  const out = {} as Record<PlanLineNumber, Float64Array>
  for (const k of PLAN_LINE_NUMBERS) out[k] = new Float64Array(length)
  return out
}

/** A writer of lines' numbers into row i of the columns, one column per `PLAN_LINE_NUMBERS` entry. */
function numberWriter(cols: Record<PlanLineNumber, Float64Array>): (i: number, l: LineNumbers) => void {
  const {
    heads,
    fte,
    active,
    rate,
    localBase,
    localBonus,
    localBurden,
    localBenefits,
    localOneTime,
    localVacancy,
    usdBase,
    usdBonus,
    usdBurden,
    usdBenefits,
    usdOneTime,
    usdVacancy,
    usdEquity,
    usdLoaded,
  } = cols
  return (i, l) => {
    heads[i] = l.heads
    fte[i] = l.fte
    active[i] = l.active
    rate[i] = l.rate
    localBase[i] = l.local.base
    localBonus[i] = l.local.bonus
    localBurden[i] = l.local.burden
    localBenefits[i] = l.local.benefits
    localOneTime[i] = l.local.oneTime
    localVacancy[i] = l.local.vacancy
    usdBase[i] = l.usd.base
    usdBonus[i] = l.usd.bonus
    usdBurden[i] = l.usd.burden
    usdBenefits[i] = l.usd.benefits
    usdOneTime[i] = l.usd.oneTime
    usdVacancy[i] = l.usd.vacancy
    usdEquity[i] = l.usd.equity
    usdLoaded[i] = l.usd.loaded
  }
}

/** Amounts of row i read back from the number columns. */
function amountsAt(n: Readonly<Record<PlanLineNumber, Float64Array>>, i: number) {
  return {
    heads: n.heads[i],
    fte: n.fte[i],
    active: n.active[i],
    rate: n.rate[i],
    local: {
      base: n.localBase[i],
      bonus: n.localBonus[i],
      burden: n.localBurden[i],
      benefits: n.localBenefits[i],
      oneTime: n.localOneTime[i],
      vacancy: n.localVacancy[i],
    },
    usd: {
      base: n.usdBase[i],
      bonus: n.usdBonus[i],
      burden: n.usdBurden[i],
      benefits: n.usdBenefits[i],
      oneTime: n.usdOneTime[i],
      vacancy: n.usdVacancy[i],
      equity: n.usdEquity[i],
      loaded: n.usdLoaded[i],
    },
  }
}

/**
 * Lines as a table, sorted by positionId, month, then holderId (null first). Every line must carry
 * `versionId`; throws when two versions are mixed.
 *
 * The sort is stable, so lines equal on all three keep their input order. Dictionaries list values
 * in order of first appearance in the sorted rows.
 */
export function toPlanLineTable(versionId: string, lines: readonly PlanLine[]): PlanLineTable {
  for (const l of lines) {
    if (l.versionId !== versionId)
      throw new Error(`A line of ${l.versionId || 'no version'} cannot be stored in ${versionId}.`)
  }
  const sorted = [...lines].sort(
    (a, b) =>
      cmp(a.positionId, b.positionId) || cmp(a.month, b.month) || cmp(a.holderId ?? '', b.holderId ?? ''),
  )
  const n = sorted.length
  const positionId = new ColumnBuilder<string>(n)
  const holderId = new ColumnBuilder<string>(n)
  const month = new ColumnBuilder<Month>(n)
  const status = new ColumnBuilder<PositionStatus>(n)
  const currency = new ColumnBuilder<string>(n)
  const basis = new ColumnBuilder<CostBasis>(n)
  const numbers = numberColumns(n)
  const write = numberWriter(numbers)
  sorted.forEach((l, i) => {
    positionId.set(i, l.positionId)
    holderId.set(i, l.holderId ?? '')
    month.set(i, l.month)
    status.set(i, l.status)
    currency.set(i, l.currency)
    basis.set(i, l.basis)
    write(i, l)
  })
  return {
    length: n,
    versionId,
    positionId: positionId.done(),
    holderId: holderId.done(),
    month: month.done(),
    status: status.done(),
    currency: currency.done(),
    basis: basis.done(),
    numbers,
  }
}

/** A PlanLineTable's rows as PlanLine objects, in stored order (holderId '' reads null). */
export const planLineRows: RowsOf<PlanLineTable, PlanLine> = function* (table) {
  for (let i = 0; i < table.length; i++) {
    const holder = table.holderId.dict[table.holderId.codes[i]]
    yield {
      positionId: table.positionId.dict[table.positionId.codes[i]],
      versionId: table.versionId,
      month: table.month.dict[table.month.codes[i]],
      holderId: holder === '' ? null : holder,
      status: table.status.dict[table.status.codes[i]],
      currency: table.currency.dict[table.currency.codes[i]],
      basis: table.basis.dict[table.basis.codes[i]],
      ...amountsAt(table.numbers, i),
    }
  }
}

/** Actual lines as a table, sorted by month, employeeId, then positionId (null first). */
export function toActualLineTable(lines: readonly ActualLine[]): ActualLineTable {
  const sorted = [...lines].sort(
    (a, b) =>
      cmp(a.month, b.month) || cmp(a.employeeId, b.employeeId) || cmp(a.positionId ?? '', b.positionId ?? ''),
  )
  const n = sorted.length
  const employeeId = new ColumnBuilder<string>(n)
  const positionId = new ColumnBuilder<string>(n)
  const month = new ColumnBuilder<Month>(n)
  const currency = new ColumnBuilder<string>(n)
  const leave = new ColumnBuilder<LeaveState>(n)
  const numbers = numberColumns(n)
  const write = numberWriter(numbers)
  sorted.forEach((l, i) => {
    employeeId.set(i, l.employeeId)
    positionId.set(i, l.positionId ?? '')
    month.set(i, l.month)
    currency.set(i, l.currency)
    leave.set(i, l.leave)
    write(i, l)
  })
  return {
    length: n,
    employeeId: employeeId.done(),
    positionId: positionId.done(),
    month: month.done(),
    currency: currency.done(),
    leave: leave.done(),
    numbers,
  }
}

/** An ActualLineTable's rows as ActualLine objects, in stored order (positionId '' reads null). */
export const actualLineRows: RowsOf<ActualLineTable, ActualLine> = function* (table) {
  for (let i = 0; i < table.length; i++) {
    const position = table.positionId.dict[table.positionId.codes[i]]
    yield {
      employeeId: table.employeeId.dict[table.employeeId.codes[i]],
      positionId: position === '' ? null : position,
      month: table.month.dict[table.month.codes[i]],
      currency: table.currency.dict[table.currency.codes[i]],
      leave: table.leave.dict[table.leave.codes[i]],
      ...amountsAt(table.numbers, i),
    }
  }
}
