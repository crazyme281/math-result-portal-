import React, { useState } from 'react';
import {
  IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage,
  IonSearchbar, IonSegment, IonSegmentButton, IonTitle, IonToolbar, IonBadge, useIonAlert, useIonViewWillEnter, IonText,
} from '@ionic/react';
import { add, logOutOutline, peopleOutline, personCircleOutline, statsChartOutline, trashOutline } from 'ionicons/icons';
import { InstitutionLogo } from '../components/InstitutionLogo';
import { DeptBanner } from '../components/DeptBanner';
import { useHistory } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

interface Row {
  id: string; owner_id: string; course_code: string; course_title: string; academic_session: string; level: string;
  semester: string; status: string; updated_at: string;
  departments: { name: string } | null; profiles: { full_name: string | null } | null;
}

const STATUS_COLOR: Record<string, string> = { draft: 'medium', submitted: 'warning', approved: 'success', locked: 'dark' };

const Sheets: React.FC = () => {
  const history = useHistory();
  const { signOut, session, institution, role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'mine' | 'department'>('mine');
  const [err, setErr] = useState('');
  const [alert] = useIonAlert();
  const me = session?.user.id ?? '';
  const reviewer = role === 'hod' || role === 'exam_officer';

  const load = async () => {
    const { data, error } = await supabase
      .from('result_sheets')
      .select('id,owner_id,course_code,course_title,academic_session,level,semester,status,updated_at,departments(name),profiles(full_name)')
      .order('updated_at', { ascending: false });
    if (error) setErr(error.message);
    else { setErr(''); setRows((data ?? []) as unknown as Row[]); }
  };
  useIonViewWillEnter(() => { load(); });

  const remove = (r: Row) =>
    alert({
      header: 'Delete sheet?',
      message: `${r.course_code} - ${r.course_title} will be deleted permanently.`,
      buttons: [
        'Cancel',
        { text: 'Delete', role: 'destructive', handler: async () => {
          const { error } = await supabase.from('result_sheets').delete().eq('id', r.id);
          if (error) setErr(error.message); else load();
        } },
      ],
    });

  const term = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => !reviewer || view === 'department' || r.owner_id === me)
    .filter((r) => !term || [r.course_code, r.course_title, r.academic_session, r.profiles?.full_name ?? '']
      .some((v) => v.toLowerCase().includes(term)));

  return (
    <IonPage>
      <IonHeader>
        <DeptBanner />
        <IonToolbar>
          <IonTitle>ResultDesk</IonTitle>
          <IonButtons slot="end">
            <IonText className="muted small">{session?.user.email}{role !== 'lecturer' ? ` (${role.replace('_', ' ')})` : ''}</IonText>
            <InstitutionLogo code={institution?.code} />
            {role === 'hod' && (
              <IonButton onClick={() => history.push('/analysis')}><IonIcon slot="start" icon={statsChartOutline} />Student Performance Analysis</IonButton>
            )}
            {role === 'admin' && (
              <IonButton onClick={() => history.push('/admin')}><IonIcon slot="start" icon={peopleOutline} />Admin</IonButton>
            )}
            <IonButton onClick={() => history.push('/profile')}><IonIcon slot="start" icon={personCircleOutline} />Profile</IonButton>
            <IonButton onClick={signOut}><IonIcon slot="start" icon={logOutOutline} />Log out</IonButton>
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar placeholder="Search course, lecturer or session" value={q}
            onIonInput={(e) => setQ(String(e.detail.value ?? ''))} />
        </IonToolbar>
        {reviewer && (
          <IonToolbar>
            <IonSegment value={view} onIonChange={(e) => setView(e.detail.value as 'mine' | 'department')}>
              <IonSegmentButton value="mine"><IonLabel>My sheets</IonLabel></IonSegmentButton>
              <IonSegmentButton value="department"><IonLabel>Department of Mathematics</IonLabel></IonSegmentButton>
            </IonSegment>
          </IonToolbar>
        )}
      </IonHeader>
      <IonContent>
        {err && <IonText color="danger"><p className="pad">{err}</p></IonText>}
        <IonList>
          {shown.map((r) => (
            <IonItem key={r.id} button detail onClick={() => history.push(`/sheet/${r.id}`)}>
              <IonLabel>
                <h2>{r.course_code} - {r.course_title}</h2>
                <p>
                  {r.academic_session} - {r.level} level - {r.semester} semester
                  {r.owner_id !== me && r.profiles?.full_name ? ` - by ${r.profiles.full_name}` : ''}
                </p>
              </IonLabel>
              <IonBadge color={STATUS_COLOR[r.status] ?? 'medium'} slot="end">{r.status}</IonBadge>
              {r.status === 'draft' && r.owner_id === me && (
                <IonButton slot="end" fill="clear" color="danger" onClick={(e) => { e.stopPropagation(); remove(r); }}>
                  <IonIcon icon={trashOutline} />
                </IonButton>
              )}
            </IonItem>
          ))}
        </IonList>
        {!shown.length && !err && <p className="muted pad">No result sheets yet. Tap + to create one.</p>}
        <IonFab slot="fixed" vertical="bottom" horizontal="end">
          <IonFabButton onClick={() => history.push('/sheet/new')}><IonIcon icon={add} /></IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default Sheets;
