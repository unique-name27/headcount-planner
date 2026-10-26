/**
 * What the dev server (`npm run dev`) refuses to serve (scripts/devServer.mjs, vite.config.ts):
 * Vite's own list of secrets, plus workspace files (*.hcplan.json), which hold plan state and, in a
 * Full file, pay. Setting `server.fs.deny` replaces Vite's list, so the list keeps Vite's six
 * patterns. It is matched here the way Vite matches it.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEV_SERVER_DENY } from '../../scripts/devServer.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
  .replace(/\\/g, '/')
  .replace(/\/$/, '')

type Matcher = (path: string) => boolean
const picomatch = createRequire(import.meta.url)('picomatch') as (
  patterns: string[],
  options: { matchBase: boolean; nocase: boolean; dot: boolean },
) => Matcher

/** Vite 8's `fsDenyGlob`: a pattern with no slash matches in any folder. */
const denied = picomatch(
  DEV_SERVER_DENY.map((p) => (p.includes('/') ? p : `**/${p}`)),
  { matchBase: false, nocase: true, dot: true },
)

describe('the dev server', () => {
  it('never serves a workspace file, nor what Vite refuses on its own', () => {
    for (const path of [
      `${root}/plan.hcplan.json`,
      `${root}/Shared/FY27 Full.HCPLAN.JSON`,
      `${root}/src/data/sample/manager-a.hcplan.json`,
      `${root}/.env`,
      `${root}/.env.production`,
      `${root}/certs/dev.pem`,
      `${root}/.npmrc`,
      `${root}/.git/config`,
    ])
      expect(denied(path), path).toBe(true)
  })

  it('still serves the app', () => {
    for (const path of [
      `${root}/index.html`,
      `${root}/src/main.tsx`,
      `${root}/src/styles/index.css`,
      `${root}/package.json`,
      `${root}/src/data/sample/README.md`,
    ])
      expect(denied(path), path).toBe(false)
  })

  it('keeps Vite’s own list, and vite.config.ts uses this one', () => {
    for (const p of [
      '.env',
      '.env.*',
      '*.{crt,pem,key,p12,pfx,cer,der}',
      '.npmrc',
      '.yarnrc.yml',
      '**/.git/**',
    ])
      expect(DEV_SERVER_DENY).toContain(p)
    expect(DEV_SERVER_DENY).toContain('*.hcplan.json')
    const config = readFileSync(join(root, 'vite.config.ts'), 'utf8')
    expect(config).toContain("import { DEV_SERVER_DENY } from './scripts/devServer.mjs'")
    expect(config).toContain('server: { fs: { deny: DEV_SERVER_DENY } }')
  })
})
