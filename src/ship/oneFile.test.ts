/**
 * The one-file build (docs/PLAN.md 3.3 and 17, M4 "one-file build (size, opens from file://)"):
 * vite.config.ts builds one self-contained page in `--mode single`, and scripts/oneFile.mjs is the
 * check that the built page opens from file:// with no network request and stays under its size
 * budget. The check is a static read of the page as the browser's HTML parser reads it (running
 * the 4.8 MB app under a DOM shim in Node would not be reliable). It runs on the real build after
 * every one-file build: verify's one-file step (scripts/check-single.mjs), copy-single.mjs and the
 * deploy script refuse a page that fails it. Here it is tried on made-up pages, each break alone,
 * so it cannot pass by finding nothing.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, UserConfig } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import {
  MOUNT_ID,
  ONE_FILE_BUDGET,
  oneFileProblems,
  oneFileReport,
  PAGE_TAGS,
} from '../../scripts/oneFile.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Code only: comments may say what a script never does. */
const code = (p: string) => read(p).replace(/^\s*\/\/.*$/gm, '')

/** A page like the real one-file build, small: every script and style inline, fonts as data: URLs. */
const GOOD = [
  '<!doctype html>',
  '<html lang="en">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  '    <title>Headcount Planner</title>',
  `    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E" />`,
  '    <script type="module" crossorigin>',
  '      const ns = `http://www.w3.org/2000/svg`; const help = "https://react.dev/errors/";',
  '      if (1 < 2 && 3 > 2) document.getElementById("root").textContent = ns + help',
  '      const font = `data:font/woff2;base64,d09GMg==`; fetch(font)',
  '      const s = `<script><\\/script>`',
  '    </script>',
  '    <style rel="stylesheet" crossorigin>@font-face{src:url(data:font/woff2;base64,d09GMg==)format("woff2")}',
  '      .a{fill:url(#grad)} .b{background:url("data:image/png;base64,AAAA")}</style>',
  '  </head>',
  '  <body>',
  '    <div id="root"></div>',
  '    <noscript>Headcount Planner runs in this browser and needs JavaScript turned on.</noscript>',
  '  </body>',
  '</html>',
  '',
].join('\n')

/** GOOD with one change. */
const breaking = (from: string, to: string) => {
  expect(GOOD, from).toContain(from)
  return GOOD.replace(from, to)
}

describe('the one-file check', () => {
  it('passes a page whose every script, style and font is inline', () => {
    expect(oneFileProblems(GOOD)).toEqual([])
    const r = oneFileReport(GOOD)
    expect(r.scripts).toBe(1)
    expect(r.styles).toBe(1)
    expect(r.bytes).toBe(new TextEncoder().encode(GOOD).length)
    expect(r.budget).toBe(ONE_FILE_BUDGET)
  })

  it('refuses each way a page could reach for a file or the network', () => {
    const script = '<script type="module" crossorigin>'
    const cases: [string, string, string][] = [
      [script, '<script type="module" src="./assets/index-Dx.js">', 'loads a file or an address'],
      [
        script,
        `<script src="https://cdn.example.invalid/react.js"></script>${script}`,
        'loads a file or an address',
      ],
      [
        '<link rel="icon"',
        '<link rel="stylesheet" href="./assets/index.css" /><link rel="icon"',
        'loads a file',
      ],
      [
        '<link rel="icon"',
        '<link rel="modulepreload" href="./assets/chunk.js" /><link rel="icon"',
        'loads a file',
      ],
      [
        '<link rel="icon"',
        '<link rel="preconnect" href="https://fonts.example.invalid" /><link rel="icon"',
        'address',
      ],
      ['url(data:font/woff2', 'url(./assets/archivo.woff2', 'with url()'],
      ['url("data:image/png', 'url("https://example.invalid/a.png', 'with url()'],
      ['<style rel="stylesheet" crossorigin>', '<style>@import "./more.css";', 'uses @import'],
      ['fetch(font)', 'import("./assets/exceljs.js")', 'import()'],
      ['fetch(font)', 'const deps = ["assets/xlsx-Cu.js"]', 'names a built file under assets/'],
      ['fetch(font)', 'new URL("./worker.js", import.meta.url)', 'import.meta.url'],
      ['fetch(font)', 'new Worker(w)', 'starts a worker'],
      ['fetch(font)', 'navigator.serviceWorker.register(s)', 'service worker'],
      ['fetch(font)', 'fetch("https://telemetry.example.invalid/hit")', 'requests a written address'],
      ['fetch(font)', 'fetch(`//cdn.example.invalid/x`)', 'requests a written address'],
      [
        '<meta charset="UTF-8" />',
        '<meta http-equiv="refresh" content="0; url=https://example.invalid" />',
        'refresh',
      ],
      ['<div id="root"></div>', '<div id="root" style="background:url(bg.png)"></div>', 'style attribute'],
      ['<div id="root"></div>', '<div id="root"></div><img src="logo.png" />', '<img>'],
      ['<div id="root"></div>', '<div id="root"></div><iframe src="about:blank"></iframe>', '<iframe>'],
      ['<head>', '<head><base href="https://example.invalid/" />', '<base>'],
    ]
    for (const [from, to, want] of cases) {
      const problems = oneFileProblems(breaking(from, to))
      expect(problems.join(' | '), to).toContain(want)
    }
  })

  it('reads a script as the browser does, so a script that ends early is caught', () => {
    // An unescaped end tag inside a string ends the script there; the rest reads as markup.
    const early = breaking('const s = `<script><\\/script>`', 'const s = `</script>`; if (a <b && c > d) x()')
    expect(oneFileProblems(early).join(' | ')).toContain('a script may have ended early')
    // "<!--" inside a script moves where the parser ends it.
    expect(oneFileProblems(breaking('fetch(font)', 'const c = "<!--"')).join(' | ')).toContain('<!--')
    // A script that is never closed.
    expect(oneFileProblems(GOOD.slice(0, GOOD.indexOf('    </script>'))).join(' | ')).toContain(
      'never closed',
    )
  })

  it('refuses a page with no doctype, no inline script or no mount point', () => {
    expect(oneFileProblems(GOOD.replace('<!doctype html>', '')).join(' | ')).toContain('<!doctype html>')
    const noScript = GOOD.replace(/<script[\s\S]*?<\/script>/, '')
    expect(oneFileProblems(noScript)).toEqual(['The page holds no inline script.'])
    expect(oneFileProblems(GOOD.replace('id="root"', 'id="app"'))).toEqual([
      `The page holds no <div id="${MOUNT_ID}"> for the app to mount into.`,
    ])
  })

  it('refuses a page over its budget, and the budget is a constant under the template app’s 8 MB', () => {
    const bytes = new TextEncoder().encode(GOOD).length
    expect(oneFileProblems(GOOD, { budget: bytes })).toEqual([])
    expect(oneFileProblems(GOOD, { budget: bytes - 1 })).toEqual([
      `The page is ${bytes.toLocaleString('en-US')} bytes, over its ${(bytes - 1).toLocaleString('en-US')} byte budget.`,
    ])
    // M3 ended at 4,820,666 bytes (docs/M3-REPORT.md); the plan does not copy an 8 MB one file.
    expect(ONE_FILE_BUDGET).toBeGreaterThan(4_820_666)
    expect(ONE_FILE_BUDGET).toBeLessThan(8_000_000)
    const big = GOOD.replace(
      '<div id="root"></div>',
      `<div id="root"></div><noscript>${'x'.repeat(ONE_FILE_BUDGET)}</noscript>`,
    )
    expect(oneFileProblems(big).join(' | ')).toContain('byte budget')
  })

  it('writes its reasons in plain sentences, without an em dash', () => {
    const all = [
      oneFileProblems(''),
      oneFileProblems(breaking('fetch(font)', 'import("./a.js"); new Worker(w)')),
      oneFileProblems(GOOD, { budget: 1 }),
    ].flat()
    expect(all.length).toBeGreaterThan(3)
    for (const p of all) {
      expect(p, p).toMatch(/^[A-Z<]/)
      expect(p.endsWith('.'), p).toBe(true)
      expect(p.includes('—'), p).toBe(false)
      // A "!" only where a reason names "<!doctype html>" or "<!--".
      expect(p.replace(/<!doctype html>|<!--/g, '').includes('!'), p).toBe(false)
    }
    expect(PAGE_TAGS).toEqual([
      'html',
      'head',
      'meta',
      'title',
      'link',
      'script',
      'style',
      'body',
      'div',
      'noscript',
    ])
  })
})

describe('scripts/check-single.mjs', () => {
  const box = mkdtempSync(join(tmpdir(), 'hcp-one-file-test-'))
  afterAll(() => rmSync(box, { recursive: true, force: true }))
  const run = (file: string) =>
    spawnSync(process.execPath, ['scripts/check-single.mjs', file], { cwd: ROOT, encoding: 'utf8' })

  it('passes a good page with its size, and fails a bad one with each reason', () => {
    writeFileSync(join(box, 'good.html'), GOOD)
    const ok = run(join(box, 'good.html'))
    expect(ok.status).toBe(0)
    expect(ok.stdout).toContain(`of a ${ONE_FILE_BUDGET.toLocaleString('en-US')} byte budget`)
    expect(ok.stdout).toContain(
      '1 inline script and 1 inline style. It opens from file:// with no network request.',
    )

    writeFileSync(join(box, 'bad.html'), breaking('url(data:font/woff2', 'url(./assets/archivo.woff2'))
    const bad = run(join(box, 'bad.html'))
    expect(bad.status).toBe(1)
    expect(bad.stderr).toContain('would not open on its own:')
    expect(bad.stderr).toContain('  Inline style 1 loads ./assets/archivo.woff2;base64,d09GMg== with url().')

    const missing = run(join(box, 'none.html'))
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain('not found. Run npm run build:single.')
    for (const out of [ok.stdout, bad.stderr, missing.stderr]) expect(out.includes('—')).toBe(false)
  })
})

describe('the one-file build', () => {
  type ConfigFn = (env: { mode: string; command: 'build' | 'serve' }) => UserConfig
  const configFor = async (mode: string): Promise<UserConfig> => {
    const fn = (await import('../../vite.config')).default as unknown as ConfigFn
    return fn({ mode, command: 'build' })
  }
  const names = (c: UserConfig) =>
    (c.plugins ?? [])
      .flat(4)
      .map((p) => (p && typeof p === 'object' && 'name' in p ? (p as Plugin).name : ''))

  it('is one self-contained page in --mode single, with relative paths, and the app build is not', async () => {
    const single = await configFor('single')
    expect(single.base).toBe('./')
    expect(single.build?.outDir).toBe('dist-single')
    expect(names(single)).toContain('vite:singlefile')
    // Every asset (the two fonts) inlines as a data: URL, however large.
    expect(Number(single.build?.assetsInlineLimit)).toBeGreaterThanOrEqual(ONE_FILE_BUDGET)
    // The one file is one chunk; Vite warns at the page's own budget (in kB).
    expect(single.build?.chunkSizeWarningLimit).toBe(ONE_FILE_BUDGET / 1000)
    const app = await configFor('production')
    expect(app.base).toBe('./')
    expect(app.build?.outDir).toBe('dist')
    expect(names(app)).not.toContain('vite:singlefile')
    expect(read('vite.config.ts')).toContain('viteSingleFile({ removeViteModuleLoader: true })')
  })

  it('starts from an index.html that names no external URL and mounts where main.tsx renders', () => {
    const html = read('index.html')
    // The only address in it is the SVG namespace inside the icon's data: URL.
    expect([...html.matchAll(/https?:\/\/[^\s'"%)]+/g)].map((m) => m[0])).toEqual([
      'http://www.w3.org/2000/svg',
    ])
    expect(html).toMatch(/<link rel="icon" href="data:image\/svg\+xml,/)
    expect([...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])).toEqual([
      '<script type="module" src="/src/main.tsx">',
    ])
    expect(html).toContain(`<div id="${MOUNT_ID}"></div>`)
    expect(read('src/main.tsx')).toContain(`document.getElementById('${MOUNT_ID}')`)
    // Fonts are bundled from fontsource, never fetched from a font host.
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)|<link[^>]+stylesheet/)
  })

  it('is checked after every one-file build: verify, copy-single and the deploy refuse a page that fails', () => {
    const verify = code('scripts/verify.mjs')
    expect(verify).toMatch(
      /\['One-file build', `\$\{VITE\} build --mode single && node scripts\/check-single\.mjs`\]/,
    )
    const copy = code('scripts/copy-single.mjs')
    expect(copy).toContain("from './oneFile.mjs'")
    expect(copy.indexOf('oneFileProblems(')).toBeGreaterThan(0)
    expect(copy.indexOf('oneFileProblems(')).toBeLessThan(copy.indexOf('copyFileSync(src'))
    expect(code('scripts/deploy-pages.mjs')).toContain('oneFileProblems(')
    expect(code('scripts/check-single.mjs')).toContain("path.join('dist-single', 'index.html')")
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts['build:single']).toMatch(/--mode single && node scripts\/copy-single\.mjs$/)
    expect(pkg.scripts.deploy).toBe('npm run build:single && node scripts/deploy-pages.mjs')
  })
})
