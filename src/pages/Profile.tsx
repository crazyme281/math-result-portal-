import React, { useState } from 'react';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonInput, IonInputPasswordToggle, IonPage, IonSpinner, IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import { useAuth } from '../lib/auth';
import { DeptBanner } from '../components/DeptBanner';
import { DEPARTMENT_TITLE, UNIVERSITY_NAME } from '../lib/config';

const LABEL: Record<string, string> = { lecturer: 'Lecturer', exam_officer: 'Exam officer', hod: 'Head of Department of Mathematics', admin: 'Administrator', hod_setup: 'Default HOD login' };

/** My profile: change my email address and password at any time (lecturers, HODs, exam officers, administrators). */
const Profile: React.FC = () => {
  const { session, role, changePassword, changeEmail } = useAuth();
  const [cur1, setCur1] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [cur2, setCur2] = useState(''); const [email, setEmail] = useState('');
  const [msg1, setMsg1] = useState<{ ok: boolean; text: string } | null>(null);
  const [msg2, setMsg2] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');

  const savePassword = async () => {
    setMsg1(null);
    if (!cur1) { setMsg1({ ok: false, text: 'Enter your current password.' }); return; }
    if (pw.length < 8) { setMsg1({ ok: false, text: 'The new password must be at least 8 characters.' }); return; }
    if (pw !== pw2) { setMsg1({ ok: false, text: 'The two new passwords do not match.' }); return; }
    setBusy('pw');
    const err = await changePassword(cur1, pw);
    setBusy('');
    if (err) setMsg1({ ok: false, text: err });
    else { setMsg1({ ok: true, text: 'Password changed.' }); setCur1(''); setPw(''); setPw2(''); }
  };
  const saveEmail = async () => {
    setMsg2(null);
    if (!cur2) { setMsg2({ ok: false, text: 'Enter your current password.' }); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setMsg2({ ok: false, text: 'Enter a valid email address.' }); return; }
    setBusy('email');
    const err = await changeEmail(cur2, email.trim());
    setBusy('');
    if (err) setMsg2({ ok: false, text: err });
    else { setMsg2({ ok: true, text: 'Email address changed. Use it the next time you log in.' }); setCur2(''); setEmail(''); }
  };

  return (
    <IonPage>
      <IonHeader>
        <DeptBanner />
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref="/sheets" /></IonButtons>
          <IonTitle>My profile</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="editor" style={{ maxWidth: 720 }}>
          <section className="card">
            <h3>Account</h3>
            <p style={{ margin: 0 }}><b>Email:</b> {session?.user.email}</p>
            <p style={{ margin: '4px 0' }}><b>Role:</b> {LABEL[role] ?? role}</p>
            <p style={{ margin: 0 }}><b>Department:</b> {DEPARTMENT_TITLE}, {UNIVERSITY_NAME}</p>
          </section>

          <section className="card">
            <h3>Change password</h3>
            <div className="stack">
              <IonInput fill="outline" type="password" label="Current password" labelPlacement="stacked" value={cur1} onIonInput={(e) => setCur1(String(e.detail.value ?? ''))}><IonInputPasswordToggle slot="end" /></IonInput>
              <IonInput fill="outline" type="password" label="New password" labelPlacement="stacked" value={pw} onIonInput={(e) => setPw(String(e.detail.value ?? ''))}><IonInputPasswordToggle slot="end" /></IonInput>
              <IonInput fill="outline" type="password" label="Confirm new password" labelPlacement="stacked" value={pw2} onIonInput={(e) => setPw2(String(e.detail.value ?? ''))}><IonInputPasswordToggle slot="end" /></IonInput>
            </div>
            {msg1 && <IonText color={msg1.ok ? 'success' : 'danger'}><p>{msg1.text}</p></IonText>}
            <IonButton onClick={savePassword} disabled={busy === 'pw'}>{busy === 'pw' ? <IonSpinner name="dots" /> : 'Change password'}</IonButton>
          </section>

          <section className="card">
            <h3>Change email address</h3>
            <div className="stack">
              <IonInput fill="outline" type="email" label="New email address" labelPlacement="stacked" value={email} onIonInput={(e) => setEmail(String(e.detail.value ?? ''))} />
              <IonInput fill="outline" type="password" label="Current password" labelPlacement="stacked" value={cur2} onIonInput={(e) => setCur2(String(e.detail.value ?? ''))}><IonInputPasswordToggle slot="end" /></IonInput>
            </div>
            <p className="muted small">No confirmation email is sent, so type the address carefully: it becomes your login.</p>
            {msg2 && <IonText color={msg2.ok ? 'success' : 'danger'}><p>{msg2.text}</p></IonText>}
            <IonButton onClick={saveEmail} disabled={busy === 'email'}>{busy === 'email' ? <IonSpinner name="dots" /> : 'Change email'}</IonButton>
          </section>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Profile;
