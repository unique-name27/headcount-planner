/**
 * Open a shared file in Manager mode reads a file's figures through `managerText` (M4 recheck EX-3-b;
 * 8.4 rule 5, PV-6: "a file is never a way round"): a Manager-mode file whose figures hold a raw
 * position title with an amount, as a build before the EX-3 fix wrote it or as an edit leaves it
 * (checksum recomputed), shows "an amount" in Manager mode, as request titles already do. HR admin
 * opening a file of its own with the same title reads it as written (control).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { workspaceChecksum } from '@/plan/workspace/file'
import { MemoryStorage } from '@/testkit/memoryStorage'
import {
  leakSample,
  MANAGER_POSITION_TEXTS,
  MANAGER_TEXTS,
  type ManagerTextFixture,
  managerTextFixture,
  PINNED_AT,
  personaCtx,
  personaOf,
  sampleCtx,
} from '@/testkit/sample'
import { type FileResult, forManagerFile, openSharedFile, shareableFile } from './workspace'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let fx: ManagerTextFixture

beforeAll(() => {
  fx = managerTextFixture(leakSample())
}, 120_000)

/** A file's text with every `from` in its body put back to `to`, its checksum recomputed. */
function edited(out: FileResult, from: string, to: string): string {
  if (!out.ok) throw new Error(out.refused)
  expect(out.out.text).toContain(from)
  const file = JSON.parse(out.out.text)
  const body = JSON.parse(JSON.stringify(file.body).split(from).join(to))
  return JSON.stringify({ ...file, body, checksum: workspaceChecksum(body) }, null, 2)
}

const managerA = () => personaCtx('manager-a', { sample: fx.sample, audit: fx.audit })

describe('a shared file’s figures in Manager mode (M4 recheck EX-3-b)', () => {
  it('reads a raw position title in an opened file’s figures as "an amount"', () => {
    const a = personaOf(fx.sample, 'manager-a')
    const files = {
      'own Shareable': shareableFile(managerA(), PINNED_AT),
      'Export for a manager from HR admin': forManagerFile(
        sampleCtx('hr-admin', { sample: fx.sample, audit: fx.audit }),
        a.employeeId,
        PINNED_AT,
      ),
    }
    for (const [name, out] of Object.entries(files)) {
      const text = edited(out, MANAGER_POSITION_TEXTS.positionTitle, MANAGER_TEXTS.positionTitle)
      const opened = openSharedFile(managerA(), text, text.length)
      if (!opened.ok) throw new Error(`${name}: ${opened.reason}`)
      // Non-vacuous: the figures show, and the planted seat's title is among them.
      expect(opened.view.figuresShown, name).toBe(true)
      const shown = JSON.stringify(opened.view.figures)
      expect(shown, name).toContain(MANAGER_POSITION_TEXTS.positionTitle)
      const all = JSON.stringify(opened.view)
      expect(all, name).not.toContain(MANAGER_TEXTS.positionTitle)
      for (const needle of ['140,000', '€']) expect(all.includes(needle), `${name}: ${needle}`).toBe(false)
    }
  })

  it('control: HR admin reads its own file’s title as written', () => {
    const hr = sampleCtx('hr-admin', { sample: fx.sample, audit: fx.audit })
    const out = shareableFile(hr, PINNED_AT)
    if (!out.ok) throw new Error(out.refused)
    expect(out.out.text).toContain(MANAGER_TEXTS.positionTitle)
    const opened = openSharedFile(hr, out.out.text, out.out.text.length)
    if (!opened.ok) throw new Error(opened.reason)
    expect(JSON.stringify(opened.view.figures)).toContain(MANAGER_TEXTS.positionTitle)
  })
})
