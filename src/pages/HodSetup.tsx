import React, { useEffect, useState } from 'react';
import { IonButton, IonContent, IonInput, IonInputPasswordToggle, IonPage, IonSpinner, IonText } from '@ionic/react';
import { DeptBanner } from '../components/DeptBanner';
import { DEPARTMENT_TITLE } from '../lib/config';
import { InstitutionLogo } from '../components/InstitutionLogo';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

interface Free { id: string; name: string; faculty_name: string }

/**
 * Shown to whoever signs in with the default HOD login. They register their own account as HOD of the
 * Department of Mathematics (name, email, password). The department is fixed: there is no other one.
 * When the department already has an HOD, registration is closed.
 */
const HodSetup: React.FC = () => {
  const { institution, signOut, signIn } = useAuth();
  const [free, setFree] = useState<Free[]>([]);
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);

  const loadFree = async () => {
    setLoading(true);
    const { data, error: e } = await supabase.rpc('hod_free_departments');
    if (e) setError(e.message); else setFree((data ?? []) as Free[]);
    setLoading(false);
  };
  const open = free.length > 0; // the Department of Mathematics has no HOD yet
  useEffect(() => { loadFree(); }, []);

  const submit = async () => {
    setError('');
    if (!name.trim()) { setError('Enter your full name.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (pw.length < 8) { setError('The password must be at least 8 characters.'); return; }
    if (pw !== pw2) { setError('The two passwords do not match.'); return; }
    if (!open) { setError('The Department of Mathematics already has an HOD.'); return; }
    setBusy(true);
    const { error: e } = await supabase.rpc('hod_register', { p_email: email.trim(), p_password: pw, p_full_name: name.trim() });
    if (e) { setError(e.message); setBusy(false); loadFree(); return; }
    // the default login stays available for the next HOD; sign in as the new HOD
    await signOut();
    const err = await signIn(email.trim(), pw);
    if (err) setError(err);
    setBusy(false);
  };

  return (
    <IonPage>
      <IonContent>
        <div className="login-wrap">
          <div className="login-card">
            <DeptBanner />
            <InstitutionLogo code={institution?.code} height={64} />
            <h1>Register as HOD of Mathematics</h1>
            <p className="muted">
              You are signed in with the default HOD login of the {DEPARTMENT_TITLE}. Create your own HOD account:
              enter your details. From now on, log in with the email and password you choose here.
            </p>
            <IonInput className="gap" fill="outline" label="Full name" labelPlacement="floating" value={name} onIonInput={(e) => setName(String(e.detail.value ?? ''))} />
            <IonInput className="gap" fill="outline" type="email" label="Your email address" labelPlacement="floating" value={email} onIonInput={(e) => setEmail(String(e.detail.value ?? ''))} />
            <IonInput className="gap" fill="outline" type="password" label="New password (8 or more characters)" labelPlacement="floating" value={pw} onIonInput={(e) => setPw(String(e.detail.value ?? ''))}><IonInputPasswordToggle slot="end" /></IonInput>
            <IonInput className="gap" fill="outline" type="password" label="Confirm password" labelPlacement="floating" value={pw2} onIonInput={(e) => setPw2(String(e.detail.value ?? ''))}><IonInputPasswordToggle slot="end" /></IonInput>
            {!loading && !open && !error && (
              <IonText color="danger"><p>The {DEPARTMENT_TITLE} already has an HOD, so no new HOD can be registered.</p></IonText>
            )}
            {error && <IonText color="danger"><p>{error}</p></IonText>}
            <IonButton expand="block" className="gap" onClick={submit} disabled={busy || loading || !open}>{busy ? <IonSpinner name="dots" /> : 'Create my HOD account'}</IonButton>
            <IonButton expand="block" fill="clear" onClick={signOut}>Log out</IonButton>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default HodSetup;
