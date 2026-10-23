import React, { useState } from 'react';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonPage, IonSelect, IonSelectOption, IonText, IonTitle, IonToolbar,
  useIonAlert, useIonToast, useIonViewWillEnter,
} from '@ionic/react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Role } from '../lib/types';
import { DeptBanner } from '../components/DeptBanner';
import { DEPARTMENT_TITLE } from '../lib/config';

interface UserRow { id: string; full_name: string | null; email: string; role: Role; faculty_id: string | null; department_id: string | null }

const ROLES: { value: Role; label: string }[] = [
  { value: 'lecturer', label: 'Lecturer' },
  { value: 'exam_officer', label: 'Exam officer' },
  { value: 'hod', label: 'HOD of Mathematics' },
  { value: 'hod_setup', label: 'Default HOD login' },
  { value: 'admin', label: 'Administrator' },
];

/** Administration: who is a lecturer, exam officer, HOD or administrator of the Department of Mathematics. */
const Admin: React.FC = () => {
  const { role, session } = useAuth();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [edits, setEdits] = useState<Record<string, Role>>({});

  const say = (message: string, color: 'success' | 'danger' = 'success') => toast({ message, duration: 2500, color });

  const load = async () => {
    const u = await supabase.rpc('admin_list_users');
    if (u.error) say(u.error.message, 'danger'); else setUsers((u.data ?? []) as UserRow[]);
    setEdits({});
  };
  useIonViewWillEnter(() => { load(); });

  const header = (
    <IonHeader>
      <DeptBanner />
      <IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/sheets" /></IonButtons><IonTitle>Administration</IonTitle></IonToolbar>
    </IonHeader>
  );

  if (role !== 'admin') {
    return <IonPage>{header}<IonContent><p className="pad muted">Administrators only.</p></IonContent></IonPage>;
  }

  const saveUser = async (u: UserRow) => {
    const newRole = edits[u.id];
    if (!newRole) return;
    const { error } = await supabase.rpc('admin_set_user', { p_user: u.id, p_role: newRole });
    if (error) { alert({ header: 'Not saved', message: error.message, buttons: ['OK'] }); return; }
    say('User updated.'); load();
  };

  return (
    <IonPage>
      {header}
      <IonContent>
        <div className="editor">
          <section className="card">
            <h3>Users of the {DEPARTMENT_TITLE}</h3>
            <p className="muted small">
              Roles are assigned here only. An HOD or exam officer is always of the {DEPARTMENT_TITLE}, and the department can have one HOD.
              Administrator accounts are not created here or by registration: they are provisioned directly in the database.
            </p>
            <div className="tablewrap">
              <table className="results">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
                <tbody>
                  {users.map((u) => {
                    const current = edits[u.id] ?? u.role;
                    const self = u.id === session?.user.id || u.role === 'hod_setup';
                    return (
                      <tr key={u.id}>
                        <td style={{ padding: '4px 8px' }}>{u.full_name || '(no name)'}</td>
                        <td style={{ padding: '4px 8px' }}>{u.email}</td>
                        <td style={{ padding: '4px 8px' }}>
                          <IonSelect value={current} disabled={self} interface="popover"
                            onIonChange={(ev) => setEdits((p) => ({ ...p, [u.id]: ev.detail.value }))}>
                            {ROLES.filter((r) => r.value !== 'hod_setup' || current === 'hod_setup').map((r) => <IonSelectOption key={r.value} value={r.value}>{r.label}</IonSelectOption>)}
                          </IonSelect>
                        </td>
                        <td className="c"><IonButton size="small" disabled={current === u.role || self} onClick={() => saveUser(u)}>Save</IonButton></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <IonText className="muted small"><p>Grading scales and class-of-degree bands are changed only in the database, because changing them alters every grade.</p></IonText>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Admin;
