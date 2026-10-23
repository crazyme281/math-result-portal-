/** Class-of-degree helpers shared by the HOD analysis pages. */
export interface DegreeClass { min_cgpa: number; name: string }

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function classFor(cgpa: number | null, classes: DegreeClass[]): string {
  if (cgpa === null) return '';
  const sorted = [...classes].sort((a, b) => b.min_cgpa - a.min_cgpa);
  return sorted.find((c) => cgpa >= c.min_cgpa)?.name ?? '';
}
