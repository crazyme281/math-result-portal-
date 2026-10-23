import React from 'react';
import { IonApp, IonRouterOutlet, IonSpinner, setupIonicReact } from '@ionic/react';
import { IonReactHashRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import './theme/app.css';

import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import Sheets from './pages/Sheets';
import SheetEditor from './pages/SheetEditor';
import Admin from './pages/Admin';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import HodSetup from './pages/HodSetup';
import AnalysisHome from './pages/analysis/AnalysisHome';
import CourseList from './pages/analysis/CourseList';
import CoursePie from './pages/analysis/CoursePie';
import SemesterBars from './pages/analysis/SemesterBars';
import GpaAnalysis from './pages/analysis/GpaAnalysis';
import GraduationPage from './pages/analysis/GraduationPage';

setupIonicReact({ mode: 'md' });

const Protected: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useAuth();
  if (loading) return <div className="center-screen"><IonSpinner /></div>;
  return session ? <>{children}</> : <Redirect to="/login" />;
};

// Student Performance Analysis is for HODs only (the database also limits what an HOD can read to their department).
const HodOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role, loading } = useAuth();
  if (loading) return <div className="center-screen"><IonSpinner /></div>;
  return role === 'hod' ? <>{children}</> : <Redirect to="/sheets" />;
};
const hod = (el: React.ReactNode) => () => <Protected><HodOnly>{el}</HodOnly></Protected>;

// Reads the sign-in state inside its own component so it always updates (Ionic keeps route render functions cached).
const LoginRoute: React.FC = () => {
  const { session, loading } = useAuth();
  return !loading && session ? <Redirect to="/sheets" /> : <Login />;
};

const Routes: React.FC = () => {
  const { recovery, session, loading, role } = useAuth();
  if (recovery) return <ResetPassword />;
  // everyone who uses the default HOD login must register their own HOD account first
  if (session && !loading && role === 'hod_setup') return <HodSetup />;
  return (
    <IonRouterOutlet>
      <Route exact path="/login" render={() => <LoginRoute />} />
      <Route exact path="/sheets" render={() => <Protected><Sheets /></Protected>} />
      <Route exact path="/sheet/:id" render={() => <Protected><SheetEditor /></Protected>} />
      <Route exact path="/admin" render={() => <Protected><Admin /></Protected>} />
      <Route exact path="/profile" render={() => <Protected><Profile /></Protected>} />
      <Route exact path="/analysis" render={hod(<AnalysisHome />)} />
      <Route exact path="/analysis/course" render={hod(<CourseList />)} />
      <Route exact path="/analysis/courses" render={hod(<CoursePie />)} />
      <Route exact path="/analysis/semester" render={hod(<SemesterBars />)} />
      <Route exact path="/analysis/gpa" render={hod(<GpaAnalysis />)} />
      <Route exact path="/analysis/graduation" render={hod(<GraduationPage />)} />
      <Route render={() => <Redirect to="/sheets" />} />
    </IonRouterOutlet>
  );
};

const App: React.FC = () => (
  <IonApp>
    <AuthProvider>
      <IonReactHashRouter>
        <Routes />
      </IonReactHashRouter>
    </AuthProvider>
  </IonApp>
);

export default App;
