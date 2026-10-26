/**
 * The README and ARCHITECTURE.md (docs/PLAN.md 3.5, 14.3, 15.3): the README states the live link,
 * the download, architecture honesty, the shared origin and every accepted risk of 15.3 that
 * concerns users, and its nine stories' numbers are the generated sample's as they stand (computed
 * here with the same stories module sample.test.ts asserts). ARCHITECTURE.md names every source
 * folder, script and ship test that exists, and only those, gives the one correct Vite command and
 * the ports. Neither calls a checksum proof against tampering, in any spelling.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { ONE_FILE_BUDGET } from '../../scripts/oneFile.mjs'
import { BANNED_HASH_WORDS, managerExportLine, modeExportLine, NOT_SECURITY_SHORT } from '../access/copy'
import { APP_SLUG, ONE_FILE } from '../app/brand'
import { STORAGE_KEYS } from '../app/storageKeys'
import { generateSample, type Sample } from '../data/sample'
import { computeStories, type Stories, storyModel } from '../data/sample/stories'
import { INDIVIDUAL_PAY_LINE } from '../lib/export/exportHeader'
import { hrAdminExportLine } from '../lib/export/modeMeta'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
/** A file as text, with LF line ends (docs/PLAN.md is checked out with CRLF on Windows). */
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
/** Whitespace folded, so a phrase may wrap across lines. */
const flat = (s: string) => s.replace(/\s+/g, ' ')
const README = read('README.md')
const ARCH = read('ARCHITECTURE.md')
const LIVE = `https://unique-name27.github.io/${APP_SLUG}/`

/**
 * A string constant as the source writes it (`name = 'text'`, or the first quoted value after
 * `name = {`), read from the file's text so this test does not load the app's stores.
 */
function sourceString(file: string, name: string): string {
  const text = read(file)
  const m = new RegExp(`\\b${name} =\\s*(?:\\{[^'"\`]*?)?(['"\`])((?:(?!\\1).)+)\\1`, 's').exec(text)
  expect(m, `${name} in ${file}`).not.toBeNull()
  return m?.[2] ?? ''
}

/** The sample's default manager (Manager A), whose Manager line the README quotes. */
const MANAGER_A = 'Sebastian Wagner'

/** A section of a Markdown file: its heading to the next heading of the same level or above. */
function section(text: string, heading: string): string {
  const level = heading.match(/^#+/)?.[0].length ?? 2
  const start = text.indexOf(`\n${heading}\n`)
  expect(start, heading).toBeGreaterThanOrEqual(0)
  const rest = text.slice(start + heading.length + 2)
  const next = rest.search(new RegExp(`\\n#{1,${level}} `))
  return next < 0 ? rest : rest.slice(0, next)
}

const money = (x: number) =>
  `$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const whole = (x: number) => x.toLocaleString('en-US')
/** "+8", "−10" (a minus sign, as the sample's README writes it). */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

describe('the README', () => {
  it('gives the live link, the download for real data and the launcher', () => {
    const text = flat(README)
    expect(text).toContain(`**Live, on the sample only:** ${LIVE}`)
    expect(text).toContain(`**For real data, download \`${ONE_FILE}\`**`)
    expect(text).toContain(`${LIVE}${ONE_FILE}`)
    expect(text).toContain('`Launch Headcount Planner.bat`')
  })

  it('says modes are not security, in the app’s own words, and that checksums catch damage, not forgery', () => {
    const honest = flat(section(README, '## Modes are not security'))
    expect(honest).toContain(NOT_SECURITY_SHORT)
    expect(honest).toContain('**No server.**')
    expect(honest).toContain('**Checksums catch damage, not forgery.**')
    expect(honest).toContain('**Real access control needs a server with sign-in**')
    const origin = flat(section(README, '## Same origin'))
    expect(origin).toContain('`unique-name27.github.io` shares one browser origin')
    expect(origin).toContain(`download \`${ONE_FILE}\``)
  })

  it('repeats every accepted risk of PLAN 15.3 that concerns users, by its own title', () => {
    const plan = section(
      read('docs/PLAN.md'),
      '### 15.3 Accepted risks (repeated in README where they concern users)',
    )
    const items = plan.split(/\n(?=\d+\. )/).filter((s) => /^\d+\. /.test(s))
    expect(items.length).toBeGreaterThanOrEqual(9)
    // The one risk that concerns no user: nothing is shown or counted from it (R74).
    const internal = ['Request number clashes']
    const risks = section(README, '## Accepted risks')
    const told = risks.split('\n').filter((l) => /^\d+\. /.test(l))
    const forUsers = items.filter((s) => !internal.some((t) => s.includes(`**${t}**`)))
    expect(told.length).toBe(forUsers.length)
    for (const item of forUsers)
      for (const [, title] of item.matchAll(/\*\*([^*]+)\*\*/g))
        expect(risks.toLowerCase(), title).toContain(`**${title.toLowerCase()}`)
    expect(flat(risks)).toContain('request number clashes, is internal and shows nothing')
  })

  it('says every output names its mode and which outputs carry individual pay (M4 review D-MODELINE, D-PAYFILES)', () => {
    const what = flat(section(README, '## What it does'))
    expect(what).toContain(`"${modeExportLine('hr-admin')}"`)
    expect(what).toContain(`"${hrAdminExportLine(false)}"`)
    expect(what).toContain(`"${hrAdminExportLine(true)}"`)
    expect(what).toContain(`"${modeExportLine('hrbp', 'Silicon Engineering')}"`)
    expect(what).toContain(`"${managerExportLine(MANAGER_A)}"`)
    expect(what).toContain(`"Show pay amounts" on starts with the line "${INDIVIDUAL_PAY_LINE}"`)
    expect(what).toContain("The load file at Finance's rules is written as with the switch off")
    expect(what).toContain(
      `HR admin's Full file for a backup or a move, which starts with "${INDIVIDUAL_PAY_LINE}"`,
    )
    expect(what).toContain(
      'HR admin\'s Shareable file is always written as with "Show pay amounts" off, at Finance\'s rules, whatever the switch says (the save says so)',
    )
    expect(what).toContain(
      'individual pay leaves the app only in a Full file or an output made with the switch on',
    )
    expect(what).toContain(
      "A file made in Manager mode, or for a manager, names that manager's team in its header: its first line is the Manager line above for that manager",
    )
  })

  it('says where the M4 review put forecast accuracy, back-dated adjustments, the Not in plan row and the component totals (D-SPEC)', () => {
    const what = flat(section(README, '## What it does'))
    const notInPlan = sourceString('src/views/plan/engine/overview.ts', 'NOT_IN_PLAN')
    expect(notInPlan).toBe('Not in plan')
    expect(what).toContain(`people who hold no seat count on a "${notInPlan}" row of Plan > Overview`)
    expect(what).toContain("the forecast's average FTE counts days, whatever a version's proration")
    expect(what).toContain(
      "A back-dated HRIS change to a closed month posts as an adjustment in the first open month, so Plan's totals, the forecast and the bridge's timing step all carry it",
    )
    expect(what).toContain(
      "Forecast accuracy scores the year's latest reforecast against the months closed since it locked, for the whole company: in heads on Forecast > Variance, and in cost there and on Finance > Versions",
    )
    expect(what).toContain(
      "Finance's control totals add USD by component for each unit and the company wherever the screen shows that split",
    )
    const stories = flat(section(README, '### The nine stories'))
    expect(stories).toContain(
      `The 6 count in actual heads on the "${notInPlan}" row of Plan > Overview's Heads by unit`,
    )
  })

  it('says what happens to changes made on an earlier build of the sample (lead browser finding B9)', () => {
    const sample = flat(section(README, '## The sample company'))
    const notice = sourceString('src/app/planState.ts', 'SAMPLE_CHANGED_NOTICE')
    const label = sourceString('src/views/data/engine/workspace.ts', 'EARLIER_SAMPLE_LABEL')
    expect(notice).toMatch(/^Headcount Planner's sample changed with this version\./)
    expect(label).toBe('Changes on the earlier sample')
    expect(sample).toContain(
      'kept in this browser against its baseline id, a hash of the whole generated sample',
    )
    expect(sample).toContain('those changes are set aside, never laid over the new sample')
    expect(sample).toContain(`the app says "${notice}"`)
    expect(sample).toContain(`Data room > Workspace shows them under "${label}"`)
    expect(sample).toContain(
      'saves them as a Full file (with "Show pay amounts" on) and can then remove the kept copy',
    )
    expect(sample).toContain('Each earlier sample keeps its own copy until it is removed')
  })

  it('lists every npm script and the one-file budget', () => {
    const pkg = JSON.parse(read('package.json'))
    for (const name of Object.keys(pkg.scripts))
      expect(README, name).toContain(name === 'test' ? '`npm test`' : `npm run ${name}`)
    expect(README).toContain(`${whole(ONE_FILE_BUDGET)} bytes`)
    expect(README).toContain('`ONE_FILE_BUDGET` in `scripts/oneFile.mjs`')
  })

  describe('the sample and its nine stories, as the sample stands', () => {
    let sample: Sample
    let st: Stories
    beforeAll(() => {
      sample = generateSample()
      st = computeStories(storyModel(sample))
    }, 120_000)

    it('names every persona', () => {
      for (const p of sample.personas) expect(README, p.key).toContain(p.name)
    })

    it('states each story’s numbers', () => {
      const text = flat(section(README, '### The nine stories'))
      const { s1, s2, s3, s4, s5, s6, s7, s8, s9 } = st
      const ss = s3.flagged['Systems & Software'] ?? []
      const recon = Object.values(s7.exceptions)
      const costed = new Set(Object.values(s8.costedPeople))
      const [give] = s9.quote.give
      const [get] = s9.quote.get
      const target = s9.routing.target
      expect(Object.keys(s3.flagged)).toEqual(['Systems & Software'])
      expect(costed.size).toBe(1)
      expect(Object.values(s5.otherSitesFx).every((x) => x === 0)).toBe(true)
      expect(s9.routing.steps.map((s) => s.role)).toEqual(['manager', 'hrbp', 'leader'])
      const facts = [
        // 1
        `Actual heads ${s1.actualHeads} against ${s1.budgetPlanHeads} Budget plan heads at September month-end: **${signed(s1.headsDelta)}**`,
        `Cost year to date ${money(s1.ytdActual)} against the Budget's ${money(s1.ytdBudget)}`,
        `forecast ${money(s1.fyForecast)} against ${money(s1.fyBudget)}, over by ${money(s1.fyVariance)}`,
        // 2
        `Actual heads ${s2.actualHeads} against ${s2.budgetPlanHeads} Budget plan heads: **${signed(s2.headsDelta)}**`,
        `forecast ${money(s2.fyForecast)} against ${money(s2.fyBudget)}, over by ${money(s2.fyVariance)}`,
        // 3
        `**${ss.length}** pending Backfill requests (${[...ss].sort().join(', ')})`,
        // 4
        `holds **${s4.frozen.length}** openings`,
        `Corporate has ${s4.corporateOpenPlanned} Open and Planned seats`,
        s4.offerStart?.start === '2026-10-19'
          ? 'starts in the forecast on 19 Oct 2026'
          : String(s4.offerStart?.start),
        // 5
        `seat by seat (${s5.munich.actualHeads} and ${s5.haifa.actualHeads})`,
        `an FX effect of ${money(s5.munich.fx)} in Munich and ${money(s5.haifa.fx)} in Haifa`,
        '$0 at every other site',
        `Munich ${money(s5.munich.fyVariance)}, Haifa ${money(s5.haifa.fyVariance)}`,
        // 6
        `Target ${s6.targetHeads} heads`,
        `ranked asks add ${s6.rankedHeads}, so asks ${s6.asksHeads} and a gap of **${signed(s6.gap)}**`,
        `after the ${s6.cutAfter}th ranked head`,
        `${s6.notSubmitted.length} managers have not submitted`,
        // 7
        `**${recon.reduce((a, n) => a + n, 0)}** reconciliation exceptions: ${s7.exceptions['not-in-plan']} employees not in the plan and ${s7.exceptions['cost-center-mismatch']} whose worker row`,
        // 8
        `**A cost center with ${[...costed][0]} costed people.** \`1550-HSZ\``,
        // 9
        `${give.level} ${give.location} seat (band estimate ${money(give.bandUsd ?? 0)})`,
        `= ${money(get.bandUsd ?? 0)} each; band ratio ${((give.bandUsd ?? 0) / (get.bandUsd ?? 1)).toFixed(4)})`,
        `At ${whole(give.weightBp ?? 0)} bp against ${whole(get.weightBp ?? 0)} bp it buys **${s9.quote.get.length}** seats, heads **${signed(s9.quote.headsDelta)}**, leaving ${s9.quote.creditBp} bp of trade credit`,
        `The get seats' band estimate, ${money(s9.quote.getBandUsd)}, is over $250,000, so the chain is manager, HRBP and leader`,
        `gap before the trade is ${signed((target.targetHeads ?? 0) - s9.routing.asksHeads)} heads (target ${target.targetHeads}, asks ${s9.routing.asksHeads})`,
      ]
      for (const f of facts) expect(text, f).toContain(f)
      expect(flat(README)).toContain(
        `The standard head is **${money(s9.quote.rates.standardHeadUsd).replace('.00', '')}**`,
      )
    })
  })

  it('keeps the copy rules: no "!", no em dash but the "—" placeholder, never "tamper-proof"', () => {
    for (const [name, text] of [
      ['README.md', README],
      ['ARCHITECTURE.md', ARCH],
    ] as const) {
      for (const w of BANNED_HASH_WORDS) expect(text.toLowerCase(), `${name}: ${w}`).not.toContain(w)
      expect(text.replace(/"—"/g, '').includes('—'), name).toBe(false)
    }
    expect(README.includes('!')).toBe(false)
  })
})

describe('ARCHITECTURE.md', () => {
  const dirs = (p: string) =>
    readdirSync(join(ROOT, p)).filter((n) => statSync(join(ROOT, p, n)).isDirectory() && !n.startsWith('__'))
  /** The folder map: the code block under "## Folder ownership". */
  const map = section(ARCH, '## Folder ownership (PLAN 4)')
  const block = map.slice(map.indexOf('```'), map.indexOf('```', map.indexOf('```') + 3))
  /** The words of the map line that starts with `label` (and its continuation lines). */
  const entry = (label: string) => {
    const lines = block.split('\n')
    const at = lines.findIndex((l) => l.trimStart().startsWith(label))
    expect(at, label).toBeGreaterThanOrEqual(0)
    const out = [lines[at]]
    for (const l of lines.slice(at + 1)) {
      if (/^\s{0,2}\S/.test(l)) break
      out.push(l)
    }
    return out.join(' ')
  }

  it('names every folder under src, and every folder it names exists', () => {
    const named = [...block.matchAll(/^ {2}([a-z]+)\/(?: |$)/gm)].map((m) => m[1])
    const drawn = [...block.matchAll(/(?:^ {2}| )([a-z]+)\/(?= )/gm)].map((m) => m[1])
    const top = dirs('src').sort()
    expect(top.length).toBeGreaterThan(10)
    for (const d of top) expect(drawn, d).toContain(d)
    for (const d of named) expect(top, d).toContain(d)
    for (const sub of ['data/sample', 'app/write']) expect(block, sub).toContain(`  ${sub}/`)
    const plan = flat(entry('plan/'))
    for (const d of dirs('src/plan')) expect(plan, `plan/${d}`).toContain(`${d}/`)
    const views = flat(entry('views/'))
    for (const d of dirs('src/views')) expect(views, `views/${d}`).toContain(`${d}/`)
  })

  it('names every script and every ship test', () => {
    const scripts = flat(entry('scripts/'))
    const have = new Set(
      readdirSync(join(ROOT, 'scripts'))
        .filter((n) => n.endsWith('.mjs'))
        .map((n) => n.replace(/\.mjs$/, '')),
    )
    expect(have.size).toBeGreaterThan(5)
    for (const s of have) expect(scripts, s).toMatch(new RegExp(`(^|[ ,])${s}(,|$| )`))
    const ship = flat(entry('ship/'))
    for (const t of readdirSync(join(ROOT, 'src/ship')).filter((n) => n.endsWith('.test.ts')))
      expect(ship, t).toContain(t.replace(/\.test\.ts$/, ''))
  })

  it('lists every storage key the app keeps, the M4 review’s hcp:plan-aside: included (B9)', () => {
    const storage = flat(section(ARCH, '## Names, storage and the write lock'))
    expect(STORAGE_KEYS.some((d) => d.key === 'hcp:plan-aside:')).toBe(true)
    for (const d of STORAGE_KEYS)
      expect(storage, d.key).toMatch(new RegExp(`\`${d.key}${d.prefix ? '<' : '`'}`))
    expect(storage).toContain('`hcp:plan-aside:<baseline id>`')
    expect(storage).toContain('`sampleBaselineId`')
  })

  it('gives the workspace file header as src/plan/types.ts declares it (CP-2 `modeLine`)', () => {
    const types = read('src/plan/types.ts')
    const start = types.indexOf('export interface WorkspaceFile {')
    expect(start).toBeGreaterThan(0)
    const block = types.slice(start, types.indexOf('\n}', start))
    const fields = [...block.matchAll(/^ {2}(\w+)(\??):/gm)].map((m) => `${m[1]}${m[2]}`)
    expect(fields).toEqual(
      expect.arrayContaining(['format', 'kind', 'notice?', 'modeLine?', 'checksum', 'body']),
    )
    const files = flat(section(ARCH, '## Workspace files (PLAN 5.5, C35, R70 to R78)'))
    const header = /`\{ format: 'hcplan', ([^}]+) \}`/.exec(files)?.[1] ?? ''
    const named = header.split(', ').map((f) => f.replace(/: .*$/, ''))
    expect(named).toEqual(fields.filter((f) => f !== 'format'))
  })

  /**
   * The M4 review's fixes as ARCHITECTURE.md names them, each with the file that defines it, so the
   * contract names the code that holds each rule.
   */
  const M4_REVIEW_NAMES: readonly [string, string][] = [
    ['adjustmentLines', 'src/plan/lineSource.ts'],
    ['withAdjustments', 'src/plan/engine/forecast.ts'],
    ['activeDaily', 'src/plan/types.ts'],
    ['mixOf', 'src/plan/engine/bridge.ts'],
    ['foldedOf', 'src/views/forecast/engine/bridge.ts'],
    ['NOT_IN_PLAN', 'src/views/plan/engine/overview.ts'],
    ['forecastAccuracyOf', 'src/views/finance/engine/accuracy.ts'],
    ['accuracyOf', 'src/plan/engine/accuracy.ts'],
    ['ACCURACY_COMPANY_NOTE', 'src/views/finance/engine/accuracy.ts'],
    ['componentTotalLines', 'src/views/finance/engine/longCsv.ts'],
    ['accountsOf', 'src/views/finance/engine/longCsv.ts'],
    ['ControlTotal', 'src/lib/export/controlTotals.ts'],
    ['hrAdminExportLine', 'src/lib/export/modeMeta.ts'],
    ['madeWithPay', 'src/lib/export/exportHeader.ts'],
    ['shareableBaseOf', 'src/views/data/engine/workspace.ts'],
    ['SHAREABLE_PAY_OFF_TEXT', 'src/views/data/engine/workspace.ts'],
    ['fileModeLine', 'src/views/data/engine/workspace.ts'],
    ['earlierSampleFile', 'src/views/data/engine/workspace.ts'],
    ['managerModeLine', 'src/plan/workspace/file.ts'],
    ['sampleBaselineId', 'src/data/sample/generate.ts'],
    ['setAsideOf', 'src/app/planState.ts'],
    ['keepAside', 'src/app/planState.ts'],
    ['clearAside', 'src/app/planState.ts'],
    ['SAMPLE_CHANGED_NOTICE', 'src/app/planState.ts'],
  ]

  it('names the code behind each M4 review fix, as the source spells it', () => {
    for (const [name, file] of M4_REVIEW_NAMES) {
      expect(ARCH, name).toMatch(new RegExp(`\`[^\`]*\\b${name}\\b[^\`]*\``))
      expect(read(file), `${name} in ${file}`).toMatch(
        new RegExp(`(function|const|interface|type) ${name}\\b|^\\s+${name}\\??:`, 'm'),
      )
    }
  })

  it('names no code identifier that the source does not have', () => {
    /** Each file under `dir`: its path, and its text when it is code. */
    const source = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(join(ROOT, dir))) {
        const p = `${dir}/${name}`
        if (statSync(join(ROOT, p)).isDirectory()) {
          if (name !== '__snapshots__') source(p, out)
        } else {
          out.push(p)
          if (/\.(ts|tsx|mjs|css)$/.test(name)) out.push(read(p))
        }
      }
      return out
    }
    const all = [...source('src'), ...source('scripts'), read('vite.config.ts')].join('\n')
    // Names the text gives that are not code of this app: a tsconfig option it does not use.
    const notCode = new Set(['baseUrl'])
    // Fenced blocks, then double-backtick spans (`` `hcp:dataset:${key}` ``), then single ones.
    const fences = [...ARCH.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1])
    const prose = flat(ARCH.replace(/```[\s\S]*?```/g, ' '))
    const doubles = [...prose.matchAll(/``(.+?)``/g)].map((m) => m[1])
    const spans = [...prose.replace(/``.+?``/g, ' ').matchAll(/`([^`]+)`/g)].map((m) => m[1])
    const ids = new Set<string>()
    for (const code of [...fences, ...doubles, ...spans])
      for (const [id] of code.matchAll(
        /\b(?:[a-z]+[A-Z]\w*|[A-Z][a-z]+[A-Z]\w*|[A-Z][A-Z0-9]*_[A-Z0-9_]+)\b/g,
      ))
        if (!notCode.has(id)) ids.add(id)
    // The scan finds names (it is not vacuous), those of the M4 review among them.
    expect(ids.size).toBeGreaterThan(80)
    for (const [name] of M4_REVIEW_NAMES) expect(ids, name).toContain(name)
    const missing = [...ids].filter((id) => !new RegExp(`\\b${id}\\b`).test(all))
    expect(missing).toEqual([])
  })

  it('gives the one Vite command and the ports, and never tells anyone to run npx vite', () => {
    expect(ARCH).toContain(
      'node --max-semi-space-size=64 node_modules/vite/bin/vite.js --port <8830 or above> --strictPort',
    )
    expect(ARCH).toContain('**Never `npx vite`.**')
    // `npx vitest` is fine; `npx vite` only where the text says never to use it.
    const told = ARCH.split('\n').filter((l) => /\bnpx vite(?!st)/.test(l))
    expect(told.length).toBeGreaterThan(0)
    for (const line of told) expect(line, line).toMatch(/[Nn]ever|[Dd]o not|telling builders/)
    for (const port of ['8820, 8821', '8822', '8823', '8830 and up']) expect(ARCH).toContain(`| ${port} |`)
    expect(flat(ARCH)).toContain(
      `at most ${whole(ONE_FILE_BUDGET)} bytes (\`ONE_FILE_BUDGET\` in \`scripts/oneFile.mjs\`)`,
    )
  })
})
