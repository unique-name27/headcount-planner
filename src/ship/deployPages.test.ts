/**
 * What `npm run deploy` publishes (docs/PLAN.md 3.3 and 3.4): the one-file build as index.html and
 * as headcount-planner.html, and an empty .nojekyll. The list is pure (scripts/pagesFiles.mjs); the
 * script stages exactly those files by name in a throwaway repository and refuses, with a plain
 * message, to run without a commit, an origin or the build, or with a build that would not open on
 * its own from file:// (scripts/oneFile.mjs). The last tests run the real script against a local
 * bare repository in the temp folder, so nothing leaves this computer.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APP_NAME, APP_SLUG, ONE_FILE } from '../../scripts/brand.mjs'
import { pagesFiles } from '../../scripts/pagesFiles.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const script = readFileSync(join(ROOT, 'scripts/deploy-pages.mjs'), 'utf8')

describe('the Pages deploy', () => {
  it('publishes the one-file build as index.html and headcount-planner.html, and nothing else', () => {
    expect(pagesFiles()).toEqual([
      { from: 'headcount-planner.html', to: 'index.html' },
      { from: 'headcount-planner.html', to: 'headcount-planner.html' },
      { from: null, to: '.nojekyll' },
    ])
    expect(ONE_FILE).toBe('headcount-planner.html')
  })

  it('is what the deploy script copies, staged by name, never with git add -A', () => {
    expect(script).toContain("from './pagesFiles.mjs'")
    expect(script).toMatch(/for \(const f of files\)/)
    expect(script).toContain("git(['add', '--', ...files.map((f) => f.to)], dir)")
    // Code only: the header comment says what it never does.
    const code = script.replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/add['"]?,?\s*['"]?(-A|--all|\.)['"\s\]]/)
    expect(code).not.toMatch(/git add -A|git add \./)
    expect(code.match(/'add'/g)).toHaveLength(1)
    expect(script).toMatch(/`\$\{APP_SLUG\}-pages-`/)
    expect(script).toMatch(/`Publish \$\{APP_NAME\} \(one-file build of main@\$\{sha\}\)`/)
    expect(script).toContain("git(['init', '-q', '-b', 'gh-pages'], dir)")
  })

  it('checks the one-file build before it stages anything, and pushes only to origin', () => {
    expect(script).toContain("from './oneFile.mjs'")
    const code = script.replace(/^\s*\/\/.*$/gm, '')
    expect(code.indexOf('oneFileProblems(')).toBeGreaterThan(0)
    expect(code.indexOf('oneFileProblems(')).toBeLessThan(code.indexOf('mkdtempSync('))
    expect(code).toContain("gitAnswer(['remote', 'get-url', 'origin'])")
    expect(code.match(/'push'/g)).toHaveLength(1)
    expect(code).toContain("git(['push', '-q', '-f', remote, 'gh-pages'], dir)")
  })

  it('writes its messages without an em dash', () => {
    for (const m of script.matchAll(/(?:refuse|console\.(?:log|error))\(([^)]*)\)/g))
      expect(m[1].includes('—'), m[1]).toBe(false)
  })
})

/** The smallest page that opens on its own: an inline script and the app's mount point. */
const PAGE = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="UTF-8" /><title>One file</title>',
  '<script type="module">document.title = "One file"</script>',
  '<style>body{margin:0}</style></head>',
  '<body><div id="root"></div></body></html>',
  '',
].join('\n')

describe('the deploy script, run in a sandbox', () => {
  let env: NodeJS.ProcessEnv = {}
  let box = ''
  let project = ''
  let remote = ''
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim()
  const deploy = () =>
    spawnSync(process.execPath, ['scripts/deploy-pages.mjs'], { cwd: project, env, encoding: 'utf8' })

  beforeAll(() => {
    box = mkdtempSync(join(tmpdir(), 'hcp-deploy-test-'))
    // Git reads none of this computer's settings (hooks, signing, credential helpers) in the sandbox.
    writeFileSync(join(box, 'gitconfig'), '')
    env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(box, 'gitconfig'),
    }
    project = join(box, 'project')
    remote = join(box, 'remote.git')
    mkdirSync(join(project, 'scripts'), { recursive: true })
    for (const f of ['brand.mjs', 'oneFile.mjs', 'pagesFiles.mjs', 'deploy-pages.mjs'])
      copyFileSync(join(ROOT, 'scripts', f), join(project, 'scripts', f))
    git(project, 'init', '-q', '-b', 'main')
  })
  afterAll(() => {
    if (box) rmSync(box, { recursive: true, force: true })
  })

  it('refuses without a commit, then without an origin, then without the build', () => {
    let r = deploy()
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Not published. This repository has no commit yet.')

    writeFileSync(join(project, 'README.md'), 'sandbox\n')
    git(project, 'add', '--', 'README.md')
    git(project, 'commit', '-q', '-m', 'First')
    r = deploy()
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Not published. This repository has no remote named origin.')

    git(box, 'init', '-q', '--bare', 'remote.git')
    git(project, 'remote', 'add', 'origin', remote)
    r = deploy()
    expect(r.status).toBe(1)
    expect(r.stderr).toContain(`Not published. ${ONE_FILE} is missing.`)
    for (const out of [r.stdout, r.stderr]) expect(out.includes('—')).toBe(false)
  })

  it('refuses a one-file build that would load a file, and publishes nothing', () => {
    writeFileSync(
      join(project, ONE_FILE),
      PAGE.replace('<script type="module">', '<script type="module" src="./assets/index.js">'),
    )
    const r = deploy()
    expect(r.status).toBe(1)
    expect(r.stderr).toContain(`Not published. ${ONE_FILE} would not open on its own.`)
    expect(r.stderr).toContain('loads a file or an address')
    expect(r.stdout.includes('—') || r.stderr.includes('—')).toBe(false)
    expect(git(remote, 'branch', '--list', 'gh-pages')).toBe('')
  })

  it('pushes one commit to gh-pages holding exactly the three files', () => {
    writeFileSync(join(project, ONE_FILE), PAGE)
    // A stray file beside the build is never published.
    writeFileSync(join(project, 'stray.txt'), 'not for the site')
    const r = deploy()
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('Published index.html, headcount-planner.html, .nojekyll')
    const files = git(remote, 'ls-tree', '--name-only', 'gh-pages').split(/\r?\n/).sort()
    expect(files).toEqual(['.nojekyll', 'headcount-planner.html', 'index.html'])
    const sha = git(project, 'rev-parse', '--short', 'HEAD')
    expect(git(remote, 'log', '--format=%s', 'gh-pages')).toBe(
      `Publish ${APP_NAME} (one-file build of main@${sha})`,
    )
    expect(git(remote, 'show', 'gh-pages:index.html')).toBe(PAGE.trimEnd())
    expect(git(remote, 'show', 'gh-pages:.nojekyll')).toBe('')
    expect(APP_SLUG).toBe('headcount-planner')
  })
})
