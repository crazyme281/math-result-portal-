import React, { useEffect, useState } from 'react';
import { IonSelect, IonSelectOption } from '@ionic/react';
import { AnalysisShell } from '../../components/AnalysisShell';
import { useAuth } from '../../lib/auth';
import { useAnalysisData } from '../../lib/analysisData';
import { defaultFinalLevel, graduationList, sessionsOf } from '../../lib/analysis';
import { SessionSelect } from './pickers';

/** "Graduation List" button: final-year students of a session who have no F in their final-year results. */
const GraduationPage: React.FC = () => {
  const { scale } = useAuth();
  const { rows, classes, loading, error, reload } = useAnalysisData();
  const sessions = sessionsOf(rows);
  const [session, setSession] = useState('');
  const [finalLevel, setFinalLevel] = useState('');
  useEffect(() => { if (sessions.length && !sessions.includes(session)) setSession(sessions[0]); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (session) setFinalLevel(defaultFinalLevel(rows, session)); }, [session, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const levels = [...new Set(rows.filter((r) => r.session === session).map((r) => r.level))].sort();
  const g = graduationList(rows, session, finalLevel, scale, classes);
  const head = (carry: boolean) => (
    <thead><tr><th>#</th><th>Matric No</th><th>Name</th><th>TCH</th><th>CGPA</th><th>Class</th>{carry && <th>Outstanding carryover courses</th>}</tr></thead>
  );
  const body = (list: typeof g.eligible, carry: boolean) => (
    <tbody>
      {list.map((s, i) => (
        <tr key={s.key}>
          <td className="c">{i + 1}</td><td style={{ padding: '2px 6px' }}>{s.matric}</td><td style={{ padding: '2px 6px' }}>{s.name}</td>
          <td className="c">{s.tch}</td><td className="c"><b>{s.cgpa === null ? '' : s.cgpa.toFixed(2)}</b></td><td className="c">{s.cls}</td>
          {carry && <td style={{ padding: '2px 6px', color: '#c62828' }}>{s.carryovers.map((c) => `${c.code} (${c.level} level, ${c.session})`).join('; ')}</td>}
        </tr>
      ))}
    </tbody>
  );

  return (
    <AnalysisShell title="Graduation list" subtitle={`${session} session - ${finalLevel} level (final year)`} loading={loading} error={error} onReload={reload}>
      <section className="card">
        <div className="grid no-print">
          <SessionSelect sessions={sessions} value={session} onChange={setSession} label="Session (final year)" />
          <IonSelect fill="outline" label="Final-year level" labelPlacement="stacked" value={finalLevel} onIonChange={(e) => setFinalLevel(String(e.detail.value ?? ''))}>
            {levels.map((l) => <IonSelectOption key={l} value={l}>{l} level</IonSelectOption>)}
          </IonSelect>
        </div>
        <p className="muted small">
          Students with an F in any final-year course are left out ({g.excluded} left out). CGPA counts every submitted result
          up to this session, each course once (a later pass replaces an earlier F). Best CGPA first.
        </p>
        {!sessions.length ? <p className="muted pad">No results have been submitted yet.</p> : (
          <>
            <h3>Graduation list <span className="muted small">{g.eligible.length} student(s), no outstanding carryover</span></h3>
            {g.eligible.length === 0 ? <p className="muted pad">No student qualifies yet.</p> : (
              <div className="tablewrap"><table className="results">{head(false)}{body(g.eligible, false)}</table></div>
            )}
            <h3 style={{ marginTop: 16 }}>Passed the final year but with outstanding carryover courses <span className="muted small">{g.withCarryover.length} student(s)</span></h3>
            {g.withCarryover.length === 0 ? <p className="muted pad">None.</p> : (
              <div className="tablewrap"><table className="results">{head(true)}{body(g.withCarryover, true)}</table></div>
            )}
          </>
        )}
      </section>
    </AnalysisShell>
  );
};

export default GraduationPage;
