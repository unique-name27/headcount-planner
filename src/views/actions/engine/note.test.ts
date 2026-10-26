/**
 * "Copy note" (the template app's note.test.ts): one polite, plain-text message per owner, following
 * the tone rules (docs/PLAN.md 14.3): a greeting, the items with what is open and the ask, a thank
 * you; never a nagging verb, an em dash or an exclamation mark; the list capped and the rest counted.
 * On the sample, every note in every mode carries no amount.
 */
import { describe, expect, it } from 'vitest'
import { groupByOwner } from './group'
import { askOf, composeNote, DEFAULT_ASK, greeting, NAGGING, NOTE_MAX_ITEMS } from './note'
import { everyMode } from './roleKit'
import { AS_OF, open } from './testkit'

/** A money amount in text: a currency sign or code beside a number, or a grouped number. */
const MONEY = /[$€£¥₹₪]\s?\d|\d[\d,.]*\s?(USD|EUR|GBP|INR|TWD|CNY|ILS|CAD|VND)\b|\b\d{1,3}(,\d{3})+\b/

describe('greeting', () => {
  it('uses a first name for a person and the group name for an owner group', () => {
    expect(greeting({ name: 'Ji-woo Lim', isTeam: false })).toBe('Hi Ji-woo,')
    expect(greeting({ name: 'Finance', isTeam: true })).toBe('Hi Finance team,')
    expect(greeting({ name: 'Recruiting team', isTeam: true })).toBe('Hi Recruiting team,')
    expect(greeting({ name: 'HR business partners', isTeam: true })).toBe('Hello,')
  })
})

describe('composeNote', () => {
  const waiting = open({
    what: 'New role request has waited 13 days at the Manager step',
    note: 'Could you let me know when you expect to decide on it?',
    subject: { kind: 'requests', id: 'R-1047', label: 'Request R-1047: New role, Principal Power Architect' },
    due: '2026-09-22',
  })
  const asks = open({
    what: 'No ranked asks sent for FY28 yet',
    note: 'Could you send your ranked asks for FY28 by 16 Oct?',
    subject: { kind: 'none', label: "Ji-woo Lim's team" },
    due: '2026-10-16',
  })

  it('greets, lists each item with what is open and its ask, and thanks', () => {
    const text = composeNote({ name: 'Ji-woo Lim', isTeam: false }, [waiting, asks], AS_OF)
    expect(text).toBe(
      [
        'Hi Ji-woo,',
        'Here are 2 open items for you, as of 30 Sep 2026.',
        [
          '1. Request R-1047: New role, Principal Power Architect',
          '   New role request has waited 13 days at the Manager step. Due 22 Sep 2026.',
          '   Could you let me know when you expect to decide on it?',
          '',
          "2. Ji-woo Lim's team",
          // The ask already says its date, so it is not repeated.
          '   No ranked asks sent for FY28 yet.',
          '   Could you send your ranked asks for FY28 by 16 Oct?',
        ].join('\n'),
        'If any of these are already done, let me know and I will update the list. Thank you.',
      ].join('\n\n'),
    )
  })

  it('reads an item worded for its owner that way', () => {
    const own = open({
      what: 'No ranked asks sent for FY28 yet',
      subject: { kind: 'none', label: "Ji-woo Lim's team" },
      forOwner: { what: 'Your ranked asks for FY28 are not in yet, due 16 Oct 2026', subject: 'Your team' },
      note: 'Could you send your ranked asks for FY28 by 16 Oct?',
      due: '2026-10-16',
    })
    const note = composeNote({ name: 'Ji-woo Lim', isTeam: false }, [own], AS_OF)
    expect(note).toContain('1. Your team')
    expect(note).toContain('Your ranked asks for FY28 are not in yet, due 16 Oct 2026.')
    expect(note.slice(note.indexOf('\n'))).not.toContain('Ji-woo Lim')
  })

  it('speaks to an owner group, and to one item', () => {
    const text = composeNote({ name: 'Finance', isTeam: true }, [asks], AS_OF)
    expect(
      text.startsWith('Hi Finance team,\n\nHere is one open item for your team, as of 30 Sep 2026.'),
    ).toBe(true)
    expect(text.endsWith('If this is already done, let me know and I will update the list. Thank you.')).toBe(
      true,
    )
  })

  it('never nags: an ask with a nagging verb is replaced by a neutral one', () => {
    const pushy = open({ note: 'Please chase the approver and push for a decision.' })
    expect(askOf(pushy)).toBe(DEFAULT_ASK)
    expect(askOf(open({ note: undefined }))).toBe(DEFAULT_ASK)
    const text = composeNote({ name: 'Sam Lee', isTeam: false }, [pushy, waiting], AS_OF)
    expect(text).not.toMatch(NAGGING)
    expect(text).not.toMatch(/\w — \w/)
    expect(text).not.toContain('!')
  })

  it('says "together" where an ask would name the person sending it', () => {
    const item = open({ note: 'Could we review the seat with Ji-woo Lim this week?' })
    const note = composeNote({ name: 'Agnieszka Nielsen', isTeam: false }, [item], AS_OF, {
      me: 'Ji-woo Lim',
    })
    expect(note).toContain('Could we review the seat together this week?')
    expect(note).not.toContain('Ji-woo')
  })

  it('lists at most the cap and counts the rest', () => {
    const items = Array.from({ length: NOTE_MAX_ITEMS + 3 }, () => open())
    const text = composeNote({ name: 'Sam Lee', isTeam: false }, items, AS_OF)
    expect(text).toContain(`Here are ${NOTE_MAX_ITEMS + 3} open items for you`)
    expect(text).toContain(`${NOTE_MAX_ITEMS}. `)
    expect(text).not.toContain(`${NOTE_MAX_ITEMS + 1}. `)
    expect(text).toContain('There are 3 more; I can send the full list.')
    expect(composeNote({ name: 'Sam Lee', isTeam: false }, [], AS_OF)).toBe('')
  })
})

describe('on the sample, every note in every mode', () => {
  it('holds no amount, no nagging verb, no em dash and no exclamation mark', () => {
    let notes = 0
    for (const { mode, ctx, collected } of everyMode()) {
      for (const b of groupByOwner(collected.items, ctx.asOf).flatMap((g) => g.owners)) {
        const items = b.items.flatMap((a) => (a.members ? [...a.members] : [a]))
        const text = composeNote({ name: b.name, isTeam: b.isTeam }, items, ctx.asOf)
        notes++
        expect(text, `${mode} ${b.name}`).not.toMatch(MONEY)
        expect(text, `${mode} ${b.name}`).not.toMatch(NAGGING)
        expect(text, `${mode} ${b.name}`).not.toMatch(/\w ?— ?\w/)
        expect(text, `${mode} ${b.name}`).not.toContain('!')
      }
    }
    expect(notes).toBeGreaterThan(0)
  }, 300_000)
})
