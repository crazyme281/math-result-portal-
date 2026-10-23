import React, { useEffect, useState } from 'react';
import { logoUrl } from '../lib/logo';
import { useAuth } from '../lib/auth';
import { DEPARTMENT_HEADING, FACULTY_NAME, UNIVERSITY_HEADING } from '../lib/config';

/** The university logo (public/logos/<code>.png). Renders nothing when the file is not installed. */
export const InstitutionLogo: React.FC<{ code?: string; height?: number }> = ({ code, height = 36 }) => {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(true), [code]);
  if (!code || !ok) return null;
  return <img className="inst-logo" src={logoUrl(code)} alt="" style={{ height }} onError={() => setOk(false)} />;
};

/** Printed at the top of every analysis page: the university logo, name, department and title. */
export const PrintHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const { institution } = useAuth();
  return (
    <div className="print-only print-header">
      <InstitutionLogo code={institution?.code} height={72} />
      <div className="ph-text">
        <div className="ph-uni">{UNIVERSITY_HEADING}</div>
        <div className="ph-fac">{FACULTY_NAME.toUpperCase()}</div>
        <div className="ph-dept">{DEPARTMENT_HEADING}</div>
        <div className="ph-title">{title}</div>
        {subtitle && <div className="ph-sub">{subtitle}</div>}
        <div className="ph-date">Printed on {new Date().toLocaleDateString()}</div>
      </div>
    </div>
  );
};
