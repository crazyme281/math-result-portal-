import React, { useState } from 'react';
import { IonInput } from '@ionic/react';
import { AnalysisShell } from '../../components/AnalysisShell';
import { PieChart, gradeColor } from '../../components/Charts';
import { useAuth } from '../../lib/auth';
import { useAnalysisData } from '../../lib/analysisData';
import { gradeCounts, passFail, sessionsOf } from '../../lib/analysis';
import { SessionSelect } from './pickers';

/** "Courses" button: type a course code to see the grades A to F of every submitted result for that course. */
const CoursePie: React.FC = () => {
  const { scale } = useAuth();
  const { rows, loading, error, reload } = useAnalysisData();
  const [code, setCode] = useState('');
  const [session, setSession] = useState('');
  const wanted = code.trim().toUpperCase();
  const list = rows.filter((r) => r.code.toUpperCase() === wanted && (!session || r.session === session));
  const counts = gradeCounts(list, scale);
  const pf = passFail(list, scale);
  const known = [...new Set(rows.map((r) => r.code.toUpperCase()))].sort();
  const title = list[0]?.title;
  return (
    <AnalysisShell title="Courses - grade distribution" subtitle={wanted ? `${wanted}${title ? ` - ${title}` : ''} (${session || 'all sessions'})` : undefined}
      loading={loading} error={error} onReload={reload}>
      <section className="card">
        <div className="grid no-print">
          <IonInput fill="outline" label="Course code" labelPlacement="stacked" placeholder="e.g. IFT238" value={code}
            onIonInput={(e) => setCode(String(e.detail.value ?? '').toUpperCase())} />
          <SessionSelect sessions={sessionsOf(rows)} value={session} onChange={setSession} all />
        </div>
        {!wanted ? (
          <p className="muted small">Enter a course code.{known.length ? ` Courses with submitted results: ${known.slice(0, 14).join(', ')}${known.length > 14 ? ', ...' : ''}` : ''}</p>
        ) : pf.total === 0 ? (
          <p className="muted pad">No submitted results for {wanted}{session ? ` in ${session}` : ''}.</p>
        ) : (
          <>
            <p><b>{wanted}</b>{title ? ` - ${title}` : ''}: {pf.total} students, {pf.passPct}% passed, {pf.failPct}% failed.</p>
            <PieChart data={counts.map((c) => ({ label: c.grade, value: c.count, color: gradeColor(c.grade) }))} />
          </>
        )}
      </section>
    </AnalysisShell>
  );
};

export default CoursePie;
