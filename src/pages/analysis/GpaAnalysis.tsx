import React, { useEffect, useState } from 'react';
import { IonButton, IonInput, IonSelect, IonSelectOption } from '@ionic/react';
import { AnalysisShell } from '../../components/AnalysisShell';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useAnalysisData } from '../../lib/analysisData';
import { classify, inTerm, sessionsOf, studentTerms } from '../../lib/analysis';
import { SemesterSelect, SessionSelect } from './pickers';

const WITHDRAWAL = 'Withdrawal List';
const CARRYOVER = 'Carryover List';

/** "GPA" button: semester GPA of every student (only the chosen session and semester), classified for the university. */
const GpaAnalysis: React.FC = () => {
  const { scale, institution, session: auth, departmentId } = useAuth();
  const { rows, classes, loading, error, reload } = useAnalysisData();
  const sessions = sessionsOf(rows);
  const [session, setSession] = useState('');
  const [semester, setSemester] = useState('FIRST');
  const [level, setLevel] = useState('');
  const [code, setCode] = useState('');
  const [segment, setSegment] = useState('All');
  useEffect(() => { if (sessions.length && !sessions.includes(session)) setSession(sessions[0]); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const term = inTerm(rows, session, semester);
  const levels = [...new Set(term.map((r) => r.level))].sort();
  const classNames = [...classes].sort((a, b) => b.min_cgpa - a.min_cgpa).map((c) => c.name);
  // UNICAL: the HOD of the department sets the withdrawal GPA. Otherwise the university's own value is used.
  const hodSets = !!institution?.hod_sets_withdrawal;
  const [deptBelow, setDeptBelow] = useState<number | null>(null);
  const [belowInput, setBelowInput] = useState('');
  const [belowMsg, setBelowMsg] = useState('');
  useEffect(() => {
    if (!hodSets || !departmentId) return;
    supabase.from('department_settings').select('withdrawal_below_gpa').eq('department_id', departmentId).maybeSingle().then(({ data }) => {
      const v = data ? Number(data.withdrawal_below_gpa) : null;
      setDeptBelow(v);
      setBelowInput(String(v ?? institution?.withdrawal_below_gpa ?? 1));
    });
  }, [hodSets, departmentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const withdrawBelow = hodSets && deptBelow !== null ? deptBelow : (institution?.withdrawal_below_gpa ?? 1);
  const saveBelow = async () => {
    const n = Number(belowInput);
    if (belowInput.trim() === '' || !Number.isFinite(n) || n < 0 || n > 5) { setBelowMsg('Enter a GPA between 0 and 5.'); return; }
    const { error: e } = await supabase.from('department_settings')
      .upsert({ department_id: departmentId, withdrawal_below_gpa: n, updated_by: auth?.user.id, updated_at: new Date().toISOString() });
    if (e) { setBelowMsg(e.message); return; }
    setDeptBelow(n);
    setBelowMsg('Saved.');
  };
  const all = classify(studentTerms(term, scale), classes, withdrawBelow);
  const wanted = code.trim().toUpperCase();
  const filtered = all.filter((s) => (!level || s.level === level) && (!wanted || s.courses.some((c) => c.code === wanted)));

  const inSegment = (s: (typeof all)[number], seg: string) =>
    seg === 'All' ? true : seg === WITHDRAWAL ? s.withdrawal : seg === CARRYOVER ? s.carryover : s.cls === seg;
  const segments = ['All', ...classNames, WITHDRAWAL, CARRYOVER];
  const shown = filtered.filter((s) => inSegment(s, segment));

  return (
    <AnalysisShell title="GPA analysis" subtitle={`${session} - ${semester} semester${level ? ` - ${level} level` : ''}${wanted ? ` - ${wanted}` : ''}`}
      loading={loading} error={error} onReload={reload}>
      <section className="card">
        <div className="grid no-print">
          <SessionSelect sessions={sessions} value={session} onChange={setSession} />
          <SemesterSelect value={semester} onChange={setSemester} />
          <IonSelect fill="outline" label="Level" labelPlacement="stacked" value={level} onIonChange={(e) => setLevel(String(e.detail.value ?? ''))}>
            <IonSelectOption value="">All levels</IonSelectOption>
            {levels.map((l) => <IonSelectOption key={l} value={l}>{l} level</IonSelectOption>)}
          </IonSelect>
          <IonInput fill="outline" label="Course code (optional)" labelPlacement="stacked" placeholder="e.g. IFT238" value={code}
            onIonInput={(e) => setCode(String(e.detail.value ?? '').toUpperCase())} />
        </div>
        {hodSets && (
          <div className="grid no-print" style={{ marginBottom: 8 }}>
            <IonInput fill="outline" type="number" label="Withdrawal GPA (set by the HOD)" labelPlacement="stacked" value={belowInput}
              onIonInput={(e) => { setBelowInput(String(e.detail.value ?? '')); setBelowMsg(''); }} />
            <div><IonButton onClick={saveBelow}>Save withdrawal GPA</IonButton> <span className="muted small">{belowMsg}</span></div>
          </div>
        )}
        <p className="muted small">
          GPA = total grade points / total credit hours, using only the results submitted for this session and semester.
          Any F puts a student on the carryover list; a GPA below {withdrawBelow.toFixed(2)} puts a student on the withdrawal list
          {hodSets ? ' (set by the HOD of this department)' : ''}.
        </p>
        <div className="segments no-print">
          {segments.map((s) => (
            <IonButton key={s} size="small" fill={segment === s ? 'solid' : 'outline'} onClick={() => setSegment(s)}>
              {s} ({filtered.filter((x) => inSegment(x, s)).length})
            </IonButton>
          ))}
        </div>
        <h3 className="print-only">{segment}</h3>
        {all.length === 0 ? <p className="muted pad">No submitted results for this session and semester.</p>
          : shown.length === 0 ? <p className="muted pad">No students in this list.</p> : (
            <div className="tablewrap">
              <table className="results">
                <thead>
                  <tr><th>#</th><th>Matric No</th><th>Name</th><th>Level</th><th>TCH</th><th>TGP</th><th>GPA</th><th>Classification</th><th>Carryover courses</th>{wanted && <th>{wanted}</th>}</tr>
                </thead>
                <tbody>
                  {shown.map((s, i) => (
                    <tr key={s.key} className={s.carryover || s.withdrawal ? 'fail' : ''}>
                      <td className="c">{i + 1}</td><td style={{ padding: '2px 6px' }}>{s.matric}</td><td style={{ padding: '2px 6px' }}>{s.name}</td>
                      <td className="c">{s.level}</td><td className="c">{s.tch}</td><td className="c">{s.tgp}</td>
                      <td className="c"><b>{s.gpa === null ? '' : s.gpa.toFixed(2)}</b></td>
                      <td className="c">{[s.cls, s.withdrawal ? WITHDRAWAL : '', s.carryover ? CARRYOVER : ''].filter(Boolean).join(' / ')}</td>
                      <td className="c">{s.failed.join(', ')}</td>
                      {wanted && <td className="c">{(() => { const c = s.courses.find((x) => x.code === wanted); return c ? `${c.score} ${c.grade}` : ''; })()}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </AnalysisShell>
  );
};

export default GpaAnalysis;
