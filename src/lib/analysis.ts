/**
 * HOD analysis maths: pass/fail rates, grade distributions, semester GPA, classification, graduation list.
 * Pure functions - they work on the submitted results already loaded from the database and use the grading scale
 * and class-of-degree bands of the HOD's own university.
 */
import { ScaleRow, gradeFor, pointFor, sortScale } from './grading';
import { DegreeClass, classFor, round2 } from './degree';

export type Semester = 'FIRST' | 'SECOND' | 'SUMMER';
export const SEM_ORDER: Record<string, number> = { FIRST: 1, SECOND: 2, SUMMER: 3 };
export const termKey = (session: string, sem: string) => `${session}|${SEM_ORDER[sem] ?? 9}`;

export interface ResultRow {
  sheetId: string; code: string; title: string; credit: number;
  session: string; semester: string; level: string;
  key: string; // the student (record id, or matric number for older rows)
  matric: string; name: string;
  score: number | null; // CA + exam; null when either is missing (never counted)
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export const sessionsOf = (rows: ResultRow[]) => [...new Set(rows.map((r) => r.session))].sort().reverse();
export const inTerm = (rows: ResultRow[], session: string, semester: string) =>
  rows.filter((r) => r.session === session && r.semester === semester);
const graded = (rows: ResultRow[]) => rows.filter((r) => r.score !== null) as (ResultRow & { score: number })[];

// ---------------------------------------------------------------- pass / fail
export interface PassFail { total: number; pass: number; fail: number; passPct: number; failPct: number }

export function passFail(rows: ResultRow[], scale: ScaleRow[]): PassFail {
  const g = graded(rows);
  const pass = g.filter((r) => gradeFor(r.score, scale).status === 'PASS').length;
  return { total: g.length, pass, fail: g.length - pass, passPct: pct(pass, g.length), failPct: pct(g.length - pass, g.length) };
}

// ---------------------------------------------------------------- grade distribution
export interface GradeCount { grade: string; count: number; pct: number }

export function gradeCounts(rows: ResultRow[], scale: ScaleRow[]): GradeCount[] {
  const g = graded(rows);
  const letters = sortScale(scale).map((s) => s.grade);
  return letters.map((letter) => {
    const count = g.filter((r) => gradeFor(r.score, scale).grade === letter).length;
    return { grade: letter, count, pct: pct(count, g.length) };
  });
}

export interface CourseSummary {
  code: string; title: string; credit: number; students: number; pass: number; fail: number;
  passPct: number; failPct: number; average: number; counts: GradeCount[];
}

export function courseSummaries(rows: ResultRow[], scale: ScaleRow[]): CourseSummary[] {
  const byCode = new Map<string, ResultRow[]>();
  graded(rows).forEach((r) => byCode.set(r.code.toUpperCase(), [...(byCode.get(r.code.toUpperCase()) ?? []), r]));
  return [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, list]) => {
    const pf = passFail(list, scale);
    const avg = list.reduce((a, r) => a + (r.score as number), 0) / list.length;
    return {
      code, title: list[0].title, credit: list[0].credit, students: pf.total, pass: pf.pass, fail: pf.fail,
      passPct: pf.passPct, failPct: pf.failPct, average: Math.round(avg * 10) / 10, counts: gradeCounts(list, scale),
    };
  });
}

// ---------------------------------------------------------------- semester GPA and classification
export interface StudentTerm {
  key: string; matric: string; name: string; level: string;
  courses: { code: string; credit: number; score: number; grade: string; point: number }[];
  tch: number; tgp: number; gpa: number | null;
  failed: string[]; // courses with an F
}

/** GPA = TGP / TCH over the courses of the rows given (callers pass one session + semester). */
export function studentTerms(rows: ResultRow[], scale: ScaleRow[]): StudentTerm[] {
  const by = new Map<string, ResultRow[]>();
  graded(rows).forEach((r) => by.set(r.key, [...(by.get(r.key) ?? []), r]));
  return [...by.values()].map((list) => {
    const courses = list.map((r) => {
      const g = gradeFor(r.score as number, scale);
      return { code: r.code.toUpperCase(), credit: r.credit, score: r.score as number, grade: g.grade, point: pointFor(r.score as number, scale) ?? 0, status: g.status };
    });
    const tch = courses.reduce((a, c) => a + c.credit, 0);
    const tgp = courses.reduce((a, c) => a + c.credit * c.point, 0);
    const levels = new Map<string, number>();
    list.forEach((r) => levels.set(r.level, (levels.get(r.level) ?? 0) + 1));
    const level = [...levels.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0][0];
    return {
      key: list[0].key, matric: list[0].matric, name: list[0].name, level,
      courses: courses.map(({ status: _s, ...c }) => c), tch, tgp, gpa: tch > 0 ? round2(tgp / tch) : null,
      failed: courses.filter((c) => c.status === 'FAIL').map((c) => c.code),
    };
  }).sort((a, b) => (b.gpa ?? -1) - (a.gpa ?? -1) || a.name.localeCompare(b.name));
}

export interface Classified extends StudentTerm { cls: string; withdrawal: boolean; carryover: boolean }

/**
 * Carryover list: any F in the semester. Withdrawal list: GPA below the university's threshold.
 * A class (First Class, Second Class Upper, ...) is given only to students without an F and above the threshold.
 */
export function classify(list: StudentTerm[], classes: DegreeClass[], withdrawBelow: number): Classified[] {
  return list.map((s) => {
    const carryover = s.failed.length > 0;
    const withdrawal = s.gpa !== null && s.gpa < withdrawBelow;
    return { ...s, carryover, withdrawal, cls: !carryover && !withdrawal ? classFor(s.gpa, classes) : '' };
  });
}

// ---------------------------------------------------------------- cumulative results and graduation
export interface Cumulative {
  key: string; matric: string; name: string; tch: number; tgp: number; cgpa: number | null;
  carryovers: { code: string; session: string; level: string }[];
}

/** Cumulative record up to (and including) a session. Each course counts once: the latest attempt replaces earlier ones. */
export function cumulative(rows: ResultRow[], upToSession: string, scale: ScaleRow[]): Map<string, Cumulative> {
  const latest = new Map<string, ResultRow & { score: number }>();
  graded(rows).filter((r) => r.session <= upToSession).forEach((r) => {
    const k = `${r.key}|${r.code.toUpperCase()}`;
    const prev = latest.get(k);
    if (!prev || termKey(r.session, r.semester) > termKey(prev.session, prev.semester)) latest.set(k, r);
  });
  const out = new Map<string, Cumulative>();
  latest.forEach((r) => {
    const c = out.get(r.key) ?? { key: r.key, matric: r.matric, name: r.name, tch: 0, tgp: 0, cgpa: null, carryovers: [] };
    const g = gradeFor(r.score, scale);
    c.tch += r.credit;
    c.tgp += r.credit * (pointFor(r.score, scale) ?? 0);
    if (g.status === 'FAIL') c.carryovers.push({ code: r.code.toUpperCase(), session: r.session, level: r.level });
    out.set(r.key, c);
  });
  out.forEach((c) => {
    c.cgpa = c.tch > 0 ? round2(c.tgp / c.tch) : null;
    c.carryovers.sort((a, b) => a.session.localeCompare(b.session) || a.code.localeCompare(b.code));
  });
  return out;
}

export const defaultFinalLevel = (rows: ResultRow[], session: string) =>
  rows.filter((r) => r.session === session).map((r) => r.level).sort().reverse()[0] ?? '';

export interface Graduate extends Cumulative { cls: string }
export interface GraduationList { eligible: Graduate[]; withCarryover: Graduate[]; excluded: number }

/**
 * Final-year students of a session. Anyone with an F in a final-year course is left out.
 * The rest are listed best CGPA first; those with an unresolved F from earlier years are shown with those courses.
 */
export function graduationList(rows: ResultRow[], session: string, finalLevel: string, scale: ScaleRow[], classes: DegreeClass[]): GraduationList {
  const finals = graded(rows).filter((r) => r.session === session && r.level === finalLevel);
  const keys = [...new Set(finals.map((r) => r.key))];
  const failedKeys = new Set(finals.filter((r) => gradeFor(r.score, scale).status === 'FAIL').map((r) => r.key));
  const cum = cumulative(rows, session, scale);
  const list: Graduate[] = keys.filter((k) => !failedKeys.has(k)).map((k) => {
    const c = cum.get(k) as Cumulative;
    return { ...c, cls: classFor(c.cgpa, classes) };
  }).sort((a, b) => (b.cgpa ?? -1) - (a.cgpa ?? -1) || a.name.localeCompare(b.name));
  return {
    eligible: list.filter((g) => g.carryovers.length === 0),
    withCarryover: list.filter((g) => g.carryovers.length > 0),
    excluded: failedKeys.size,
  };
}
