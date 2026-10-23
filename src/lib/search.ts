import { StudentRow } from './types';

const flat = (v: string) => (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Sheet search: matches ONLY the script number or the matriculation number (not names or scores).
 * Case, spaces and "/" are ignored, and partial entries match - "095244228" and "20/095244228" both find 20/095244228.
 */
export function matchesStudent(s: Pick<StudentRow, 'matric_no' | 'script_no'>, query: string): boolean {
  const q = flat(query);
  if (!q) return true;
  return flat(s.script_no).includes(q) || flat(s.matric_no).includes(q);
}
