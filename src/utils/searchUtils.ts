import { Course } from '../types/types';
import { getAllSections } from './courseUtils';

/**
 * Ranks courses by relevance to a search query using a tiered scoring system
 */
export function rankCoursesByRelevance(
  courses: Course[],
  query: string,
): Course[] {
  if (!query.trim()) return courses;

  const queryLower = query.toLowerCase();

  return courses.sort((a, b) => {
    const scoreA = calculateRelevanceScore(a, queryLower);
    const scoreB = calculateRelevanceScore(b, queryLower);
    return scoreB - scoreA;
  });
}

/**
 * Tiered relevance score for a course vs. a search query (higher = more relevant).
 * Tier weights cascade exact > prefix > contains, code/id > name > department > description.
 */
export function calculateRelevanceScore(
  course: Course,
  queryLower: string,
): number {
  let score = 0;

  const normalizedQuery = queryLower.replace(/[-\s]/g, '');
  const courseCode = `${course.departmentAbbr}${course.number}`
    .toLowerCase()
    .replace(/[-\s]/g, '');
  const normalizedId = course.id.toLowerCase().replace(/[-\s]/g, '');
  const courseName = course.name.toLowerCase();
  const courseDescription = course.description.toLowerCase();

  // TIER 1: Exact ID/Code matches (1000+ points)
  if (courseCode === normalizedQuery) score += 1000;
  if (normalizedId === normalizedQuery) score += 950;
  if (course.number.toLowerCase() === normalizedQuery) score += 900;

  // TIER 2: Exact name matches (800+ points)
  if (courseName === queryLower) score += 850;
  if (courseName === normalizedQuery) score += 840;

  // TIER 3: Prefix matches for ID/Code (700+ points)
  if (courseCode.startsWith(normalizedQuery)) score += 750;
  if (normalizedId.startsWith(normalizedQuery)) score += 700;
  if (course.number.toLowerCase().startsWith(normalizedQuery)) score += 650;

  // TIER 4: Prefix matches for name (600+ points)
  if (courseName.startsWith(queryLower)) score += 600;

  // TIER 5: Contains matches for ID/Code (500+ points)
  if (courseCode.includes(normalizedQuery)) score += 500;
  if (normalizedId.includes(normalizedQuery)) score += 450;

  // TIER 6: Contains matches for name (400+ points)
  if (courseName.includes(queryLower)) score += 400;

  // TIER 7: Department matches (300+ points)
  if (course.departmentAbbr.toLowerCase() === normalizedQuery) score += 350;
  if (course.departmentAbbr.toLowerCase().startsWith(normalizedQuery))
    score += 300;

  // TIER 8: Description matches (1 point only)
  if (courseDescription.includes(queryLower)) score += 1;

  // Small boost for availability (doesn't override tier system)
  const sections = getAllSections(course);
  const availableSeats = sections.reduce(
    (sum, section) => sum + section.seatsAvailable,
    0,
  );
  if (availableSeats > 0) score += 0.5;

  return score;
}

/**
 * Unique professor names across all course sections, sorted; TBA entries excluded.
 */
export function getAvailableProfessors(courses: Course[]): string[] {
  const professors = new Set<string>();

  courses.forEach(course => {
    const sections = getAllSections(course);
    sections.forEach(section => {
      section.periods.forEach(period => {
        if (period.professor && period.professor !== 'TBA') {
          professors.add(period.professor);
        }
      });
    });
  });

  return Array.from(professors).sort();
}
