/**
 * The sample's personas (docs/PLAN.md 13.3): one per mode, the two other leaders the atom rules need
 * (the CFO with company scope, a Design Verification director) and the two leak-test managers. Built
 * from the generated organization after IDs are assigned. Pure: draws no random numbers.
 */
import type { Mode } from '../schema'
import { AS_OF } from './calendar'
import { holderOn, type Seat, type World } from './org'

export type PersonaKey =
  | 'hr-admin'
  | 'hrbp-se'
  | 'leader-svp-se'
  | 'leader-cfo'
  | 'leader-dv-director'
  | 'finance-fpa'
  | 'manager-a'
  | 'manager-b'
  | 'manager-c'

export interface Persona {
  key: PersonaKey
  mode: Mode
  /** What the persona is, in the Acting as menu's words. */
  label: string
  employeeId: string
  name: string
  positionId: string
  title: string
  businessUnit: string
  department: string
  /** The mode's default Acting as pick. */
  isDefault: boolean
  /** Why the sample has this persona. */
  why: string
}

function persona(
  w: World,
  key: PersonaKey,
  mode: Mode,
  label: string,
  seat: Seat,
  isDefault: boolean,
  why: string,
): Persona {
  const h = holderOn(w, seat.idx, AS_OF)
  if (h == null) throw new Error(`Persona ${key} has no holder.`)
  const p = w.people[h]
  return {
    key,
    mode,
    label,
    employeeId: p.id,
    name: p.name,
    positionId: seat.id,
    title: seat.title,
    businessUnit: seat.bu,
    department: seat.dept,
    isDefault,
    why,
  }
}

export function samplePersonas(w: World): Persona[] {
  const tagged = (tag: string) => w.seats.find((s) => s.tags.has(tag))!
  const seatOf = (person: number) => w.seats[w.people[person].seat!]
  const dvDirector = w.seats
    .filter((s) => s.role === 'director' && s.dept === 'Design Verification')
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0]
  return [
    persona(
      w,
      'hr-admin',
      'hr-admin',
      'HR admin',
      seatOf(w.named.get('hris-lead')!),
      true,
      'The HRIS lead in Corporate > People; the default mode.',
    ),
    persona(
      w,
      'hrbp-se',
      'hrbp',
      'Silicon Engineering HRBP',
      seatOf(w.hrbp.get('Silicon Engineering')!),
      true,
      'The unit HRBP of stories 2 and 6.',
    ),
    persona(
      w,
      'leader-svp-se',
      'leader',
      'SVP Silicon Engineering',
      w.seats[w.execs.get('svp-se')!],
      true,
      'The default leader; the sub-orgs are VPs and directors.',
    ),
    persona(
      w,
      'leader-cfo',
      'leader',
      'CFO',
      w.seats[w.execs.get('cfo')!],
      false,
      'A leader with company scope, for the atom rules.',
    ),
    persona(
      w,
      'leader-dv-director',
      'leader',
      'Design Verification director',
      dvDirector,
      false,
      'Cost for the whole tree and heads by sub-org, for the atom rules.',
    ),
    persona(
      w,
      'finance-fpa',
      'finance',
      'FP&A lead',
      tagged('fpa-lead'),
      true,
      'Finance; reports to the CFO.',
    ),
    persona(
      w,
      'manager-a',
      'manager',
      'Manager A',
      tagged('manager-a'),
      true,
      'A Sales manager in Munich with 7 reports, an Open seat, the planted Munich P4 and a pending New role.',
    ),
    persona(
      w,
      'manager-b',
      'manager',
      'Manager B',
      tagged('manager-b'),
      false,
      'A Quality & Reliability manager with 3 Filled and 2 Open seats, for the leak tests.',
    ),
    persona(
      w,
      'manager-c',
      'manager',
      'Manager C',
      tagged('manager-c'),
      false,
      'A Supply Chain manager whose own seat is in a confidential Elimination, for the leak tests.',
    ),
  ]
}
