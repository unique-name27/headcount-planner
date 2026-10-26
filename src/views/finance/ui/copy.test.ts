/**
 * The copy rules (docs/PLAN.md 14.3) on the Finance and Targets write sides (M3) and Finance > Export
 * with its long CSV and load file models (M4): every prose string
 * of the change dialogs and their models is free of "!", of an em dash between words ("—" is the
 * missing-value placeholder only), of the checksum words the plan bans, and of nagging verbs; button
 * and title labels start with a capital. The same prose reader as src/app/copy.test.ts.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BANNED_HASH_WORDS } from '@/access/copy'

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url))
const FILES = [
  'src/views/finance/ui/form.tsx',
  'src/views/finance/ui/VersionChanges.tsx',
  'src/views/finance/ui/AssumptionChanges.tsx',
  'src/views/finance/ui/FreezeChanges.tsx',
  'src/views/finance/ui/ReviewChanges.tsx',
  // M4: Finance > Export and the long CSV and load file models.
  'src/views/finance/ui/Export.tsx',
  'src/views/finance/engine/export.ts',
  'src/views/finance/engine/longCsv.ts',
  'src/views/finance/engine/loadFile.ts',
  'src/views/finance/engine/writes.ts',
  'src/views/finance/engine/edits.ts',
  'src/views/targets/ui/form.tsx',
  'src/views/targets/ui/TargetChanges.tsx',
  'src/views/targets/engine/writes.ts',
  'src/cost/edits.ts',
]
const NAGGING = ['chase', 'nag', 'ping', 'hound', 'remind', 'unblock']

/** String literals and JSX text that read as prose (src/app/copy.test.ts's reader). */
function prose(text: string, tsx: boolean): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
  const out: string[] = []
  for (const m of code.matchAll(/'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g)) {
    const s = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, 'x')
    if (/^[@./#]/.test(s) || !/\s/.test(s.trim()) || !/[a-z]{2}/i.test(s)) continue
    const tokens = s.trim().split(/\s+/)
    if (/^[A-Z]/.test(s.trim()) || tokens.every((t) => !/[-:[\]/()#=_]/.test(t))) out.push(s)
  }
  if (tsx)
    for (const m of code.matchAll(/<\/?[A-Za-z][\w.]*(?:\s[^<>]*)?>([^<>{}]*[A-Za-z]{2}[^<>{}]*)[<{]/g)) {
      const s = m[1].trim()
      if (s && !/[=;]/.test(s)) out.push(s)
    }
  return out
}

describe('the write sides’ copy', () => {
  it('has no "!", no em dash between words, no banned checksum word and no nagging verb', () => {
    let read = 0
    for (const f of FILES) {
      const text = readFileSync(`${ROOT}${f}`, 'utf8')
      for (const s of prose(text, f.endsWith('.tsx'))) {
        read++
        expect(s.includes('!'), `${f}: ${s}`).toBe(false)
        expect(/\w\s*—\s*\w/.test(s), `${f}: ${s}`).toBe(false)
        for (const w of BANNED_HASH_WORDS) expect(s.toLowerCase().includes(w), `${f}: ${s}`).toBe(false)
        for (const w of NAGGING) expect(new RegExp(`\\b${w}`, 'i').test(s), `${f}: ${s}`).toBe(false)
      }
    }
    expect(read).toBeGreaterThan(100)
  })

  it('starts every dialog title and button label with a capital', () => {
    for (const f of FILES.filter((x) => x.endsWith('.tsx'))) {
      const text = readFileSync(`${ROOT}${f}`, 'utf8')
      for (const m of text.matchAll(/title="([^"]+)"/g))
        expect(/^[A-Z]/.test(m[1]), `${f}: ${m[1]}`).toBe(true)
      // An arrow function in a button's props would end the tag early: read it as one character.
      const tags = text.replace(/=>/g, '⇒')
      for (const m of tags.matchAll(/<Button[^>]*>\s*([A-Za-z][^<{]*)</g))
        expect(/^[A-Z]/.test(m[1].trim()), `${f}: ${m[1]}`).toBe(true)
    }
  })

  it('shows the free-text hint under every free-text box a manager can read (8.4 rule 5, review UI-3)', () => {
    // A version's name reaches Manager mode (tiles' "vs plan of record" labels, files): the Lock and
    // New Working version dialogs' Name boxes carry the hint, as every reason box does.
    for (const f of ['src/views/finance/ui/VersionChanges.tsx', 'src/views/finance/ui/FreezeChanges.tsx']) {
      const text = readFileSync(`${ROOT}${f}`, 'utf8')
      const boxes = [...text.matchAll(/<Field label="(Name|Reason|New reason)"([^>]*)>/g)]
      expect(boxes.length, f).toBeGreaterThan(0)
      for (const m of boxes) expect(m[2], `${f}: ${m[1]}`).toContain('hint={FREE_TEXT_HINT}')
    }
    const versions = readFileSync(`${ROOT}src/views/finance/ui/VersionChanges.tsx`, 'utf8')
    expect([...versions.matchAll(/<Field label="Name"/g)].length).toBe(2)
  })
})
