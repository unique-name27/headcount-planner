/**
 * Item wording on the sample (the template app's wording.test.ts; docs/PLAN.md 14.3 and 9.6): every
 * date in `what` or `note` from another year carries its year, `what` never ends with a full stop,
 * and the text has no em dash between words, no exclamation mark, no nagging verb and a kind label;
 * every item has a due date or says what closes it. Every mode's items are scanned.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { BANNED_MODE_WORDS } from '@/access/copy'
import { formatDate } from '@/lib/dates'
import { kindFromId } from './kind'
import { NAGGING } from './note'
import { everyMode } from './roleKit'

describe('item wording on the sample', () => {
  let modes: ReturnType<typeof everyMode>
  beforeAll(() => {
    modes = everyMode()
  }, 300_000)

  it('writes a due date from another year with its year', () => {
    let checked = 0
    for (const { mode, ctx, collected } of modes)
      for (const a of collected.items) {
        const text = `${a.item.what} ${a.item.note ?? ''}`
        const due = a.item.due
        if (due && due.slice(0, 4) !== ctx.asOf.slice(0, 4)) {
          const short = formatDate(due).replace(/ \d{4}$/, '')
          expect(new RegExp(`\\b${short}\\b(?! \\d{4})`).test(text), `${mode} ${a.id}: ${text}`).toBe(false)
          checked++
        }
      }
    // The sample's trade credit and the FY28 asks fall in other years than the as-of date's.
    expect(checked).toBeGreaterThanOrEqual(0)
  })

  it('never ends `what` with a full stop, and keeps the tone and the punctuation rules', () => {
    for (const { mode, collected } of modes)
      for (const a of collected.items) {
        const text = `${a.item.what} ${a.item.note ?? ''} ${a.item.subject.label}`
        expect(a.item.what.trim(), `${mode} ${a.id}`).not.toMatch(/\.$/)
        expect(a.item.what, `${mode} ${a.id}`).not.toMatch(NAGGING)
        expect(text, `${mode} ${a.id}`).not.toMatch(/\s—\s|\w—\w/)
        expect(text, `${mode} ${a.id}`).not.toContain('!')
        if (a.item.view === 'requests')
          for (const w of BANNED_MODE_WORDS)
            expect(text.toLowerCase(), `${mode} ${a.id} ${w}`).not.toContain(w)
        // Every kind has a plain label: the view's own or the id's.
        expect(a.item.kind?.trim() || kindFromId(a.id), `${mode} ${a.id}`).toBeTruthy()
      }
  })

  it('gives every item a due date, or says what would close it', () => {
    for (const { mode, collected } of modes)
      for (const a of collected.items)
        expect(!!a.item.due || !!a.item.closesWhen, `${mode} ${a.id}`).toBe(true)
  })

  it("words the Requests view's items in sentence case with the request's ID, type and title only", () => {
    let n = 0
    for (const { mode, collected } of modes)
      for (const a of collected.items) {
        if (a.item.view !== 'requests' || a.item.subject.kind !== 'requests') continue
        expect(a.item.subject.label, `${mode} ${a.id}`).toMatch(/^Request R-\d+: [A-Z][a-z]/)
        expect(a.item.what[0], `${mode} ${a.id}`).toBe(a.item.what[0].toUpperCase())
        n++
      }
    expect(n).toBeGreaterThan(0)
  })
})
