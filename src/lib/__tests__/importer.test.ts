import { describe, expect, it } from 'vitest';
import { importStudents } from '../importer';

const csv = (rows: string[]) => new File([rows.join('\n')], 'students.csv', { type: 'text/csv' });
const HEAD = 'S/NO,MATRIC NO,JAMBREGNO,NAMES,SCRIPTNO,CA,EXAM';

describe('student import', () => {
  it('finds the header row, normalizes matric numbers and keeps file row numbers', async () => {
    const r = await importStudents(csv([
      'UNIVERSITY OF CALABAR', HEAD,
      '1,23123,J1,"AGBAKA, FRANCIS",441707,15,38',
      '2,23/095244002,J2,AJU EMMANUEL,441706,31,20',
      '3,23/095244003,,TEST THREE,441705,23,',
    ]), '/095244');
    expect(r.students.map((s) => s.matric_no)).toEqual(['23/095244123', '23/095244002', '23/095244003']);
    expect(r.students[0].name).toBe('AGBAKA, FRANCIS');
    expect(r.fileRows).toEqual([3, 4, 5]);
    expect(r.issues).toContain('Row 4: CA score cannot be greater than 30.');
    expect(r.issues).toContain('Row 5: JAMB registration number is missing.');
    expect(r.issues).toContain('Row 5: Examination score is missing.');
  });
  it('accepts NAME OF STUDENT / Matric Number headers and prefers Matric Number over Reg. Number', async () => {
    const r = await importStudents(csv([
      'S/N,Reg. Number,Matric Number,NAME OF STUDENT,Script No,CA,EXAM,TOTAL,GRADE,REMARK',
      '6,202211024189FA,202211024189FA,OGAR JAMES OSOWOMUKO,196034,25,2.5,,,',
      '27,20/095244228,20/095244228,MICHAEL IDORENYIN FRIDAY,196053,23,27,,,',
    ]), '/095244');
    expect(r.students).toHaveLength(2);
    expect(r.students[1]).toMatchObject({ matric_no: '20/095244228', name: 'MICHAEL IDORENYIN FRIDAY', script_no: '196053', ca: '23', exam: '27' });
  });
  it.each([
    ['NAMES', 'MATRIC NO'], ['Names', 'Matric No.'], ['Name', 'Matric Number'], ['NAME OF STUDENT', 'Matriculation Number'],
    ['Name of Student', 'Matriculation No'], ['Names of Students', 'MATRIC NUMBER'], ['Student Name', 'Matric'],
  ])('accepts the header pair "%s" + "%s"', async (nameH, matricH) => {
    const r = await importStudents(csv([`S/N,${matricH},${nameH},CA,EXAM`, '1,23/095244001,TEST ONE,20,40']), '/095244');
    expect(r.students).toHaveLength(1);
    expect(r.students[0]).toMatchObject({ matric_no: '23/095244001', name: 'TEST ONE' });
  });
  it.each(['Reg No', 'Reg. No.', 'Reg Number', 'Reg. Number', 'Registration Number', 'Registration No', 'REG.NO'])(
    'reads the registration number from a "%s" column',
    async (regH) => {
      const r = await importStudents(csv([`S/N,Matric Number,${regH},Names,CA,EXAM`, '1,23/095244001,2023123456AB,TEST ONE,20,40']), '/095244');
      expect(r.students[0]).toMatchObject({ matric_no: '23/095244001', jamb_reg_no: '2023123456AB', name: 'TEST ONE' });
    },
  );
  it('uses a Reg. Number column as the matric number when there is no matric column', async () => {
    const r = await importStudents(csv(['S/N,Reg. Number,Name of Student,CA,EXAM', '1,23/095244001,TEST ONE,20,40']), '/095244');
    expect(r.students[0]).toMatchObject({ matric_no: '23/095244001', jamb_reg_no: '', name: 'TEST ONE' });
  });
  it('moves a registration number (letters, no "/") out of the matric column into the registration column', async () => {
    const r = await importStudents(csv([
      'S/N,Matric Number,Reg. Number,Name of Student,CA,EXAM',
      '1,202211024189FA,,OGAR JAMES,25,20',
      '2,202210842136CF,202210842136CF,ODOK FORTUNE,26,24',
      '3,20/095244228,,MICHAEL FRIDAY,23,27',
    ]), '/095244');
    expect(r.students[0]).toMatchObject({ matric_no: '', jamb_reg_no: '202211024189FA' });
    expect(r.students[1]).toMatchObject({ matric_no: '', jamb_reg_no: '202210842136CF' });
    expect(r.students[2]).toMatchObject({ matric_no: '20/095244228', jamb_reg_no: '' });
    expect(r.issues.some((m) => m.startsWith('Row 2:') && m.includes('registration number'))).toBe(true);
    expect(r.issues.some((m) => m.includes('Matriculation number must be'))).toBe(false);
  });
  it('does not copy a matric number into the registration column when both columns repeat it', async () => {
    const r = await importStudents(csv(['S/N,Reg. Number,Matric Number,NAME OF STUDENT,CA,EXAM', '1,20/095244228,20/095244228,MICHAEL FRIDAY,23,27', '2,202211024189FA,202211024189FA,OGAR JAMES,25,20']), '/095244');
    expect(r.students[0]).toMatchObject({ matric_no: '20/095244228', jamb_reg_no: '' });
    expect(r.students[1]).toMatchObject({ matric_no: '', jamb_reg_no: '202211024189FA' });
  });
  it('swaps the two when matric and registration numbers are the wrong way round', async () => {
    const r = await importStudents(csv(['S/N,Matric No,Reg No,Names,CA,EXAM', '1,202211024189FA,20/095244228,TEST ONE,20,40']), '/095244');
    expect(r.students[0]).toMatchObject({ matric_no: '20/095244228', jamb_reg_no: '202211024189FA' });
  });
  it('moves a matric number out of the registration column when the matric cell is empty', async () => {
    const r = await importStudents(csv(['S/N,Matric No,Reg No,Names,CA,EXAM', '1,,20/095244228,TEST ONE,20,40']), '/095244');
    expect(r.students[0]).toMatchObject({ matric_no: '20/095244228', jamb_reg_no: '' });
  });
  it('rejects a file without a NAMES and MATRIC NO header', async () => {
    await expect(importStudents(csv(['a,b', '1,2']), '')).rejects.toThrow();
  });

  it('lists the headings it found when the header row is missing', async () => {
    await expect(importStudents(csv(['S/NO,SURNAME,CODE', '1,Obi,X']), '')).rejects.toThrow();
    try { await importStudents(csv(['S/NO,SURNAME,CODE', '1,Obi,X']), ''); } catch (e) {
      expect((e as Error).message).toContain('"SURNAME"');
    }
  });

  it('finds a header row that is further down the file (after a long title block)', async () => {
    const title = Array.from({ length: 40 }, (_, i) => `title line ${i}`);
    const r = await importStudents(csv([...title, 'S/NO,MATRIC NO,NAMES,CA,EXAM', '1,20/095244001,A B,10,20']), '');
    expect(r.students).toHaveLength(1);
    expect(r.fileRows).toEqual([42]);
  });

  it('reads semicolon-separated and tab-separated files', async () => {
    const semi = await importStudents(csv(['S/NO;MATRIC NO;NAMES;CA;EXAM', '1;20/095244001;A B;10;20']), '');
    expect(semi.students[0]).toMatchObject({ matric_no: '20/095244001', name: 'A B', ca: '10', exam: '20' });
    const tab = await importStudents(csv(['S/NO\tMATRIC NO\tNAMES\tCA\tEXAM', '1\t20/095244001\tA B\t10\t20']), '');
    expect(tab.students[0]).toMatchObject({ matric_no: '20/095244001', name: 'A B' });
  });

  it('reads a UTF-16 "Unicode Text" file saved by Excel', async () => {
    const text = 'S/NO\tMATRIC NO\tNAMES\tCA\tEXAM\r\n1\t20/095244001\tA B\t10\t20\r\n';
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes[0] = 0xff; bytes[1] = 0xfe;
    for (let i = 0; i < text.length; i++) { bytes[2 + i * 2] = text.charCodeAt(i); bytes[3 + i * 2] = 0; }
    const r = await importStudents(new File([bytes], 'unicode.txt'), '');
    expect(r.students[0]).toMatchObject({ matric_no: '20/095244001', name: 'A B' });
  });

  it('explains how to convert an old .xls file', async () => {
    try { await importStudents(new File(['x'], 'old.xls'), ''); } catch (e) {
      expect((e as Error).message).toContain('.xlsx');
    }
  });
});
