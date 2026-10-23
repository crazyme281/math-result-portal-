import React, { useRef, useState } from 'react';
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonPage, IonSelect,
  IonSearchbar, IonSelectOption, IonSpinner, IonTitle, IonToolbar, IonText, useIonAlert, useIonActionSheet, useIonToast,
  useIonViewWillEnter,
} from '@ionic/react';
import { addCircleOutline, cloudUploadOutline, downloadOutline, gitBranchOutline, paperPlaneOutline, saveOutline, trashOutline } from 'ionicons/icons';
import { useHistory, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { DeptBanner } from '../components/DeptBanner';
import { Department, ExportData, Faculty, SheetForm, SheetStatus, StudentRow } from '../lib/types';
import {
  FieldKey, CA_MAX, EXAM_MAX, checkSheet, checkStudent, fmt, joinMatric, matricFormatError, rowView, splitMatric, summary,
} from '../lib/grading';
import { blankStudent, importStudents } from '../lib/importer';
import { exportDocx, exportPdf, exportXlsx } from '../lib/exporters';
import { loadLogo } from '../lib/logo';
import { DEPARTMENT_NAME, FACULTY_NAME, UNIVERSITY_HEADING } from '../lib/config';
import { matchesStudent } from '../lib/search';

const emptyForm = (university = UNIVERSITY_HEADING): SheetForm => ({
  university,
  faculty_id: '', department_id: '', matric_fixed: '',
  academic_session: '2025/2026', result_title: 'UNDERGRADUATE RESULT SCORES',
  course_code: '', course_title: '', semester: 'FIRST', level: '100', credit_unit: '2',
  examiners: '', hod: '', released_to: '', sign_date: '', status: 'draft',
});

const COLS: { key: FieldKey; label: string; cls?: string }[] = [
  { key: 'matric_no', label: 'MATRIC NO', cls: 'matric' },
  { key: 'jamb_reg_no', label: 'JAMB REG NO' },
  { key: 'name', label: 'NAMES', cls: 'wide' },
  { key: 'script_no', label: 'SCRIPT NO' },
  { key: 'ca', label: `CA /${CA_MAX}`, cls: 'num' },
  { key: 'exam', label: `EXAM /${EXAM_MAX}`, cls: 'num' },
];

const STATUS_COLOR: Record<SheetStatus, string> = { draft: 'medium', submitted: 'warning', approved: 'success', locked: 'dark' };

interface AuditRow {
  id: number; at: string; actor_name: string | null; action: string;
  details: {
    from?: string; to?: string; note?: string | null; students?: number; added?: number; removed?: number;
    score_changes?: { matric: string; name: string; ca: (string | null)[]; exam: (string | null)[] }[];
  };
}

const describeAudit = (h: AuditRow): string => {
  const d = h.details ?? {};
  if (h.action === 'status_changed') return `${d.from} -> ${d.to}${d.note ? ` ("${d.note}")` : ''}`;
  if (h.action === 'sheet_created') return `created with ${d.students ?? 0} student(s)`;
  if (h.action === 'sheet_deleted') return 'deleted';
  if (h.action === 'sheet_saved') {
    const sc = d.score_changes ?? [];
    const first = sc.slice(0, 3).map((c) => `${c.matric}: CA ${c.ca[0] ?? '-'}->${c.ca[1] ?? '-'}, exam ${c.exam[0] ?? '-'}->${c.exam[1] ?? '-'}`).join('; ');
    return `saved - ${d.added ?? 0} added, ${d.removed ?? 0} removed, ${sc.length} score change(s)${first ? ` (${first}${sc.length > 3 ? '; ...' : ''})` : ''}`;
  }
  return h.action;
};

const SheetEditor: React.FC = () => {
  const params = useParams<{ id?: string }>();
  const history = useHistory();
  // Ionic keeps the previous page mounted while navigating away; at that moment the route no longer matches and
  // useParams().id becomes undefined. Fall back to the URL, then to the last valid id this page saw, so we never
  // query result_sheets with id = "undefined".
  const urlId = window.location.hash.match(/\/sheet\/([^/?#]+)/)?.[1];
  const lastId = useRef<string | undefined>(undefined);
  const found = [params.id, urlId].find((v) => v && v !== 'undefined');
  if (found) lastId.current = found;
  const id = lastId.current as string;
  const { session, institution, scale, role, departmentId } = useAuth();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const [sheet] = useIonActionSheet();

  const [form, setForm] = useState<SheetForm>(emptyForm());
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [q, setQ] = useState(''); // search box: script no / matric no
  const [registered, setRegistered] = useState<Record<string, boolean>>({});
  const [parts, setParts] = useState<Record<string, { yy: string; mid: string; nnn: string }>>({});
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const profileEmpty = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const userId = session?.user.id ?? '';
  const isOwner = id === 'new' || ownerId === userId;
  const reviewerHere = (role === 'hod' || role === 'exam_officer') && departmentId === form.department_id;
  const hodHere = role === 'hod' && departmentId === form.department_id;
  // only the owner can edit, and only while the sheet is a draft (the database enforces the same rule)
  const locked = !(isOwner && form.status === 'draft');
  const fixed = form.matric_fixed.trim();
  const codeLen = fixed ? fixed.length - 1 : 0;
  const facultyName = FACULTY_NAME;
  const departmentName = DEPARTMENT_NAME;

  const say = (message: string, color: 'success' | 'danger' | 'warning' = 'success') =>
    toast({ message, duration: 3000, color, position: 'bottom' });

  // ------------------------------------------------------------ load
  const load = async () => {
    if (!id) { setLoading(false); return; } // no valid sheet id (page is being left) - nothing to load
    setLoading(true); setLoadErr('');
    const [f, d] = await Promise.all([
      supabase.from('faculties').select('*').eq('institution_id', institution?.id ?? '').order('sort_order'),
      supabase.from('departments').select('*').order('name'),
    ]);
    if (f.error || d.error) { setLoadErr((f.error || d.error)!.message); setLoading(false); return; }
    const facs = f.data as Faculty[];
    setFaculties(facs);
    setDepartments(d.data as Department[]);
    setRegistered({}); setParts({}); setAudit([]);
    // ResultDesk is for the Department of Mathematics only: its faculty and department are found, never chosen.
    const math = (d.data as Department[]).find((x) => x.name === DEPARTMENT_NAME);
    if (!math) {
      setLoadErr('The Department of Mathematics is not set up in the database (run supabase/setup/04_seed.sql and 07_math_only.sql).');
      setLoading(false); return;
    }

    if (id === 'new') {
      const { data: p } = await supabase.from('profiles').select('faculty_id,department_id').eq('id', userId).maybeSingle();
      profileEmpty.current = !p?.department_id;
      const fx = facs.find((x) => x.id === math.faculty_id)?.matric_fixed ?? '';
      setOwnerId(userId); setOwnerName('');
      setForm({ ...emptyForm(), faculty_id: math.faculty_id, department_id: math.id, matric_fixed: fx, released_to: DEPARTMENT_NAME.toUpperCase() });
      setStudents([]);
    } else {
      const { data: s, error } = await supabase.from('result_sheets').select('*, profiles(full_name)').eq('id', id).maybeSingle();
      if (error || !s) { setLoadErr(error?.message ?? 'Sheet not found.'); setLoading(false); return; }
      const { data: rows } = await supabase.from('result_students').select('*').eq('sheet_id', id).order('sort_order');
      setOwnerId(s.owner_id);
      setOwnerName((s as unknown as { profiles: { full_name: string | null } | null }).profiles?.full_name ?? '');
      setForm({
        id: s.id, university: UNIVERSITY_HEADING, faculty_id: s.faculty_id, department_id: s.department_id,
        matric_fixed: s.matric_fixed ?? '', academic_session: s.academic_session, result_title: s.result_title,
        course_code: s.course_code, course_title: s.course_title, semester: s.semester, level: s.level,
        credit_unit: String(s.credit_unit), examiners: s.examiners ?? '', hod: s.hod ?? '', released_to: s.released_to ?? '',
        sign_date: s.sign_date ?? '', status: s.status,
      });
      setStudents((rows ?? []).map((r) => ({
        key: r.id, matric_no: r.matric_no, jamb_reg_no: r.jamb_reg_no ?? '', name: r.name, script_no: r.script_no ?? '',
        ca: r.ca === null ? '' : fmt(Number(r.ca)), exam: r.exam === null ? '' : fmt(Number(r.exam)),
      })));
      const { data: log } = await supabase.from('audit_log').select('id,at,actor_name,action,details')
        .eq('sheet_id', id).order('id', { ascending: false }).limit(60);
      setAudit((log ?? []) as unknown as AuditRow[]);
    }
    setDirty(false);
    setLoading(false);
  };
  useIonViewWillEnter(() => { load(); });

  // ------------------------------------------------------------ form edits
  const setF = <K extends keyof SheetForm>(k: K, v: SheetForm[K]) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };

  // ------------------------------------------------------------ student registry lookup
  const lookup = async (key: string, matric: string) => {
    const m = matric.trim();
    if (!m || matricFormatError(fixed, m) || !institution) return;
    const { data } = await supabase.from('students').select('name,jamb_reg_no')
      .eq('institution_id', institution.id).eq('matric_norm', m.toUpperCase()).maybeSingle();
    if (data) {
      setStudents((rows) => rows.map((r) =>
        r.key === key && r.matric_no === matric
          ? { ...r, name: data.name, jamb_reg_no: data.jamb_reg_no ?? r.jamb_reg_no }
          : r));
    }
    setRegistered((p) => ({ ...p, [key]: !!data }));
  };

  // ------------------------------------------------------------ student edits
  const setCell = (key: string, field: FieldKey, value: string) => {
    setStudents((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    if (field === 'matric_no') setRegistered((p) => ({ ...p, [key]: false }));
    setDirty(true);
  };

  /** Edit one part of the matric number: [YY] [faculty code - editable, placeholder /095244] [NNN]. */
  const editParts = (key: string, cur: { yy: string; mid: string; nnn: string }, patch: Partial<{ yy: string; mid: string; nnn: string }>) => {
    const next = { ...cur, ...patch };
    setParts((p) => ({ ...p, [key]: next }));
    const value = joinMatric(fixed, next.yy, next.mid, next.nnn);
    setCell(key, 'matric_no', value);
    if (next.yy.length === 2 && next.nnn.length === 3) lookup(key, value);
  };

  const addRow = () => { setQ(''); setStudents((r) => [...r, blankStudent()]); setDirty(true); };

  const delRow = (s: StudentRow, n: number) =>
    alert({
      header: 'Delete student?',
      message: `Delete row ${n}${s.matric_no ? ` (${s.matric_no})` : ''}? This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => { setStudents((r) => r.filter((x) => x.key !== s.key)); setDirty(true); } },
      ],
    });

  const onCellKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number | string) => {
    if (e.key !== 'Enter') return;
    const next = document.querySelector<HTMLInputElement>(`input[data-r="${r + 1}"][data-c="${c}"]`);
    if (next) { e.preventDefault(); next.focus(); next.select(); }
  };

  // ------------------------------------------------------------ import
  const fillFromRegistry = async (added: StudentRow[]) => {
    const wanted = added.filter((s) => s.matric_no && !matricFormatError(fixed, s.matric_no));
    const found = new Map<string, { name: string; jamb_reg_no: string | null }>();
    for (let i = 0; i < wanted.length; i += 200) {
      const chunk = wanted.slice(i, i + 200).map((s) => s.matric_no.trim().toUpperCase());
      const { data } = await supabase.from('students').select('matric_norm,name,jamb_reg_no')
        .eq('institution_id', institution?.id ?? '').in('matric_norm', chunk);
      (data ?? []).forEach((r) => found.set(r.matric_norm, r));
    }
    const reg: Record<string, boolean> = {};
    const filled = added.map((s) => {
      const hit = found.get(s.matric_no.trim().toUpperCase());
      if (!hit) return s;
      reg[s.key] = true;
      return { ...s, name: s.name || hit.name, jamb_reg_no: s.jamb_reg_no || (hit.jamb_reg_no ?? '') };
    });
    setRegistered((p) => ({ ...p, ...reg }));
    return filled;
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = await importStudents(file, fixed);
      const have = new Set(students.map((s) => s.matric_no.trim().toUpperCase()).filter(Boolean));
      const report = [...res.issues];
      let added: StudentRow[] = [];
      let skipped = 0;
      res.students.forEach((s, i) => {
        const k = s.matric_no.trim().toUpperCase();
        if (k && have.has(k)) {
          skipped++;
          report.push(`Row ${res.fileRows[i]}: Matriculation number ${s.matric_no} is already on this sheet - skipped.`);
        } else {
          if (k) have.add(k);
          added.push(s);
        }
      });
      added = await fillFromRegistry(added);
      setQ('');
      setStudents((rows) => [...rows, ...added]);
      setDirty(true);
      report.sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));
      if (report.length) {
        alert({
          header: 'Import report',
          subHeader: `${added.length} imported, ${skipped} skipped. Row numbers are rows in your file.`,
          message: report.slice(0, 15).join('\n') + (report.length > 15 ? `\n...and ${report.length - 15} more (see the red rows and the list on the sheet).` : ''),
          buttons: ['OK'],
        });
      } else say(`Imported ${added.length} student(s).`);
    } catch (err) {
      alert({ header: 'Import failed', message: (err as Error).message, buttons: ['OK'] });
    }
  };

  // ------------------------------------------------------------ save / workflow / export
  const check = checkSheet(form, students);

  const listProblems = (header: string, problems: string[]) =>
    alert({
      header,
      message: problems.slice(0, 12).join('\n') + (problems.length > 12 ? `\n...and ${problems.length - 12} more` : ''),
      buttons: ['OK'],
    });

  const save = async (): Promise<boolean> => {
    if (check.errors.length) { listProblems('Fix these before saving', check.errors); return false; }
    setSaving(true);
    const { id: _ignore, status: _s, ...sheetFields } = form;
    void _ignore; void _s;
    const { data, error } = await supabase.rpc('save_result_sheet', {
      p_sheet: { id: form.id ?? null, ...sheetFields },
      p_students: students.map(({ key: _k, ...rest }) => rest),
    });
    setSaving(false);
    if (error) { alert({ header: 'Could not save', message: error.message, buttons: ['OK'] }); return false; }
    if (profileEmpty.current && form.faculty_id && form.department_id) {
      await supabase.from('profiles').update({ faculty_id: form.faculty_id, department_id: form.department_id }).eq('id', userId);
      profileEmpty.current = false;
    }
    setDirty(false);
    if (check.incompleteRows) say(`Saved. ${check.incompleteRows} incomplete record(s) are highlighted in red.`, 'warning');
    else say('Saved.');
    if (!form.id) { if (data) history.replace(`/sheet/${data as string}`); else history.replace('/sheets'); }
    else load();
    return true;
  };

  const moveTo = async (to: SheetStatus, note?: string) => {
    const { error } = await supabase.rpc('set_sheet_status', { p_sheet: form.id, p_status: to, p_note: note ?? null });
    if (error) { alert({ header: 'Not allowed', message: error.message, buttons: ['OK'] }); return; }
    say(`Sheet is now ${to}.`);
    load();
  };

  const act = async (a: { label: string; to: SheetStatus; note?: boolean }) => {
    if (!form.id) { say('Save the sheet first.', 'warning'); return; }
    if (dirty && isOwner && form.status === 'draft' && a.to !== 'draft' && !(await save())) return;
    if (a.to === 'submitted') {
      if (check.errors.length || check.incomplete.length) {
        listProblems('Complete the sheet before submitting', [...check.errors, ...check.incomplete]);
        return;
      }
    }
    if (a.note) {
      alert({
        header: a.label, message: 'Give a reason (it is recorded in the history).',
        inputs: [{ name: 'note', type: 'textarea', placeholder: 'Reason' }],
        buttons: ['Cancel', { text: 'Confirm', handler: (d) => {
          const n = String(d.note ?? '').trim();
          if (!n) { say('A reason is required.', 'warning'); return false; }
          moveTo(a.to, n); return true;
        } }],
      });
    } else {
      alert({ header: a.label, message: a.to === 'locked' && !institution?.uses_approval
          ? 'The sheet cannot be edited or deleted while it is locked. You can open it again at any time.'
          : a.to === 'submitted'
            ? 'Submit these results to your HOD? You cannot edit the sheet while it is with the HOD, but you can withdraw it.'
            : form.status === 'submitted' && a.to === 'draft'
              ? 'Withdraw these results from the HOD so you can edit them again?'
              : `Move this sheet to "${a.to}"?`,
        buttons: ['Cancel', { text: 'Yes', handler: () => { moveTo(a.to); } }] });
    }
  };

  const actions: { label: string; to: SheetStatus; note?: boolean }[] = [];
  if (form.id && institution && !institution.uses_approval) {
    // UNICAL: the lecturer locks and opens their own results at will
    if (form.status === 'draft' && isOwner) actions.push({ label: 'Lock results', to: 'locked' });
    if (form.status === 'locked' && isOwner) actions.push({ label: 'Open results for editing', to: 'draft' });
    if (form.status === 'submitted' && isOwner) actions.push({ label: 'Withdraw from HOD', to: 'draft' });
  } else if (form.id) {
    if (form.status === 'submitted' && isOwner) actions.push({ label: 'Withdraw from HOD', to: 'draft' });
    if (form.status === 'submitted' && hodHere) {
      actions.push({ label: 'Approve', to: 'approved' });
      if (!isOwner) actions.push({ label: 'Return to lecturer', to: 'draft', note: true });
    }
    if (form.status === 'approved' && reviewerHere) actions.push({ label: 'Lock', to: 'locked' });
    if (form.status === 'locked' && hodHere) actions.push({ label: 'Unlock', to: 'approved', note: true });
  }

  // "Submit to HOD" (both institutions): a lecturer sends a complete sheet to the HOD of the department
  const canSubmit = !!form.id && isOwner && (form.status === 'draft' || (form.status === 'locked' && !institution?.uses_approval));
  const submitToHod = () => act({ label: 'Submit to HOD', to: 'submitted' });

  const openWorkflow = () =>
    sheet({
      header: `Status: ${form.status}`,
      buttons: [...actions.map((a) => ({ text: a.label, handler: () => { act(a); } })), { text: 'Cancel', role: 'cancel' as const }],
    });

  const exportAs = (kind: 'xlsx' | 'pdf' | 'docx') => {
    if (check.errors.length) { listProblems('Fix these before exporting', check.errors); return; }
    const run = async () => {
      const logo = institution ? await loadLogo(institution.code) : null;
      const data: ExportData = { form, facultyName, departmentName, students, logo };
      if (kind === 'xlsx') exportXlsx(data, scale);
      else if (kind === 'pdf') exportPdf(data, scale);
      else exportDocx(data, scale);
    };
    if (!check.incompleteRows) { void run(); return; }
    alert({
      header: 'Incomplete records',
      message:
        `${check.incompleteRows} record(s) have missing information. They will be highlighted in red in the output.\n\n` +
        check.incomplete.slice(0, 8).join('\n') + (check.incomplete.length > 8 ? `\n...and ${check.incomplete.length - 8} more` : ''),
      buttons: ['Cancel', { text: 'Export anyway', handler: () => { void run(); } }],
    });
  };

  const openExport = () =>
    sheet({
      header: 'Export / print result sheet',
      buttons: [
        { text: 'Excel (.xlsx)', handler: () => exportAs('xlsx') },
        { text: 'PDF (.pdf) - for printing', handler: () => exportAs('pdf') },
        { text: 'Word (.docx)', handler: () => exportAs('docx') },
        { text: 'Cancel', role: 'cancel' },
      ],
    });

  // ------------------------------------------------------------ render
  const text = (k: keyof SheetForm, label: string) => (
    <IonInput fill="outline" label={label} labelPlacement="stacked" value={String(form[k] ?? '')} disabled={locked}
      onIonInput={(e) => setF(k, String(e.detail.value ?? '') as never)} />
  );

  const sum = summary(students, scale);

  const matricCell = (s: StudentRow, i: number, bad: boolean) => {
    const p = parts[s.key] ?? splitMatric(fixed, s.matric_no);
    if (!p) {
      return (
        <input value={s.matric_no} disabled={locked} data-r={i} data-c={0} placeholder="Matric no"
          onChange={(e) => setCell(s.key, 'matric_no', e.target.value)}
          onBlur={() => lookup(s.key, s.matric_no)}
          onKeyDown={(e) => onCellKey(e, i, 0)} />
      );
    }
    const focus = (c: string | number) => document.querySelector<HTMLInputElement>(`input[data-r="${i}"][data-c="${c}"]`)?.focus();
    return (
      <div className={`mcell ${bad ? 'bad' : ''}`}>
        <input className="yy" maxLength={2} inputMode="numeric" placeholder="YY" value={p.yy} disabled={locked}
          data-r={i} data-c="y" title="Year (2 digits)"
          onChange={(e) => {
            const yy = e.target.value.replace(/\D/g, '').slice(0, 2);
            editParts(s.key, p, { yy });
            if (yy.length === 2) focus(fixed ? 'm' : 0);
          }} />
        {fixed && (
          <input className="mid" maxLength={codeLen + 1} inputMode="numeric" placeholder={fixed} value={p.mid} disabled={locked}
            data-r={i} data-c="m" title="Faculty code - leave empty to use the suggested one, or edit it"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, codeLen);
              editParts(s.key, p, { mid: digits ? `/${digits}` : '' });
              if (digits.length === codeLen) focus(0);
            }} />
        )}
        <input className="nnn" maxLength={3} inputMode="numeric" placeholder="000" value={p.nnn} disabled={locked}
          data-r={i} data-c={0} title="Last 3 digits"
          onChange={(e) => editParts(s.key, p, { nnn: e.target.value.replace(/\D/g, '').slice(0, 3) })}
          onKeyDown={(e) => onCellKey(e, i, 0)} />
      </div>
    );
  };

  return (
    <IonPage>
      <IonHeader>
        <DeptBanner />
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref="/sheets" /></IonButtons>
          <IonTitle>{form.course_code || 'New result sheet'}</IonTitle>
          <IonButtons slot="end">
            {dirty && <IonBadge color="warning">Unsaved</IonBadge>}
            <IonBadge color={STATUS_COLOR[form.status]}>{form.status}</IonBadge>
            {canSubmit && (
              <IonButton color="success" fill="solid" onClick={submitToHod}><IonIcon slot="start" icon={paperPlaneOutline} />Submit to HOD</IonButton>
            )}
            {actions.length > 0 && (
              <IonButton onClick={openWorkflow}><IonIcon slot="start" icon={gitBranchOutline} />{institution?.uses_approval ? 'Workflow' : form.status === 'locked' ? 'Open' : 'Lock'}</IonButton>
            )}
            <IonButton onClick={openExport}><IonIcon slot="start" icon={downloadOutline} />Export</IonButton>
            <IonButton fill="solid" onClick={save} disabled={saving || locked}>
              {saving ? <IonSpinner name="dots" /> : <><IonIcon slot="start" icon={saveOutline} />Save</>}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {loading ? (
          <div className="center-screen"><IonSpinner /></div>
        ) : loadErr ? (
          <IonText color="danger"><p className="pad">{loadErr}</p></IonText>
        ) : (
          <div className="editor">
            {locked && form.id && (
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                {isOwner ? `This sheet is ${form.status} and cannot be edited.` : `Read-only: this sheet belongs to ${ownerName || 'another lecturer'}.`}
                {ownerName && isOwner ? '' : ''}
              </p>
            )}
            <section className="card">
              <h3>Course details {ownerName && <span className="muted small">Owner: {ownerName}</span>}</h3>
              <div className="grid">
                <IonInput fill="outline" label="Faculty" labelPlacement="stacked" value={FACULTY_NAME} readonly />
                <IonInput fill="outline" label="Department" labelPlacement="stacked" value={DEPARTMENT_NAME} readonly />
                {text('academic_session', 'Academic session')}
                {text('course_code', 'Course code')}
                {text('course_title', 'Course title')}
                <IonSelect fill="outline" label="Semester" labelPlacement="stacked" value={form.semester} disabled={locked}
                  onIonChange={(e) => setF('semester', e.detail.value)}>
                  {['FIRST', 'SECOND', 'SUMMER'].map((s) => <IonSelectOption key={s} value={s}>{s}</IonSelectOption>)}
                </IonSelect>
                <IonSelect fill="outline" label="Level" labelPlacement="stacked" value={form.level} disabled={locked}
                  onIonChange={(e) => setF('level', e.detail.value)}>
                  {['100', '200', '300', '400', '500', '600'].map((s) => <IonSelectOption key={s} value={s}>{s}</IonSelectOption>)}
                </IonSelect>
                {text('credit_unit', 'Credit unit')}
                {text('examiners', 'Examiner(s)')}
                {text('hod', "Ag. HOD's name")}
                {text('released_to', 'Result released to department of')}
                {text('sign_date', 'Sign & date')}
                {text('result_title', 'Result title')}
                {text('matric_fixed', 'Faculty code in matric number (optional)')}
              </div>
              <p className="muted small">
                {fixed
                  ? `Matric numbers: type the 2-digit year, then the faculty code (suggested ${fixed} - leave it empty to use it, or type a different one), then the last 3 digits (e.g. 23${fixed}123).`
                  : 'No faculty code set - type full matric numbers, or enter the faculty code above (for example /095244) to have the year / code / 3-digit format checked.'}
              </p>
            </section>

            {(check.errors.length > 0 || check.incomplete.length > 0) && (
              <section className="card problems">
                {check.errors.length > 0 && (
                  <>
                    <h3 className="err">{check.errors.length} error(s) - fix before saving or exporting</h3>
                    <ul>{check.errors.slice(0, 60).map((m, i) => <li key={i}>{m}</li>)}</ul>
                  </>
                )}
                {check.incomplete.length > 0 && (
                  <>
                    <h3 className="warn">{check.incompleteRows} incomplete record(s) - shown in red (you can still save or export, but not submit)</h3>
                    <ul>{check.incomplete.slice(0, 60).map((m, i) => <li key={i}>{m}</li>)}</ul>
                  </>
                )}
              </section>
            )}

            <section className="card">
              <div className="row">
                <h3>
                  Students{' '}
                  <span className="muted small">
                    {sum.count} total - {sum.passed} pass - {sum.failed} fail{sum.incomplete ? ` - ${sum.incomplete} incomplete` : ''}
                  </span>
                </h3>
                <div>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx" hidden onChange={onImport} />
                  <IonButton fill="outline" size="small" disabled={locked} onClick={() => fileRef.current?.click()}>
                    <IonIcon slot="start" icon={cloudUploadOutline} />Import CSV / Excel
                  </IonButton>
                  <IonButton size="small" disabled={locked} onClick={addRow}>
                    <IonIcon slot="start" icon={addCircleOutline} />Add student
                  </IonButton>
                </div>
              </div>
              {students.length > 0 && (
                <div className="sheetsearch">
                  <IonSearchbar
                    value={q}
                    debounce={0}
                    placeholder="Search this result by script number or matric number"
                    inputmode="search"
                    onIonInput={(e) => setQ(String(e.detail.value ?? ''))}
                    onIonClear={() => setQ('')}
                  />
                  {q.trim() !== '' && (
                    <p className="muted small pad">
                      Showing {students.filter((x) => matchesStudent(x, q)).length} of {students.length} students
                    </p>
                  )}
                </div>
              )}
              <div className="tablewrap">
                <table className="results">
                  <thead>
                    <tr>
                      <th>S/NO</th>
                      {COLS.map((c) => <th key={c.key}>{c.label}</th>)}
                      <th>TOTAL</th><th>GRADE</th><th>STATUS</th><th>REMARKS</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => {
                      if (!matchesStudent(s, q)) return null;
                      const v = rowView(s, scale);
                      const ck = checkStudent(s, fixed);
                      const incomplete = ck.errors.length > 0 || ck.missing.length > 0;
                      const remark = [...ck.errors, ck.missing.length ? `Missing: ${ck.missing.map((m) => m.label).join(', ')}` : '']
                        .filter(Boolean).join(' ');
                      return (
                        <tr key={s.key} className={`${v.status === 'FAIL' ? 'fail' : ''} ${incomplete ? 'incomplete' : ''}`}>
                          <td className="c">{i + 1}</td>
                          {COLS.map((c, ci) => (
                            <td key={c.key}
                              className={`${c.cls ?? ''} ${ck.badKeys.has(c.key) ? 'miss' : ''} ${c.key === 'name' && registered[s.key] ? 'reg' : ''}`}
                              title={c.key === 'name' && registered[s.key] ? 'Found in the student registry' : undefined}>
                              {c.key === 'matric_no' ? matricCell(s, i, ck.badKeys.has('matric_no')) : (
                                <input value={s[c.key]} disabled={locked} data-r={i} data-c={ci}
                                  inputMode={c.key === 'ca' || c.key === 'exam' ? 'decimal' : 'text'}
                                  onChange={(e) => setCell(s.key, c.key, e.target.value)}
                                  onKeyDown={(e) => onCellKey(e, i, ci)} />
                              )}
                            </td>
                          ))}
                          <td className="c">{v.total === null ? '' : fmt(v.total)}</td>
                          <td className="c">{v.grade}</td>
                          <td className="c">{v.status}</td>
                          <td className="remark">{remark}</td>
                          <td className="c">
                            <IonButton fill="clear" size="small" color="danger" disabled={locked} onClick={() => delRow(s, i + 1)}>
                              <IonIcon icon={trashOutline} />
                            </IonButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!students.length && <p className="muted pad">No students yet - add a row or import a CSV/Excel file.</p>}
                {students.length > 0 && q.trim() !== '' && !students.some((x) => matchesStudent(x, q)) && (
                  <p className="muted pad">No student with that script number or matric number.</p>
                )}
              </div>
            </section>

            {form.id && (
              <section className="card">
                <h3>History <span className="muted small">who did what, and when</span></h3>
                {audit.length === 0 ? <p className="muted small">No history yet.</p> : (
                  <ul className="history">
                    {audit.map((h) => (
                      <li key={h.id}>
                        <b>{new Date(h.at).toLocaleString()}</b> - {h.actor_name || 'Unknown user'}: {describeAudit(h)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default SheetEditor;
