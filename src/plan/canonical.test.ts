import { describe, expect, it } from 'vitest'
import { canonicalJson } from './canonical'

describe('canonicalJson', () => {
  it('writes one text for one value, whatever the key order', () => {
    const a = { b: 1, a: { d: [1, 2], c: 'x' } }
    const b = { a: { c: 'x', d: [1, 2] }, b: 1 }
    expect(canonicalJson(a)).toBe('{"a":{"c":"x","d":[1,2]},"b":1}')
    expect(canonicalJson(b)).toBe(canonicalJson(a))
  })

  it('drops undefined keys, writes undefined array items as null and -0 as 0', () => {
    expect(canonicalJson({ a: undefined, b: null, c: [undefined, -0] })).toBe('{"b":null,"c":[null,0]}')
  })

  it('writes typed arrays as arrays of numbers', () => {
    expect(canonicalJson({ v: new Float64Array([1.5, 2]) })).toBe('{"v":[1.5,2]}')
    expect(canonicalJson(new Uint32Array([3, 4]))).toBe('[3,4]')
  })

  it('refuses values a hash should never cover', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/finite/)
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow(/finite/)
    expect(() => canonicalJson({ m: new Map() })).toThrow(/plain data/)
    expect(() => canonicalJson({ d: new Date(0) })).toThrow(/plain data/)
  })

  it('keeps objects made with Object.create(null)', () => {
    const row = Object.create(null) as Record<string, unknown>
    row.z = 1
    row.a = 'b'
    expect(canonicalJson(row)).toBe('{"a":"b","z":1}')
  })

  it('names where a value it refuses sits', () => {
    expect(() => canonicalJson({ a: [1, { b: Number.NaN }] })).toThrow(
      'canonicalJson: $.a[1].b is not a finite number',
    )
    expect(() => canonicalJson({ a: [[1, Number.POSITIVE_INFINITY]] })).toThrow(
      'canonicalJson: $.a[0][1] is not a finite number',
    )
    expect(() => canonicalJson({ s: new Set([1]) })).toThrow('canonicalJson: $.s is not plain data')
    expect(() => canonicalJson(undefined)).toThrow('canonicalJson: $ is a undefined')
    expect(() => canonicalJson({ n: [10n] })).toThrow('canonicalJson: $.n[0] is a bigint')
  })

  it('writes holes empty and keeps every other value as JSON.stringify of sorted keys would', () => {
    // biome-ignore lint/suspicious/noSparseArray: a hole is what is under test
    const sparse = [1, , 'x']
    expect(canonicalJson(sparse)).toBe('[1,,"x"]')
    expect(canonicalJson([() => 1, undefined, true, false, null])).toBe('[null,null,true,false,null]')
    const sorted = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(sorted)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
            )
          : v
    const value = {
      lines: [
        ['P-1', '2026-09', '', 'Filled', 'hris', 'EUR', 1, 0.6, 0.5, 1.0832, 583442, -12, 0],
        ['P-"2"', '2026-10', 'E\\9', 'Open', 'band', 'ILS', 0, 1, 1 / 3, 0.27, 1e21, 5e-7, -0],
      ],
      text: 'Zürich, São Paulo, \u2028 and a tab\t',
      nested: { z: [{ b: 2, a: [1.5, 'q'] }], a: null, m: false },
    }
    expect(canonicalJson(value)).toBe(JSON.stringify(sorted(value)))
  })
})
