/**
 * Northgate Semiconductor's structure as data (docs/PLAN.md 13.1): six business units, 22 departments
 * with their site mix, level mix and career tracks, the executive layer, and cost centers
 * (`<department code>-<site code>`, such as 1130-BLR).
 *
 * `size` is the number of Filled seats at 30 Sep 2026, executives seated in the department included,
 * so the units hold Silicon Engineering 556, Systems & Software 337, Operations 170, Go-to-Market 184,
 * Corporate 196 and Executive Office 7 (1,450). `pins` fix the seats at a site exactly where a story
 * needs it: every Munich and Haifa cost center keeps 6 or more people (story 5) and Facilities in
 * Hsinchu (1550-HSZ) holds exactly 3 (story 8). `remote` seats one San Jose Architecture engineer in
 * Austin, so every Silicon Engineering cost center has 5 or more costed people in every month of
 * every FY27 grid: Finance's fold (docs/PLAN.md 7.4) then has no Other in the unit, and no MUC or HFA
 * cost center can join one (story 5).
 */
import type { Level } from '../schema'

export type IcLevel = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6'
export const IC_LEVELS: readonly IcLevel[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']

export const SE = 'Silicon Engineering'
export const SS = 'Systems & Software'
export const OPS = 'Operations'
export const GTM = 'Go-to-Market'
export const CORP = 'Corporate'
export const EO = 'Executive Office'
export const UNITS: readonly string[] = [SE, SS, OPS, GTM, CORP, EO]

export type Ladder = 'eng' | 'biz' | 'tech'

export interface Track {
  role: string
  w: number
  /** The job family of the track; the department name when absent. */
  family?: string
  min?: IcLevel
  max?: IcLevel
  ladder?: Ladder
  /** Explicit titles for roles that don't follow a standard ladder. */
  titles?: Partial<Record<IcLevel, string>>
}

/** A team carved out first at a site: one manager and `size` individual contributors. */
export interface TeamPlant {
  site: string
  size: number
  tag: string
}

export interface DeptSpec {
  name: string
  bu: string
  /** Filled seats at 30 Sep 2026, including executives seated in the department. */
  size: number
  sites: readonly (readonly [string, number])[]
  /** Exact manager and individual-contributor seats at a site (directors and executives not counted). */
  pins?: Readonly<Record<string, number>>
  /** Relative weights of individual-contributor levels P1..P6. */
  mix: readonly number[]
  tracks: Track[]
  directors: number
  /** Senior individual contributors reporting straight to each director. */
  dirIcs: number
  /** Fixed manager count; otherwise derived from the site sizes. */
  managers?: number
  directorTitles?: string[]
  manager: string
  /** Executive slot the directors (or managers, when there are no directors) report to. */
  boss: string
  code: number
  /** Built by hand rather than by the generic team builder. */
  explicit?: boolean
  plants?: readonly TeamPlant[]
  /**
   * Individual contributors of the main site who sit at another site, by site, reporting to their
   * main-site manager. `seatRemotes` (positions.ts) moves them there once every module that picks
   * seats by site has drawn, so no random stream moves and their pay is drawn at the new site.
   */
  remote?: Readonly<Record<string, number>>
}

const ENG_MIX = [3, 13, 26, 28, 22, 8]
const OPS_MIX = [8, 18, 28, 26, 15, 5]
const GTM_MIX = [3, 15, 25, 30, 20, 7]
const CORP_MIX = [8, 18, 30, 26, 14, 4]

export const DEPTS: DeptSpec[] = [
  {
    name: 'Architecture',
    bu: SE,
    size: 46,
    code: 1110,
    boss: 'vp-arch',
    directors: 1,
    dirIcs: 2,
    sites: [
      ['San Jose', 55],
      ['Haifa', 25],
      ['Austin', 10],
      ['Munich', 10],
    ],
    pins: { Munich: 6, Haifa: 11 },
    // Austin's team is a manager and 3 engineers; one San Jose engineer sits with them, so 1110-AUS
    // holds 5 costed people all year and Silicon Engineering's Finance fold has no Other (story 5).
    remote: { Austin: 1 },
    mix: [0, 3, 12, 25, 35, 25],
    manager: 'Architecture Manager',
    tracks: [
      { role: 'SoC Architect', w: 3, min: 'P4' },
      { role: 'CPU Architect', w: 2, min: 'P4' },
      { role: 'Performance Modeling Engineer', w: 3, min: 'P2', max: 'P5' },
      { role: 'Power Architect', w: 1, min: 'P4' },
    ],
  },
  {
    name: 'Digital Design',
    bu: SE,
    size: 128,
    code: 1120,
    boss: 'vp-arch',
    directors: 3,
    dirIcs: 1,
    sites: [
      ['San Jose', 33],
      ['Austin', 17],
      ['Bengaluru', 27],
      ['Haifa', 13],
      ['Munich', 10],
    ],
    pins: { Munich: 12, Haifa: 16 },
    mix: ENG_MIX,
    manager: 'Digital Design Manager',
    tracks: [
      { role: 'ASIC Design Engineer', w: 4 },
      { role: 'RTL Design Engineer', w: 3 },
      { role: 'Digital IP Design Engineer', w: 2 },
      { role: 'Low Power Design Engineer', w: 1, min: 'P3' },
    ],
  },
  {
    name: 'Design Verification',
    bu: SE,
    size: 150,
    code: 1130,
    boss: 'vp-verif',
    directors: 4,
    dirIcs: 1,
    sites: [
      ['San Jose', 22],
      ['Bengaluru', 45],
      ['Austin', 8],
      ['Hsinchu', 8],
      ['Ho Chi Minh City', 10],
      ['Raleigh', 7],
    ],
    mix: ENG_MIX,
    manager: 'Design Verification Manager',
    tracks: [
      { role: 'Design Verification Engineer', w: 6 },
      { role: 'Formal Verification Engineer', w: 1, min: 'P3' },
      { role: 'Emulation Engineer', w: 2 },
    ],
  },
  {
    name: 'Physical Design',
    bu: SE,
    size: 112,
    code: 1140,
    boss: 'vp-pd',
    directors: 3,
    dirIcs: 1,
    sites: [
      ['Austin', 30],
      ['San Jose', 20],
      ['Bengaluru', 30],
      ['Hsinchu', 10],
      ['Shanghai', 10],
    ],
    mix: ENG_MIX,
    manager: 'Physical Design Manager',
    tracks: [
      { role: 'Physical Design Engineer', w: 5 },
      { role: 'Static Timing Analysis Engineer', w: 2 },
      { role: 'Physical Verification Engineer', w: 2 },
    ],
  },
  {
    name: 'Analog & Mixed-Signal',
    bu: SE,
    size: 70,
    code: 1150,
    boss: 'vp-pd',
    directors: 2,
    dirIcs: 1,
    sites: [
      ['San Jose', 37],
      ['Boulder', 37],
      ['Munich', 16],
      ['Hsinchu', 10],
    ],
    pins: { Munich: 11 },
    mix: [2, 10, 22, 30, 26, 10],
    manager: 'Analog Design Manager',
    tracks: [
      { role: 'Analog Design Engineer', w: 4 },
      { role: 'Mixed-Signal Design Engineer', w: 3 },
      { role: 'Analog Layout Engineer', w: 2, max: 'P5' },
      { role: 'SerDes Design Engineer', w: 2, min: 'P3' },
    ],
  },
  {
    name: 'DFT',
    bu: SE,
    size: 50,
    code: 1160,
    boss: 'vp-verif',
    directors: 1,
    dirIcs: 1,
    sites: [
      ['Bengaluru', 45],
      ['San Jose', 28],
      ['Austin', 15],
      ['Hsinchu', 12],
    ],
    mix: ENG_MIX,
    manager: 'DFT Manager',
    tracks: [
      { role: 'DFT Engineer', w: 5 },
      { role: 'Memory BIST Engineer', w: 1, min: 'P2' },
    ],
  },
  {
    name: 'Firmware',
    bu: SS,
    size: 90,
    code: 1210,
    boss: 'vp-sw',
    directors: 2,
    dirIcs: 1,
    sites: [
      ['Bengaluru', 33],
      ['San Jose', 22],
      ['Raleigh', 18],
      ['Toronto', 17],
      ['Haifa', 10],
    ],
    pins: { Haifa: 9 },
    mix: ENG_MIX,
    manager: 'Firmware Engineering Manager',
    tracks: [
      { role: 'Firmware Engineer', w: 5 },
      { role: 'Embedded Software Engineer', w: 3 },
      { role: 'Security Firmware Engineer', w: 1, min: 'P3' },
    ],
  },
  {
    name: 'Software',
    bu: SS,
    size: 122,
    code: 1220,
    boss: 'vp-sw',
    directors: 3,
    dirIcs: 1,
    sites: [
      ['San Jose', 23],
      ['Seattle', 24],
      ['Toronto', 12],
      ['Vancouver', 16],
      ['Bengaluru', 25],
    ],
    mix: ENG_MIX,
    manager: 'Software Engineering Manager',
    tracks: [
      { role: 'Software Engineer', w: 4 },
      { role: 'Driver Engineer', w: 2 },
      { role: 'Compiler Engineer', w: 2 },
      { role: 'SDK Engineer', w: 1 },
      { role: 'Software Tools Engineer', w: 1 },
    ],
  },
  {
    name: 'Systems Validation',
    bu: SS,
    size: 70,
    code: 1230,
    boss: 'vp-sys',
    directors: 2,
    dirIcs: 0,
    sites: [
      ['San Jose', 33],
      ['Hsinchu', 20],
      ['Shanghai', 20],
      ['Bengaluru', 17],
      ['Ho Chi Minh City', 10],
    ],
    mix: ENG_MIX,
    manager: 'Systems Validation Manager',
    tracks: [
      { role: 'Systems Validation Engineer', w: 4 },
      { role: 'Post-Silicon Validation Engineer', w: 3 },
      { role: 'Validation Automation Engineer', w: 1 },
    ],
  },
  {
    name: 'Hardware Engineering',
    bu: SS,
    size: 55,
    code: 1240,
    boss: 'vp-sys',
    directors: 2,
    dirIcs: 1,
    sites: [
      ['San Jose', 42],
      ['Boulder', 22],
      ['Raleigh', 22],
      ['Hsinchu', 14],
    ],
    mix: ENG_MIX,
    manager: 'Hardware Engineering Manager',
    tracks: [
      { role: 'Hardware Engineer', w: 3 },
      { role: 'Signal Integrity Engineer', w: 2 },
      { role: 'Board Design Engineer', w: 2 },
      { role: 'Package Design Engineer', w: 2 },
    ],
  },
  {
    name: 'Test & Product Engineering',
    bu: OPS,
    size: 92,
    code: 1310,
    boss: 'vp-test',
    directors: 2,
    dirIcs: 0,
    sites: [
      ['Hsinchu', 25],
      ['Shanghai', 25],
      ['San Jose', 22],
      ['Ho Chi Minh City', 16],
      ['Austin', 12],
    ],
    mix: OPS_MIX,
    manager: 'Product Engineering Manager',
    tracks: [
      { role: 'Product Engineer', w: 3 },
      { role: 'Test Engineer', w: 3 },
      { role: 'Yield Engineer', w: 2 },
      { role: 'Test Technician', w: 2, max: 'P3', ladder: 'tech' },
    ],
  },
  {
    name: 'Supply Chain',
    bu: OPS,
    size: 44,
    code: 1320,
    boss: 'vp-scm',
    directors: 1,
    dirIcs: 0,
    sites: [
      ['San Jose', 45],
      ['Hsinchu', 25],
      ['Shanghai', 30],
    ],
    mix: OPS_MIX,
    manager: 'Supply Chain Manager',
    tracks: [
      { role: 'Supply Chain Planner', w: 3, ladder: 'biz' },
      { role: 'Foundry Operations Engineer', w: 2 },
      { role: 'Procurement Specialist', w: 2, ladder: 'biz', family: 'Procurement' },
      { role: 'Logistics Specialist', w: 1, ladder: 'biz', max: 'P4' },
    ],
    // Manager C (docs/PLAN.md 13.3) and the manager below C.
    plants: [
      { site: 'San Jose', size: 3, tag: 'manager-c' },
      { site: 'San Jose', size: 3, tag: 'manager-c-sub' },
    ],
  },
  {
    name: 'Quality & Reliability',
    bu: OPS,
    size: 34,
    code: 1330,
    boss: 'vp-scm',
    directors: 1,
    dirIcs: 0,
    sites: [
      ['Hsinchu', 32],
      ['San Jose', 40],
      ['Shanghai', 28],
    ],
    mix: OPS_MIX,
    manager: 'Quality Engineering Manager',
    tracks: [
      { role: 'Reliability Engineer', w: 3 },
      { role: 'Quality Engineer', w: 3 },
      { role: 'Failure Analysis Engineer', w: 2 },
    ],
    // Manager B: 3 Filled seats now; the generator adds the 2 Open ones.
    plants: [{ site: 'San Jose', size: 3, tag: 'manager-b' }],
  },
  {
    name: 'Sales',
    bu: GTM,
    size: 86,
    code: 1410,
    boss: 'vp-sales',
    directors: 2,
    dirIcs: 0,
    directorTitles: ['Director, Sales, Americas', 'Director, Sales, Asia Pacific and Europe'],
    sites: [
      ['San Jose', 28],
      ['Shanghai', 20],
      ['Munich', 14],
      ['Hsinchu', 8],
      ['Austin', 10],
      ['Seattle', 6],
      ['Bengaluru', 12],
    ],
    pins: { Munich: 13 },
    mix: GTM_MIX,
    manager: 'Regional Sales Manager',
    tracks: [
      {
        role: 'Account Manager',
        w: 5,
        min: 'P2',
        titles: {
          P2: 'Sales Development Representative',
          P3: 'Account Manager',
          P4: 'Senior Account Manager',
          P5: 'Strategic Account Manager',
          P6: 'Global Account Director',
        },
      },
      { role: 'Sales Operations Analyst', w: 1, ladder: 'biz', family: 'Sales operations', max: 'P5' },
    ],
    // Manager A: 7 Filled reports in Munich.
    plants: [{ site: 'Munich', size: 7, tag: 'manager-a' }],
  },
  {
    name: 'Field Applications',
    bu: GTM,
    size: 64,
    code: 1420,
    boss: 'vp-fae',
    directors: 2,
    dirIcs: 0,
    directorTitles: [
      'Director, Field Applications, Americas and Europe',
      'Director, Field Applications, Asia Pacific',
    ],
    sites: [
      ['San Jose', 25],
      ['Shanghai', 20],
      ['Hsinchu', 15],
      ['Munich', 15],
      ['Bengaluru', 15],
      ['Haifa', 10],
    ],
    pins: { Munich: 10, Haifa: 7 },
    mix: GTM_MIX,
    manager: 'Field Applications Manager',
    tracks: [
      { role: 'Field Applications Engineer', w: 5 },
      { role: 'Customer Program Manager', w: 1, ladder: 'biz', family: 'Program management', min: 'P3' },
    ],
  },
  {
    name: 'Product Marketing',
    bu: GTM,
    size: 34,
    code: 1430,
    boss: 'vp-pmm',
    directors: 0,
    dirIcs: 0,
    sites: [
      ['San Jose', 80],
      ['Austin', 20],
    ],
    mix: GTM_MIX,
    manager: 'Product Marketing Lead',
    tracks: [
      {
        role: 'Product Marketing Manager',
        w: 3,
        min: 'P2',
        titles: {
          P2: 'Associate Product Marketing Manager',
          P3: 'Product Marketing Manager',
          P4: 'Senior Product Marketing Manager',
          P5: 'Lead Product Marketing Manager',
          P6: 'Principal Product Marketing Manager',
        },
      },
      { role: 'Technical Marketing Engineer', w: 2 },
      { role: 'Marketing Communications Specialist', w: 1, ladder: 'biz', max: 'P4' },
    ],
  },
  {
    name: 'Finance',
    bu: CORP,
    size: 50,
    code: 1510,
    boss: 'vp-fin',
    directors: 3,
    dirIcs: 1,
    // The FP&A director reports to the CFO (the FP&A lead persona, docs/PLAN.md 13.3).
    directorTitles: ['Director, Accounting', 'Director, Tax & Treasury', 'Director, FP&A'],
    sites: [
      ['San Jose', 70],
      ['Bengaluru', 20],
      ['Hsinchu', 10],
    ],
    mix: CORP_MIX,
    manager: 'Finance Manager',
    tracks: [
      { role: 'Accountant', w: 3, ladder: 'biz', family: 'Accounting' },
      { role: 'Financial Analyst', w: 3, ladder: 'biz', family: 'FP&A' },
      { role: 'Tax Analyst', w: 1, ladder: 'biz', family: 'Tax', min: 'P2' },
      { role: 'Treasury Analyst', w: 1, ladder: 'biz', family: 'Treasury', min: 'P2' },
    ],
  },
  {
    name: 'People',
    bu: CORP,
    size: 46,
    code: 1520,
    boss: 'cpo',
    directors: 3,
    dirIcs: 0,
    explicit: true,
    sites: [
      ['San Jose', 55],
      ['Bengaluru', 20],
      ['Austin', 15],
      ['Hsinchu', 10],
    ],
    mix: CORP_MIX,
    manager: 'People Operations Manager',
    tracks: [
      { role: 'HR Operations Specialist', w: 3, ladder: 'biz', family: 'People operations', max: 'P4' },
      {
        role: 'Technical Recruiter',
        w: 2,
        ladder: 'biz',
        family: 'Talent acquisition',
        min: 'P2',
        max: 'P5',
      },
    ],
  },
  {
    name: 'Legal',
    bu: CORP,
    size: 20,
    code: 1530,
    boss: 'gc',
    directors: 2,
    dirIcs: 2,
    managers: 3,
    directorTitles: ['Associate General Counsel, Commercial', 'Associate General Counsel, Corporate'],
    sites: [['San Jose', 100]],
    mix: [0, 15, 25, 30, 22, 8],
    manager: 'Legal Operations Manager',
    tracks: [
      {
        role: 'Corporate Counsel',
        w: 2,
        min: 'P4',
        titles: { P4: 'Corporate Counsel', P5: 'Senior Corporate Counsel', P6: 'Lead Counsel' },
      },
      { role: 'Paralegal', w: 2, ladder: 'tech', max: 'P4' },
      {
        role: 'Contracts Manager',
        w: 2,
        min: 'P3',
        max: 'P5',
        titles: { P3: 'Contracts Specialist', P4: 'Contracts Manager', P5: 'Senior Contracts Manager' },
      },
      {
        role: 'Trade Compliance Specialist',
        w: 1,
        ladder: 'biz',
        family: 'Trade compliance',
        min: 'P3',
        max: 'P5',
      },
    ],
  },
  {
    name: 'IT',
    bu: CORP,
    size: 50,
    code: 1540,
    boss: 'vp-it',
    directors: 2,
    dirIcs: 0,
    directorTitles: ['Director, IT Infrastructure', 'Director, Enterprise Applications'],
    sites: [
      ['San Jose', 40],
      ['Bengaluru', 40],
      ['Raleigh', 20],
    ],
    mix: CORP_MIX,
    manager: 'IT Manager',
    tracks: [
      { role: 'IT Support Specialist', w: 2, ladder: 'biz', max: 'P3' },
      { role: 'Systems Administrator', w: 2, ladder: 'biz', max: 'P5' },
      { role: 'Enterprise Applications Engineer', w: 2, family: 'Enterprise applications' },
      { role: 'Security Engineer', w: 2, family: 'Information security', min: 'P2' },
      { role: 'CAD Infrastructure Engineer', w: 2, family: 'EDA and CAD', min: 'P2' },
    ],
  },
  {
    name: 'Facilities',
    bu: CORP,
    size: 30,
    code: 1550,
    boss: 'cfo',
    directors: 1,
    dirIcs: 0,
    directorTitles: ['Director, Workplace and Facilities'],
    sites: [
      ['San Jose', 40],
      ['Bengaluru', 20],
      ['Austin', 20],
      ['Hsinchu', 20],
    ],
    // Story 8: 1550-HSZ holds exactly 3 costed people, reporting to a manager in San Jose.
    pins: { Hsinchu: 3 },
    mix: [15, 30, 30, 18, 6, 1],
    manager: 'Facilities Manager',
    tracks: [
      { role: 'Facilities Coordinator', w: 2, ladder: 'biz', max: 'P4' },
      { role: 'Lab Operations Technician', w: 2, ladder: 'tech', max: 'P3' },
      { role: 'EHS Specialist', w: 1, ladder: 'biz', min: 'P3', max: 'P5' },
      { role: 'Workplace Experience Specialist', w: 1, ladder: 'biz', max: 'P4' },
    ],
  },
  {
    name: 'Executive Office',
    bu: EO,
    size: 7,
    code: 1010,
    boss: 'ceo',
    directors: 1,
    dirIcs: 0,
    explicit: true,
    sites: [['San Jose', 100]],
    mix: [0, 0, 20, 40, 40, 0],
    manager: 'Chief of Staff',
    tracks: [{ role: 'Strategy Analyst', w: 1, ladder: 'biz', family: 'Corporate strategy' }],
  },
]

const DEPT_BY_NAME = new Map(DEPTS.map((d) => [d.name, d]))
export const deptSpec = (name: string): DeptSpec => DEPT_BY_NAME.get(name)!

/** The executive layer: CEO, C-suite and SVPs, and VPs. */
export interface ExecSlot {
  key: string
  title: string
  level: Level
  dept: string
  site: string
  boss: string | null
  hire: string
}
export const EXEC_SLOTS: ExecSlot[] = [
  {
    key: 'ceo',
    title: 'Chief Executive Officer',
    level: 'E3',
    dept: 'Executive Office',
    site: 'San Jose',
    boss: null,
    hire: '2014-03-03',
  },
  {
    key: 'svp-se',
    title: 'Senior Vice President, Silicon Engineering',
    level: 'E2',
    dept: 'Architecture',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2014-04-14',
  },
  {
    key: 'vp-arch',
    title: 'Vice President, Architecture and Digital Design',
    level: 'E1',
    dept: 'Architecture',
    site: 'San Jose',
    boss: 'svp-se',
    hire: '2015-08-03',
  },
  {
    key: 'vp-verif',
    title: 'Vice President, Verification and DFT',
    level: 'E1',
    dept: 'Design Verification',
    site: 'San Jose',
    boss: 'svp-se',
    hire: '2017-02-06',
  },
  {
    key: 'vp-pd',
    title: 'Vice President, Physical Design and Analog',
    level: 'E1',
    dept: 'Physical Design',
    site: 'Austin',
    boss: 'svp-se',
    hire: '2016-05-02',
  },
  {
    key: 'svp-ss',
    title: 'Senior Vice President, Systems and Software',
    level: 'E2',
    dept: 'Software',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2016-01-11',
  },
  {
    key: 'vp-sw',
    title: 'Vice President, Software and Firmware',
    level: 'E1',
    dept: 'Software',
    site: 'Seattle',
    boss: 'svp-ss',
    hire: '2018-09-10',
  },
  {
    key: 'vp-sys',
    title: 'Vice President, Systems Engineering',
    level: 'E1',
    dept: 'Systems Validation',
    site: 'San Jose',
    boss: 'svp-ss',
    hire: '2024-06-03',
  },
  {
    key: 'coo',
    title: 'Chief Operating Officer',
    level: 'E3',
    dept: 'Test & Product Engineering',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2015-10-05',
  },
  {
    key: 'vp-test',
    title: 'Vice President, Test and Product Engineering',
    level: 'E1',
    dept: 'Test & Product Engineering',
    site: 'Hsinchu',
    boss: 'coo',
    hire: '2017-06-05',
  },
  {
    key: 'vp-scm',
    title: 'Vice President, Supply Chain and Quality',
    level: 'E1',
    dept: 'Supply Chain',
    site: 'San Jose',
    boss: 'coo',
    hire: '2019-03-04',
  },
  {
    key: 'cro',
    title: 'Chief Revenue Officer',
    level: 'E3',
    dept: 'Sales',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2019-01-07',
  },
  {
    key: 'vp-sales',
    title: 'Vice President, Worldwide Sales',
    level: 'E1',
    dept: 'Sales',
    site: 'San Jose',
    boss: 'cro',
    hire: '2020-02-03',
  },
  {
    key: 'vp-fae',
    title: 'Vice President, Field Applications',
    level: 'E1',
    dept: 'Field Applications',
    site: 'San Jose',
    boss: 'cro',
    hire: '2018-04-02',
  },
  {
    key: 'vp-pmm',
    title: 'Vice President, Product Marketing',
    level: 'E1',
    dept: 'Product Marketing',
    site: 'San Jose',
    boss: 'cro',
    hire: '2021-07-12',
  },
  {
    key: 'cfo',
    title: 'Chief Financial Officer',
    level: 'E3',
    dept: 'Finance',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2017-01-09',
  },
  {
    key: 'vp-fin',
    title: 'Vice President, Finance and Corporate Controller',
    level: 'E1',
    dept: 'Finance',
    site: 'San Jose',
    boss: 'cfo',
    hire: '2018-02-05',
  },
  {
    key: 'vp-it',
    title: 'Vice President, Information Technology',
    level: 'E1',
    dept: 'IT',
    site: 'San Jose',
    boss: 'cfo',
    hire: '2019-08-05',
  },
  {
    key: 'cpo',
    title: 'Chief People Officer',
    level: 'E2',
    dept: 'People',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2020-03-02',
  },
  {
    key: 'gc',
    title: 'General Counsel',
    level: 'E2',
    dept: 'Legal',
    site: 'San Jose',
    boss: 'ceo',
    hire: '2018-06-04',
  },
]

export const SITE_CODE: Readonly<Record<string, string>> = {
  'San Jose': 'SJC',
  Austin: 'AUS',
  Raleigh: 'RDU',
  Boulder: 'BLD',
  Seattle: 'SEA',
  Toronto: 'YYZ',
  Vancouver: 'YVR',
  Munich: 'MUC',
  Haifa: 'HFA',
  Bengaluru: 'BLR',
  Hsinchu: 'HSZ',
  Shanghai: 'SHA',
  'Ho Chi Minh City': 'SGN',
}

/** `<department code>-<site code>`, such as 1130-BLR. */
export const costCenter = (dept: string, site: string): string => `${deptSpec(dept).code}-${SITE_CODE[site]}`

/** The department's first-listed site, where its directors and remote reports' managers sit. */
export const mainSite = (dept: string): string => deptSpec(dept).sites[0][0]

/** The units and sites whose heads match the Budget position by position (docs/PLAN.md 13.1). */
export const STORY_UNITS: ReadonlySet<string> = new Set([SE, GTM])
export const STORY_SITES: ReadonlySet<string> = new Set(['Munich', 'Haifa'])
export const isStoryOrg = (bu: string, site: string): boolean => STORY_UNITS.has(bu) || STORY_SITES.has(site)
