/**
 * The shell's copy rules (docs/PLAN.md 14.3), on its own sentences and on every prose string in
 * src/app: sentence case, no "!", no em dash between words ("—" is the missing-value placeholder
 * only), none of `BANNED_MODE_WORDS` or `BANNED_HASH_WORDS`, and no nagging verbs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BANNED_HASH_WORDS, BANNED_MODE_WORDS } from '@/access/copy'
import { MODES } from '@/access/modes'
import {
  actingAsLine,
  COMPANY_TAG,
  FOOTER_LOCAL,
  footerSample,
  LOADING_LINE,
  PERSONA_TAG,
  PICK_SEARCH,
  pageComing,
  pinnedTip,
} from './copy'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const NAGGING = ['chase', 'nag', 'ping', 'hound', 'remind', 'unblock']

/** Every non-test source file under src/app. */
function sources(dir = HERE): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sources(p))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** String literals and JSX text that read as prose: two words or more with a letter. */
function prose(text: string, tsx: boolean): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
  const out: string[] = []
  for (const m of code.matchAll(/'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g)) {
    // A template's expressions are code: only its text is prose.
    const s = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, 'x')
    if (/^[@./#]/.test(s) || !/\s/.test(s.trim()) || !/[a-z]{2}/i.test(s)) continue
    // Class lists and selectors are lower case tokens with "-", ":", "[" or "/" in them; prose
    // starts with a capital, or is plain words.
    const tokens = s.trim().split(/\s+/)
    if (/^[A-Z]/.test(s.trim()) || tokens.every((t) => !/[-:[\]/()#=_]/.test(t))) out.push(s)
  }
  // JSX text: what follows an opening or closing tag, up to the next tag or expression.
  if (tsx)
    for (const m of code.matchAll(/<\/?[A-Za-z][\w.]*(?:\s[^<>]*)?>([^<>{}]*[A-Za-z]{2}[^<>{}]*)[<{]/g)) {
      const s = m[1].trim()
      if (s && !/[=;]/.test(s)) out.push(s)
    }
  return out
}

/** The shell's own sentences, with sample values filled in. */
const OWN: string[] = [
  actingAsLine('Priya Raman'),
  COMPANY_TAG,
  FOOTER_LOCAL,
  footerSample('Northgate Semiconductor'),
  LOADING_LINE,
  PERSONA_TAG,
  pageComing('Data room'),
  ...MODES.flatMap((m) => [pinnedTip(m, 'Silicon Engineering'), PICK_SEARCH[m].search, PICK_SEARCH[m].list]),
]

/** Problems with one sentence. */
function problems(s: string): string[] {
  const out: string[] = []
  const lower = s.toLowerCase()
  if (/!(\s|$|['"`)])/.test(s)) out.push('"!"')
  // "—" alone, or quoted as the placeholder ('reads "—"'), is the missing value, not punctuation.
  const dashes = s.replace(/["“]—["”]/g, '')
  if (/\S\s?—\s?\S/.test(dashes) && !/^—$/.test(s.trim())) out.push('em dash between words')
  for (const w of BANNED_MODE_WORDS) if (lower.includes(w)) out.push(`banned word "${w}"`)
  for (const w of BANNED_HASH_WORDS) if (lower.includes(w)) out.push(`banned word "${w}"`)
  for (const w of NAGGING) if (new RegExp(`\\b${w}\\b`).test(lower)) out.push(`nagging verb "${w}"`)
  return out
}

describe('the shell’s copy', () => {
  it('its own sentences follow the rules and start with a capital', () => {
    for (const s of OWN) {
      expect(problems(s), s).toEqual([])
      expect(/^[A-Z?]/.test(s), s).toBe(true)
    }
  })

  it('the scan finds prose in code and JSX, and flags what breaks the rules', () => {
    const found = prose(
      'const a = \'Export done! Your file is ready.\'\nconst b = <p className="x">Locked down — for now</p>',
      true,
    )
    expect(found).toEqual(['Export done! Your file is ready.', 'Locked down — for now'])
    expect(problems(found[0])).toEqual(['"!"'])
    expect(problems(found[1])).toEqual(['em dash between words', 'banned word "locked down"'])
    expect(problems('Numbers read "—" here.')).toEqual([])
  })

  it('every prose string in src/app follows the rules', () => {
    const bad: string[] = []
    let seen = 0
    for (const file of sources()) {
      for (const s of prose(readFileSync(file, 'utf8'), file.endsWith('.tsx'))) {
        seen++
        const p = problems(s)
        if (p.length) bad.push(`${relative(HERE, file)}: "${s}" (${p.join(', ')})`)
      }
    }
    expect(seen).toBeGreaterThan(100)
    expect(bad).toEqual([])
  })
})
