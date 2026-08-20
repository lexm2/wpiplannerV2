/**
 * Characterization tests for search relevance ranking — previously zero coverage.
 * Asserts the tier ORDERING rather than exact point values, so the tests stay
 * meaningful if the weights are retuned.
 */
import { describe, it, expect } from 'vitest';
import { rankCoursesByRelevance, calculateRelevanceScore, getAvailableProfessors } from '../../src/utils/searchUtils';
import type { Course } from '../../src/types/types';

function course(over: Partial<Course> = {}): Course {
    return {
        id: 'CS1101', number: '1101', name: 'Introduction to Program Design',
        description: 'A first course in programming.',
        departmentAbbr: 'CS', departmentName: 'Computer Science',
        minCredits: 3, maxCredits: 3,
        ...over,
    } as Course;
}

describe('calculateRelevanceScore', () => {
    it('scores an exact course-code match above a name match', () => {
        const c = course();
        expect(calculateRelevanceScore(c, 'cs1101')).toBeGreaterThan(
            calculateRelevanceScore(c, 'introduction to program design')
        );
    });

    it('ignores hyphens and spaces in the query when matching a code', () => {
        const c = course();
        expect(calculateRelevanceScore(c, 'cs 1101')).toBe(calculateRelevanceScore(c, 'cs1101'));
        expect(calculateRelevanceScore(c, 'cs-1101')).toBe(calculateRelevanceScore(c, 'cs1101'));
    });

    it('scores an exact match above a prefix match, and a prefix above a substring', () => {
        const c = course({ name: 'Algorithms' });
        const exact = calculateRelevanceScore(c, 'algorithms');
        const prefix = calculateRelevanceScore(c, 'algo');
        const contains = calculateRelevanceScore(c, 'rithm');
        expect(exact).toBeGreaterThan(prefix);
        expect(prefix).toBeGreaterThan(contains);
    });

    it('returns 0 for a query matching nothing', () => {
        expect(calculateRelevanceScore(course(), 'zzzznomatch')).toBe(0);
    });

    it('gives a description-only match a non-zero but low score', () => {
        const c = course({ description: 'Covers recursion and iteration.' });
        const desc = calculateRelevanceScore(c, 'recursion');
        expect(desc).toBeGreaterThan(0);
        expect(desc).toBeLessThan(calculateRelevanceScore(c, 'cs1101'));
    });
});

describe('rankCoursesByRelevance', () => {
    it('returns the input untouched for a blank query', () => {
        const list = [course({ id: 'A' }), course({ id: 'B' })];
        expect(rankCoursesByRelevance(list, '   ')).toBe(list);
    });

    it('puts the best match first', () => {
        const cs = course({ id: 'CS1101', number: '1101', departmentAbbr: 'CS', name: 'Program Design' });
        const ma = course({ id: 'MA1021', number: '1021', departmentAbbr: 'MA', name: 'Calculus' });
        expect(rankCoursesByRelevance([ma, cs], 'cs1101')[0].id).toBe('CS1101');
        expect(rankCoursesByRelevance([cs, ma], 'calculus')[0].id).toBe('MA1021');
    });

    it('sorts in place — the caller receives the same array instance', () => {
        // Documents current behaviour: callers must copy first if they need the original order.
        const list = [course({ id: 'A', name: 'Zebra' }), course({ id: 'B', name: 'Apple' })];
        expect(rankCoursesByRelevance(list, 'apple')).toBe(list);
    });
});

describe('getAvailableProfessors', () => {
    it('returns an empty list when there are no sections', () => {
        expect(getAvailableProfessors([course()])).toEqual([]);
    });

    it('handles an empty course list', () => {
        expect(getAvailableProfessors([])).toEqual([]);
    });
});
