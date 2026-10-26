/**
 * Scenario helpers for the write path's tests (docs/PLAN.md 17 M3 "scenario walkthroughs per
 * persona"; docs/CONTRACTS-M3.md 3): one write harness over the generated sample, a ticking clock on
 * the sample's as-of date, and contexts for any mode and Acting as person over the store's state, so
 * a test walks a flow as the app runs it and reads each model in between. After each step a test can
 * check that the audit chain verifies and that every new entry is signed by the step's person.
 *
 * Test code only: the app never imports it (it reads the test kit's sample contexts).
 */

import { listsInForce } from '@/access/lists'
import type { ActingAs, Mode } from '@/access/modes'
import type { AnalyticsContext } from '@/data/context'
import { unitHrbps } from '@/data/lists/roles'
import { SAMPLE_AS_OF, type Sample } from '@/data/sample'
import type { Datasets, ISODate } from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import type { ActionInput, ActionName } from '@/plan/actions'
import { verifyChain } from '@/plan/audit/chain'
import { AUDIT_FIELDS } from '@/plan/audit/fields'
import type { AuditEntry, HcRequest, PlanState } from '@/plan/types'
import { defaultPicks, leakSample, sampleCtx, sampleSources } from '@/testkit/sample'
import { type WriteHarness, writeHarness } from './harness'
import type { WriteOutcome } from './run'

/** Who acts in a step: a mode and its Acting as person (an HRBP with the unit they support). */
export interface Who {
  mode: Mode
  personId: string
  unit?: string
  /** HR admin's reporting date for this step's context (the scenario's when not given). */
  asOf?: ISODate
}

export interface ScenarioOptions {
  /** A changed copy of the sample; the generated one when not given. */
  sample?: Sample
  /** HR admin's as-of override for every context (the sample's own date when not given). */
  asOf?: ISODate | null
  /** The first tick of the clock; the as-of date at 09:00 UTC when not given. */
  start?: string
  /** A reader tab. */
  readOnly?: boolean
  /** The datasets to read instead of the sample's (an ATS import after approval, say). */
  datasets?: () => Partial<Datasets>
  /** The workspace's request ID tag (the harness's 'TEST' when not given): another tag is another browser. */
  idTag?: string
  /** The workspace's request ID secret (the harness's own for the tag when not given). */
  idSecret?: string
}

export interface StepResult {
  outcome: WriteOutcome
  /** The audit entries this step appended. */
  entries: AuditEntry[]
}

export interface Scenario {
  sample: Sample
  harness: WriteHarness
  /** The context over the store's state for a person in a mode. */
  ctx(who: Who): Promise<AnalyticsContext>
  /** Runs an action as a person and returns what it appended to the log. */
  run<N extends ActionName>(who: Who, name: N, input: ActionInput<N>): Promise<StepResult>
  /** The plan state in force (the sample's plan with the stored overlay). */
  plan(): Promise<PlanState>
  /** A request as plan state holds it now (the plan's copy, else the imported row). */
  request(id: string): Promise<HcRequest | null>
  /** The audit log as stored. */
  log(): Promise<AuditEntry[]>
  /** The clock's last tick. */
  now(): string
  /** Datasets to read from now on (an ATS import, a new req): replaces what `datasets` gives. */
  setDatasets(patch: Partial<Datasets> | null): void
}

/** A person as a pick, named as the workers dataset names them. */
function pickFor(s: Sample, who: Who): ActingAs {
  const name = s.datasets.workers.find((w) => w.employeeId === who.personId)?.name ?? who.personId
  return { personId: who.personId, name, ...(who.unit ? { unit: who.unit } : {}) }
}

/** A scenario over the sample (see the module comment). */
export function scenario(opts: ScenarioOptions = {}): Scenario {
  const s = opts.sample ?? leakSample()
  const asOf = opts.asOf ?? null
  const base = Date.parse(opts.start ?? `${asOf ?? SAMPLE_AS_OF}T09:00:00.000Z`)
  let tick = 0
  let last = new Date(base).toISOString()
  const now = (): string => {
    last = new Date(base + tick++ * 60_000).toISOString()
    return last
  }
  let patch: Partial<Datasets> | null = opts.datasets?.() ?? null
  const contextFor =
    (who: Who) =>
    (plan: PlanState, audit: readonly AuditEntry[]): AnalyticsContext => {
      const sample: Sample = { ...s, plan, ...(patch ? { datasets: { ...s.datasets, ...patch } } : {}) }
      return sampleCtx(who.mode, {
        sample,
        audit,
        picks: { ...defaultPicks(s), [who.mode]: pickFor(s, who) },
        ...((who.asOf ?? asOf) ? { asOfOverride: who.asOf ?? asOf } : {}),
      })
    }
  const harness = writeHarness({
    initial: s.plan,
    sample: s.plan,
    now,
    contextOf: contextFor({ mode: 'hr-admin', personId: defaultPicks(s)['hr-admin']?.personId ?? '' }),
    ...(opts.readOnly ? { readOnly: true } : {}),
    ...(opts.idTag ? { idTag: opts.idTag } : {}),
    ...(opts.idSecret ? { idSecret: opts.idSecret } : {}),
  })
  const as = (who: Who) => harness.as(contextFor(who))
  const out: Scenario = {
    sample: s,
    harness,
    ctx: (who) => as(who).ctx(),
    async run(who, name, input) {
      const before = (await harness.store.listAudit()).length
      const outcome = await as(who).run(name, input)
      const after = await harness.store.listAudit()
      return { outcome, entries: [...after.slice(before)] }
    },
    async plan() {
      return (await harness.ctx()).plan as PlanState
    },
    async request(id) {
      const p = await out.plan()
      const own = p.requests.find((r) => r.requestId === id)
      if (own) return own
      return requestsOf(await harness.ctx()).find((r) => r.requestId === id) ?? null
    },
    log: async () => [...(await harness.store.listAudit())],
    now: () => last,
    setDatasets(p) {
      patch = p
    },
  }
  return out
}

/** The units each HRBP supports (the Units list's HRBP column). */
export function hrbpUnitOf(s: Sample): (personId: string) => string | undefined {
  const lists = listsInForce(null, s.datasets, sampleSources(s.datasets))
  const byPerson = new Map<string, string>()
  for (const [unit, id] of unitHrbps(lists)) if (!byPerson.has(id)) byPerson.set(id, unit)
  return (id) => byPerson.get(id)
}

/** Who decides a request's waiting step: its role's mode, acting as its approver (an HRBP with their unit). */
export function deciderOf(s: Sample, req: HcRequest): Who {
  const step = req.steps.find((x) => x.enteredAt != null && x.decision == null)
  if (!step) throw new Error(`${req.requestId} waits on no step`)
  const mode: Mode =
    step.role === 'hrbp'
      ? 'hrbp'
      : step.role === 'leader'
        ? 'leader'
        : step.role === 'finance'
          ? 'finance'
          : 'manager'
  const unit = mode === 'hrbp' ? (hrbpUnitOf(s)(step.approverId) ?? req.businessUnit) : undefined
  return { mode, personId: step.approverId, ...(unit ? { unit } : {}) }
}

/** Approves a request step by step, each approver acting as themselves, until no step waits. */
export async function approveAll(sc: Scenario, requestId: string): Promise<StepResult[]> {
  const out: StepResult[] = []
  for (let guard = 0; guard < 12; guard++) {
    const req = await sc.request(requestId)
    if (!req?.steps.some((x) => x.enteredAt != null && x.decision == null)) break
    const r = await sc.run(deciderOf(sc.sample, req), 'approveRequest', { requestId })
    out.push(r)
    if (!r.outcome.ok) break
  }
  return out
}

/** Whether an entry's field is one src/plan/audit/fields.ts lists for its object (patterns included). */
export function fieldListed(e: Pick<AuditEntry, 'object' | 'field'>): boolean {
  return AUDIT_FIELDS[e.object].fields.some((f) => {
    if (!f.includes('<')) return f === e.field
    const re = new RegExp(`^${f.replace(/<n>/g, '[0-9]+').replace(/<unit>/g, '.+')}$`)
    return re.test(e.field)
  })
}

/**
 * The chain verifies over the whole log (10.7), and every entry's field is one the audit field list
 * names for its object (src/plan/audit/fields.ts: a builder adds a new field there in the same change).
 */
export function chainOk(log: readonly AuditEntry[]): boolean {
  const unlisted = log.filter((e) => !fieldListed(e))
  if (unlisted.length)
    throw new Error(`Audit fields not listed: ${unlisted.map((e) => `${e.object}.${e.field}`).join(', ')}`)
  return verifyChain(log).ok
}

/** A refusal's sentence (a test reads it), or the notice when the action went through. */
export const said = (o: WriteOutcome): string => (o.ok ? o.notice : o.refused)
