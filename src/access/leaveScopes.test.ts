/**
 * The leave count (docs/PLAN.md 7.7, C25): one count for the mode's whole scope at the as-of date,
 * HRBP and Leader only. Over every HRBP and Leader pick on the sample, a count shows only for a scope
 * `leaveShown` keeps, it is the number of people on leave in the scope, it is 5 or more, and every
 * class of people defined by the scopes that show a count holds 0 or 5 or more on leave. Any filter
 * but the scope's own pin, or any period but the default, reads "—" with the leave note. Manager,
 * Finance and HR admin have no leave count.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaCtx, picksWith, sampleCtx } from '@/testkit/sample'
import { LEAVE_FIT_NOTE, peopleOnLeave } from './leave'
import { leaveCountOf, leaveScopeKey, leaveScopesOf } from './leaveScopes'
import { contextLists } from './lists'
import { actingAsOptions, type ScopeEnv } from './scopes'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
let admin: AnalyticsContext
let env: ScopeEnv

beforeAll(() => {
  s = leakSample()
  admin = sampleCtx('hr-admin')
  env = {
    positionIndex: admin.positionIndex,
    asOf: admin.asOf,
    all: admin.all,
    lists: contextLists(admin),
    atoms: admin.guard.atoms,
  }
}, 120_000)

describe('the leave scopes', () => {
  it('are every HRBP unit and every leader tree, the company for a company leader', () => {
    const scopes = leaveScopesOf(env)
    const keys = scopes.map((x) => x.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.filter((k) => k.startsWith('unit:')).length).toBe(6)
    expect(keys).toContain('company')
    expect(keys.filter((k) => k.startsWith('tree:')).length).toBeGreaterThan(20)
  })
})

describe('the leave count in every HRBP and Leader pick', () => {
  it('shows only for whole scopes that keep every class of people on leave at 0 or 5 or more', () => {
    const onLeave = peopleOnLeave(admin.all.workers, admin.asOf)
    const shown: { key: string; people: ReadonlySet<string> }[] = []
    let hidden = 0
    for (const mode of ['hrbp', 'leader'] as const)
      for (const o of actingAsOptions(mode, env)) {
        const ctx = sampleCtx(mode, { picks: picksWith(s, mode, o.pick) })
        const c = leaveCountOf(ctx)
        expect(c, `${mode} ${o.pick.name}`).not.toBeNull()
        if (!c || ctx.access.unset) continue
        const scope = ctx.access.scope
        const people = scope ? scope.personIds : new Set(admin.all.workers.map((w) => w.employeeId))
        const n = [...onLeave].filter((id) => people.has(id)).length
        if (c.value == null) {
          hidden++
          expect(c.reason, `${mode} ${o.pick.name}`).toMatch(/^Hidden to protect anonymity/)
          continue
        }
        expect(c.value, `${mode} ${o.pick.name}`).toBe(n)
        expect(c.value).toBeGreaterThanOrEqual(c.min)
        shown.push({ key: leaveScopeKey(scope), people })
      }
    // Non-vacuity: some counts show and some are held back.
    expect(shown.length).toBeGreaterThan(0)
    expect(hidden).toBeGreaterThan(0)
    const classes = new Map<string, number>()
    const unique = [...new Map(shown.map((x) => [x.key, x])).values()]
    for (const id of onLeave) {
      const sig = unique
        .filter((x) => x.people.has(id))
        .map((x) => x.key)
        .join('|')
      if (sig) classes.set(sig, (classes.get(sig) ?? 0) + 1)
    }
    for (const [sig, n] of classes) expect(n >= 5, `${sig} holds ${n}`).toBe(true)
  }, 300_000)

  it('reads "—" under any filter but the scope pin, and under any period but the default', () => {
    for (const key of ['hrbp-se', 'leader-svp-se'] as const) {
      expect(leaveCountOf(personaCtx(key))?.value, key).not.toBeNull()
      for (const filters of [
        { location: ['Munich'] },
        { level: ['P6'], modes: { level: 'exclude' as const } },
        { period: 'qtd' as const },
        { period: 'ytd' as const },
      ]) {
        const c = leaveCountOf(personaCtx(key, { filters }))
        expect(c?.value, `${key} ${JSON.stringify(filters)}`).toBeNull()
        expect(c?.reason).toBe(LEAVE_FIT_NOTE)
      }
    }
  })

  it('is no count at all in Manager, Finance and HR admin mode', () => {
    for (const mode of ['manager', 'finance', 'hr-admin'] as const)
      expect(leaveCountOf(sampleCtx(mode))).toBeNull()
  })
})
