/**
 * Date settings (type 'date'): 'YYYY-MM-DD' or '' for not set, read from a form, a cell or a
 * settings file, and worded for Settings and Metric definitions.
 */
import { describe, expect, it } from 'vitest'
import { allowedText, formatParam, NOT_SET, parseParamInput, readDateSetting, validateParam } from './params'
import type { ParamDef } from './types'

const def: ParamDef = { key: 'closeDate', label: 'Cycle closes', description: 'x', type: 'date', default: '' }

describe('date settings', () => {
  it('take a calendar date or blank, and nothing else', () => {
    expect(validateParam(def, '')).toEqual({ ok: true, value: '' })
    expect(validateParam(def, '2026-10-30')).toEqual({ ok: true, value: '2026-10-30' })
    for (const bad of ['2026-02-30', '30 Oct', 42, null, true])
      expect(validateParam(def, bad).ok, String(bad)).toBe(false)
  })

  it('read typed and pasted dates, Excel cells and "Not set"', () => {
    const read = (raw: unknown) => parseParamInput(def, raw)
    expect(read('2026-10-30')).toEqual({ ok: true, value: '2026-10-30' })
    expect(read('30 Oct 2026')).toEqual({ ok: true, value: '2026-10-30' })
    expect(read('Oct 30, 2026')).toEqual({ ok: true, value: '2026-10-30' })
    expect(read('30/10/2026')).toEqual({ ok: true, value: '2026-10-30' })
    expect(read('20261030')).toEqual({ ok: true, value: '2026-10-30' })
    expect(read(new Date(Date.UTC(2026, 9, 30)))).toEqual({ ok: true, value: '2026-10-30' })
    expect(read(46325)).toEqual({ ok: true, value: '2026-10-30' })
    for (const blank of ['', '  ', NOT_SET, 'not set', '—', null, undefined])
      expect(read(blank)).toEqual({ ok: true, value: '' })
    const bad = read('next Friday')
    expect(bad.ok).toBe(false)
    if (!bad.ok)
      expect(bad.error).toBe(
        'Cycle closes: "next Friday" is not a date. Write it as 30 Oct 2026, or leave it blank.',
      )
  })

  it('refuse dates that are not on the calendar or out of range', () => {
    expect(readDateSetting('31 Sep 2026')).toBeNull()
    expect(readDateSetting('30 Foo 2026')).toBeNull()
    expect(readDateSetting('1850-01-01')).toBeNull()
    expect(readDateSetting(12.5)).toBeNull()
    expect(readDateSetting(new Date(Number.NaN))).toBeNull()
    expect(readDateSetting({})).toBeNull()
  })

  it('read in words', () => {
    expect(formatParam(def, '')).toBe(NOT_SET)
    expect(formatParam(def, '2026-10-30')).toBe('30 Oct 2026')
    expect(allowedText(def)).toBe('A date, or blank for not set')
  })
})
