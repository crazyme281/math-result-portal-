import React, { useState } from 'react';
import { IonButton, IonContent, IonInput, IonInputPasswordToggle, IonPage, IonSpinner, IonText } from '@ionic/react';
import { useAuth } from '../lib/auth';
import { DeptBanner } from '../components/DeptBanner';

/** Shown after the user opens the link in their password-reset email. */
const ResetPassword: React.FC = () => {
  const { setNewPassword, signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (pw.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (pw !== pw2) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    const err = await setNewPassword(pw);
    if (err) setError(err);
    setBusy(false);
  };

  return (
    <IonPage>
      <IonContent>
        <div className="login-wrap">
          <div className="login-card">
            <DeptBanner />
            <h1>Set a new password</h1>
            <IonInput className="gap" fill="outline" type="password" label="New password" labelPlacement="floating" value={pw}
              onIonInput={(e) => setPw(String(e.detail.value ?? ''))}><IonInputPasswordToggle slot="end" /></IonInput>
            <IonInput className="gap" fill="outline" type="password" label="Confirm new password" labelPlacement="floating" value={pw2}
              onIonInput={(e) => setPw2(String(e.detail.value ?? ''))} onKeyUp={(e) => e.key === 'Enter' && submit()}>
              <IonInputPasswordToggle slot="end" />
            </IonInput>
            {error && <IonText color="danger"><p>{error}</p></IonText>}
            <IonButton expand="block" className="gap" onClick={submit} disabled={busy}>{busy ? <IonSpinner name="dots" /> : 'Save password'}</IonButton>
            <IonButton expand="block" fill="clear" onClick={signOut}>Cancel</IonButton>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ResetPassword;
