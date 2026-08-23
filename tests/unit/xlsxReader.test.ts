import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readSheet } from '../../src/services/degree/xlsxReader';

const here = dirname(fileURLToPath(import.meta.url));
// A small, sanitized fixture in the export's exact format (built by
// scripts/make-degree-test-fixture.ts). It contains only public WPI course
// identifiers - no real student data - so it is safe to commit.
const fixturePath = resolve(here, '../fixtures/academic-progress-sample.xlsx');

function loadFixture(): ArrayBuffer {
  const buf = readFileSync(fixturePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('readSheet', () => {
  it('extracts a dense matrix with the header row locatable by column A', () => {
    const rows = readSheet(loadFixture());
    expect(rows.length).toBeGreaterThan(5);

    const headerRow = rows.findIndex(
      r => (r[0] ?? '').trim() === 'Requirement',
    );
    expect(headerRow).toBeGreaterThanOrEqual(0);
    expect(rows[headerRow][1]).toBe('Status');
    expect(rows[headerRow][4]).toBe('Academic Period');
  });

  it('resolves shared strings (course cells are readable, no stray whitespace)', () => {
    const rows = readSheet(loadFixture());
    const flat = rows.flat();
    expect(flat).toContain(
      'CS 1102 - Accelerated Introduction To Program Design',
    );
  });

  it('densifies rows so every row has the same column count', () => {
    const rows = readSheet(loadFixture());
    const widths = new Set(rows.map(r => r.length));
    expect(widths.size).toBe(1);
  });
});
