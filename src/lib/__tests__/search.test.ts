import { describe, expect, it } from 'vitest';
import { matchesStudent } from '../search';

const s = { matric_no: '20/095244228', script_no: '196053' };

describe('sheet search by script no or matric no', () => {
  it('matches the script number, full or partial', () => {
    expect(matchesStudent(s, '196053')).toBe(true);
    expect(matchesStudent(s, '9605')).toBe(true);
  });
  it('matches the matric number with or without the slash, any case, any spacing', () => {
    expect(matchesStudent(s, '20/095244228')).toBe(true);
    expect(matchesStudent(s, '20095244228')).toBe(true);
    expect(matchesStudent(s, ' 095244228 ')).toBe(true);
  });
  it('does not match other values', () => {
    expect(matchesStudent(s, '196054')).toBe(false);
    expect(matchesStudent(s, '20/095244229')).toBe(false);
  });
  it('an empty search matches everything', () => {
    expect(matchesStudent(s, '')).toBe(true);
    expect(matchesStudent(s, '   ')).toBe(true);
  });
  it('handles students with no matric number (registration-number only)', () => {
    expect(matchesStudent({ matric_no: '', script_no: '196034' }, '196034')).toBe(true);
    expect(matchesStudent({ matric_no: '', script_no: '196034' }, '20/09')).toBe(false);
  });
});
