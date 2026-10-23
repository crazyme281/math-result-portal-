import { describe, expect, it } from 'vitest';
import {
  ScaleRow, checkSheet, gradeFor, joinMatric, matricFormatError, normalizeMatric, pointFor, rowView, scoreError, splitMatric,
} from '../grading';
import { SheetForm, StudentRow } from '../types';

const scale = (points: boolean): ScaleRow[] =>
  [[70, 'A', 5], [60, 'B', 4], [50, 'C', 3], [45, 'D', 2], [40, 'E', 1], [0, 'F', 0]].map(([m, g, p]) => ({
    min_score: m as number, grade: g as string, status: (m as number) > 0 ? 'PASS' : 'FAIL', point: points ? (p as number) : null,
  }));

const stu = (o: Partial<StudentRow> = {}): StudentRow => ({
  key: 'k', matric_no: '23/095244001', jamb_reg_no: 'J1', name: 'A B', script_no: '', ca: '10', exam: '20', ...o,
});
const form = (o: Partial<SheetForm> = {}): SheetForm => ({
  university: 'U', faculty_id: 'f', department_id: 'd', matric_fixed: '/095244', academic_session: '2025/2026',
  result_title: 'T', course_code: 'IFT238', course_title: 'Lab', semester: 'FIRST', level: '100', credit_unit: '2',
  examiners: '', hod: '', released_to: '', sign_date: '', status: 'draft', ...o,
});

describe('grading boundaries', () => {
  it('grades every boundary', () => {
    const s = scale(true);
    const cases: [number, string, string][] = [
      [39, 'F', 'FAIL'], [40, 'E', 'PASS'], [44, 'E', 'PASS'], [45, 'D', 'PASS'], [49, 'D', 'PASS'],
      [50, 'C', 'PASS'], [59, 'C', 'PASS'], [60, 'B', 'PASS'], [69, 'B', 'PASS'], [70, 'A', 'PASS'], [100, 'A', 'PASS'],
    ];
    cases.forEach(([t, g, st]) => expect(gradeFor(t, s)).toEqual({ grade: g, status: st }));
  });
  it('grade points follow the scale; a scale without points gives none', () => {
    expect(pointFor(75, scale(true))).toBe(5);
    expect(pointFor(42, scale(true))).toBe(1);
    expect(pointFor(10, scale(true))).toBe(0);
    expect(pointFor(75, scale(false))).toBeNull();
  });
  it('an incomplete score is never graded as 0 / F', () => {
    const v = rowView(stu({ exam: '' }), scale(false));
    expect(v.status).toBe('INCOMPLETE');
    expect(v.total).toBeNull();
    expect(v.incomplete).toBe(true);
  });
});

describe('score validation messages', () => {
  it('uses the required wording', () => {
    expect(scoreError('CA score', '31', 30)).toBe('CA score cannot be greater than 30.');
    expect(scoreError('Examination score', '71', 70)).toBe('Examination score cannot be greater than 70.');
    expect(scoreError('CA score', '-1', 30)).toBe('CA score cannot be negative.');
    expect(scoreError('CA score', 'abc', 30)).toBe('CA score must be a number.');
    expect(scoreError('CA score', '30', 30)).toBeNull();
    expect(scoreError('CA score', '', 30)).toBeNull();
  });
});

describe('matriculation number', () => {
  it('accepts year + faculty code + 3 digits, including an edited faculty code of the same length', () => {
    expect(matricFormatError('/095244', '23/095244123')).toBeNull();
    expect(matricFormatError('/095244', '22/095300456')).toBeNull();
  });
  it('rejects wrong shapes', () => {
    expect(matricFormatError('/095244', '23/0952123')).not.toBeNull();
    expect(matricFormatError('/095244', '2/095244123')).not.toBeNull();
    expect(matricFormatError('/095244', '23/095244')).not.toBeNull();
  });
  it('is not enforced when the faculty has no code', () => {
    expect(matricFormatError('', 'AK21/ENG/EEE/DE/006')).toBeNull();
  });
  it('joins and splits the three parts', () => {
    expect(joinMatric('/095244', '23', '', '123')).toBe('23/095244123');
    expect(joinMatric('/095244', '23', '/095300', '123')).toBe('23/095300123');
    expect(joinMatric('/095244', '', '', '')).toBe('');
    expect(splitMatric('/095244', '23/095244123')).toEqual({ yy: '23', mid: '', nnn: '123' });
    expect(splitMatric('/095244', '23/095300123')).toEqual({ yy: '23', mid: '/095300', nnn: '123' });
    expect(splitMatric('/095244', 'weird')).toBeNull();
  });
  it('expands an imported year + last digits', () => {
    expect(normalizeMatric('/095244', '23123')).toBe('23/095244123');
    expect(normalizeMatric('', '23123')).toBe('23123');
  });
});

describe('sheet checks', () => {
  it('reports row-numbered errors, duplicates and incomplete records separately', () => {
    const c = checkSheet(form(), [
      stu(),
      stu({ matric_no: '23/095244002', ca: '31' }),
      stu({ matric_no: '23/095244001' }),
      stu({ matric_no: '', name: '' }),
    ]);
    expect(c.errors).toContain('Row 2: CA score cannot be greater than 30.');
    expect(c.errors).toContain('Row 3: Duplicate matriculation number (also in row 1).');
    expect(c.incomplete).toContain('Row 4: Student matriculation number is missing.');
    expect(c.incomplete).toContain('Row 4: Student name is missing.');
    expect(c.incompleteRows).toBe(1);
  });
  it('requires course details', () => {
    const c = checkSheet(form({ course_code: '', faculty_id: '' }), []);
    expect(c.errors).toContain('Course code is required.');
    expect(c.errors).toContain('Select a faculty.');
  });
});
