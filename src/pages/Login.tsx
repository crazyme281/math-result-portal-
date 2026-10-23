import React, { useState } from 'react';
import {
  IonButton, IonContent, IonInput, IonInputPasswordToggle, IonPage, IonSegment, IonSegmentButton, IonLabel, IonText,
  IonSpinner,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { Redirect } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { DeptBanner } from '../components/DeptBanner';
import { DEPARTMENT_TITLE, UNIVERSITY_NAME } from '../lib/config';

const Login: React.FC = () => {
  const history = useHistory();
  const { signIn, signUp, sendReset, session, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(''); setInfo('');
    if (mode === 'forgot') {
      if (!email.trim()) { setError('Enter your email address.'); return; }
      setBusy(true);
      const err = await sendReset(email.trim());
      if (err) setError(err); else setInfo('If an account exists for that email, a reset link has been sent. Open it to choose a new password.');
      setBusy(false);
      return;
    }
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    if (mode === 'register') {
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    }
    setBusy(true);
    if (mode === 'login') {
      const err = await signIn(email.trim(), password);
      if (err) setError(err);
      else history.replace('/sheets');
    } else {
      const r = await signUp(email.trim(), password, fullName.trim());
      if (r.error) setError(r.error);
      else if (r.needsConfirm) { setInfo('Account created. Check your email to confirm it, then log in.'); setMode('login'); }
      else history.replace('/sheets');
    }
    setBusy(false);
  };

  // signed in: wait for the profile to load, then go to the sheet list
  if (session) {
    return loading
      ? <IonPage><IonContent><div className="center-screen"><IonSpinner /></div></IonContent></IonPage>
      : <Redirect to="/sheets" />;
  }

  return (
    <IonPage>
      <IonContent>
        <div className="login-wrap">
          <div className="login-card">
            <DeptBanner />
            <h1>ResultDesk</h1>
            <p className="muted">Result sheet manager - {DEPARTMENT_TITLE}, {UNIVERSITY_NAME}</p>
            {mode !== 'forgot' && (
            <IonSegment value={mode} onIonChange={(e) => setMode(e.detail.value as 'login' | 'register')}>
              <IonSegmentButton value="login"><IonLabel>Log in</IonLabel></IonSegmentButton>
              <IonSegmentButton value="register"><IonLabel>Register</IonLabel></IonSegmentButton>
            </IonSegment>
            )}
            {mode === 'forgot' && <p className="muted">Enter your email and we will send you a link to reset your password.</p>}
            {mode === 'register' && (
              <>
                <IonInput className="gap" fill="outline" label="Full name" labelPlacement="floating" value={fullName}
                  onIonInput={(e) => setFullName(String(e.detail.value ?? ''))} />
              </>
            )}
            <IonInput className="gap" fill="outline" type="email" label="Email" labelPlacement="floating" value={email}
              onIonInput={(e) => setEmail(String(e.detail.value ?? ''))} />
            {mode !== 'forgot' && (
            <IonInput className="gap" fill="outline" type="password" label="Password" labelPlacement="floating" value={password}
              onIonInput={(e) => setPassword(String(e.detail.value ?? ''))}
              onKeyUp={(e) => e.key === 'Enter' && submit()}>
              <IonInputPasswordToggle slot="end" />
            </IonInput>
            )}
            {error && <IonText color="danger"><p>{error}</p></IonText>}
            {info && <IonText color="success"><p>{info}</p></IonText>}
            <IonButton expand="block" className="gap" onClick={submit} disabled={busy}>
              {busy ? <IonSpinner name="dots" /> : mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : 'Send reset link'}
            </IonButton>
            {mode === 'login' && <p className="muted small">HOD of the Department of Mathematics? Sign in with the default HOD login you were given, then register your own HOD account.</p>}
            {mode === 'login' && <IonButton expand="block" fill="clear" size="small" onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}>Forgot password?</IonButton>}
            {mode === 'forgot' && <IonButton expand="block" fill="clear" size="small" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>Back to log in</IonButton>}
            {mode === 'register' && <p className="muted small">Accounts are for staff of the {DEPARTMENT_TITLE}, {UNIVERSITY_NAME}.</p>}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Login;
