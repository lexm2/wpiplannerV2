#!/usr/bin/env bun

import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WPI_DATA_URL = 'https://courselistings.wpi.edu/assets/prod-data-raw.json';

interface FetchOptions extends RequestInit {
  timeout?: number;
}

// Fetch with timeout and retry logic
async function fetchWithRetry(
  url: string,
  options: FetchOptions = {},
  maxRetries = 3,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeout || 30000,
  );

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `Attempt ${attempt}/${maxRetries}: Fetching WPI course data...`,
      );

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent':
            'WPI-Course-Planner/1.0 (+https://github.com/lexm2/wpiplannerV2)',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate, br',
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Log response details
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        console.log(
          `Response size: ${Math.round((parseInt(contentLength) / 1024 / 1024) * 100) / 100} MB`,
        );
      }

      clearTimeout(timeout);
      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Attempt ${attempt} failed:`, errorMessage);

      if (attempt === maxRetries) {
        clearTimeout(timeout);
        throw new Error(
          `Failed after ${maxRetries} attempts. Last error: ${errorMessage}`,
          { cause: error },
        );
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unexpected: loop exited without returning or throwing');
}

async function fetchCourseData(): Promise<void> {
  try {
    console.log('Starting WPI course data fetch process...');

    const response = await fetchWithRetry(WPI_DATA_URL, { timeout: 45000 });
    console.log('Successfully connected, parsing JSON data...');

    const data = await response.json();
    console.log('Data parsed successfully');

    // Log data statistics
    const dataKeys = Object.keys(data);
    console.log(
      `Data contains ${dataKeys.length} top-level properties:`,
      dataKeys,
    );

    // Save raw data for section construction pipeline
    console.log('Saving raw course data...');
    const rawOutputPath = join(__dirname, '..', 'public', 'course-data.json');
    const jsonString = JSON.stringify(data, null, 2);
    writeFileSync(rawOutputPath, jsonString);
    console.log(
      `Raw data saved to ${rawOutputPath} (${Math.round((jsonString.length / 1024 / 1024) * 100) / 100} MB)`,
    );

    console.log('Course data fetch completed successfully!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch course data:', errorMessage);

    // Provide helpful debugging information
    if (
      errorMessage.includes('terminated') ||
      errorMessage.includes('ECONNRESET')
    ) {
      console.error('Network connection was terminated. This could be due to:');
      console.error('   - WPI server temporarily unavailable');
      console.error('   - Network timeout (large file download)');
      console.error('   - GitHub Actions network limitations');
    }

    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('AbortError')
    ) {
      console.error(
        'Request timed out. The WPI server may be slow or overloaded.',
      );
    }

    console.error(
      'This error is typically temporary. The GitHub Actions workflow will retry in 15 minutes.',
    );
    process.exit(1);
  }
}

fetchCourseData().catch(err => {
  console.error(err);
  process.exit(1);
});
