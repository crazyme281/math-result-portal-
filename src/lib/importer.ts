import ExcelJS from 'exceljs';
import { StudentRow } from './types';
import { checkStudent, normalizeMatric } from './grading';

const ALIASES: Record<string, string[]> = {
  matric_no: ['matricno', 'matricnumber', 'matriculationnumber', 'matriculationno', 'matriculationnum', 'matricnum', 'matricnos', 'matricnumbers', 'matric', 'matriculation', 'studentmatricno', 'studentmatricnumber'],
  // The sheet's single registration-number field. Accepts Reg. No, Reg. Number, Registration No/Number, JAMB Reg No, etc.
  jamb_reg_no: ['regno', 'regnumber', 'registrationnumber', 'registrationno', 'regnum', 'registrationnum', 'regnos', 'regnumbers', 'registrationnumbers', 'jambregno', 'jambreg', 'jambno', 'jambregistrationnumber', 'jamb'],
  name: ['names', 'name', 'nameofstudent', 'namesofstudents', 'namesofstudent', 'nameofstudents', 'studentname', 'studentsname', 'studentnames', 'fullname', 'fullnames', 'candidatename', 'nameofcandidate'],
  script_no: ['scriptno', 'scriptnumber', 'script'],
  ca: ['ca', 'cascore', 'continuousassessment'],
  exam: ['exam', 'examscore', 'examination'],
};
/**
 * University of Calabar: a matriculation number contains "/" and no letters (20/095244228);
 * a registration number contains letters and no "/" (202211024189FA).
 */
const hasLetter = (v: string) => /[a-z]/i.test(v);
const looksLikeReg = (v: string) => !!v && !v.includes('/') && hasLetter(v);
const looksLikeMatric = (v: string) => !!v && v.includes('/') && !hasLetter(v);
const norm = (h: unknown) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const newKey = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
export const blankStudent = (): StudentRow => ({
  key: newKey(), matric_no: '', jamb_reg_no: '', name: '', script_no: '', ca: '', exam: '',
});

interface SrcRow { n: number; cells: string[] } // n = row number in the user's file

function parseCsv(text: string, delim = ','): SrcRow[] {
  const rows: SrcRow[] = [];
  let row: string[] = [], cell = '', q = false;
  const push = () => { row.push(cell); cell = ''; rows.push({ n: rows.length + 1, cells: row }); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      push();
    } else cell += c;
  }
  if (cell !== '' || row.length) push();
  return rows;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return cellText(o.result);
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('');
    if ('text' in o) return String(o.text);
  }
  return String(v).trim();
}

export interface ImportResult {
  students: StudentRow[];
  /** Row number in the imported file for each student (same order as `students`). */
  fileRows: number[];
  /** Row-numbered problems found in the file, e.g. "Row 5: CA score cannot be greater than 30." */
  issues: string[];
}

interface Header { headerAt: number; map: Record<string, number> }

/** Finds the heading row (a student name column and a matric / registration column) in the first 60 rows. */
function findHeader(rows: SrcRow[]): Header | null {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const m: Record<string, number> = {};
    const cells = rows[i].cells.map(norm);
    // Aliases are listed in order of preference, so e.g. "Matric Number" is always the matric column and "Reg. Number" is the registration column, whatever the column order.
    for (const [k, names] of Object.entries(ALIASES)) {
      for (const a of names) {
        const j = cells.indexOf(a);
        if (j >= 0) { m[k] = j; break; }
      }
    }
    // Looser fallback so unusual wordings still work: any header containing "matric" or "name".
    if (!('matric_no' in m)) {
      const j = cells.findIndex((c) => c.includes('matric') && !c.includes('jamb'));
      if (j >= 0) m.matric_no = j;
    }
    if (!('jamb_reg_no' in m)) {
      const j = cells.findIndex((c) => c.includes('registration') || /^reg(no|num)/.test(c));
      if (j >= 0 && j !== m.matric_no) m.jamb_reg_no = j;
    }
    // A file that only has a Reg. Number column (no matric column) uses it as the matric number.
    if (!('matric_no' in m) && 'jamb_reg_no' in m) { m.matric_no = m.jamb_reg_no; delete m.jamb_reg_no; }
    if (!('name' in m)) {
      const j = cells.findIndex((c) => c.includes('name') && !c.includes('script') && !c.includes('course') && !c.includes('lecturer'));
      if (j >= 0) m.name = j;
    }
    if ('name' in m && 'matric_no' in m) return { headerAt: i, map: m };
  }
  return null;
}

/** The error shown when no heading row is found; it lists the headings the file does have so the problem is easy to see. */
function noHeaderError(rows: SrcRow[], sheetNames: string[] = []): Error {
  const first = rows.slice(0, 60).find((r) => r.cells.filter((c) => c.trim()).length >= 2);
  const seen = first ? first.cells.filter((c) => c.trim()).slice(0, 10).map((c) => `"${c.trim()}"`).join(', ') : '';
  return new Error(
    'Could not find a header row containing a student NAME column (e.g. NAMES or NAME OF STUDENT) and a MATRIC NO column (e.g. MATRIC NO or MATRIC NUMBER).' +
    (seen ? ` The first headings found in the file are: ${seen}.` : ' The file looks empty.') +
    (sheetNames.length > 1 ? ` Sheets checked: ${sheetNames.join(', ')}.` : '')
  );
}

function toStudents(rows: SrcRow[], fixed: string, header: Header | null = findHeader(rows)): ImportResult {
  if (!header) throw noHeaderError(rows);
  const { headerAt, map } = header;

  const get = (r: string[], k: string) => (k in map ? (r[map[k]] ?? '').trim() : '');
  const students: StudentRow[] = [];
  const fileRows: number[] = [];
  const issues: string[] = [];

  rows.slice(headerAt + 1).forEach((r) => {
    let matric = get(r.cells, 'matric_no').replace(/\s+/g, '');
    let reg = get(r.cells, 'jamb_reg_no');
    const regFlat = reg.replace(/\s+/g, '');
    const notes: string[] = [];
    if (looksLikeReg(matric)) {
      // A registration number was typed in the matric column.
      if (!reg || regFlat.toUpperCase() === matric.toUpperCase()) {
        notes.push(`${matric} is a registration number (it has letters and no "/"), so it was moved to the registration number column.`);
        reg = matric; matric = '';
      } else if (looksLikeMatric(regFlat)) {
        // The two columns are the wrong way round.
        notes.push(`The matriculation and registration numbers were the wrong way round, so they were swapped.`);
        [matric, reg] = [regFlat, matric];
      }
    } else if (looksLikeMatric(matric) && regFlat === matric) {
      // The registration column just repeats the matric number (it has "/" and no letters, so it is not a registration number).
      reg = '';
    } else if (!matric && looksLikeMatric(regFlat)) {
      // A matriculation number was typed in the registration column.
      notes.push(`${regFlat} is a matriculation number (it has "/" and no letters), so it was moved to the matriculation number column.`);
      matric = regFlat; reg = '';
    }
    const s: StudentRow = {
      key: newKey(),
      matric_no: normalizeMatric(fixed, matric),
      jamb_reg_no: reg,
      name: get(r.cells, 'name'),
      script_no: get(r.cells, 'script_no'),
      ca: get(r.cells, 'ca'),
      exam: get(r.cells, 'exam'),
    };
    if (!s.name && !s.matric_no && !s.jamb_reg_no) return; // blank line
    notes.forEach((m) => issues.push(`Row ${r.n}: ${m}`));
    const c = checkStudent(s, fixed);
    c.errors.forEach((m) => issues.push(`Row ${r.n}: ${m}`));
    c.missing.forEach((m) => issues.push(`Row ${r.n}: ${m.msg}`));
    students.push(s);
    fileRows.push(r.n);
  });
  return { students, fileRows, issues };
}

function decodeText(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2)); // Excel "Unicode Text"
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  return new TextDecoder('utf-8').decode(b).replace(/^\uFEFF/, '');
}

/** Comma, semicolon or tab: whichever appears most in the first lines (Excel in some regions saves CSV with semicolons). */
function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/).slice(0, 10).join('\n');
  const count = (d: string) => head.split(d).length - 1;
  return [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
}

export async function importStudents(file: File, fixed: string): Promise<ImportResult> {
  if (/\.xls$/i.test(file.name)) {
    throw new Error('Old Excel files (.xls) cannot be read. In Excel use File > Save As and choose "Excel Workbook (.xlsx)" or "CSV", then import that file.');
  }
  if (/\.xlsx$/i.test(file.name)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    // the heading row may be on any sheet of the workbook
    const sheets = wb.worksheets.map((ws) => {
      const rows: SrcRow[] = [];
      ws.eachRow({ includeEmpty: false }, (row, n) => {
        rows.push({ n, cells: (row.values as unknown[]).slice(1).map(cellText) });
      });
      return rows;
    });
    for (const rows of sheets) {
      const h = findHeader(rows);
      if (h) return toStudents(rows, fixed, h);
    }
    throw noHeaderError(sheets.find((r) => r.length > 0) ?? [], wb.worksheets.map((w) => w.name));
  }
  const text = decodeText(new Uint8Array(await file.arrayBuffer()));
  return toStudents(parseCsv(text, detectDelimiter(text)), fixed);
}
