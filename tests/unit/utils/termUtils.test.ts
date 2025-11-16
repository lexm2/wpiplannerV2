import { describe, test, expect } from 'vitest';
import { formatTermName, isValidTermLetter } from '../../../src/utils/termUtils';

describe('termUtils', () => {
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