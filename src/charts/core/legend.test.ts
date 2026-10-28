import { describe, expect, it } from 'vitest'
import { dashBackground, dottedBackground, lineBackground, swatchSvg } from './legend'

describe('legend swatches for image exports', () => {
  it('draws each shape around the center line from the left edge', () => {
    expect(swatchSvg('rect', 10, 20)).toEqual({
      tag: 'rect',
      attrs: { x: 10, y: 15, width: 10, height: 10, rx: 2 },
    })
    expect(swatchSvg(undefined, 10, 20).tag).toBe('rect')
    expect(swatchSvg('line', 10, 20).attrs).toMatchObject({ y: 19, width: 14, height: 2 })
    expect(swatchSvg('dot', 10, 20)).toEqual({ tag: 'circle', attrs: { cx: 14, cy: 20, r: 4 } })
  })

  it('draws a dashed line as the 5,4 line it keys: two 5px dashes 4px apart, one path the export fills', () => {
    const d = swatchSvg('dash', 10, 20)
    expect(d.tag).toBe('path')
    expect(String(d.attrs.d)).toBe('M10,19h5v2h-5Z M19,19h5v2h-5Z')
    // On screen the same dashes in the given color, with gaps between.
    expect(dashBackground('#123456')).toBe(
      'repeating-linear-gradient(to right, #123456 0 5px, transparent 5px 9px)',
    )
  })

  it('draws a dotted line as the 2,3 line it keys, never like the dashed one (review RU-14)', () => {
    const d = swatchSvg('dotted', 10, 20)
    expect(d.tag).toBe('path')
    expect(String(d.attrs.d)).toBe('M10,19h2v2h-2Z M15,19h2v2h-2Z M20,19h2v2h-2Z')
    expect(dottedBackground('#123456')).toBe(
      'repeating-linear-gradient(to right, #123456 0 2px, transparent 2px 5px)',
    )
    expect(String(d.attrs.d)).not.toBe(String(swatchSvg('dash', 10, 20).attrs.d))
    expect(lineBackground('dotted', '#123456')).not.toBe(lineBackground('dash', '#123456'))
    expect(lineBackground('rect', '#123456')).toBeNull()
  })

  it('draws a 10px diamond', () => {
    expect(swatchSvg('diamond', 10, 20)).toEqual({ tag: 'path', attrs: { d: 'M15,15L20,20L15,25L10,20Z' } })
  })

  it('draws a medal as one filled path inside its 10px box', () => {
    const m = swatchSvg('medal', 10, 20)
    expect(m.tag).toBe('path')
    const nums =
      String(m.attrs.d)
        .match(/-?\d+(\.\d+)?/g)
        ?.map(Number) ?? []
    expect(nums.length).toBeGreaterThan(10)
  })

  it('draws an outline as a 1.5px ring that the export fills', () => {
    const o = swatchSvg('outline', 10, 20)
    expect(o.tag).toBe('path')
    expect(o.attrs['fill-rule']).toBe('evenodd')
    expect(String(o.attrs.d)).toBe('M10,15h10v10h-10Z M11.5,16.5v7h7v-7Z')
  })
})
