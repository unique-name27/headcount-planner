/**
 * Settings (docs/PLAN.md 5.4 and 16.2): sanitized field by field, saved at `hcp:settings` without
 * "Show pay amounts", and the settings file round trip that refuses foreign or newer files.
 */
import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '@/testkit/memoryStorage'
import {
  DEFAULT_SETTINGS,
  isReportingDate,
  loadSettings,
  parseSettingsFile,
  SECTION_LABEL,
  SETTINGS_FILE_KIND,
  SETTINGS_KEY,
  SETTINGS_SECTIONS,
  sanitizeSettings,
  saveSettings,
  settingsBlob,
  settingsFile,
  settingsFileName,
} from './settings'

const file = (settings: unknown, extra: Record<string, unknown> = {}) => ({
  kind: SETTINGS_FILE_KIND,
  version: 1,
  settings,
  ...extra,
})

describe('settings', () => {
  it('default to the system theme, standard text, everything shown and no as-of override', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      theme: 'system',
      textSize: 'md',
      motion: 'system',
      dataStandard: 'bronze',
      asOfOverride: null,
    })
    expect(SETTINGS_KEY).toBe('hcp:settings')
  })

  it('sanitize every field, falling back to defaults, and keep nothing else', () => {
    const s = sanitizeSettings({
      theme: 'neon',
      textSize: 'lg',
      motion: 'reduce',
      dataStandard: 'gold',
      asOfOverride: '2026-02-30',
      showPay: true,
      tools: { x: 'https://example.com' },
    })
    expect(s).toEqual({
      theme: 'system',
      textSize: 'lg',
      motion: 'reduce',
      dataStandard: 'gold',
      asOfOverride: null,
    })
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
  })

  it('accept as-of dates from 1 Jan 1990 to today only', () => {
    const today = '2026-10-13'
    expect(isReportingDate('2026-09-30', today)).toBe(true)
    expect(isReportingDate('2026-10-13', today)).toBe(true)
    for (const d of ['2026-10-14', '1989-12-31', '2026-02-30', '20260930', 7])
      expect(isReportingDate(d, today), String(d)).toBe(false)
    expect(sanitizeSettings({ asOfOverride: '2026-09-30' }, today).asOfOverride).toBe('2026-09-30')
  })

  it('save and load through storage, never writing the pay switch, and survive blocked storage', () => {
    const st = new MemoryStorage()
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS)
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', showPay: true } as typeof DEFAULT_SETTINGS, st)
    const saved = JSON.parse(st.getItem(SETTINGS_KEY)!)
    expect(saved).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' })
    expect(saved).not.toHaveProperty('showPay')
    expect(loadSettings(st).theme).toBe('dark')
    st.setItem(SETTINGS_KEY, '{not json')
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS)
    st.failure = new Error('blocked')
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS)
    expect(() => saveSettings(DEFAULT_SETTINGS, st)).not.toThrow()
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('list the Settings sheet’s sections in sentence case', () => {
    expect(SETTINGS_SECTIONS.map((s) => SECTION_LABEL[s])).toEqual([
      'Mode',
      'Display',
      'Data',
      'Formulas',
      'Official lists',
      'Privacy',
      'This device',
    ])
  })
})

describe('the settings file', () => {
  it('exports to a file and imports it back', async () => {
    const mine = { ...DEFAULT_SETTINGS, theme: 'dark' as const, dataStandard: 'silver' as const }
    const text = await settingsBlob(mine, new Date('2026-10-03T00:00:00Z')).text()
    const parsed = JSON.parse(text)
    expect(parsed).toEqual({
      kind: 'hcp-settings',
      version: 1,
      exportedAt: '2026-10-03T00:00:00.000Z',
      settings: mine,
    })
    const r = parseSettingsFile(text, DEFAULT_SETTINGS)
    expect(r.ok && r.settings).toEqual(mine)
    expect(r.ok && r.applied).toEqual(['theme', 'textSize', 'motion', 'dataStandard', 'asOfOverride'])
  })

  it('imports field by field, keeping current values for anything invalid or missing', () => {
    const mine = { ...DEFAULT_SETTINGS, theme: 'dark' as const, asOfOverride: '2026-06-30' }
    const today = '2026-10-03'
    expect(parseSettingsFile(file({ theme: 'neon', textSize: 'xl' }), mine, today)).toEqual({
      ok: true,
      settings: { ...mine, textSize: 'xl' },
      applied: ['textSize'],
    })
    // As-of dates outside 1 Jan 1990 to today are refused, as in the Settings sheet; null clears it.
    for (const d of ['2099-12-31', '1989-12-31', '2026-10-04'])
      expect(parseSettingsFile(file({ asOfOverride: d }), mine, today).ok).toBe(false)
    const cleared = parseSettingsFile(file({ asOfOverride: null }), mine, today)
    expect(cleared.ok && cleared.settings.asOfOverride).toBeNull()
    // A key inherited from the prototype is not a setting in the file.
    const proto = parseSettingsFile(
      JSON.parse('{"kind":"hcp-settings","version":1,"settings":{"__proto__":{"theme":"light"}}}'),
      mine,
      today,
    )
    expect(proto.ok).toBe(false)
  })

  it('carries the other sections and hands them back to their owners', () => {
    const metrics = { overrides: { 'plan.heads.approved': { text: {}, params: {} } }, log: [] }
    const lists = { version: 1, lists: {} }
    const views = { version: 1, views: [], startupId: null }
    const f = settingsFile(DEFAULT_SETTINGS, new Date('2026-10-03T00:00:00Z'), { metrics, lists, views })
    expect(f).toMatchObject({ metrics, lists, views })
    const r = parseSettingsFile(JSON.stringify(f), DEFAULT_SETTINGS)
    expect(r.ok && r.metricsSection).toEqual(metrics)
    expect(r.ok && r.listsSection).toEqual(lists)
    expect(r.ok && r.viewsSection).toEqual(views)
    // A file with only a section in it is still a settings file.
    const only = parseSettingsFile(file({}, { views }), DEFAULT_SETTINGS)
    expect(only.ok && only.applied).toEqual([])
    expect(only.ok && only.viewsSection).toEqual(views)
  })

  it('refuses files that are not Headcount Planner settings, or are newer', () => {
    expect(parseSettingsFile('{oops', DEFAULT_SETTINGS)).toEqual({
      ok: false,
      error: 'The file is not valid JSON.',
    })
    for (const bad of [{ settings: {} }, [], { kind: 'other-settings', version: 1, settings: {} }, null])
      expect(parseSettingsFile(bad, DEFAULT_SETTINGS)).toEqual({
        ok: false,
        error: 'The file is not a Headcount Planner settings file.',
      })
    expect(parseSettingsFile({ kind: 'hcp-settings', version: 9, settings: {} }, DEFAULT_SETTINGS)).toEqual({
      ok: false,
      error: 'The file comes from a newer version of Headcount Planner.',
    })
    expect(parseSettingsFile(file({ theme: 'neon' }), DEFAULT_SETTINGS)).toEqual({
      ok: false,
      error: 'The file holds no settings Headcount Planner can use.',
    })
  })

  it('is named like every other export', () => {
    expect(settingsFileName('2026-10-04')).toBe('headcount-planner-settings-2026-10-04.json')
  })
})
