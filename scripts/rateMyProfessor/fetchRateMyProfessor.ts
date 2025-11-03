/**
 * Script to fetch Rate My Professor data for WPI professors
 * Uses direct GraphQL queries to the Rate My Professors API
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  Professor,
  RateMyProfessorData,
  School,
} from './types';

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

// Output file path
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'rateMyProfessor.json');

// Rate limiting configuration
const DELAY_BETWEEN_REQUESTS_MS = 100; // 100ms delay between requests

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make a GraphQL request to Rate My Professors API
 */
async function graphqlRequest(query: string, variables: any): Promise<any> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${AUTH_TOKEN}`,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
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
async function searchTeachers(schoolID: string, query: string = '*'): Promise<any[]> {
  const graphqlQuery = `
    query NewSearchTeachersQuery($query: TeacherSearchQuery!) {
      newSearch {
        teachers(query: $query, first: 1000) {
          edges {
            node {
              id
              firstName
              lastName
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
 * Get detailed information about a teacher
 */
async function getTeacher(id: string): Promise<any> {
  const graphqlQuery = `
    query TeacherQuery($id: ID!) {
      node(id: $id) {
        ... on Teacher {
          id
          legacyId
          firstName
          lastName
          department
          avgDifficulty
          avgRating
          numRatings
          wouldTakeAgainPercent
        }
      }
    }
  `;

  const data = await graphqlRequest(graphqlQuery, { id });
  return data.node;
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

        process.stdout.write(`\rProgress: ${letter.toUpperCase()} (${allTeachers.size} unique professors found)`);
      } catch (error) {
        console.error(`\nFailed to search for letter ${letter}:`, error);
      }
    }

    console.log(`\n\nFound ${allTeachers.size} unique professors. Fetching detailed information...`);

    const teachers = Array.from(allTeachers.values());

    if (teachers.length === 0) {
      console.warn('No professors found for WPI');
      return [];
    }

    const professors: Professor[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Fetch detailed information for each professor with rate limiting
    for (let i = 0; i < teachers.length; i++) {
      const teacher = teachers[i];

      try {
        // Add delay between requests to avoid overwhelming the API
        if (i > 0) {
          await sleep(DELAY_BETWEEN_REQUESTS_MS);
        }

        const details = await getTeacher(teacher.id);

        if (!details) {
          throw new Error('No details returned');
        }

        // Create professor object with cleaned data
        const professor: Professor = {
          id: details.id,
          legacyId: details.legacyId,
          firstName: details.firstName || teacher.firstName,
          lastName: details.lastName || teacher.lastName,
          department: details.department || 'Unknown',
          avgRating: details.avgRating || 0,
          avgDifficulty: details.avgDifficulty || 0,
          numRatings: details.numRatings || 0,
          wouldTakeAgainPercent: details.wouldTakeAgainPercent ?? null,
          profileUrl: `https://www.ratemyprofessors.com/professor/${details.legacyId}`,
        };

        professors.push(professor);
        successCount++;

        // Log progress every 10 professors
        if ((i + 1) % 10 === 0) {
          console.log(`Progress: ${i + 1}/${teachers.length} professors processed`);
        }
      } catch (error) {
        failureCount++;
        console.error(`Failed to fetch details for ${teacher.firstName} ${teacher.lastName}:`, error);
        // Continue with the next professor
      }
    }

    console.log(`\nCompleted: ${successCount} successful, ${failureCount} failed`);

    return professors;
  } catch (error) {
    console.error('Error fetching professors:', error);
    throw error;
  }
}

/**
 * Save data to JSON file
 */
async function saveToFile(data: RateMyProfessorData): Promise<void> {
  try {
    // Ensure the data directory exists
    const dataDir = path.dirname(OUTPUT_PATH);
    await fs.mkdir(dataDir, { recursive: true });

    // Write JSON file with pretty formatting
    await fs.writeFile(
      OUTPUT_PATH,
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    console.log(`\nData successfully saved to ${OUTPUT_PATH}`);
    console.log(`Total professors: ${data.totalProfessors}`);
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('=== WPI Rate My Professor Data Fetcher ===\n');

  const startTime = Date.now();

  try {
    // WPI school information
    const school: School = {
      id: WPI_LEGACY_ID.toString(),
      name: WPI_SCHOOL_NAME,
      city: WPI_SCHOOL_CITY,
      state: WPI_SCHOOL_STATE,
    };

    // Fetch professor data
    const professors = await fetchWPIProfessors();

    // Sort professors alphabetically by last name, then first name
    professors.sort((a, b) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName);
      if (lastNameCompare !== 0) return lastNameCompare;
      return a.firstName.localeCompare(b.firstName);
    });

    // Create output data structure
    const data: RateMyProfessorData = {
      lastUpdated: new Date().toISOString(),
      school,
      professors,
      totalProfessors: professors.length,
    };

    // Save to file
    await saveToFile(data);

    const endTime = Date.now();
    const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n✓ Complete! Execution time: ${durationSeconds}s`);

    // Print some statistics
    if (professors.length > 0) {
      const avgRating = professors.reduce((sum, p) => sum + p.avgRating, 0) / professors.length;
      const avgDifficulty = professors.reduce((sum, p) => sum + p.avgDifficulty, 0) / professors.length;
      const professorsWithRatings = professors.filter(p => p.numRatings > 0).length;

      console.log('\n=== Statistics ===');
      console.log(`Professors with ratings: ${professorsWithRatings}/${professors.length}`);
      console.log(`Average rating: ${avgRating.toFixed(2)}/5.0`);
      console.log(`Average difficulty: ${avgDifficulty.toFixed(2)}/5.0`);
    }
  } catch (error) {
    console.error('\n✗ Failed to fetch Rate My Professor data:', error);
    process.exit(1);
  }
}

// Run the script
main();
