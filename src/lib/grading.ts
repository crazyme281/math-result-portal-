import { SheetForm, StudentRow } from './types';

export const CA_MAX = 30;
export const EXAM_MAX = 70;

export interface ScaleRow { min_score: number; grade: string; status: 'PASS' | 'FAIL'; point: number | null }

// Fallback only - the live scale is read from the grading_scale table in Supabase.
export const DEFAULT_SCALE: ScaleRow[] = [
  { min_score: 70, grade: 'A', status: 'PASS', point: null },
  { min_score: 60, grade: 'B', status: 'PASS', point: null },
  { min_score: 50, grade: 'C', status: 'PASS', point: null },
  { min_score: 45, grade: 'D', status: 'PASS', point: null },
  { min_score: 40, grade: 'E', status: 'PASS', point: null },
  { min_score: 0, grade: 'F', status: 'FAIL', point: null },
];

export const sortScale = (s: ScaleRow[]) => [...s].sort((a, b) => b.min_score - a.min_score);

export function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const totalOf = (ca: string, exam: string) => (toNum(ca) ?? 0) + (toNum(exam) ?? 0);

export function gradeFor(total: number, scale: ScaleRow[]): { grade: string; status: 'PASS' | 'FAIL' } {
  const sorted = sortScale(scale);
  for (const r of sorted) if (total >= r.min_score) return { grade: r.grade, status: r.status };
  const last = sorted[sorted.length - 1];
  return { grade: last.grade, status: last.status };
}

export const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));

// ---------------------------------------------------------------- field rules
export type FieldKey = 'matric_no' | 'jamb_reg_no' | 'name' | 'script_no' | 'ca' | 'exam';

/** Fields every student record must have. Records missing any of these are shown/exported in red. */
export const REQUIRED: { key: FieldKey; label: string; msg: string }[] = [
  { key: 'matric_no', label: 'MATRIC NO', msg: 'Student matriculation number is missing.' },
  { key: 'name', label: 'NAMES', msg: 'Student name is missing.' },
  { key: 'jamb_reg_no', label: 'JAMB REG NO', msg: 'JAMB registration number is missing.' },
  { key: 'ca', label: 'CA', msg: 'CA score is missing.' },
  { key: 'exam', label: 'EXAM', msg: 'Examination score is missing.' },
];

export const FIXED_RE = /^\/\d+$/;

/**
 * Matric format when a faculty code is set (Faculty of Computing: "/095244"):
 *   2 digits typed by the lecturer + faculty code + 3 digits typed by the lecturer  ->  23/095244123
 * The faculty code is only a suggestion: the lecturer may edit it, but it keeps the same length.
 */
export function matricFormatError(fixed: string, matric: string): string | null {
  const m = matric.trim();
  if (!m || !fixed || !FIXED_RE.test(fixed)) return null;
  const len = fixed.length - 1;
  const ok = new RegExp(`^\\d{2}/\\d{${len}}\\d{3}$`).test(m);
  return ok ? null : `Matriculation number must be 2 digits, a ${len}-digit faculty code like ${fixed}, then 3 digits (e.g. 23${fixed}123).`;
}

/** Three-part matric entry. An empty middle part means "use the suggested faculty code". */
export function joinMatric(fixed: string, yy: string, mid: string, nnn: string): string {
  if (!yy && !mid && !nnn) return '';
  return yy + (mid || fixed) + nnn;
}

/** Split a complete matric number into its parts (middle is '' when it equals the suggested code). */
export function splitMatric(fixed: string, m: string): { yy: string; mid: string; nnn: string } | null {
  if (!m) return { yy: '', mid: '', nnn: '' };
  if (!fixed || !FIXED_RE.test(fixed)) return null;
  const x = new RegExp(`^(\\d{2})(/\\d{${fixed.length - 1}})(\\d{3})$`).exec(m);
  return x ? { yy: x[1], mid: x[2] === fixed ? '' : x[2], nnn: x[3] } : null;
}

/** Imported value "23123" (year + last 3 digits) becomes 23/095244123. Anything else is left as-is. */
export function normalizeMatric(fixed: string, raw: string): string {
  const v = raw.trim().replace(/\s+/g, '');
  if (fixed && FIXED_RE.test(fixed) && /^\d{5}$/.test(v)) return v.slice(0, 2) + fixed + v.slice(2);
  return v;
}

export function scoreError(label: 'CA score' | 'Examination score', v: string, max: number): string | null {
  if (v.trim() === '') return null;
  const n = toNum(v);
  if (n === null) return `${label} must be a number.`;
  if (n < 0) return `${label} cannot be negative.`;
  if (n > max) return `${label} cannot be greater than ${max}.`;
  return null;
}

export interface RowCheck {
  errors: string[]; // invalid values - block save / export
  missing: { key: FieldKey; label: string; msg: string }[]; // incomplete - highlighted red, allowed
  badKeys: Set<FieldKey>;
}

export function checkStudent(s: StudentRow, fixed: string): RowCheck {
  const errors: string[] = [];
  const badKeys = new Set<FieldKey>();
  const add = (key: FieldKey, msg: string | null) => { if (msg) { errors.push(msg); badKeys.add(key); } };
  add('matric_no', matricFormatError(fixed, s.matric_no));
  add('ca', scoreError('CA score', s.ca, CA_MAX));
  add('exam', scoreError('Examination score', s.exam, EXAM_MAX));
  const missing = REQUIRED.filter((r) => s[r.key].trim() === '');
  missing.forEach((m) => badKeys.add(m.key));
  return { errors, missing, badKeys };
}

// ---------------------------------------------------------------- per-row result
export const scoresComplete = (s: StudentRow) => toNum(s.ca) !== null && toNum(s.exam) !== null;

export type RowStatus = 'PASS' | 'FAIL' | 'INCOMPLETE';

/** Incomplete scores are never graded - they show as INCOMPLETE instead of silently becoming 0 / F. */
export function rowView(s: StudentRow, scale: ScaleRow[]) {
  const missing = REQUIRED.filter((r) => s[r.key].trim() === '').map((r) => r.label);
  const done = scoresComplete(s);
  const total = done ? totalOf(s.ca, s.exam) : null;
  const g = total !== null ? gradeFor(total, scale) : null;
  return {
    total,
    grade: g?.grade ?? '',
    status: (g?.status ?? 'INCOMPLETE') as RowStatus,
    missing,
    incomplete: missing.length > 0,
  };
}

export function summary(students: StudentRow[], scale: ScaleRow[]) {
  let passed = 0, failed = 0, incomplete = 0;
  students.forEach((s) => {
    const v = rowView(s, scale);
    if (v.incomplete) incomplete++;
    if (v.status === 'PASS') passed++;
    else if (v.status === 'FAIL') failed++;
  });
  return { count: students.length, passed, failed, incomplete };
}

// ---------------------------------------------------------------- whole sheet
export interface SheetCheck {
  errors: string[]; // must be fixed before saving / exporting
  incomplete: string[]; // missing information - may still be saved / exported (shown in red)
  incompleteRows: number;
}

export function checkSheet(f: SheetForm, students: StudentRow[]): SheetCheck {
  const errors: string[] = [];
  const incomplete: string[] = [];
  let incompleteRows = 0;
  if (!f.faculty_id) errors.push('Select a faculty.');
  if (!f.department_id) errors.push('Select a department.');
  if (!f.academic_session.trim()) errors.push('Academic session is required.');
  if (!f.course_code.trim()) errors.push('Course code is required.');
  if (!f.course_title.trim()) errors.push('Course title is required.');
  if (f.matric_fixed.trim() && !FIXED_RE.test(f.matric_fixed.trim())) errors.push('Matric fixed part must look like /095244.');

  const seen = new Map<string, number>();
  students.forEach((s, i) => {
    const n = i + 1;
    const c = checkStudent(s, f.matric_fixed.trim());
    c.errors.forEach((m) => errors.push(`Row ${n}: ${m}`));
    const k = s.matric_no.trim().toUpperCase();
    if (k) {
      if (seen.has(k)) errors.push(`Row ${n}: Duplicate matriculation number (also in row ${seen.get(k)}).`);
      else seen.set(k, n);
    }
    if (c.missing.length) {
      incompleteRows++;
      c.missing.forEach((m) => incomplete.push(`Row ${n}: ${m.msg}`));
    }
  });
  return { errors, incomplete, incompleteRows };
}

// ---------------------------------------------------------------- GPA / CGPA (used by the HOD analysis pages)
/** Grade point for a total score, from the institution's own scale. null when the scale has no points. */
export function pointFor(total: number, scale: ScaleRow[]): number | null {
  const sorted = sortScale(scale);
  for (const r of sorted) if (total >= r.min_score) return r.point;
  return sorted[sorted.length - 1]?.point ?? null;
}

export interface CourseLine { credit: number; point: number }

/** TCH = sum of credit hours, TGP = sum of (credit hours x grade point), GPA = TGP / TCH. */
export function tally(lines: CourseLine[]) {
  const tch = lines.reduce((a, l) => a + l.credit, 0);
  const tgp = lines.reduce((a, l) => a + l.credit * l.point, 0);
  return { tch, tgp, gpa: tch > 0 ? tgp / tch : null };
}

/** CGPA = (previous TGP + present TGP) / (previous TCH + present TCH). */
export function cumulative(prevTgp: number, prevTch: number, tgp: number, tch: number) {
  const t = prevTch + tch;
  return t > 0 ? (prevTgp + tgp) / t : null;
}

export const to2dp = (n: number | null) => (n === null ? '-' : n.toFixed(2));
