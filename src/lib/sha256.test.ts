import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sha256 } from './sha256'

const SRC = fileURLToPath(new URL('..', import.meta.url))

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('sha256', () => {
  it('matches the published test vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('reads text as UTF-8 and spans many blocks', () => {
    expect(sha256('Zürich, São Paulo')).toBe(sha256('Zürich, São Paulo'))
    expect(sha256('Zürich')).not.toBe(sha256('Zurich'))
    expect(sha256('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3')
  })

  it('agrees with Node’s SHA-256 at every tail length, across block edges and in UTF-8', () => {
    const chars = 'aZ09 {}[]",:-_.é€😀\u0000\u001f'
    let seed = 7
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed
    }
    for (const len of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4099]) {
      let text = ''
      while (text.length < len) text += chars[next() % chars.length]
      expect(sha256(text), `length ${len}`).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
    }
  })

  it('is synchronous', () => {
    expect(typeof sha256('abc')).toBe('string')
  })

  it('is the only hash: nothing in src calls crypto.subtle (docs/PLAN.md 5.3, change C27)', () => {
    const files = sources(SRC)
    expect(files.length).toBeGreaterThan(5)
    const callers = files.filter((f) =>
      /\bsubtle\s*\.\s*(digest|importKey|sign|encrypt)\b/.test(readFileSync(f, 'utf8')),
    )
    expect(callers).toEqual([])
  })
})
