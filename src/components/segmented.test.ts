/**
 * The segmented control can be disabled as a whole (docs/PLAN.md 8.4 rule 5, C24; review UI-5): a
 * comment that mentions an amount is Approvers only, and its audience picker shows disabled with the
 * chosen option kept, so the page says what the action enforces.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Segmented } from './ui'

const options = [
  { value: 'approvers', label: 'Approvers only' },
  { value: 'everyone', label: 'Everyone on the request' },
]

const render = (disabled?: boolean) =>
  renderToStaticMarkup(
    createElement(Segmented<string>, {
      value: 'approvers',
      onChange: () => undefined,
      options,
      label: 'Who sees this comment',
      ...(disabled == null ? {} : { disabled }),
    }),
  )

const buttons = (html: string) => [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0])

describe('Segmented', () => {
  it('disables every option when asked, keeping the chosen one pressed', () => {
    const off = buttons(render(true))
    expect(off.length).toBe(2)
    for (const b of off) expect(b, b).toMatch(/aria-disabled="true"|\sdisabled(=""|\s|>)/)
    expect(off.filter((b) => /aria-pressed="true"/.test(b)).length).toBe(1)
  })

  it('leaves every option enabled by default', () => {
    for (const html of [render(), render(false)])
      for (const b of buttons(html)) expect(b, b).not.toMatch(/aria-disabled="true"|\sdisabled(=""|\s|>)/)
  })
})
