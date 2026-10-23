import React, { useEffect, useState } from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { barChartOutline, bookOutline, calculatorOutline, listOutline, ribbonOutline } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { AnalysisShell } from '../../components/AnalysisShell';
import { useAuth } from '../../lib/auth';
import { useAnalysisData } from '../../lib/analysisData';
import { courseSummaries, inTerm, passFail, sessionsOf } from '../../lib/analysis';
import { SemesterSelect, SessionSelect } from './pickers';

/** Student Performance Analysis: semester pass / fail report plus the five analysis buttons. */
const AnalysisHome: React.FC = () => {
  const history = useHistory();
  const { scale } = useAuth();
  const { rows, loading, error, reload } = useAnalysisData();
  const sessions = sessionsOf(rows);
  const [session, setSession] = useState('');
  const [semester, setSemester] = useState('FIRST');

  useEffect(() => {
    if (!sessions.length || sessions.includes(session)) return;
    const s = sessions[0];
    setSession(s);
    setSemester(rows.some((r) => r.session === s && r.semester === 'SECOND') ? 'SECOND' : 'FIRST');
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const term = inTerm(rows, session, semester);
  const pf = passFail(term, scale);
  const courses = courseSummaries(term, scale);

  const buttons = [
    { label: 'Course', to: '/analysis/course', icon: bookOutline, hint: 'Pass and fail rate of every course' },
    { label: 'Semester', to: '/analysis/semester', icon: barChartOutline, hint: 'Grades of all courses of a semester' },
    { label: 'GPA', to: '/analysis/gpa', icon: calculatorOutline, hint: 'Student GPA and classification' },
    { label: 'Graduation List', to: '/analysis/graduation', icon: ribbonOutline, hint: 'Final-year students, best first' },
    { label: 'Courses', to: '/analysis/courses', icon: listOutline, hint: 'Pie chart for one course code' },
  ];

  return (
    <AnalysisShell title="Student Performance Analysis" subtitle={session ? `${session} - ${semester} semester` : undefined}
      back="/sheets" loading={loading} error={error} onReload={reload}>
      <section className="card no-print">
        <h3>Analysis</h3>
        <div className="analysis-buttons">
          {buttons.map((b) => (
            <IonButton key={b.label} size="large" onClick={() => history.push(b.to)} title={b.hint}>
              <IonIcon slot="start" icon={b.icon} />{b.label}
            </IonButton>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Semester report - pass and failure rate</h3>
        <div className="grid no-print">
          <SessionSelect sessions={sessions} value={session} onChange={setSession} />
          <SemesterSelect value={semester} onChange={setSemester} />
        </div>
        {!sessions.length ? (
          <p className="muted pad">No results have been submitted to you yet. Lecturers use "Submit to HOD" on their sheets.</p>
        ) : pf.total === 0 ? (
          <p className="muted pad">No submitted results for {session}, {semester.toLowerCase()} semester.</p>
        ) : (
          <>
            <div className="stat-row">
              <div className="stat"><b>{courses.length}</b><span>courses</span></div>
              <div className="stat"><b>{pf.total}</b><span>results</span></div>
              <div className="stat good"><b>{pf.passPct}%</b><span>passed ({pf.pass})</span></div>
              <div className="stat bad"><b>{pf.failPct}%</b><span>failed ({pf.fail})</span></div>
            </div>
            <div className="ratebar" aria-label="pass and fail">
              <div style={{ width: `${pf.passPct}%`, background: '#2e7d32' }}>{pf.passPct > 8 ? `${pf.passPct}% pass` : ''}</div>
              <div style={{ width: `${pf.failPct}%`, background: '#c62828' }}>{pf.failPct > 8 ? `${pf.failPct}% fail` : ''}</div>
            </div>
            <div className="tablewrap">
              <table className="results">
                <thead><tr><th>Course</th><th>Title</th><th>CH</th><th>Students</th><th>Passed</th><th>Failed</th><th>Pass %</th><th>Fail %</th></tr></thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.code}>
                      <td className="c">{c.code}</td><td style={{ padding: '2px 6px' }}>{c.title}</td><td className="c">{c.credit}</td>
                      <td className="c">{c.students}</td><td className="c">{c.pass}</td><td className="c">{c.fail}</td>
                      <td className="c">{c.passPct}%</td><td className="c" style={{ color: c.failPct > 0 ? '#c62828' : undefined }}>{c.failPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </AnalysisShell>
  );
};

export default AnalysisHome;
