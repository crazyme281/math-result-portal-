import React, { useEffect, useState } from 'react';
import { AnalysisShell } from '../../components/AnalysisShell';
import { StackedBars, gradeColor } from '../../components/Charts';
import { useAuth } from '../../lib/auth';
import { useAnalysisData } from '../../lib/analysisData';
import { courseSummaries, inTerm, passFail, sessionsOf } from '../../lib/analysis';
import { SemesterSelect, SessionSelect } from './pickers';

/** "Semester" button: every course of the chosen semester and session in one bar chart. */
const SemesterBars: React.FC = () => {
  const { scale } = useAuth();
  const { rows, loading, error, reload } = useAnalysisData();
  const sessions = sessionsOf(rows);
  const [session, setSession] = useState('');
  const [semester, setSemester] = useState('FIRST');
  useEffect(() => { if (sessions.length && !sessions.includes(session)) setSession(sessions[0]); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const term = inTerm(rows, session, semester);
  const courses = courseSummaries(term, scale);
  const pf = passFail(term, scale);
  const grades = courses[0]?.counts.map((c) => c.grade) ?? [];
  return (
    <AnalysisShell title="Semester analysis" subtitle={`${session} - ${semester} semester`} loading={loading} error={error} onReload={reload}>
      <section className="card">
        <div className="grid no-print">
          <SemesterSelect value={semester} onChange={setSemester} />
          <SessionSelect sessions={sessions} value={session} onChange={setSession} />
        </div>
        {courses.length === 0 ? <p className="muted pad">No submitted results for this semester and session.</p> : (
          <>
            <p><b>{courses.length}</b> courses, <b>{pf.total}</b> results: {pf.passPct}% passed, {pf.failPct}% failed.</p>
            <StackedBars yLabel="Students" keys={grades.map((g) => ({ key: g, color: gradeColor(g) }))}
              items={courses.map((c) => ({ label: c.code, parts: c.counts.map((g) => ({ key: g.grade, value: g.count })) }))} />
            <div className="tablewrap" style={{ marginTop: 12 }}>
              <table className="results">
                <thead><tr><th>Course</th><th>Students</th><th>Average</th>{grades.map((g) => <th key={g}>{g}</th>)}<th>Pass %</th><th>Fail %</th></tr></thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.code}>
                      <td className="c">{c.code}</td><td className="c">{c.students}</td><td className="c">{c.average}</td>
                      {c.counts.map((g) => <td key={g.grade} className="c">{g.count} ({g.pct}%)</td>)}
                      <td className="c">{c.passPct}%</td><td className="c">{c.failPct}%</td>
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

export default SemesterBars;
