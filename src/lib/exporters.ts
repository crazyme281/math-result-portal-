import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  AlignmentType, Document, Footer, ImageRun, Packer, PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell,
  TableRow, TabStopType, TextRun, VerticalAlign, WidthType,
} from 'docx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ExportData } from './types';
import { ScaleRow, fmt, rowView, sortScale, summary, toNum } from './grading';

const BASE_HEADERS = ['S/NO', 'MATRIC NO', 'JAMB REG NO', 'NAMES', 'SCRIPT NO', 'CA', 'EXAM', 'TOTAL', 'GRADE', 'STATUS'];

const headingLines = (d: ExportData) => [
  d.form.university.toUpperCase(),
  d.facultyName.toUpperCase(),
  `DEPARTMENT OF ${d.departmentName.toUpperCase()}`,
  `${d.form.academic_session} ${d.form.result_title}`.toUpperCase(),
];

const fileBase = (d: ExportData) =>
  `${d.form.course_code}_${d.form.academic_session.replace(/[\\/]/g, '-')}_Result`.replace(/\s+/g, '_');

const numOrBlank = (v: string) => toNum(v) ?? '';

function nestedIf(ref: string, scale: ScaleRow[], key: 'grade' | 'status'): string {
  const s = sortScale(scale);
  let expr = `"${s[s.length - 1][key]}"`;
  for (let i = s.length - 2; i >= 0; i--) expr = `IF(${ref}>=${s[i].min_score},"${s[i][key]}",${expr})`;
  return expr;
}

/** Everything the three exporters need to know about incomplete records. */
function analyse(d: ExportData, scale: ScaleRow[]) {
  const views = d.students.map((s) => rowView(s, scale));
  const incompleteCount = views.filter((v) => v.incomplete).length;
  const sum = summary(d.students, scale);
  const remark = (i: number) => (views[i].incomplete ? `Missing: ${views[i].missing.join(', ')}` : '');
  const warning = incompleteCount
    ? `WARNING: ${incompleteCount} incomplete record(s) are highlighted in red (see REMARKS). Complete them before final submission.`
    : '';
  const headers = incompleteCount ? [...BASE_HEADERS, 'REMARKS'] : BASE_HEADERS;
  return { views, incompleteCount, sum, remark, warning, headers };
}

const summaryText = (sum: ReturnType<typeof summary>) =>
  `Total students: ${sum.count}   Passed: ${sum.passed}   Failed: ${sum.failed}` +
  (sum.incomplete ? `   Incomplete: ${sum.incomplete}` : '');

// ------------------------------------------------------------------ Excel
export async function exportXlsx(d: ExportData, scale: ScaleRow[]) {
  const a = analyse(d, scale);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Result', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const font = (bold = false, size = 10, color?: string) => ({ name: 'Arial', bold, size, color: color ? { argb: color } : undefined });
  const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const lastCol = a.incompleteCount ? 'K' : 'J';

  if (d.logo) {
    const id = wb.addImage({ base64: d.logo.dataUrl, extension: 'png' });
    const h = 62;
    ws.addImage(id, { tl: { col: 0.15, row: 0.15 }, ext: { width: Math.round(h * d.logo.width / d.logo.height), height: h } });
  }
  let r = 1;
  headingLines(d).forEach((line, i) => {
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = line;
    c.font = font(true, i === 0 ? 13 : 11);
    c.alignment = { horizontal: 'center' };
    r++;
  });
  r++;

  const meta = (left: string, right?: string) => {
    ws.mergeCells(`A${r}:G${r}`);
    ws.getCell(`A${r}`).value = left;
    ws.getCell(`A${r}`).font = font(true);
    if (right) {
      ws.mergeCells(`H${r}:J${r}`);
      ws.getCell(`H${r}`).value = right;
      ws.getCell(`H${r}`).font = font(true);
    }
    r++;
  };
  const f = d.form;
  meta(`ACADEMIC SESSION: ${f.academic_session}`, `SEMESTER: ${f.semester}`);
  meta(`COURSE CODE: ${f.course_code.toUpperCase()}`, `LEVEL: ${f.level}`);
  meta(`COURSE TITLE: ${f.course_title.toUpperCase()}`, `CREDIT UNIT: ${f.credit_unit}`);
  meta(`EXAMINERS: ${f.examiners.toUpperCase()}      SIGN: ____________`);
  meta(`Ag. HOD'S NAME: ${f.hod.toUpperCase()}      SIGN & DATE: ____________ ${f.sign_date}`);
  meta(`RESULT RELEASED TO DEPARTMENT OF ${(f.released_to || d.departmentName).toUpperCase()}`);
  if (a.warning) {
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    ws.getCell(`A${r}`).value = a.warning;
    ws.getCell(`A${r}`).font = font(true, 10, 'FFC00000');
    r++;
  }
  r++;

  const headRow = r;
  a.headers.forEach((h, j) => {
    const c = ws.getCell(r, j + 1);
    c.value = h;
    c.font = font(true);
    c.border = box;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  const first = r + 1;
  d.students.forEach((s, i) => {
    r++;
    const v = a.views[i];
    const total: ExcelJS.CellValue = v.total === null
      ? ''
      : { formula: `F${r}+G${r}`, result: v.total };
    const grade: ExcelJS.CellValue = v.total === null ? '' : { formula: nestedIf(`H${r}`, scale, 'grade'), result: v.grade };
    const status: ExcelJS.CellValue = v.total === null
      ? 'INCOMPLETE'
      : { formula: nestedIf(`H${r}`, scale, 'status'), result: v.status };
    const vals: ExcelJS.CellValue[] = [
      i + 1, s.matric_no, s.jamb_reg_no, s.name.toUpperCase(), s.script_no, numOrBlank(s.ca), numOrBlank(s.exam),
      total, grade, status,
    ];
    if (a.incompleteCount) vals.push(a.remark(i));
    vals.forEach((val, j) => {
      const c = ws.getCell(r, j + 1);
      c.value = val;
      c.font = v.incomplete ? font(true, 10, 'FF9C0006') : font();
      c.border = box;
      c.alignment = { horizontal: (j >= 1 && j <= 3) || j === 10 ? 'left' : 'center' };
      if (v.incomplete) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
    });
  });
  if (d.students.length) {
    ws.addConditionalFormatting({
      ref: `A${first}:J${r}`,
      rules: [{ type: 'expression', priority: 1, formulae: [`$J${first}="FAIL"`], style: { font: { color: { argb: 'FFC00000' } } } }],
    });
  }
  r += 2;
  ws.getCell(r, 1).value = summaryText(a.sum);
  ws.getCell(r, 1).font = font();

  [6, 18, 18, 38, 12, 7, 7, 8, 8, 12, 34].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: 'frozen', ySplit: headRow }];
  ws.headerFooter.oddFooter = '&CPage &P of &N';
  ws.pageSetup.printTitlesRow = `${headRow}:${headRow}`;

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(d)}.xlsx`);
}

// ------------------------------------------------------------------ PDF
export function exportPdf(d: ExportData, scale: ScaleRow[]) {
  const a = analyse(d, scale);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 12;
  if (d.logo) {
    const h = 20;
    doc.addImage(d.logo.dataUrl, 'PNG', 12, 8, h * d.logo.width / d.logo.height, h);
  }
  headingLines(d).forEach((line, i) => {
    doc.setFont('helvetica', 'bold').setFontSize(i === 0 ? 12 : 10);
    doc.text(line, W / 2, y, { align: 'center' });
    y += i === 0 ? 5.5 : 5;
  });
  y += 3;
  const f = d.form;
  doc.setFontSize(8.5);
  const L = (t: string, yy: number) => doc.text(t, 12, yy);
  const R = (t: string, yy: number) => doc.text(t, W - 12, yy, { align: 'right' });
  L(`ACADEMIC SESSION: ${f.academic_session}`, y); R(`SEMESTER: ${f.semester}`, y); y += 5;
  L(`COURSE CODE: ${f.course_code.toUpperCase()}`, y); R(`LEVEL: ${f.level}`, y); y += 5;
  L(`COURSE TITLE: ${f.course_title.toUpperCase()}`, y); R(`CREDIT UNIT: ${f.credit_unit}`, y); y += 5;
  L(`EXAMINERS: ${f.examiners.toUpperCase()}     SIGN: ____________`, y); y += 5;
  L(`Ag. HOD'S NAME: ${f.hod.toUpperCase()}     SIGN & DATE: ____________ ${f.sign_date}`, y); y += 5;
  L(`RESULT RELEASED TO DEPARTMENT OF ${(f.released_to || d.departmentName).toUpperCase()}`, y); y += 5;
  if (a.warning) {
    doc.setTextColor(192, 0, 0);
    doc.text(a.warning, 12, y);
    doc.setTextColor(0, 0, 0);
    y += 5;
  }

  const fails = new Set<number>();
  const incompleteRows = new Set<number>();
  const body = d.students.map((s, i) => {
    const v = a.views[i];
    if (v.status === 'FAIL') fails.add(i);
    if (v.incomplete) incompleteRows.add(i);
    const row: (string | number)[] = [
      i + 1, s.matric_no, s.jamb_reg_no, s.name.toUpperCase(), s.script_no, s.ca, s.exam,
      v.total === null ? '' : fmt(v.total), v.grade, v.status,
    ];
    if (a.incompleteCount) row.push(a.remark(i));
    return row;
  });
  autoTable(doc, {
    startY: y,
    head: [a.headers],
    body,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.2, textColor: 0, lineColor: 0, lineWidth: 0.2, halign: 'center', valign: 'middle' },
    headStyles: { fillColor: [217, 217, 217], textColor: 0, fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'left' }, 2: { halign: 'left' }, 3: { halign: 'left', cellWidth: a.incompleteCount ? 58 : 80 },
      ...(a.incompleteCount ? { 10: { halign: 'left' as const, cellWidth: 45 } } : {}),
    },
    margin: { left: 12, right: 12, bottom: 14 },
    didParseCell: (h) => {
      if (h.section !== 'body') return;
      if (incompleteRows.has(h.row.index)) {
        h.cell.styles.fillColor = [255, 199, 206];
        h.cell.styles.textColor = [156, 0, 6];
        h.cell.styles.fontStyle = 'bold';
      } else if (fails.has(h.row.index)) {
        h.cell.styles.textColor = [192, 0, 0];
      }
    },
  });
  const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  doc.setFont('helvetica', 'bold').setFontSize(8.5);
  doc.text(summaryText(a.sum), 12, endY);
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(8);
    doc.text(`${f.course_code.toUpperCase()}  -  Page ${p} of ${pages}`, W - 12, doc.internal.pageSize.getHeight() - 7, { align: 'right' });
  }
  doc.save(`${fileBase(d)}.pdf`);
}

// ------------------------------------------------------------------ Word (.docx)
export async function exportDocx(d: ExportData, scale: ScaleRow[]) {
  const a = analyse(d, scale);
  const f = d.form;
  const FONT = 'Arial';
  const PAGE_W = 15398; // A4 landscape (16838) minus 2 x 720 margins, in twips
  const run = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text, font: FONT, bold: o.bold, size: o.size ?? 18, color: o.color });

  const logoParagraph: Paragraph[] = [];
  if (d.logo) {
    const h = 70;
    const opts = { data: d.logo.bytes, type: 'png', transformation: { width: Math.round(h * d.logo.width / d.logo.height), height: h } };
    logoParagraph.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new ImageRun(opts as unknown as ConstructorParameters<typeof ImageRun>[0])] }));
  }
  const heading = headingLines(d).map(
    (line, i) =>
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [run(line, { bold: true, size: i === 0 ? 26 : 22 })] })
  );
  const metaLine = (left: string, right = '') =>
    new Paragraph({
      spacing: { after: 40 },
      tabStops: [{ type: TabStopType.RIGHT, position: PAGE_W }],
      children: [run(left, { bold: true }), ...(right ? [run(`\t${right}`, { bold: true })] : [])],
    });
  const meta = [
    new Paragraph({ spacing: { before: 160 }, children: [] }),
    metaLine(`ACADEMIC SESSION: ${f.academic_session}`, `SEMESTER: ${f.semester}`),
    metaLine(`COURSE CODE: ${f.course_code.toUpperCase()}`, `LEVEL: ${f.level}`),
    metaLine(`COURSE TITLE: ${f.course_title.toUpperCase()}`, `CREDIT UNIT: ${f.credit_unit}`),
    metaLine(`EXAMINERS: ${f.examiners.toUpperCase()}      SIGN: ____________`),
    metaLine(`Ag. HOD'S NAME: ${f.hod.toUpperCase()}      SIGN & DATE: ____________ ${f.sign_date}`),
    metaLine(`RESULT RELEASED TO DEPARTMENT OF ${(f.released_to || d.departmentName).toUpperCase()}`),
    ...(a.warning ? [new Paragraph({ spacing: { before: 80 }, children: [run(a.warning, { bold: true, color: 'C00000' })] })] : []),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];

  const widths = a.incompleteCount
    ? [600, 2000, 2000, 2800, 1200, 700, 700, 800, 700, 1100, 2798]
    : [600, 2200, 2200, 4600, 1300, 800, 800, 900, 800, 1198];
  const leftCols = new Set([1, 2, 3, a.incompleteCount ? 10 : -1]);
  const cell = (text: string, i: number, o: { head?: boolean; red?: boolean } = {}) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 40, bottom: 40, left: 70, right: 70 },
      shading: o.head
        ? { type: ShadingType.CLEAR, fill: 'D9D9D9', color: 'auto' }
        : o.red ? { type: ShadingType.CLEAR, fill: 'FFC7CE', color: 'auto' } : undefined,
      children: [
        new Paragraph({
          alignment: leftCols.has(i) && !o.head ? AlignmentType.LEFT : AlignmentType.CENTER,
          children: [run(text, { bold: o.head || o.red, size: 16, color: o.red ? '9C0006' : undefined })],
        }),
      ],
    });

  const rows = [
    new TableRow({ tableHeader: true, cantSplit: true, children: a.headers.map((h, i) => cell(h, i, { head: true })) }),
    ...d.students.map((s, n) => {
      const v = a.views[n];
      const vals = [
        String(n + 1), s.matric_no, s.jamb_reg_no, s.name.toUpperCase(), s.script_no, s.ca, s.exam,
        v.total === null ? '' : fmt(v.total), v.grade, v.status,
      ];
      if (a.incompleteCount) vals.push(a.remark(n));
      return new TableRow({ cantSplit: true, children: vals.map((val, i) => cell(val, i, { red: v.incomplete })) });
    }),
  ];

  const doc = new Document({
    creator: 'ResultDesk',
    title: `${f.course_code} Result`,
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ children: [`${f.course_code.toUpperCase()}  -  Page `, PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], font: FONT, size: 16 }),
                ],
              }),
            ],
          }),
        },
        children: [
          ...logoParagraph,
          ...heading,
          ...meta,
          new Table({ width: { size: PAGE_W, type: WidthType.DXA }, columnWidths: widths, rows }),
          new Paragraph({ spacing: { before: 160 }, children: [run(summaryText(a.sum), { bold: true })] }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileBase(d)}.docx`);
}
