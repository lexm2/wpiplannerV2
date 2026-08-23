/**
 * Generates tests/fixtures/academic-progress-sample.xlsx - a small, sanitized
 * stand-in for a real Workday "View My Academic Progress" export.
 *
 * The real export (docs/View_My_Academic_Progress.xlsx) contains a student's
 * grades and full history, so it is git-ignored and never committed. This
 * fixture reproduces the export's exact structure (stray label row, header row
 * on row 2, the 7 columns) but contains only a handful of rows built from
 * PUBLIC WPI course identifiers and synthetic grades - enough to exercise every
 * parser branch the unit tests assert against.
 *
 * Run: bun run scripts/make-degree-test-fixture.ts
 */
import { zipSync, strToU8 } from 'fflate';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// [Requirement, Status, Remaining, Registrations Used, Academic Period, Credits, Grade]
const ROWS: string[][] = [
  ['', '', '', 'Satisfied With', '', '', ''],
  [
    'Requirement',
    'Status',
    'Remaining',
    'Registrations Used',
    'Academic Period',
    'Credits',
    'Grade',
  ],
  // Total Credits - drives required(135)/remaining(35.25); CS 1102 (1st of 3),
  // a transfer course, a semester-long activity, and an in-progress cross-listed course.
  [
    'WPI Total Credits Required - Undergraduate - 135 Credits',
    'In Progress',
    'Minimum 35.25 Credit(s)',
    'CS 1102 - Accelerated Introduction To Program Design',
    '2025 Fall A Term',
    '3',
    'A',
  ],
  [
    'WPI Total Credits Required - Undergraduate - 135 Credits',
    'In Progress',
    'Minimum 35.25 Credit(s)',
    'MA 1021 - Calculus I (Transfer Credit)',
    '',
    '3',
    'L',
  ],
  [
    'WPI Total Credits Required - Undergraduate - 135 Credits',
    'In Progress',
    'Minimum 35.25 Credit(s)',
    'WPE 1601 - Insight Program',
    '2025 Fall Semester',
    '0.75',
    'P',
  ],
  [
    'WPI Total Credits Required - Undergraduate - 135 Credits',
    'In Progress',
    'Minimum 35.25 Credit(s)',
    'CS 2022/ MA 2201 - Discrete Mathematics (In Progress)',
    '2026 Fall A Term',
    '3',
    '',
  ],
  // Residency - CS 1102 (2nd of 3) for the dedupe/satisfies assertion.
  [
    'WPI Residency Requirement - Undergraduate - 72 Credits',
    'In Progress',
    'None',
    'CS 1102 - Accelerated Introduction To Program Design',
    '2025 Fall A Term',
    '3',
    'A',
  ],
  // MQP - lets the parser derive major "Computer Science" + degree "BS".
  [
    'WPI Major Qualifying Project (Computer Science BS) Requirement - Undergraduate',
    'Not Satisfied',
    'Minimum Combination Required',
    '',
    '',
    '',
    '',
  ],
  // Major-specific in-progress requirement - CS 1102 (3rd of 3).
  [
    'Computer Science - Core Requirement - Undergraduate - 36 Credits',
    'In Progress',
    'Minimum 6 Credit(s)',
    'CS 1102 - Accelerated Introduction To Program Design',
    '2025 Fall A Term',
    '3',
    'A',
  ],
  // A satisfied major-specific requirement.
  [
    'Computer Science - Systems Requirement - Undergraduate - 3 Credits',
    'Satisfied',
    'None',
    'CS 3013 - Operating Systems',
    '2026 Spring C Term',
    '3',
    'A',
  ],
  // The synthetic "Unused Courses" bucket the UI hides.
  [
    'Unused Courses - Successfully Completed - Undergraduate',
    'Not Satisfied',
    'Minimum 200 Credit(s)',
    '',
    '',
    '',
    '',
  ],
];

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Build the shared-strings table.
const stringIndex = new Map<string, number>();
const strings: string[] = [];
for (const row of ROWS) {
  for (const cell of row) {
    if (cell !== '' && !stringIndex.has(cell)) {
      stringIndex.set(cell, strings.length);
      strings.push(cell);
    }
  }
}

const sharedStrings =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
  strings.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') +
  `</sst>`;

const sheetRows = ROWS.map((row, r) => {
  const cells = row
    .map((cell, c) => {
      if (cell === '') return '';
      const ref = `${COLS[c]}${r + 1}`;
      return `<c r="${ref}" t="s"><v>${stringIndex.get(cell)}</v></c>`;
    })
    .join('');
  return `<row r="${r + 1}">${cells}</row>`;
}).join('');

const sheet =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<sheetData>${sheetRows}</sheetData></worksheet>`;

const workbook =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const workbookRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
  `</Relationships>`;

const rootRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const contentTypes =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
  `</Types>`;

const zip = zipSync({
  '[Content_Types].xml': strToU8(contentTypes),
  '_rels/.rels': strToU8(rootRels),
  'xl/workbook.xml': strToU8(workbook),
  'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
  'xl/worksheets/sheet1.xml': strToU8(sheet),
  'xl/sharedStrings.xml': strToU8(sharedStrings),
});

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../tests/fixtures');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'academic-progress-sample.xlsx');
writeFileSync(outPath, zip);
console.log(
  `Wrote ${outPath} (${zip.length} bytes, ${strings.length} shared strings)`,
);
