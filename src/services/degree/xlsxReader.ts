/**
 * Minimal .xlsx reader for the WPI "View My Academic Progress" export.
 *
 * The export is the simplest possible OOXML case: a zip with one worksheet, a
 * shared-strings table, no formulas, no inline rich text in cells, and no date
 * serials (every value - including credits - is a shared string). So instead of
 * a heavy SheetJS dependency we unzip with `fflate` and parse the two relevant
 * XML parts with the browser's `DOMParser`.
 *
 * `fflate` is imported dynamically by callers (degreeImportService) so it only
 * loads when a user actually imports a file.
 */
import { unzipSync, strFromU8 } from 'fflate';

/** Convert a column letter (A, B, ..., Z, AA, ...) to a 0-based index. */
function columnToIndex(col: string): number {
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64); // 'A' = 65
  }
  return n - 1;
}

/** Split a cell reference like "D12" into its column letters and 1-based row. */
function parseCellRef(ref: string): { col: number; row: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return null;
  return { col: columnToIndex(match[1]), row: parseInt(match[2], 10) };
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Malformed XML in spreadsheet');
  }
  return doc;
}

/**
 * Read the first worksheet of an .xlsx into a dense 2D matrix of strings.
 * Missing/empty cells become "". Rows are 0-indexed in the result.
 */
export function readSheet(buf: ArrayBuffer): string[][] {
  const files = unzipSync(new Uint8Array(buf));

  const sheetEntry =
    files['xl/worksheets/sheet1.xml'] ??
    // Fall back to whatever worksheet exists if the name differs.
    files[
      Object.keys(files).find(k => /^xl\/worksheets\/.*\.xml$/.test(k)) ?? ''
    ];
  if (!sheetEntry) {
    throw new Error('No worksheet found in the .xlsx file');
  }

  // Shared strings table (optional in theory, always present here).
  const sharedStrings: string[] = [];
  const ssEntry = files['xl/sharedStrings.xml'];
  if (ssEntry) {
    const ssDoc = parseXml(strFromU8(ssEntry));
    const siNodes = ssDoc.getElementsByTagName('si');
    for (let i = 0; i < siNodes.length; i++) {
      // Concatenate the <t> runs rather than reading the <si> textContent -
      // pretty-printed XML adds whitespace text nodes between <si> and <t>
      // that would otherwise pollute the value. This handles both the plain
      // <si><t> and the rich-text <si><r><t> forms.
      const tNodes = siNodes[i].getElementsByTagName('t');
      let text = '';
      for (let j = 0; j < tNodes.length; j++)
        text += tNodes[j].textContent ?? '';
      sharedStrings.push(text);
    }
  }

  const sheetDoc = parseXml(strFromU8(sheetEntry));
  const cellNodes = sheetDoc.getElementsByTagName('c');

  const matrix: string[][] = [];
  let maxCol = 0;

  for (let i = 0; i < cellNodes.length; i++) {
    const cell = cellNodes[i];
    const ref = cell.getAttribute('r');
    if (!ref) continue;
    const pos = parseCellRef(ref);
    if (!pos) continue;

    const rowIdx = pos.row - 1;
    const type = cell.getAttribute('t');

    let value = '';
    if (type === 's') {
      const v = cell.getElementsByTagName('v')[0];
      const idx = v ? parseInt(v.textContent ?? '', 10) : NaN;
      value = Number.isNaN(idx) ? '' : (sharedStrings[idx] ?? '');
    } else if (type === 'inlineStr') {
      value = cell.textContent ?? '';
    } else {
      const v = cell.getElementsByTagName('v')[0];
      value = v?.textContent ?? '';
    }

    if (!matrix[rowIdx]) matrix[rowIdx] = [];
    matrix[rowIdx][pos.col] = value;
    if (pos.col > maxCol) maxCol = pos.col;
  }

  // Densify: fill gaps with "" so consumers can index columns safely.
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    for (let c = 0; c <= maxCol; c++) {
      if (row[c] === undefined) row[c] = '';
    }
    matrix[r] = row;
  }

  return matrix;
}
