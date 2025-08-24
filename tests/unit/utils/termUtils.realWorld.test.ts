import { describe, test, expect } from 'vitest';
import { extractTermLetter, formatTermName, isValidTermLetter } from '../../../src/utils/termUtils';

describe('termUtils - Real World Section Patterns', () => {
    describe('extractTermLetter - Problematic Real World Cases', () => {
        test('should handle complex multi-section patterns from user debug logs', () => {
            // These are the exact patterns that were causing issues in production
            const realWorldCases = [
                { section: 'DL01/DD01', expected: 'D', description: 'D-term lab/discussion combo' },
                { section: 'AL06-ACL/AD06-ACL/AX05', expected: 'A', description: 'A-term complex multi-section' },
                { section: 'AL01/AX01', expected: 'A', description: 'A-term lab/extra section' },
                { section: 'BL01/BX03', expected: 'B', description: 'B-term lab/extra section' },
                { section: 'CL01/CX02', expected: 'C', description: 'C-term lab/extra section' },
            ];

            realWorldCases.forEach(({ section, expected, description }) => {
                const result = extractTermLetter('202201', section);
                expect(result).toBe(expected);
                console.log(`✓ ${description}: ${section} -> ${result}`);
            });
        });

        test('should handle various section naming conventions', () => {
            const sectionPatterns = [
                // Standard patterns
                { section: 'A01', expected: 'A' },
                { section: 'B23', expected: 'B' },
                { section: 'C05', expected: 'C' },
                { section: 'D12', expected: 'D' },
                
                // Lab sections
                { section: 'AL01', expected: 'A' },
                { section: 'BL02', expected: 'B' },
                { section: 'CL03', expected: 'C' },
                { section: 'DL04', expected: 'D' },
                
                // Discussion sections
                { section: 'AD01', expected: 'A' },
                { section: 'BD02', expected: 'B' },
                { section: 'CD03', expected: 'C' },
                { section: 'DD04', expected: 'D' },
                
                // Recitation sections
                { section: 'AR01', expected: 'A' },
                { section: 'BR02', expected: 'B' },
                { section: 'CR03', expected: 'C' },
                { section: 'DR04', expected: 'D' },
                
                // Workshop sections
                { section: 'AW01', expected: 'A' },
                { section: 'BW02', expected: 'B' },
                { section: 'CW03', expected: 'C' },
                { section: 'DW04', expected: 'D' },
                
                // Extra sections
                { section: 'AX01', expected: 'A' },
                { section: 'BX02', expected: 'B' },
                { section: 'CX03', expected: 'C' },
                { section: 'DX04', expected: 'D' },
            ];

            sectionPatterns.forEach(({ section, expected }) => {
                const result = extractTermLetter('202201', section);
                expect(result).toBe(expected);
            });
        });

        test('should handle complex multi-part section numbers', () => {
            const complexPatterns = [
                // Forward slash separators
                { section: 'AL01/AD01', expected: 'A' },
                { section: 'BL01/BD01', expected: 'B' },
                { section: 'CL01/CD01', expected: 'C' },
                { section: 'DL01/DD01', expected: 'D' },
                
                // Hyphen separators
                { section: 'AL01-AD01', expected: 'A' },
                { section: 'BL01-BD01', expected: 'B' },
                { section: 'CL01-CD01', expected: 'C' },
                { section: 'DL01-DD01', expected: 'D' },
                
                // Mixed separators (real world case)
                { section: 'AL06-ACL/AD06-ACL/AX05', expected: 'A' },
                { section: 'BL03-BCL/BD03-BCL/BX02', expected: 'B' },
                
                // Triple sections
                { section: 'AL01/AD01/AX01', expected: 'A' },
                { section: 'BL02/BD02/BX02', expected: 'B' },
                { section: 'CL03/CD03/CX03', expected: 'C' },
                { section: 'DL04/DD04/DX04', expected: 'D' },
            ];

            complexPatterns.forEach(({ section, expected }) => {
                const result = extractTermLetter('202201', section);
                expect(result).toBe(expected);
            });
        });

        test('should handle edge cases with consistent first letter extraction', () => {
            const edgeCases = [
                // Case insensitive
                { section: 'al01', expected: 'A' },
                { section: 'bL02', expected: 'B' },
                { section: 'Cl03', expected: 'C' },
                { section: 'DL04', expected: 'D' },
                
                // With extra characters before term letter (should still extract first valid term)
                { section: '1A01', expected: 'A' }, // Numbers before
                { section: 'XA01', expected: 'A' }, // Invalid letter before valid one - takes first A
                
                // Mixed term letters - should take first one
                { section: 'AB01', expected: 'A' }, // A and B, should take A
                { section: 'BA01', expected: 'B' }, // B and A, should take B
                
                // Long section numbers
                { section: 'A01-EXTRA-INFO', expected: 'A' },
                { section: 'B23/LECTURE/LAB', expected: 'B' },
            ];

            edgeCases.forEach(({ section, expected }) => {
                const result = extractTermLetter('202201', section);
                expect(result).toBe(expected);
            });
        });

        test('should fallback to A term for invalid patterns', () => {
            const invalidPatterns = [
                '', // Empty string
                '123', // No term letters
                'XYZ', // Invalid term letters
                'Lab1', // No term at start
                '01', // Numbers only
                'LECTURE', // No term letters
                'TBA', // To be announced
                'Staff', // Professor name instead of section
            ];

            invalidPatterns.forEach((section) => {
                const result = extractTermLetter('202201', section);
                expect(result).toBe('A');
            });
        });
    });

    describe('extractTermLetter - Text Format Patterns', () => {
        test('should extract terms from future text format', () => {
            const textFormatCases = [
                { term: '2025 Fall A Term', expected: 'A' },
                { term: '2024 Spring B Term', expected: 'B' },
                { term: '2026 Summer C Term', expected: 'C' },
                { term: '2023 Fall D Term', expected: 'D' },
            ];

            textFormatCases.forEach(({ term, expected }) => {
                const result = extractTermLetter(term, '');
                expect(result).toBe(expected);
            });
        });

        test('should prioritize section number over text format', () => {
            // When both section and text are provided, section should take precedence
            const priorityTests = [
                { term: '2025 Fall B Term', section: 'A01', expected: 'A' },
                { term: '2025 Fall A Term', section: 'C02', expected: 'C' },
                { term: '2025 Spring D Term', section: 'B03', expected: 'B' },
            ];

            priorityTests.forEach(({ term, section, expected }) => {
                const result = extractTermLetter(term, section);
                expect(result).toBe(expected);
            });
        });
    });

    describe('Real World Data Migration Scenarios', () => {
        test('should handle sections that previously had undefined computedTerm', () => {
            // These represent the exact scenarios from the user's debug logs
            const migrationScenarios = [
                {
                    description: 'MA2621 section that was showing as undefined',
                    section: 'DL01/DD01',
                    originalComputedTerm: 'undefined',
                    expectedAfterMigration: 'D'
                },
                {
                    description: 'MA1024 section that was showing as undefined',
                    section: 'AL06-ACL/AD06-ACL/AX05',
                    originalComputedTerm: 'undefined',
                    expectedAfterMigration: 'A'
                },
                {
                    description: 'CS1102 section that was showing as undefined',
                    section: 'AL01/AX01',
                    originalComputedTerm: 'undefined',
                    expectedAfterMigration: 'A'
                }
            ];

            migrationScenarios.forEach(({ description, section, expectedAfterMigration }) => {
                const result = extractTermLetter('202201', section);
                expect(result).toBe(expectedAfterMigration);
                console.log(`✓ ${description}: ${section} -> ${result}`);
            });
        });

        test('should validate migration success with isValidTermLetter', () => {
            const problematicSections = ['DL01/DD01', 'AL06-ACL/AD06-ACL/AX05', 'AL01/AX01', 'BL01/BX03'];
            
            problematicSections.forEach(section => {
                const extractedTerm = extractTermLetter('202201', section);
                expect(isValidTermLetter(extractedTerm)).toBe(true);
                
                const formattedName = formatTermName(extractedTerm);
                expect(['A Term', 'B Term', 'C Term', 'D Term']).toContain(formattedName);
            });
        });

        test('should handle performance with many problematic sections', () => {
            const startTime = performance.now();
            
            // Generate many problematic section patterns
            const problematicPatterns = [];
            for (let i = 0; i < 1000; i++) {
                const termLetters = ['A', 'B', 'C', 'D'];
                const termLetter = termLetters[i % 4];
                problematicPatterns.push(`${termLetter}L${i.toString().padStart(2, '0')}/X${i.toString().padStart(2, '0')}`);
            }
            
            // Extract terms from all patterns
            const results = problematicPatterns.map(pattern => extractTermLetter('202201', pattern));
            
            const endTime = performance.now();
            const processingTime = endTime - startTime;
            
            // Verify all were extracted correctly
            expect(results).toHaveLength(1000);
            expect(results.every(term => ['A', 'B', 'C', 'D'].includes(term))).toBe(true);
            
            // Should process 1000 sections in reasonable time (less than 50ms)
            expect(processingTime).toBeLessThan(50);
            
            console.log(`Processed ${problematicPatterns.length} sections in ${processingTime.toFixed(2)}ms`);
        });
    });
});