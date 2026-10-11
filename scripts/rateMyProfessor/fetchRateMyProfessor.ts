/**
 * Script to fetch Rate My Professor data for WPI professors
 * Uses direct GraphQL queries to the Rate My Professors API
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Professor, RateMyProfessorData, School } from './types';

// WPI School Information (obtained from https://www.ratemyprofessors.com/school/1220)
const WPI_LEGACY_ID = 1220;
const WPI_SCHOOL_NAME = 'Worcester Polytechnic Institute';
const WPI_SCHOOL_CITY = 'Worcester';
const WPI_SCHOOL_STATE = 'MA';

// Encode school ID for GraphQL API (format: "School-{id}" in base64)
const WPI_SCHOOL_ID = Buffer.from(`School-${WPI_LEGACY_ID}`).toString('base64');

// Rate My Professors GraphQL API endpoint
const GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql';

// Authorization token (from @mtucourses/rate-my-professors library)
const AUTH_TOKEN = 'dGVzdDp0ZXN0';

const OUTPUT_PATH = path.join(process.cwd(), 'public', 'rateMyProfessor.json');

// Rate limiting configuration
const DELAY_BETWEEN_REQUESTS_MS = 100;
const REQUEST_TIMEOUT_MS = 15000;

// Refuse to overwrite the existing file with a result smaller than this share of
// it; CI commits whatever gets written, so an API outage must not wipe the data.
const MIN_RESULT_RATIO = 0.5;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function graphqlRequest(query: string, variables: any): Promise<any> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${AUTH_TOKEN}`,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

/**
 * Search for teachers at a school with pagination
 */
async function searchTeachers(
  schoolID: string,
  query: string = '*',
): Promise<any[]> {
  const graphqlQuery = `
    query NewSearchTeachersQuery($query: TeacherSearchQuery!) {
      newSearch {
        teachers(query: $query, first: 1000) {
          edges {
            node {
              id
              legacyId
              firstName
              lastName
              department
              avgDifficulty
              avgRating
              numRatings
              wouldTakeAgainPercent
              school {
                id
                name
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    query: {
      text: query,
      schoolID: schoolID,
    },
  };

  const data = await graphqlRequest(graphqlQuery, variables);

  if (!data.newSearch.teachers) {
    return [];
  }

  return data.newSearch.teachers.edges.map((edge: any) => edge.node);
}

/**
 * Fetch all professors for WPI by searching through the alphabet
 */
async function fetchWPIProfessors(): Promise<Professor[]> {
  console.log(`Searching for professors at ${WPI_SCHOOL_NAME}...`);

  try {
    // The API doesn't support getting all teachers at once, so we search by letter
    // This is a workaround to get as many professors as possible
    const allTeachers = new Map<string, any>();
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const failedLetters: string[] = [];

    console.log('Searching through alphabet to find all professors...');

    for (const letter of letters) {
      try {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
        const teachers = await searchTeachers(WPI_SCHOOL_ID, letter);

        for (const teacher of teachers) {
          // Use ID as key to avoid duplicates
          if (!allTeachers.has(teacher.id)) {
            allTeachers.set(teacher.id, teacher);
          }
        }

        process.stdout.write(
          `\rProgress: ${letter.toUpperCase()} (${allTeachers.size} unique professors found)`,
        );
      } catch (error) {
        console.error(`\nFailed to search for letter ${letter}:`, error);
        failedLetters.push(letter);
      }
    }

    // A missing letter silently drops every professor only it would find
    if (failedLetters.length > 0) {
      throw new Error(
        `Search failed for letter(s): ${failedLetters.join(', ')}`,
      );
    }

    console.log(`\n\nFound ${allTeachers.size} unique professors.`);

    const teachers = Array.from(allTeachers.values());

    if (teachers.length === 0) {
      throw new Error('No professors found for WPI');
    }

    // The search nodes already carry the rating fields, so no per-teacher
    // detail request is needed.
    const professors: Professor[] = teachers.map((teacher): Professor => ({
      id: teacher.id,
      legacyId: teacher.legacyId,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      department: teacher.department || 'Unknown',
      avgRating: teacher.avgRating || 0,
      avgDifficulty: teacher.avgDifficulty || 0,
      numRatings: teacher.numRatings || 0,
      wouldTakeAgainPercent: teacher.wouldTakeAgainPercent ?? null,
      profileUrl: `https://www.ratemyprofessors.com/professor/${teacher.legacyId}`,
    }));

    return professors;
  } catch (error) {
    console.error('Error fetching professors:', error);
    throw error;
  }
}

/**
 * Throws if the new result is drastically smaller than what's already on disk
 */
async function checkAgainstExisting(totalProfessors: number): Promise<void> {
  let existingTotal: number;
  try {
    const existing = JSON.parse(
      await fs.readFile(OUTPUT_PATH, 'utf-8'),
    ) as Partial<RateMyProfessorData>;
    existingTotal = existing.totalProfessors ?? 0;
  } catch {
    // No readable existing file, nothing to compare against
    return;
  }

  if (totalProfessors < existingTotal * MIN_RESULT_RATIO) {
    throw new Error(
      `Only ${totalProfessors} professors fetched vs ${existingTotal} in the existing file; refusing to overwrite`,
    );
  }
}

async function saveToFile(data: RateMyProfessorData): Promise<void> {
  try {
    const dataDir = path.dirname(OUTPUT_PATH);
    await fs.mkdir(dataDir, { recursive: true });

    await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf-8');

    console.log(`\nData successfully saved to ${OUTPUT_PATH}`);
    console.log(`Total professors: ${data.totalProfessors}`);
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
}

async function main() {
  console.log('=== WPI Rate My Professor Data Fetcher ===\n');

  const startTime = Date.now();

  try {
    const school: School = {
      id: WPI_LEGACY_ID.toString(),
      name: WPI_SCHOOL_NAME,
      city: WPI_SCHOOL_CITY,
      state: WPI_SCHOOL_STATE,
    };

    const professors = await fetchWPIProfessors();

    professors.sort((a, b) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName);
      if (lastNameCompare !== 0) return lastNameCompare;
      return a.firstName.localeCompare(b.firstName);
    });

    const data: RateMyProfessorData = {
      lastUpdated: new Date().toISOString(),
      school,
      professors,
      totalProfessors: professors.length,
    };

    await checkAgainstExisting(data.totalProfessors);
    await saveToFile(data);

    const endTime = Date.now();
    const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n✓ Complete! Execution time: ${durationSeconds}s`);

    if (professors.length > 0) {
      const avgRating =
        professors.reduce((sum, p) => sum + p.avgRating, 0) / professors.length;
      const avgDifficulty =
        professors.reduce((sum, p) => sum + p.avgDifficulty, 0) /
        professors.length;
      const professorsWithRatings = professors.filter(
        p => p.numRatings > 0,
      ).length;

      console.log('\n=== Statistics ===');
      console.log(
        `Professors with ratings: ${professorsWithRatings}/${professors.length}`,
      );
      console.log(`Average rating: ${avgRating.toFixed(2)}/5.0`);
      console.log(`Average difficulty: ${avgDifficulty.toFixed(2)}/5.0`);
    }
  } catch (error) {
    console.error('\n✗ Failed to fetch Rate My Professor data:', error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
