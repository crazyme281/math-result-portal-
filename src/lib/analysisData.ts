import { useCallback, useState } from 'react';
import { supabase } from './supabase';
import { DegreeClass } from './degree';
import { ResultRow } from './analysis';
import { toNum } from './grading';
import { useEnter } from './useEnter';

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** Reads every page of a query (the database returns at most 1000 rows per request). */
async function paged<T>(run: (from: number, to: number) => Page): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await run(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}

interface SheetRec { id: string; course_code: string; course_title: string; credit_unit: number; academic_session: string; semester: string; level: string }
interface StudRec { sheet_id: string; student_id: string | null; matric_no: string; name: string; ca: number | string | null; exam: number | string | null }

/** All results the lecturers have submitted to this HOD (the database only shows an HOD their own department). */
export async function loadSubmittedResults(): Promise<ResultRow[]> {
  const sheets = await paged<SheetRec>((a, b) => supabase.from('result_sheets')
    .select('id,course_code,course_title,credit_unit,academic_session,semester,level')
    .not('submitted_to_hod_at', 'is', null).order('id').range(a, b));
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const rows: ResultRow[] = [];
  for (let i = 0; i < sheets.length; i += 25) {
    const ids = sheets.slice(i, i + 25).map((s) => s.id);
    const studs = await paged<StudRec>((a, b) => supabase.from('result_students')
      .select('sheet_id,student_id,matric_no,name,ca,exam').in('sheet_id', ids).order('id').range(a, b));
    studs.forEach((r) => {
      const s = byId.get(r.sheet_id);
      if (!s || (!r.student_id && !r.matric_no.trim())) return;
      const ca = toNum(r.ca as string), exam = toNum(r.exam as string);
      rows.push({
        sheetId: s.id, code: s.course_code, title: s.course_title, credit: s.credit_unit,
        session: s.academic_session, semester: s.semester, level: s.level,
        key: r.student_id ?? `m:${r.matric_no.trim().toUpperCase()}`, matric: r.matric_no.trim(), name: r.name,
        score: ca === null || exam === null ? null : ca + exam,
      });
    });
  }
  return rows;
}

/** Loads the HOD's submitted results and the university's class-of-degree bands each time the page is shown. */
export function useAnalysisData() {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [classes, setClasses] = useState<DegreeClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [r, c] = await Promise.all([
        loadSubmittedResults(),
        supabase.from('degree_classes').select('min_cgpa,name'),
      ]);
      setRows(r);
      setClasses((c.data ?? []).map((x) => ({ min_cgpa: Number(x.min_cgpa), name: x.name })));
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);
  useEnter(load);
  return { rows, classes, loading, error, reload: load };
}
