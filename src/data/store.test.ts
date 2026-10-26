/**
 * The app store (docs/PLAN.md 5.4 and 16.2), on the in-memory IndexedDB and a memory localStorage:
 * the sample with a fixed version per dataset, uploads with a history of 3 (raw sheets of dropped
 * versions deleted), a reload restoring them, the 1,500 ms start-up race, the write lock (a reader
 * refuses every dataset write and takes over when promoted; a writer that steps aside or loses a
 * tie to a lower tab id refuses them again), settings without pay, the settings file, and clearing
 * the device.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ORG_AS_OF, orgDatasets } from '@/testkit/orgFixture'
import { type FakeTabs, fakeTabs } from '@/testkit/tabs'
import type { ImportIssue, ParsedSheet } from './import/types'
import { ELECTION_MS, TAKEOVER_MS, WriterLock, type WriterRole } from './tabSync'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

const storage = new MemoryStorage()
vi.stubGlobal('localStorage', storage)

type Store = typeof import('./store')
type Idb = typeof import('@/testkit/memoryIdb')

let S: Store
let idb: Idb
/** The write lock the store gets: `role` resolves it, `promote` is the store's onPromote. */
let lock: { role: (r: WriterRole) => void; promote: () => void; answer: Promise<WriterRole> }

/**
 * A fresh page: modules reloaded (the in-memory database is carried over, as IndexedDB outlives a
 * reload), the sample registered and the write lock injected. `role` is what the lock answers at once.
 */
async function page(role: WriterRole | null = 'writer'): Promise<Store> {
  const carried = idb ? idb.memoryIdbEntries() : new Map<string, unknown>()
  vi.resetModules()
  idb = await import('@/testkit/memoryIdb')
  for (const [k, v] of carried) await idb.idbSet(k, v)
  const store = await import('./store')
  let resolve: (r: WriterRole) => void = () => undefined
  const answer = new Promise<WriterRole>((r) => {
    resolve = r
  })
  lock = { role: resolve, promote: () => undefined, answer }
  store.setWriterSource((onPromote) => {
    lock.promote = onPromote
    return answer
  })
  store.setSampleSource({ data: orgDatasets, asOf: ORG_AS_OF })
  if (role) resolve(role)
  return store
}

const st = () => S.useStore.getState()

const sheet: ParsedSheet = {
  name: 'Workers',
  headerRow: 0,
  headers: ['Emp ID', 'Full name'],
  rows: [{ 'Emp ID': 'E1', 'Full name': 'A' }],
  rowNumbers: [2],
} as ParsedSheet
const issues = [
  {
    row: 2,
    id: 'E1',
    field: 'level',
    label: 'Level',
    value: 'P9',
    code: 'unknown-value',
    issue: '',
    action: 'left-blank',
  },
] as unknown as ImportIssue[]

beforeEach(async () => {
  storage.m.clear()
  storage.failure = null
  idb?.resetMemoryIdb()
  S = await page()
  idb.resetMemoryIdb()
  await st().init()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the store on the sample', () => {
  it('starts on the sample with a fixed version per dataset, as the writer', () => {
    const s = st()
    expect(s.ready).toBe(true)
    expect(s.storageUnavailable).toBe(false)
    expect(s.readOnly).toBe(false)
    expect(s.data.positions).toHaveLength(orgDatasets().positions.length)
    for (const k of [
      'positions',
      'workers',
      'comp',
      'reqs',
      'requests',
      'targets',
      'freezes',
      'assumptions',
    ] as const) {
      expect(s.sources[k], k).toEqual({ kind: 'sample', rowCount: s.data[k].length })
      expect(s.versions[k], k).toMatchObject({ versionId: `sample-${k}`, source: 'sample', dataset: k })
      expect(s.versions[k].rowCount, k).toBe(s.data[k].length)
      expect(s.history[k], k).toEqual([])
    }
    expect(s.dataStandard).toBe('bronze')
    expect(s.showPay).toBe(false)
    // The sample is never stored.
    expect([...idb.memoryIdbEntries().keys()]).toEqual([])
    expect(S.contextAsOf(s)).toBe(ORG_AS_OF)
  })

  it('opens empty without a sample, and on the sample after one is registered', async () => {
    S = await page()
    S.setSampleSource(null)
    await st().init()
    expect(st().data.positions).toEqual([])
    S.setSampleSource({ data: orgDatasets, asOf: ORG_AS_OF })
    await st().init()
    expect(st().data.positions.length).toBeGreaterThan(0)
  })
})

describe('datasets and their versions', () => {
  it('replaces a dataset, keeps the previous version in history and stores the upload', async () => {
    const rows = st().data.reqs.slice(0, 2)
    await st().replaceDataset('reqs', rows, { fileName: 'reqs.xlsx' })
    const s = st()
    expect(s.data.reqs).toBe(rows)
    expect(s.sources.reqs).toMatchObject({ kind: 'upload', rowCount: 2, fileName: 'reqs.xlsx' })
    expect(s.versions.reqs).toMatchObject({
      source: 'upload',
      fileName: 'reqs.xlsx',
      rowCount: 2,
      hasRaw: false,
    })
    expect(s.history.reqs.map((v) => v.versionId)).toEqual(['sample-reqs'])
    const stored = idb.memoryIdbEntries()
    expect(stored.get('hcp:dataset:reqs')).toMatchObject({ rows, versionId: s.versions.reqs.versionId })
    expect(stored.get('hcp:versions:reqs')).toMatchObject({
      current: { versionId: s.versions.reqs.versionId },
      history: [{ versionId: 'sample-reqs' }],
    })
    // The other datasets are still the sample, and nothing else was stored.
    expect(s.sources.positions.kind).toBe('sample')
    expect([...stored.keys()].sort()).toEqual(['hcp:dataset:reqs', 'hcp:versions:reqs'])
    expect(S.contextAsOf(s)).toBe(S.contextAsOf({ ...s, today: '2026-10-13' }))
  })

  it('keeps the raw sheet, mapping and import counts of an upload, and confirms, certifies and revokes', async () => {
    const rows = st().data.workers.slice(0, 4)
    await st().replaceDataset(
      'workers',
      rows,
      { fileName: 'workers.xlsx', sheetName: 'Workers' },
      {
        raw: sheet,
        mapping: { employeeId: { header: 'Emp ID', confidence: 'high', score: 1, reason: '' } } as never,
        options: { dateOrders: { Hired: 'DMY' } } as never,
        issues,
        rowsIn: 5,
      },
    )
    const v = st().versions.workers
    expect(v.mapping.employeeId).toEqual({ header: 'Emp ID', confidence: 'high', confirmed: false })
    expect(v.applyOptions).toEqual({ dateOrders: { Hired: 'DMY' } })
    expect(v.issues).toMatchObject({ rowsIn: 5, rowsOut: 4 })
    expect(v.hasRaw).toBe(true)
    expect(idb.memoryIdbEntries().has(`hcp:raw:workers:${v.versionId}`)).toBe(true)
    expect(await st().getRaw('workers')).toEqual({
      dataset: 'workers',
      versionId: v.versionId,
      sheet,
      issues,
    })

    await st().confirmMapping('workers', ' Jamie ')
    expect(st().versions.workers).toMatchObject({ mappingConfirmedBy: 'Jamie' })
    expect(st().versions.workers.mapping.employeeId.confirmed).toBe(true)

    await st().certify('workers', {
      by: 'HRIS team',
      note: 'Matches the HRIS report',
      controlTotals: [{ label: 'Rows', metric: 'rows', expected: 4, tolerance: Number.NaN }],
    })
    expect(st().versions.workers.certification).toMatchObject({
      by: 'HRIS team',
      versionId: v.versionId,
      controlTotals: [{ actual: 4, tolerance: 0.005 }],
    })
    expect(
      (idb.memoryIdbEntries().get('hcp:versions:workers') as { current: { certification: unknown } }).current
        .certification,
    ).toBeTruthy()
    await st().revokeCertification('workers')
    expect(st().versions.workers.certification).toBeNull()

    // A new version is never certified or confirmed; the old one moves to history.
    await st().certify('workers', { by: 'HRIS team' })
    await st().replaceDataset('workers', rows, { fileName: 'workers2.xlsx' })
    expect(st().versions.workers.certification).toBeNull()
    expect(st().versions.workers.mappingConfirmedAt).toBeNull()
    expect(st().history.workers[0].certification?.by).toBe('HRIS team')
  })

  it('keeps three earlier versions and deletes the raw sheets that fall out', async () => {
    const rows = st().data.comp.slice(0, 3)
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      await st().replaceDataset('comp', rows, { fileName: `comp${i}.xlsx` }, { raw: sheet })
      ids.push(st().versions.comp.versionId)
    }
    expect(new Set(ids).size).toBe(5)
    expect(st().history.comp.map((v) => v.versionId)).toEqual([ids[3], ids[2], ids[1]])
    const stored = idb.memoryIdbEntries()
    expect(stored.has(`hcp:raw:comp:${ids[0]}`)).toBe(false)
    expect(stored.has(`hcp:raw:comp:${ids[1]}`)).toBe(true)
    expect(await st().getRaw('comp', ids[1])).toMatchObject({ versionId: ids[1] })
  })

  it('restores uploads and versions after a reload, and the decisions made on the sample', async () => {
    const rows = st().data.targets.slice(0, 1)
    await st().replaceDataset('targets', rows, { fileName: 'targets.xlsx' })
    await st().confirmMapping('targets', 'Jamie')
    await st().confirmMapping('freezes', 'Sam')
    S = await page()
    await st().init()
    const s = st()
    expect(s.data.targets).toEqual(rows)
    expect(s.sources.targets).toMatchObject({ kind: 'upload', fileName: 'targets.xlsx', rowCount: 1 })
    expect(s.versions.targets).toMatchObject({ mappingConfirmedBy: 'Jamie', fileName: 'targets.xlsx' })
    expect(s.history.targets.map((v) => v.versionId)).toEqual(['sample-targets'])
    expect(s.versions.freezes).toMatchObject({ source: 'sample', mappingConfirmedBy: 'Sam' })
    expect(s.sources.freezes.kind).toBe('sample')
  })

  it('resets a dataset to the sample', async () => {
    await st().replaceDataset('requests', st().data.requests.slice(0, 2), { fileName: 'requests.csv' })
    await st().resetDataset('requests')
    expect(st().sources.requests.kind).toBe('sample')
    expect(st().data.requests).toHaveLength(orgDatasets().requests.length)
    expect(st().versions.requests.versionId).toBe('sample-requests')
    expect(st().history.requests[0].fileName).toBe('requests.csv')
    expect(idb.memoryIdbEntries().has('hcp:dataset:requests')).toBe(false)
    await st().replaceDataset('freezes', [], { fileName: 'freezes.csv' })
    st().setAsOfOverride('2026-06-30')
    await st().resetAllToSample()
    expect(Object.values(st().sources).every((x) => x.kind === 'sample')).toBe(true)
    expect(st().asOfOverride).toBeNull()
  })

  it('applies a sample seed to the datasets still on the sample, keeping decisions made on them', async () => {
    await st().replaceDataset('reqs', [], { fileName: 'mine.csv' })
    await st().confirmMapping('freezes', 'Sam')
    const base = orgDatasets()
    st().applySampleSeed({
      freezes: { rows: base.freezes.slice(0, 1), raw: sheet, issues, fileName: 'Freezes export.csv' },
      reqs: { rows: base.reqs.slice(0, 1), raw: sheet },
    })
    expect(st().data.freezes).toHaveLength(1)
    expect(st().versions.freezes).toMatchObject({ versionId: 'sample-freezes-raw', hasRaw: true })
    expect((await st().getRaw('freezes'))?.sheet).toEqual(sheet)
    // The upload stays as it is.
    expect(st().sources.reqs.kind).toBe('upload')
    expect(st().data.reqs).toEqual([])
    // Resetting goes back to the seed's rows.
    await st().resetDataset('reqs')
    expect(st().data.reqs).toHaveLength(1)
    expect(st().versions.reqs.versionId).toBe('sample-reqs-raw')
  })

  it('loads a registered seed on init, and a failing seed leaves the plain sample', async () => {
    S = await page()
    S.setSampleSeed(() => ({ targets: { rows: orgDatasets().targets.slice(0, 2), raw: sheet } }))
    await st().init()
    expect(st().data.targets).toHaveLength(2)
    expect(st().versions.targets.versionId).toBe('sample-targets-raw')
    S = await page()
    S.setSampleSeed(() => {
      throw new Error('raw extracts failed')
    })
    await st().init()
    expect(st().data.targets).toHaveLength(orgDatasets().targets.length)
    expect(st().versions.targets.versionId).toBe('sample-targets')
  })
})

describe('start-up with storage that does not answer', () => {
  it('runs on the sample and says so when IndexedDB refuses', async () => {
    await st().replaceDataset('reqs', [], { fileName: 'reqs.csv' })
    S = await page()
    idb.failMemoryIdb()
    await st().init()
    expect(st().storageUnavailable).toBe(true)
    expect(st().ready).toBe(true)
    expect(st().sources.reqs.kind).toBe('sample')
    expect(S.STORAGE_UNAVAILABLE_NOTICE.title).toBe('Showing sample data')
  })

  it('gives IndexedDB 1,500 ms, then runs on the sample', async () => {
    S = await page()
    idb.stallMemoryIdb()
    vi.useFakeTimers()
    let done = false
    const started = st()
      .init()
      .then(() => {
        done = true
      })
    await vi.advanceTimersByTimeAsync(S.STARTUP_TIMEOUT_MS - 1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await started
    expect(st()).toMatchObject({ ready: true, storageUnavailable: true })
    expect(st().data.positions.length).toBeGreaterThan(0)
    idb.stallMemoryIdb(false)
  })
})

describe('the write lock', () => {
  it('refuses every dataset write in a reader tab, while preferences still save', async () => {
    S = await page('reader')
    await st().init()
    expect(st().readOnly).toBe(true)
    const note = 'Read only: Headcount Planner is open in another tab.'
    expect(S.READ_ONLY_NOTE).toBe(note)
    await expect(st().replaceDataset('reqs', [], { fileName: 'x.csv' })).rejects.toThrow(note)
    await expect(st().resetDataset('reqs')).rejects.toThrow(note)
    await expect(st().resetAllToSample()).rejects.toThrow(note)
    await expect(st().confirmMapping('reqs', 'Jamie')).rejects.toThrow(note)
    await expect(st().certify('reqs', { by: 'Jamie' })).rejects.toThrow(note)
    await expect(st().revokeCertification('reqs')).rejects.toThrow(note)
    await expect(st().clearDevice()).rejects.toThrow(note)
    expect(st().sources.reqs.kind).toBe('sample')
    expect([...idb.memoryIdbEntries().keys()]).toEqual([])
    st().setTheme('dark')
    st().setFilters({ location: ['Munich'] })
    expect(JSON.parse(storage.getItem('hcp:settings')!).theme).toBe('dark')
    expect(JSON.parse(storage.getItem('hcp:filters')!).location).toEqual(['Munich'])
  })

  it('takes over when promoted, reading what the writer tab stored', async () => {
    S = await page('reader')
    await st().init()
    // The writer tab stores an upload, then closes.
    const rows = orgDatasets().freezes.slice(0, 1)
    await idb.idbSet('hcp:dataset:freezes', {
      rows,
      meta: { kind: 'upload', rowCount: 1, fileName: 'freezes.csv' },
      versionId: 'freezes-up-1',
    })
    lock.promote()
    await vi.waitFor(() => expect(st().sources.freezes.kind).toBe('upload'))
    expect(st().readOnly).toBe(false)
    expect(st().data.freezes).toEqual(rows)
    expect(st().versions.freezes).toMatchObject({ versionId: 'freezes-up-1', fileName: 'freezes.csv' })
    await st().replaceDataset('freezes', [], { fileName: 'freezes2.csv' })
    expect(st().history.freezes[0].versionId).toBe('freezes-up-1')
  })

  it('stays read only until a slow lock answers', async () => {
    S = await page(null)
    vi.useFakeTimers()
    const started = st().init()
    await vi.advanceTimersByTimeAsync(S.STARTUP_TIMEOUT_MS)
    await started
    expect(st()).toMatchObject({ ready: true, readOnly: true, storageUnavailable: false })
    lock.role('writer')
    await vi.advanceTimersByTimeAsync(0)
    expect(st().readOnly).toBe(false)
  })
})

describe('the write lock, when this tab stops writing', () => {
  let tabs: FakeTabs
  beforeEach(() => {
    tabs = fakeTabs()
  })

  /** Let a promotion's re-read of IndexedDB finish (the memory database answers in microtasks). */
  const reread = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

  /** Every dataset write rejects with the read-only note, and nothing is stored. */
  async function refusesEveryWrite() {
    const note = S.READ_ONLY_NOTE
    const before = [...idb.memoryIdbEntries().keys()]
    await expect(st().replaceDataset('reqs', [], { fileName: 'x.csv' })).rejects.toThrow(note)
    await expect(st().resetDataset('reqs')).rejects.toThrow(note)
    await expect(st().resetAllToSample()).rejects.toThrow(note)
    await expect(st().confirmMapping('reqs', 'Jamie')).rejects.toThrow(note)
    await expect(st().certify('reqs', { by: 'Jamie' })).rejects.toThrow(note)
    await expect(st().revokeCertification('reqs')).rejects.toThrow(note)
    await expect(st().clearDevice()).rejects.toThrow(note)
    expect([...idb.memoryIdbEntries().keys()]).toEqual(before)
  }

  it('refuses every dataset write after a heartbeat writer steps aside, and writes again once it takes the lock back', async () => {
    const a = tabs.open('a')
    const b = tabs.open('b')
    const here = new WriterLock({ locks: null, channel: a.channel, timers: a.timers }, { tabId: 'a' })
    S.setWriterSource((onPromote, onChange) => {
      here.onChange(onChange)
      return here.acquire(onPromote)
    })
    const started = st().init()
    await tabs.advance(ELECTION_MS)
    await started
    expect(st().readOnly).toBe(false)
    await st().replaceDataset('reqs', st().data.reqs.slice(0, 1), { fileName: 'reqs.csv' })

    // Another tab opens as a reader; this page goes into the back-forward cache and steps aside.
    const other = new WriterLock({ locks: null, channel: b.channel, timers: b.timers }, { tabId: 'b' })
    void other.acquire()
    await tabs.advance(ELECTION_MS)
    expect(other.role).toBe('reader')
    here.stepAside()
    await tabs.advance(ELECTION_MS)
    expect([here.role, other.role]).toEqual(['reader', 'writer'])
    expect(st().readOnly).toBe(true)
    await refusesEveryWrite()
    expect(st().sources.reqs).toMatchObject({ kind: 'upload', fileName: 'reqs.csv' })

    // The other tab closes (it says bye): this one takes the lock back and writes again.
    other.release()
    await tabs.advance(ELECTION_MS)
    expect(here.role).toBe('writer')
    expect(st().readOnly).toBe(false)
    await reread()
    await st().replaceDataset('reqs', [], { fileName: 'reqs2.csv' })
    expect(st().sources.reqs).toMatchObject({ kind: 'upload', fileName: 'reqs2.csv' })
    here.release()
  })

  it('follows the page’s lock: a beat from a lower tab id makes it read only until that tab goes quiet', async () => {
    // The store's own source: the page's lock (acquireWriter) and its changes (onWriterChange).
    S.setWriterSource(null)
    const sync = await import('./tabSync')
    const page = tabs.open('page')
    const first = sync.acquireWriter({ deps: { locks: null, channel: page.channel, timers: page.timers } })
    await tabs.advance(ELECTION_MS)
    expect(await first).toBe('writer')
    await st().init()
    expect(st().readOnly).toBe(false)

    // Two writers (a claim that came too late for the election): the lower id, '0', keeps the lock.
    const other = tabs.open('other')
    other.channel.postMessage({ writerLock: 'beat', tab: '0' })
    await tabs.settle()
    expect(sync.writerRole()).toBe('reader')
    expect(st().readOnly).toBe(true)
    await refusesEveryWrite()

    // That tab never beats again: after the takeover wait this one claims, wins and writes.
    await tabs.advance(TAKEOVER_MS + ELECTION_MS)
    expect(sync.writerRole()).toBe('writer')
    expect(st().readOnly).toBe(false)
    await reread()
    await st().replaceDataset('reqs', [], { fileName: 'reqs.csv' })
    expect(st().sources.reqs.kind).toBe('upload')
    sync.releaseWriter()
  })

  it('ignores the lock callbacks of an earlier start-up', async () => {
    const calls: { promote: () => void; change: (r: WriterRole) => void }[] = []
    S.setWriterSource((promote, change) => {
      calls.push({ promote, change })
      return Promise.resolve('writer')
    })
    await st().init()
    await st().init()
    expect(calls).toHaveLength(2)
    calls[0].change('reader')
    expect(st().readOnly).toBe(false)
    calls[1].change('reader')
    expect(st().readOnly).toBe(true)
    calls[0].promote()
    expect(st().readOnly).toBe(true)
    calls[1].promote()
    expect(st().readOnly).toBe(false)
  })
})

describe('filters, pickers and routes', () => {
  it('saves the filters at hcp:filters through the guard, and reads them back as your last filters', () => {
    st().setFilters({ costCenter: ['1130-BLR', '1130-BLR'], modes: { costCenter: 'exclude' } })
    expect(st().filters.costCenter).toEqual(['1130-BLR'])
    expect(S.lastFilters()).toEqual(st().filters)
    S.setFilterGuard((f) => (f.leaderId ? f : { ...f, leaderId: 'P-DIR1' }))
    st().setFilters({ location: ['Munich'] })
    expect(st().filters).toMatchObject({ leaderId: 'P-DIR1', location: ['Munich'] })
    st().resetFilters()
    expect(st().filters).toMatchObject({ leaderId: 'P-DIR1', location: [], costCenter: [] })
    S.setFilterGuard(null)
    storage.setItem('hcp:filters', '{not json')
    expect(S.lastFilters().period).toBe('fy')
  })

  it('keeps the version and comparison pickers in memory, IDs only', () => {
    st().setPicks({ version: 'fy28-plan-working', compare: 'target' })
    expect(st()).toMatchObject({ version: 'fy28-plan-working', compare: 'target' })
    st().setPicks({ compare: null })
    expect(st()).toMatchObject({ version: 'fy28-plan-working', compare: null })
    st().setPicks({ version: '<b>bold</b>' })
    expect(st().version).toBeNull()
    expect(storage.keys().filter((k) => k !== 'hcp:filters')).toEqual([])
  })

  it('reads routes from the address, leaving the scope for the scope reader', () => {
    expect(S.parseHash('')).toBeNull()
    expect(S.parseHash('#data')).toEqual({ view: 'data', tab: '' })
    expect(S.parseHash('#plan.positions?bu=X&ver=fy27-working')).toEqual({ view: 'plan', tab: 'positions' })
    expect(S.parseHash('#data.metrics/plan/heads.approved')).toEqual({
      view: 'data',
      tab: 'metrics/plan/heads.approved',
    })
    expect(S.parseHash('#scorecard')).toBeNull()
    expect(S.ROUTE_VIEWS).toEqual([
      'home',
      'team',
      'plan',
      'requests',
      'forecast',
      'targets',
      'whatif',
      'finance',
      'data',
      'actions',
      'audit',
    ])
    expect(S.PAGE_VIEWS).toEqual(['data', 'actions', 'audit'])
    expect(S.homeView()).toBe('data')
  })

  it('navigates through the route guard and says so when it moved', () => {
    const notices: string[] = []
    S.setRouteGuard({
      check: (r) =>
        r.view === 'data' ? { route: { view: 'home', tab: '' }, notice: () => notices.push('moved') } : null,
      home: () => 'home',
    })
    st().navigate('plan', 'positions')
    expect(st().route).toEqual({ view: 'plan', tab: 'positions' })
    st().navigate('data')
    expect(st().route).toEqual({ view: 'home', tab: '' })
    expect(notices).toEqual(['moved'])
    expect(S.homeView()).toBe('home')
    S.setRouteGuard(null)
  })

  it('opens with the link’s scope, else the startup view, else your last filters', async () => {
    const { addView, EMPTY_VIEWS, setStartup } = await import('./savedViews')
    const views = setStartup(
      addView(
        EMPTY_VIEWS,
        {
          name: 'Start',
          scope: {
            filters: {
              ...(orgDatasets() && (await import('./scope')).DEFAULT_FILTERS),
              location: ['Munich'],
              modes: {},
            },
            standard: 'bronze',
            lens: false,
            version: 'fy27-working',
            compare: 'target',
          },
          page: { view: 'targets', tab: 'gap' },
        },
        's',
      ),
      's',
    )
    const link = S.initialScopeOf({
      hash: '#plan.positions?cc=1130-BLR&not=cc&vs=target',
      historyState: null,
      views,
    })
    expect(link.source).toBe('link')
    expect(link.scope).toMatchObject({
      filters: { costCenter: ['1130-BLR'], modes: { costCenter: 'exclude' } },
      compare: 'target',
    })
    // An entry the app wrote, with no scope in it, is a reload at the defaults.
    const mark = S.initialScopeOf({ hash: '#plan', historyState: { hcp: 1 }, views })
    expect(mark.source).toBe('link')
    expect(mark.scope?.filters.location).toEqual([])
    const start = S.initialScopeOf({ hash: '', historyState: null, views })
    expect(start).toMatchObject({
      source: 'startup',
      viewId: 's',
      page: { view: 'targets', tab: 'gap' },
      scope: { version: 'fy27-working', compare: 'target' },
    })
    expect(S.initialScopeOf({ hash: '#plan.positions', historyState: null, views }).page).toBeUndefined()
    expect(S.initialScopeOf({ hash: '#plan', historyState: null, views: EMPTY_VIEWS }).source).toBe('last')
  })
})

describe('settings', () => {
  it('saves settings, never the pay switch', () => {
    st().setTextSize('lg')
    st().setDataStandard('gold')
    st().setShowPay(true)
    st().setAsOfOverride('2026-06-30')
    const saved = JSON.parse(storage.getItem('hcp:settings')!)
    expect(saved).toEqual({
      theme: 'system',
      textSize: 'lg',
      motion: 'system',
      dataStandard: 'gold',
      asOfOverride: '2026-06-30',
    })
    expect(storage.keys().some((k) => /pay/i.test(k))).toBe(false)
    expect(S.contextAsOf(st())).toBe('2026-06-30')
  })

  it('shows a link’s data standard in this tab without saving it', () => {
    st().setDataStandard('silver')
    st().setScopeStandard('gold')
    expect(st().dataStandard).toBe('gold')
    expect(JSON.parse(storage.getItem('hcp:settings')!).dataStandard).toBe('silver')
    st().setTheme('dark')
    expect(JSON.parse(storage.getItem('hcp:settings')!)).toMatchObject({
      theme: 'dark',
      dataStandard: 'silver',
    })
    expect(S.savedDataStandard()).toBe('silver')
    S.setStandardGuard(() => 'bronze')
    st().setScopeStandard('gold')
    expect(st().dataStandard).toBe('bronze')
    S.setStandardGuard(null)
  })

  it('exports and imports settings with saved views, handing other sections back', async () => {
    const { useSavedViews } = await import('./viewsStore')
    const { DEFAULT_SCOPE } = await import('./urlScope')
    useSavedViews.getState().add({ name: 'Munich', scope: DEFAULT_SCOPE, page: null })
    st().setTheme('light')
    const text = await S.exportSettings({ metrics: { overrides: {}, log: [] } }).text()
    const file = JSON.parse(text)
    expect(file).toMatchObject({
      kind: 'hcp-settings',
      settings: { theme: 'light' },
      metrics: { overrides: {} },
    })
    expect(file.views.views.map((v: { name: string }) => v.name)).toContain('Munich')
    st().setTheme('dark')
    useSavedViews.getState().reset()
    const r = S.importSettings(text)
    expect(r.ok).toBe(true)
    expect(r.ok && r.metricsSection).toEqual({ overrides: {}, log: [] })
    expect(r.viewsSummary).toBe('3 saved views')
    expect(st().theme).toBe('light')
    expect(useSavedViews.getState().views.map((v) => v.name)).toContain('Munich')
    expect(S.importSettings('nope').ok).toBe(false)
  })
})

describe('clearing the device', () => {
  it('removes everything the app stored and starts over on the sample', async () => {
    const cleared: string[] = []
    S.onDeviceCleared(() => cleared.push('lists'))
    await st().replaceDataset('reqs', [], { fileName: 'r.xlsx' }, { raw: sheet })
    await idb.idbSet('hcp:plan', { versions: [] })
    st().setDataStandard('gold')
    st().setFilters({ location: ['Munich'] })
    st().setPicks({ compare: 'target' })
    storage.setItem('other-app', '1')
    await S.clearDevice()
    expect([...idb.memoryIdbEntries().keys()]).toEqual([])
    expect(storage.keys()).toEqual(['other-app'])
    const s = st()
    expect(s.sources.reqs.kind).toBe('sample')
    expect(s.dataStandard).toBe('bronze')
    expect(s.filters.location).toEqual([])
    expect(s.compare).toBeNull()
    expect(s.history.reqs).toEqual([])
    expect(cleared).toEqual(['lists'])
  })

  it('says what could not be cleared, after clearing the rest', async () => {
    st().setDataStandard('gold')
    vi.stubGlobal('indexedDB', {})
    idb.failMemoryIdb()
    try {
      await expect(S.clearDevice()).rejects.toThrow('Could not remove')
      expect(storage.getItem('hcp:settings')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
      vi.stubGlobal('localStorage', storage)
      idb.failMemoryIdb(null)
    }
  })
})
