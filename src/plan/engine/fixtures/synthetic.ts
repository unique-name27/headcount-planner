/**
 * A synthetic whole-company workspace for the engine budgets (docs/PLAN.md 16.2 "perf budgets"):
 * 1,650 positions in six business units, generated from a fixed seed so every run sees the same
 * data. It is shaped like the sample (a CEO, six unit heads, directors, managers and their teams over
 * five sites in four currencies; mostly Filled seats, with Open and Planned seats, accepted offers,
 * leavers, On hold and eliminated seats), but it is not the sample: the sample generator is its own
 * builder's. Plain data only; nothing here computes an engine result.
 */
import type {
  AssumptionRow,
  CompRow,
  FreezeRow,
  ISODate,
  Level,
  Month,
  PositionRow,
  ReqRow,
  WorkerRow,
} from '@/data/schema'
import type { FxRate, HcRequest } from '../../types'
import { assumption, FY27_MONTHS, positionRow, workerRow } from './common'

/** Deterministic PRNG (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const UNITS = [
  'Silicon Engineering',
  'Software',
  'Operations',
  'Go-to-Market',
  'Corporate',
  'Product',
] as const

/** Site, currency, country, plan rate (USD per 1 local) and a band factor. */
const SITES = [
  { location: 'San Jose', code: 'SJC', currency: 'USD', country: 'United States', rate: 1, factor: 1 },
  { location: 'Austin', code: 'AUS', currency: 'USD', country: 'United States', rate: 1, factor: 0.9 },
  { location: 'Munich', code: 'MUC', currency: 'EUR', country: 'Germany', rate: 1.08, factor: 0.75 },
  { location: 'Haifa', code: 'HFA', currency: 'ILS', country: 'Israel', rate: 0.27, factor: 2.6 },
  { location: 'Bengaluru', code: 'BLR', currency: 'INR', country: 'India', rate: 0.012, factor: 20 },
] as const

const IC_LEVELS: readonly Level[] = ['P1', 'P2', 'P3', 'P3', 'P4', 'P4', 'P5', 'P6']
const ALL_LEVELS: readonly Level[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'M1', 'M2', 'E1', 'E2', 'E3']

/** USD midpoints at San Jose for each level. */
const MIDPOINT_USD: Readonly<Record<Level, number>> = {
  P1: 95_000,
  P2: 115_000,
  P3: 150_000,
  P4: 180_000,
  P5: 220_000,
  P6: 260_000,
  M1: 210_000,
  M2: 280_000,
  E1: 340_000,
  E2: 420_000,
  E3: 550_000,
}

export interface SyntheticWorkspace {
  positions: PositionRow[]
  workers: WorkerRow[]
  comp: CompRow[]
  reqs: ReqRow[]
  requests: HcRequest[]
  freezes: FreezeRow[]
  assumptions: AssumptionRow[]
  /** Plan, actual (Apr to Sep 2026) and forecast (Oct 2026 to Mar 2027) rates for every currency. */
  rates: FxRate[]
  positionCount: number
}

const pad = (n: number, w = 4): string => String(n).padStart(w, '0')

/** The workspace: exactly `size` positions (1,650 by default). */
export function syntheticWorkspace(size = 1_650, seed = 2027): SyntheticWorkspace {
  const rand = prng(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
  const positions: PositionRow[] = []
  const workers: WorkerRow[] = []
  const comp: CompRow[] = []
  const reqs: ReqRow[] = []
  let ids = 0
  let people = 0

  const seat = (
    level: Level,
    unit: string,
    department: string,
    manager: string | null,
    site: (typeof SITES)[number],
  ): string => {
    const positionId = `SYN-${pad(++ids)}`
    const r = rand()
    const status: PositionRow['status'] =
      level.startsWith('E') || level === 'M2'
        ? 'Filled'
        : r < 0.84
          ? 'Filled'
          : r < 0.92
            ? 'Open'
            : r < 0.97
              ? 'Planned'
              : 'On hold'
    const start: ISODate | null =
      status === 'Open' || status === 'Planned'
        ? `2026-${pick(['07', '09', '10', '11', '12'])}-${pick(['01', '16'])}`
        : null
    positions.push(
      positionRow(positionId, {
        effectiveDate: '2025-04-01',
        status,
        level,
        businessUnit: unit,
        department,
        costCenter: `${department.slice(0, 4).toUpperCase()}-${site.code}`,
        location: site.location,
        legalEntity: null,
        managerPositionId: manager,
        jobFamily: 'Engineering',
        fte: rand() < 0.05 ? 0.6 : 1,
        startDate: start,
        openedDate: status === 'Open' ? '2026-06-01' : null,
      }),
    )
    if (status === 'Filled') {
      const employeeId = `E-SYN-${pad(++people, 5)}`
      const hired = rand() < 0.04 ? `2026-0${pick(['5', '6', '8'])}-${pick(['01', '16'])}` : '2023-06-01'
      const leaving =
        rand() < 0.06
          ? pick(['2026-10-15', '2026-10-31', '2026-11-15', '2026-11-30', '2026-12-15', '2026-12-31'])
          : null
      const onLeave = rand() < 0.02
      workers.push(
        workerRow(employeeId, positionId, {
          hireDate: hired,
          terminationDate: leaving,
          businessUnit: unit,
          department,
          location: site.location,
          fte: positions[positions.length - 1].fte ?? 1,
          onLeave,
          leavePaid: onLeave ? rand() < 0.5 : null,
        }),
      )
      comp.push({
        employeeId,
        effectiveDate: '2026-04-01',
        currency: site.currency,
        baseSalary: Math.round(MIDPOINT_USD[level] * site.factor * (0.85 + 0.3 * rand())),
        targetBonusPct: null,
      })
    } else if (status === 'Open' && rand() < 0.3) {
      const accepted = rand() < 0.4
      reqs.push({
        reqId: `R-SYN-${pad(ids)}`,
        positionId,
        status: 'Open',
        stage: accepted ? 'Offer accepted' : 'Interviewing',
        reqType: 'New',
        openedDate: '2026-06-01',
        targetStartDate: start,
        offerAcceptedDate: accepted ? '2026-09-10' : null,
        startDate: accepted ? '2026-11-02' : null,
        closedDate: null,
        hiringManagerId: null,
        recruiter: null,
        offerBase: accepted ? Math.round(MIDPOINT_USD[level] * site.factor) : null,
        offerCurrency: accepted ? site.currency : null,
        signOnBonus: accepted ? 10_000 : null,
        relocation: null,
        agencyFee: accepted ? 5_000 : null,
      })
    }
    return positionId
  }

  // CEO, six unit heads, five directors each, five managers each, then teams.
  const ceo = seat('E3', 'Executive Office', 'Executive Office', null, SITES[0])
  const managers: { id: string; unit: string; department: string; site: (typeof SITES)[number] }[] = []
  for (const unit of UNITS) {
    const head = seat('E2', unit, `${unit} Office`, ceo, SITES[0])
    for (let d = 1; d <= 5; d++) {
      const department = `${unit} D${d}`
      const site = SITES[(d + UNITS.indexOf(unit)) % SITES.length]
      const dir = seat('M2', unit, department, head, site)
      for (let m = 1; m <= 5; m++)
        managers.push({ id: seat('M1', unit, department, dir, site), unit, department, site })
    }
  }
  for (let i = 0; positions.length < size; i++) {
    const m = managers[i % managers.length]
    seat(pick(IC_LEVELS), m.unit, m.department, m.id, m.site)
  }

  // A few approved eliminations of Filled seats (endDate the last day, Eliminated the day after).
  for (let k = 0; k < 12; k++) {
    const p = positions[200 + k * 97]
    if (p.status !== 'Filled') continue
    positions.push({
      ...p,
      effectiveDate: '2027-01-01',
      status: 'Eliminated',
      endDate: '2026-12-31',
      endReason: 'Eliminated',
      sourceRequestId: `R-SYN-ELIM-${k}`,
    })
  }

  return {
    positions,
    workers,
    comp,
    reqs,
    requests: [],
    freezes: [
      {
        freezeId: 'FZ-SYN-1',
        businessUnit: 'Corporate',
        startDate: '2026-11-01',
        endDate: '2027-01-31',
        allowBackfill: true,
      },
    ],
    assumptions: syntheticAssumptions(),
    rates: syntheticRates(),
    positionCount: new Set(positions.map((p) => p.positionId)).size,
  }
}

function syntheticAssumptions(): AssumptionRow[] {
  const rows: AssumptionRow[] = []
  for (const fy of ['FY27', 'FY28'] as const) {
    const up = fy === 'FY28' ? 1.03 : 1
    for (const level of ALL_LEVELS)
      for (const s of SITES)
        rows.push(
          assumption('band', `${level}|${s.location}|${fy}`, Math.round(MIDPOINT_USD[level] * s.factor * up)),
        )
    rows.push(assumption('bonusFunding', fy, 1))
  }
  for (const level of ALL_LEVELS) {
    rows.push(
      assumption('bonusTarget', level, level.startsWith('E') ? 0.3 : level.startsWith('M') ? 0.2 : 0.1),
    )
    rows.push(assumption('equity', level, level.startsWith('E') ? 60_000 : 10_000))
    rows.push(assumption('timeToFill', level, 60))
  }
  const countries = [
    ['United States', 0.062, 176_100, 18_000],
    ['Germany', 0.21, 90_600, 0],
    ['Israel', 0.125, 600_000, 0],
    ['India', 0.12, 180_000, 50_000],
  ] as const
  for (const [country, rate, cap, benefits] of countries) {
    rows.push(assumption('burden', `${country}|social`, rate))
    rows.push(assumption('burdenCap', `${country}|social`, cap))
    rows.push(assumption('burden', `${country}|medicare`, 0.0145))
    rows.push(assumption('benefits', country, benefits))
    rows.push(assumption('severance', country, 3))
  }
  rows.push(
    assumption('merit', 'FY27|date', 20260401),
    assumption('merit', 'FY27|pct', 0.035),
    assumption('merit', 'FY27|cutoff', 20260101),
    assumption('merit', 'FY28|date', 20270401),
    assumption('merit', 'FY28|pct', 0.035),
    assumption('merit', 'FY28|cutoff', 20270101),
    assumption('fillRate', '*', 0.9),
    assumption('attrition', '*', 0.12),
    assumption('backfillRate', '*', 0.8),
    assumption('backfillLag', '*', 2),
    assumption('vacancyFactor', '*', 0.02),
  )
  return rows
}

function syntheticRates(): FxRate[] {
  const out: FxRate[] = []
  const closed: readonly Month[] = FY27_MONTHS.slice(0, 6)
  const open: readonly Month[] = FY27_MONTHS.slice(6)
  for (const s of SITES) {
    if (s.currency === 'USD') continue
    if (out.some((r) => r.currency === s.currency)) continue
    for (const month of FY27_MONTHS)
      out.push({ currency: s.currency, set: 'plan', month, usdPerLocal: s.rate })
    for (const month of closed)
      out.push({ currency: s.currency, set: 'actual', month, usdPerLocal: s.rate * 1.01 })
    for (const month of open)
      out.push({ currency: s.currency, set: 'forecast', month, usdPerLocal: s.rate * 1.02 })
  }
  return out
}
