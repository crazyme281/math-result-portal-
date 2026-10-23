import React, { useState } from 'react';
import { AnalysisShell } from '../../components/AnalysisShell';
import { useAuth } from '../../lib/auth';
import { useAnalysisData } from '../../lib/analysisData';
import { courseSummaries, sessionsOf } from '../../lib/analysis';
import { SemesterSelect, SessionSelect } from './pickers';

/** "Course" button: pass and fail rate of every course of the department. */
const CourseList: React.FC = () => {
  const { scale } = useAuth();
  const { rows, loading, error, reload } = useAnalysisData();
  const [session, setSession] = useState('');
  const [semester, setSemester] = useState('');
  const list = rows.filter((r) => (!session || r.session === session) && (!semester || r.semester === semester));
  const courses = courseSummaries(list, scale);
  const grades = courses[0]?.counts.map((c) => c.grade) ?? [];
  return (
    <AnalysisShell title="Course analysis" subtitle={`${session || 'All sessions'} - ${semester ? `${semester} semester` : 'both semesters'}`}
      loading={loading} error={error} onReload={reload}>
      <section className="card">
        <div className="grid no-print">
          <SessionSelect sessions={sessionsOf(rows)} value={session} onChange={setSession} all />
          <SemesterSelect value={semester} onChange={setSemester} all />
        </div>
        {courses.length === 0 ? <p className="muted pad">No submitted results for this selection.</p> : (
          <div className="tablewrap">
            <table className="results">
              <thead>
                <tr><th>Course</th><th>Title</th><th>Students</th><th>Average</th>{grades.map((g) => <th key={g}>{g}</th>)}<th>Pass %</th><th>Fail %</th></tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.code}>
                    <td className="c">{c.code}</td><td style={{ padding: '2px 6px' }}>{c.title}</td><td className="c">{c.students}</td><td className="c">{c.average}</td>
                    {c.counts.map((g) => <td key={g.grade} className="c">{g.count}</td>)}
                    <td className="c">{c.passPct}%</td><td className="c" style={{ color: c.failPct > 0 ? '#c62828' : undefined }}>{c.failPct}%</td>
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

export default CourseList;
