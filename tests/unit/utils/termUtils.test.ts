import { describe, test, expect } from 'vitest';
import { extractTermLetter, formatTermName, isValidTermLetter } from '../../../src/utils/termUtils';

describe('termUtils', () => {
    describe('extractTermLetter', () => {
        test('should extract term from section numbers', () => {
            expect(extractTermLetter('', 'A01')).toBe('A');
            expect(extractTermLetter('', 'B23')).toBe('B');
            expect(extractTermLetter('', 'C05')).toBe('C');
            expect(extractTermLetter('', 'D12')).toBe('D');
        });

        test('should handle case insensitive section numbers', () => {
            expect(extractTermLetter('', 'a01')).toBe('A');
            expect(extractTermLetter('', 'b23')).toBe('B');
            expect(extractTermLetter('', 'c05')).toBe('C');
            expect(extractTermLetter('', 'd12')).toBe('D');
        });

        test('should extract term from text format', () => {
            expect(extractTermLetter('2025 Fall A Term', '')).toBe('A');
            expect(extractTermLetter('2024 Spring B Term', '')).toBe('B');
            expect(extractTermLetter('2026 Summer C Term', '')).toBe('C');
            expect(extractTermLetter('2023 Fall D Term', '')).toBe('D');
        });

        test('should handle case insensitive text format', () => {
            expect(extractTermLetter('2025 fall a term', '')).toBe('A');
            expect(extractTermLetter('2024 SPRING B TERM', '')).toBe('B');
        });

        test('should prioritize section number over text format', () => {
            expect(extractTermLetter('2025 Fall B Term', 'A01')).toBe('A');
            expect(extractTermLetter('2025 Fall A Term', 'C02')).toBe('C');
        });

        test('should fallback to A term when no match found', () => {
            expect(extractTermLetter('', '')).toBe('A');
            expect(extractTermLetter('202201', '')).toBe('A');
            expect(extractTermLetter('', 'XYZ123')).toBe('A');
            expect(extractTermLetter('Some random text', 'Lab1')).toBe('A');
        });

        test('should handle empty or null inputs', () => {
            expect(extractTermLetter('', '')).toBe('A');
            expect(extractTermLetter('', undefined)).toBe('A');
            expect(extractTermLetter(null as any, '')).toBe('A');
            expect(extractTermLetter(undefined as any, undefined)).toBe('A');
        });

        test('should extract from complex section numbers', () => {
            expect(extractTermLetter('', 'AL01')).toBe('A'); // Lab section
            expect(extractTermLetter('', 'BD02')).toBe('B'); // Discussion section  
            expect(extractTermLetter('', 'CR03')).toBe('C'); // Recitation section
        });
    });

    describe('formatTermName', () => {
        test('should format standard term letters', () => {
            expect(formatTermName('A')).toBe('A Term');
            expect(formatTermName('B')).toBe('B Term');
            expect(formatTermName('C')).toBe('C Term');
            expect(formatTermName('D')).toBe('D Term');
        });

        test('should handle case insensitive input', () => {
            expect(formatTermName('a')).toBe('A Term');
            expect(formatTermName('b')).toBe('B Term');
            expect(formatTermName('c')).toBe('C Term');
            expect(formatTermName('d')).toBe('D Term');
        });

        test('should handle whitespace', () => {
            expect(formatTermName('  A  ')).toBe('A Term');
            expect(formatTermName(' b ')).toBe('B Term');
            expect(formatTermName('\tC\t')).toBe('C Term');
        });

        test('should handle unknown terms', () => {
            expect(formatTermName('X')).toBe('X Term');
            expect(formatTermName('CUSTOM')).toBe('CUSTOM Term');
            expect(formatTermName('123')).toBe('123 Term');
        });

        test('should handle empty input', () => {
            expect(formatTermName('')).toBe(' Term');
        });
    });

    describe('isValidTermLetter', () => {
        test('should validate standard term letters', () => {
            expect(isValidTermLetter('A')).toBe(true);
            expect(isValidTermLetter('B')).toBe(true);
            expect(isValidTermLetter('C')).toBe(true);
            expect(isValidTermLetter('D')).toBe(true);
        });

        test('should handle case insensitive validation', () => {
            expect(isValidTermLetter('a')).toBe(true);
            expect(isValidTermLetter('b')).toBe(true);
            expect(isValidTermLetter('c')).toBe(true);
            expect(isValidTermLetter('d')).toBe(true);
        });

        test('should handle whitespace', () => {
            expect(isValidTermLetter('  A  ')).toBe(true);
            expect(isValidTermLetter(' B ')).toBe(true);
        });

        test('should reject invalid terms', () => {
            expect(isValidTermLetter('X')).toBe(false);
            expect(isValidTermLetter('AB')).toBe(false);
            expect(isValidTermLetter('1')).toBe(false);
            expect(isValidTermLetter('AA')).toBe(false);
            expect(isValidTermLetter('TERM')).toBe(false);
            expect(isValidTermLetter('')).toBe(false);
        });

        test('should reject null/undefined input', () => {
            expect(isValidTermLetter(null as any)).toBe(false);
            expect(isValidTermLetter(undefined as any)).toBe(false);
        });
    });
});