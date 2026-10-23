import React from 'react';
import { UNIVERSITY_NAME, DEPARTMENT_HEADING } from '../lib/config';

/** "DEPARTMENT OF MATHEMATICS" written at the top of every page. */
export const DeptBanner: React.FC = () => (
  <div className="dept-banner no-print">
    <span className="db-dept">{DEPARTMENT_HEADING}</span>
    <span className="db-uni">{UNIVERSITY_NAME}</span>
  </div>
);
