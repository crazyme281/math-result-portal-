export interface Faculty { id: string; name: string; source: string; sort_order: number; matric_fixed: string | null }
export type Role = 'lecturer' | 'exam_officer' | 'hod' | 'hod_setup' | 'admin';
export type SheetStatus = 'draft' | 'submitted' | 'approved' | 'locked';
export interface Institution { id: string; code: string; name: string; heading: string; uses_gpa: boolean; uses_approval: boolean; withdrawal_below_gpa: number; hod_sets_withdrawal: boolean }
export interface Department { id: string; faculty_id: string; name: string; verified: boolean }

export interface StudentRow {
  key: string;
  matric_no: string;
  jamb_reg_no: string;
  name: string;
  script_no: string;
  ca: string;
  exam: string;
}

export interface SheetForm {
  id?: string;
  university: string;
  faculty_id: string;
  department_id: string;
  /** Fixed middle part of the matric number, e.g. "/095244" (Faculty of Computing). Empty = type full matric numbers. */
  matric_fixed: string;
  academic_session: string;
  result_title: string;
  course_code: string;
  course_title: string;
  semester: 'FIRST' | 'SECOND' | 'SUMMER';
  level: string;
  credit_unit: string;
  examiners: string;
  hod: string;
  released_to: string;
  sign_date: string;
  status: SheetStatus;
}

export interface ExportData {
  /** official logo shown at the top of the output (null when no logo file is installed) */
  logo?: import('./logo').Logo | null;
  form: SheetForm;
  facultyName: string;
  departmentName: string;
  students: StudentRow[];
}
