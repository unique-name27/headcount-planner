/**
 * The audit hash chain (docs/PLAN.md 10.7, 16.2: "audit chain (verify detects a changed entry)").
 */
import { describe, expect, it } from 'vitest'
import { sha256 } from '@/lib/sha256'
import { canonicalJson } from '../canonical'
import type { AuditDraft, AuditEntry } from '../types'
import {
  appendEntry,
  CHAIN_NOTE,
  chainStatusText,
  entryCountText,
  entryHash,
  GENESIS_HASH,
  verifyChain,
} from './chain'

const draft = (n: number, over: Partial<AuditDraft> = {}): AuditDraft => ({
  at: `2026-09-${String(n).padStart(2, '0')}T09:00`,
  by: 'E10077',
  byName: 'Priya Natarajan',
  mode: 'hrbp',
  object: 'request',
  id: `R-${n}`,
  field: 'state',
  old: 'Submitted',
  new: 'In review',
  effectiveDate: null,
  comment: null,
  commentAudience: null,
  ...over,
})

function chainOf(n: number): AuditEntry[] {
  const out: AuditEntry[] = []
  for (let i = 1; i <= n; i++) out.push(appendEntry(out.at(-1) ?? null, draft(i)))
  return out
}

describe('appendEntry', () => {
  it('numbers from 1 and starts from the genesis hash', () => {
    const first = appendEntry(null, draft(1))
    expect(first.seq).toBe(1)
    expect(first.prevHash).toBe(GENESIS_HASH)
    expect(first.hash).toMatch(/^sha256-[0-9a-f]{64}$/)
  })

  it('chains each entry to the one before', () => {
    const [a, b, c] = chainOf(3)
    expect(b.seq).toBe(2)
    expect(b.prevHash).toBe(a.hash)
    expect(c.seq).toBe(3)
    expect(c.prevHash).toBe(b.hash)
  })

  it('hashes the canonical JSON of the entry without its hash, prevHash included', () => {
    const e = appendEntry(null, draft(1, { old: { b: 2, a: 1 }, new: [1, 'two'] }))
    const { hash, ...rest } = e
    expect(hash).toBe(`sha256-${sha256(canonicalJson(rest))}`)
    expect(entryHash(e)).toBe(hash)
    expect(entryHash(rest)).toBe(hash)
  })

  it('copies only the draft fields it knows', () => {
    const extra = { ...draft(1), seq: 99, hash: 'x', prevHash: 'y', note: 'stray' } as unknown as AuditDraft
    const e = appendEntry(null, extra)
    expect(e.seq).toBe(1)
    expect(e.prevHash).toBe(GENESIS_HASH)
    expect(Object.keys(e)).not.toContain('note')
  })

  it('gives the same hash for the same entry with its keys in another order', () => {
    const a = appendEntry(null, draft(1, { new: { x: 1, y: 2 } }))
    const b = appendEntry(null, draft(1, { new: { y: 2, x: 1 } }))
    expect(a.hash).toBe(b.hash)
  })
})

describe('verifyChain', () => {
  it('checks out an intact chain, and an empty one', () => {
    expect(verifyChain(chainOf(5))).toEqual({ ok: true, count: 5 })
    expect(verifyChain([])).toEqual({ ok: true, count: 0 })
  })

  it('finds a change to any field of any entry', () => {
    const fields: (keyof AuditEntry)[] = [
      'at',
      'by',
      'byName',
      'mode',
      'object',
      'id',
      'field',
      'old',
      'new',
      'effectiveDate',
      'comment',
      'commentAudience',
    ]
    const changed: Record<string, unknown> = {
      at: '2026-10-01T00:00',
      by: 'E1',
      byName: 'Someone else',
      mode: 'finance',
      object: 'position',
      id: 'R-X',
      field: 'level',
      old: 'Draft',
      new: 'Approved',
      effectiveDate: '2026-10-01',
      comment: 'A note',
      commentAudience: 'everyone',
    }
    for (let at = 0; at < 4; at++) {
      for (const f of fields) {
        const chain = chainOf(4)
        chain[at] = { ...chain[at], [f]: changed[f] } as AuditEntry
        expect(verifyChain(chain), `${f} of entry ${at + 1}`).toEqual({
          ok: false,
          count: 4,
          brokenAt: at + 1,
        })
      }
    }
  })

  it('finds a removed, reordered, renumbered or re-pointed entry', () => {
    const chain = chainOf(4)
    expect(verifyChain([chain[0], chain[2], chain[3]])).toMatchObject({ ok: false, brokenAt: 2 })
    expect(verifyChain([chain[1], chain[0], chain[2], chain[3]])).toMatchObject({ ok: false, brokenAt: 1 })
    expect(verifyChain(chain.slice(1))).toMatchObject({ ok: false, brokenAt: 1 })
    const renumbered = chain.map((e) => ({ ...e }))
    renumbered[2].seq = 30
    expect(verifyChain(renumbered)).toMatchObject({ ok: false, brokenAt: 3 })
    const repointed = chain.map((e) => ({ ...e }))
    repointed[3].prevHash = GENESIS_HASH
    expect(verifyChain(repointed)).toMatchObject({ ok: false, brokenAt: 4 })
  })

  it('finds a re-hashed entry whose successor still points at the old hash', () => {
    const chain = chainOf(3)
    const edited = { ...chain[1], new: 'Rejected' }
    const rehashed = { ...edited, hash: entryHash(edited) }
    expect(verifyChain([chain[0], rehashed, chain[2]])).toMatchObject({ ok: false, brokenAt: 3 })
  })

  it('reports an entry that cannot be hashed as broken, not an error', () => {
    const chain = chainOf(2)
    const bad = { ...chain[1], new: Number.NaN }
    expect(verifyChain([chain[0], bad])).toMatchObject({ ok: false, brokenAt: 2 })
  })

  it('survives a JSON round trip (a Full workspace file), null and missing values included', () => {
    const chain: AuditEntry[] = []
    chain.push(appendEntry(null, draft(1, { old: null, new: { level: 'P4', fte: 0.5 } })))
    chain.push(appendEntry(chain[0], draft(2, { old: undefined, comment: 'Moved to Q3' })))
    expect(verifyChain(JSON.parse(JSON.stringify(chain)))).toEqual({ ok: true, count: 2 })
  })

  it('finds an entry spliced in from another chain', () => {
    const chain = chainOf(3)
    chain[1] = appendEntry(null, draft(2))
    expect(verifyChain(chain)).toMatchObject({ ok: false, brokenAt: 2 })
  })
})

describe('copy', () => {
  it('says the chain checks out or where it breaks, in plain counts', () => {
    expect(chainStatusText({ ok: true, count: 12 })).toBe('Chain checks out (12 entries)')
    expect(chainStatusText({ ok: true, count: 1 })).toBe('Chain checks out (1 entry)')
    expect(chainStatusText({ ok: true, count: 1234 })).toBe('Chain checks out (1,234 entries)')
    expect(chainStatusText({ ok: false, count: 12, brokenAt: 7 })).toBe('The chain breaks at entry 7.')
    expect(entryCountText(3)).toBe('3 entries')
  })

  it('never claims more than that damage shows', () => {
    for (const text of [CHAIN_NOTE, chainStatusText({ ok: true, count: 2 })])
      expect(text).not.toMatch(/tamper|proof|secure|guarantee/i)
  })
})
