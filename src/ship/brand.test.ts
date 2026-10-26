/**
 * One set of names (docs/PLAN.md 3.1 and 3.3): scripts/brand.mjs agrees with src/app/brand.ts, and
 * the package, page, launcher, ignore file and npm scripts use them. Every Vite run starts Node with
 * the crash workaround; the dev server and preview own ports 8822 and 8823 and never move.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as scriptBrand from '../../scripts/brand.mjs'
import * as brand from '../app/brand'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const VITE = 'node --max-semi-space-size=64 node_modules/vite/bin/vite.js'

describe('the names', () => {
  it('are the same in the scripts and the app', () => {
    expect(scriptBrand.APP_NAME).toBe(brand.APP_NAME)
    expect(scriptBrand.APP_SLUG).toBe(brand.APP_SLUG)
    expect(scriptBrand.ONE_FILE).toBe(brand.ONE_FILE)
    expect(brand.APP_NAME).toBe('Headcount Planner')
    expect(brand.APP_SLUG).toBe('headcount-planner')
    expect(brand.ONE_FILE).toBe('headcount-planner.html')
  })

  it('keep the app’s storage, channel, lock and DOM names apart from any other app', () => {
    expect(brand.STORAGE_PREFIX).toBe('hcp:')
    expect(brand.IDB_DB).toBe('headcount-planner')
    expect(brand.IDB_STORE).toBe('kv')
    expect(brand.TAB_CHANNEL).toBe('headcount-planner')
    expect(brand.WRITER_LOCK).toBe('hcp:writer')
    expect(brand.HISTORY_MARK).toBe('hcp')
    expect(brand.DOM_IDS).toEqual({ main: 'hcp-main', view: 'hcp-view', viewBody: 'hcp-view-body' })
    expect(brand.FILE_PREFIX).toBe('headcount-planner')
  })

  it('name the package, the page, the preview launcher and the ignored one-file build', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.name).toBe(brand.APP_SLUG)
    const lock = JSON.parse(read('package-lock.json'))
    expect(lock.name).toBe(brand.APP_SLUG)
    expect(lock.packages[''].name).toBe(brand.APP_SLUG)
    expect(read('index.html')).toContain(`<title>${brand.APP_NAME}</title>`)
    const launch = JSON.parse(read('.claude/launch.json'))
    expect(launch.configurations).toEqual([
      { name: brand.APP_SLUG, runtimeExecutable: 'npm', runtimeArgs: ['run', 'dev'], port: 8822 },
    ])
    const bat = read(`Launch ${brand.APP_NAME}.bat`)
    expect(bat).toContain(`%~dp0${brand.ONE_FILE}`)
    expect(read('.gitignore').split(/\r?\n/)).toContain(brand.ONE_FILE)
  })

  it('come from scripts/brand.mjs in every script that names a file or the app', () => {
    for (const s of ['copy-single.mjs', 'deploy-pages.mjs', 'pagesFiles.mjs', 'verify.mjs']) {
      const text = read(`scripts/${s}`)
      expect(text, s).toContain("from './brand.mjs'")
      // The names themselves only in comments, never as a string the script uses.
      expect(text.replace(/^\s*\/\/.*$/gm, ''), s).not.toMatch(
        /['"`]headcount-planner|Headcount Planner['"`]/,
      )
    }
  })
})

describe('the npm scripts', () => {
  const pkg = JSON.parse(read('package.json'))

  it('are the plan’s, with the Node 24 workaround on every Vite run', () => {
    expect(pkg.scripts).toEqual({
      dev: `${VITE} --port 8822 --strictPort`,
      build: `${VITE} build`,
      'build:single': `${VITE} build --mode single && node scripts/copy-single.mjs`,
      preview: `${VITE} preview --port 8823 --strictPort`,
      typecheck: 'tsc --noEmit -p .',
      test: 'vitest run',
      lint: 'biome check src scripts',
      verify: 'node scripts/verify.mjs',
      deploy: 'npm run build:single && node scripts/deploy-pages.mjs',
    })
    // Code only: verify.mjs's comment may say never to use it.
    const verifyCode = read('scripts/verify.mjs').replace(/^\s*\/\/.*$/gm, '')
    for (const text of [JSON.stringify(pkg.scripts), verifyCode]) expect(text).not.toMatch(/npx\s+vite\b/)
    expect(read('scripts/verify.mjs')).toContain(VITE)
  })

  it('pin the Node floor and drop the packages the plan drops', () => {
    expect(pkg.engines).toEqual({ node: '^22.18.0 || >=24.11.0' })
    const all = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const dropped of ['@anthropic-ai/sdk', 'd3-sankey', '@types/d3-sankey', 'motion', 'date-fns'])
      expect(all, dropped).not.toHaveProperty(dropped)
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@base-ui/react',
      '@fontsource-variable/archivo',
      '@fontsource-variable/jetbrains-mono',
      '@observablehq/plot',
      'd3',
      'exceljs',
      'idb-keyval',
      'pptxgenjs',
      'react',
      'react-dom',
      'xlsx',
      'zustand',
    ])
  })
})
