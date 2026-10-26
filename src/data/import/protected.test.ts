/**
 * Columns the importer never reads (docs/PLAN.md 5.2 and 16.2): protected characteristics, stand-ins
 * for them, free-text comments and notes (which can carry anything, an amount included), and
 * column names a JavaScript object reserves. They are dropped when the sheet is read.
 */
import { describe, expect, it } from 'vitest'
import { droppedColumns, droppedText, dropReason } from './protected'
import { sheetFromRows } from './sheet'

describe('columns the app never imports', () => {
  it.each([
    'Gender',
    'Sex',
    'Ethnicity',
    'Race/Ethnicity',
    'Nationality',
    'Primary Nationality',
    'Citizenship',
    'Country of Citizenship',
    'Citizen?',
    'Date of Birth',
    'DOB',
    'Birth Date',
    'Age',
    'Age band',
    'Religion',
    'Disability status',
    'Medical leave reason',
    'Health plan',
    'Veteran Status',
    'Sexual orientation',
    'Marital Status',
    'National origin',
  ])('drops %s as a protected characteristic', (h) => {
    expect(dropReason(h)).toBe('protected')
  })

  it.each([
    'Graduation year',
    'Grad Year',
    'Class of',
    'Class year',
    'Year graduated',
    'Degree year',
    'Year of degree',
    'Graduation date',
  ])('drops %s as a stand-in for age', (h) => {
    expect(dropReason(h)).toBe('proxy')
  })

  it('says why a graduation year is left out', () => {
    expect(droppedText(droppedColumns(['University', 'Grad Year']))).toBe(
      'Grad Year was left out. Graduation year can reveal age, so Headcount Planner does not read it.',
    )
  })

  it.each([
    'Comments',
    'Manager comment',
    'Verbatim',
    'Open text',
    'Free text response',
    'Justification',
    'Business justification',
    'Notes',
    'Approver note',
  ])('drops %s as free text', (h) => {
    expect(dropReason(h)).toBe('comment')
  })

  it.each(['__proto__', 'constructor', 'prototype', ' Constructor ', 'PROTOTYPE'])(
    'drops %s as a name an object reserves',
    (h) => {
      expect(dropReason(h)).toBe('reserved')
    },
  )

  it.each([
    'Employee ID',
    'Req age (days)',
    'Stage',
    'Agency fee',
    'Orientation date',
    'Leave paid',
    'On leave',
    'Country',
    'Essex office',
    'Reason',
    'Freeze reason',
    'Proto',
    'Constructor name',
    'Driver',
    'Score',
  ])('keeps %s', (h) => {
    expect(dropReason(h)).toBeNull()
  })

  it('leaves the columns out of the sheet itself and says why', () => {
    const sheet = sheetFromRows('Workers', [
      ['Employee ID', 'Citizenship', 'Worker type', 'Comments', '__proto__'],
      ['E1', 'Somewhere', 'Employee', 'raise to €140,000 next year', 'x'],
    ])!
    expect(sheet.headers).toEqual(['Employee ID', 'Worker type'])
    expect(sheet.rows).toEqual([{ 'Employee ID': 'E1', 'Worker type': 'Employee' }])
    expect(JSON.stringify(sheet)).not.toContain('140,000')
    expect(sheet.dropped).toEqual([
      { header: 'Citizenship', reason: 'protected' },
      { header: 'Comments', reason: 'comment' },
      { header: '__proto__', reason: 'reserved' },
    ])
    expect(droppedText(sheet.dropped ?? [])).toBe(
      'Citizenship was left out: Headcount Planner never imports protected characteristics. Comments was left out: free-text comments are never imported. __proto__ was left out: that column name is reserved.',
    )
    expect(droppedText(droppedColumns(['Gender', 'Age']))).toBe(
      'Gender and Age were left out: Headcount Planner never imports protected characteristics.',
    )
    expect(droppedText(droppedColumns(['constructor', 'prototype']))).toBe(
      'constructor and prototype were left out: those column names are reserved.',
    )
    expect(droppedText([])).toBeNull()
    expect(
      sheetFromRows('Plain', [
        ['A', 'B'],
        [1, 2],
      ])?.dropped,
    ).toBeUndefined()
  })
})
