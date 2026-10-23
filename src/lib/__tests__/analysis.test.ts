import { describe, expect, it } from 'vitest';
import {
  ResultRow, classify, courseSummaries, cumulative, defaultFinalLevel, gradeCounts, graduationList, passFail, sessionsOf, studentTerms,
} from '../analysis';
import { ScaleRow } from '../grading';

const scale: ScaleRow[] = [[70, 'A', 5], [60, 'B', 4], [50, 'C', 3], [45, 'D', 2], [40, 'E', 1], [0, 'F', 0]].map(([m, g, p]) => ({
  min_score: m as number, grade: g as string, status: (m as number) > 0 ? 'PASS' : 'FAIL', point: p as number,
}));
const classes = [{ min_cgpa: 4.5, name: 'First Class' }, { min_cgpa: 3.5, name: 'Second Class Upper' }, { min_cgpa: 2.4, name: 'Second Class Lower' }, { min_cgpa: 1.5, name: 'Third Class' }, { min_cgpa: 1, name: 'Pass' }];

let n = 0;
const row = (key: string, code: string, credit: number, score: number | null, session = '2024/2025', semester = 'FIRST', level = '100'): ResultRow =>
  ({ sheetId: `s${n++}`, code, title: code, credit, session, semester, level, key, matric: key, name: `Student ${key}`, score });

describe('pass / fail and grade distribution', () => {
  const rows = [row('a', 'C1', 3, 75), row('b', 'C1', 3, 65), row('c', 'C1', 3, 35), row('d', 'C1', 3, null), row('e', 'C1', 3, 41)];
  it('ignores incomplete scores and gives percentages', () => {
    expect(passFail(rows, scale)).toEqual({ total: 4, pass: 3, fail: 1, passPct: 75, failPct: 25 });
  });
  it('counts every grade A to F', () => {
    const c = gradeCounts(rows, scale);
    expect(c.map((x) => x.grade)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(c.map((x) => x.count)).toEqual([1, 1, 0, 0, 1, 1]);
    expect(c[0].pct).toBe(25);
  });
  it('summarises each course', () => {
    const s = courseSummaries([...rows, row('a', 'C2', 2, 50)], scale);
    expect(s.map((x) => x.code)).toEqual(['C1', 'C2']);
    expect(s[0].students).toBe(4);
    expect(s[0].average).toBe(54);
    expect(s[1].passPct).toBe(100);
  });
  it('lists sessions newest first', () => {
    expect(sessionsOf([row('a', 'X', 1, 50, '2023/2024'), row('a', 'Y', 1, 50, '2025/2026')])).toEqual(['2025/2026', '2023/2024']);
  });
});

describe('semester GPA and classification (worked example)', () => {
  const sem1 = [['A1', 3, 75], ['A2', 3, 65], ['A3', 3, 65], ['A4', 3, 55], ['A5', 2, 55], ['A6', 2, 42]] as [string, number, number][];
  it('GPA = TGP / TCH = 56 / 16 = 3.50', () => {
    const [s] = studentTerms(sem1.map(([c, cr, sc]) => row('x', c, cr, sc)), scale);
    expect([s.tch, s.tgp, s.gpa, s.failed]).toEqual([16, 56, 3.5, []]);
  });
  it('puts any F on the carryover list and keeps that student out of the class lists', () => {
    const list = studentTerms([row('p', 'A', 3, 80), row('p', 'B', 3, 80), row('q', 'A', 3, 80), row('q', 'B', 3, 20)], scale);
    const c = classify(list, classes, 1);
    const p = c.find((x) => x.key === 'p')!;
    const q = c.find((x) => x.key === 'q')!;
    expect([p.cls, p.carryover, p.withdrawal]).toEqual(['First Class', false, false]);
    expect([q.cls, q.carryover, q.failed]).toEqual(['', true, ['B']]);
  });
  it('puts a GPA below the threshold on the withdrawal list', () => {
    const c = classify(studentTerms([row('w', 'A', 3, 35), row('w', 'B', 3, 41)], scale), classes, 1);
    expect([c[0].gpa, c[0].withdrawal, c[0].carryover]).toEqual([0.5, true, true]);
  });
  it('classifies by band', () => {
    const cls = (score: number) => classify(studentTerms([row('z', 'A', 3, score)], scale), classes, 1)[0].cls;
    expect([cls(75), cls(65), cls(55), cls(47), cls(41)]).toEqual(['First Class', 'Second Class Upper', 'Second Class Lower', 'Third Class', 'Pass']);
  });
  it('orders students by GPA, best first', () => {
    const list = studentTerms([row('a', 'A', 3, 50), row('b', 'A', 3, 80), row('c', 'A', 3, 65)], scale);
    expect(list.map((s) => s.key)).toEqual(['b', 'c', 'a']);
  });
});

describe('cumulative results and graduation list', () => {
  const R = (key: string, code: string, score: number, session: string, sem: string, level: string) => row(key, code, 3, score, session, sem, level);
  const all: ResultRow[] = [
    // g1: strong, clean
    R('g1', 'C100', 80, '2022/2023', 'FIRST', '100'), R('g1', 'C400', 78, '2025/2026', 'FIRST', '400'),
    // g2: failed C100, passed it again later -> cleared
    R('g2', 'C100', 30, '2022/2023', 'FIRST', '100'), R('g2', 'C100', 60, '2023/2024', 'FIRST', '200'), R('g2', 'C400', 70, '2025/2026', 'FIRST', '400'),
    // g3: failed C101 in year one and never repeated -> outstanding carryover
    R('g3', 'C101', 20, '2022/2023', 'SECOND', '100'), R('g3', 'C400', 65, '2025/2026', 'FIRST', '400'),
    // g4: F in the final year -> excluded
    R('g4', 'C100', 70, '2022/2023', 'FIRST', '100'), R('g4', 'C400', 10, '2025/2026', 'FIRST', '400'),
  ];
  it('counts each course once, the latest attempt winning', () => {
    const c = cumulative(all, '2025/2026', scale).get('g2')!;
    expect([c.tch, c.tgp, c.carryovers]).toEqual([6, 3 * 4 + 3 * 5, []]);
  });
  it('records an unresolved F from year one as a carryover', () => {
    const c = cumulative(all, '2025/2026', scale).get('g3')!;
    expect(c.carryovers).toEqual([{ code: 'C101', session: '2022/2023', level: '100' }]);
  });
  it('excludes final-year F students and orders the rest by CGPA, best first', () => {
    const g = graduationList(all, '2025/2026', '400', scale, classes);
    expect(g.excluded).toBe(1);
    expect(g.eligible.map((x) => x.key)).toEqual(['g1', 'g2']);
    expect(g.withCarryover.map((x) => x.key)).toEqual(['g3']);
    expect(g.eligible[0].cls).toBe('First Class');
  });
  it('picks the highest level of the session as the final year', () => {
    expect(defaultFinalLevel(all, '2025/2026')).toBe('400');
  });
});
