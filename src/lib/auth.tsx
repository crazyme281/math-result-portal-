import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Institution, Role } from './types';
import { DEFAULT_SCALE, ScaleRow } from './grading';

interface AuthCtx {
  session: Session | null;
  /** true until the session AND the user's profile/institution/grading scale are loaded */
  loading: boolean;
  institution: Institution | null;
  /** Grading scale of the user's own institution. */
  scale: ScaleRow[];
  role: Role;
  /** Department of an HOD / exam officer (null for lecturers and admins). */
  departmentId: string | null;
  /** true while the user is setting a new password from a reset-email link */
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut: () => Promise<void>;
  sendReset: (email: string) => Promise<string | null>;
  setNewPassword: (password: string) => Promise<string | null>;
  /** change the signed-in user's password (the current password is checked first) */
  changePassword: (current: string, next: string) => Promise<string | null>;
  /** change the signed-in user's email address (the current password is checked first) */
  changeEmail: (current: string, email: string) => Promise<string | null>;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [profileDone, setProfileDone] = useState(false);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [scale, setScale] = useState<ScaleRow[]>(DEFAULT_SCALE);
  const [role, setRole] = useState<Role>('lecturer');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBooting(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load profile (institution, role, department) + that institution's grading rules when the user changes.
  const uid = session?.user.id;
  useEffect(() => {
    setProfileDone(false);
    if (!uid) { setInstitution(null); setScale(DEFAULT_SCALE); setRole('lecturer'); setDepartmentId(null); return; }
    let cancelled = false;
    (async () => {
      const { data: p } = await supabase
        .from('profiles')
        .select('role,department_id,institutions(id,code,name,heading,uses_gpa,uses_approval,withdrawal_below_gpa,hod_sets_withdrawal)')
        .eq('id', uid)
        .maybeSingle();
      const row = p as unknown as { role: Role; department_id: string | null; institutions: Institution | null } | null;
      const inst = row?.institutions ?? null;
      let rows: ScaleRow[] = DEFAULT_SCALE;
      if (inst) {
        const { data: g } = await supabase.from('grading_scale').select('*').eq('institution_id', inst.id);
        if (g?.length) {
          rows = g.map((r) => ({
            min_score: Number(r.min_score), grade: r.grade, status: r.status,
            point: r.grade_point === null || r.grade_point === undefined ? null : Number(r.grade_point),
          }));
        }
      }
      if (!cancelled) {
        setInstitution(inst); setScale(rows); setRole(row?.role ?? 'lecturer'); setDepartmentId(row?.department_id ?? null);
        setProfileDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  const value: AuthCtx = {
    session,
    loading: booting || (!!uid && !profileDone),
    institution, scale, role, departmentId, recovery,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? error.message : null;
    },
    signUp: async (email, password, fullName) => {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { full_name: fullName } },
      });
      if (error) return { error: error.message, needsConfirm: false };
      if (data.session) return { error: null, needsConfirm: false };
      // No confirmation email is needed: the account is confirmed by the database, so sign in straight away.
      const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
      return { error: e2 ? e2.message : null, needsConfirm: false };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    // The link in the email brings the user back to this address; it must be listed under
    // Supabase > Authentication > URL Configuration > Redirect URLs (see docs/SUPABASE_SETUP.md).
    sendReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      return error ? error.message : null;
    },
    changePassword: async (current, next) => {
      const email = session?.user.email;
      if (!email) return 'Not signed in.';
      const { error: bad } = await supabase.auth.signInWithPassword({ email, password: current });
      if (bad) return 'The current password is not correct.';
      const { error } = await supabase.auth.updateUser({ password: next });
      return error ? error.message : null;
    },
    changeEmail: async (current, email) => {
      const old = session?.user.email;
      if (!old) return 'Not signed in.';
      const { error: bad } = await supabase.auth.signInWithPassword({ email: old, password: current });
      if (bad) return 'The current password is not correct.';
      const { error } = await supabase.rpc('change_my_email', { p_email: email });
      if (error) return error.message;
      await supabase.auth.refreshSession();
      return null;
    },
    setNewPassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (!error) setRecovery(false);
      return error ? error.message : null;
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
