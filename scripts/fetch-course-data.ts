#!/usr/bin/env bun

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WPI_DATA_URL = 'https://courselistings.wpi.edu/assets/prod-data-raw.json';
// A full listing is ~4,000 sections; anything far below that is a bad response.
const MIN_REPORT_ENTRIES = 1000;

// The converter's input. Kept out of public/ since the app never fetches it.
const RAW_OUTPUT_PATH = join(__dirname, '..', 'data', 'course-data.json');

interface FetchOptions extends RequestInit {
  timeout?: number;
}

// Thrown for responses a retry won't fix (4xx other than timeouts/rate limits).
class PermanentHttpError extends Error {}

/**
 * Fetches and parses JSON, retrying on failure. The timeout is per attempt and
 * covers reading the body too, since the payload is large and can stall mid-read.
 */
async function fetchJsonWithRetry(
  url: string,
  options: FetchOptions = {},
  maxRetries = 3,
): Promise<unknown> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `Attempt ${attempt}/${maxRetries}: Fetching WPI course data...`,
      );

      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(options.timeout || 30000),
        headers: {
          'User-Agent':
            'WPI-Course-Planner/1.0 (+https://github.com/lexm2/wpiplannerV2)',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate, br',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const message = `HTTP ${response.status}: ${response.statusText}`;
        const retryable =
          response.status >= 500 ||
          response.status === 408 ||
          response.status === 429;
        throw retryable ? new Error(message) : new PermanentHttpError(message);
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        console.log(
          `Response size: ${Math.round((parseInt(contentLength) / 1024 / 1024) * 100) / 100} MB`,
        );
      }

      console.log('Successfully connected, parsing JSON data...');
      return await response.json();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Attempt ${attempt} failed:`, errorMessage);

      if (attempt === maxRetries || error instanceof PermanentHttpError) {
        throw new Error(
          `Failed after ${attempt} attempt(s). Last error: ${errorMessage}`,
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

function readFileOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

async function fetchCourseData(): Promise<void> {
  try {
    console.log('Starting WPI course data fetch process...');

    const data = await fetchJsonWithRetry(WPI_DATA_URL, { timeout: 45000 });
    console.log('Data parsed successfully');

    // Refuse to overwrite good data with an empty or truncated listing.
    const entries =
      data && typeof data === 'object'
        ? (data as { Report_Entry?: unknown }).Report_Entry
        : undefined;
    if (!Array.isArray(entries)) {
      throw new Error('Response has no Report_Entry array');
    }
    if (entries.length < MIN_REPORT_ENTRIES) {
      throw new Error(
        `Only ${entries.length} entries in Report_Entry (expected at least ${MIN_REPORT_ENTRIES})`,
      );
    }
    console.log(`Data contains ${entries.length} entries`);

    // WPI regenerates the file every 10 minutes whether or not anything
    // changed, so an identical copy is left alone: an unchanged file is what
    // tells the refresh loop and CI there is nothing to convert or publish.
    const jsonString = JSON.stringify(data, null, 2);
    if (jsonString === readFileOrNull(RAW_OUTPUT_PATH)) {
      console.log('Data is identical to the saved copy, leaving it untouched');
    } else {
      // Save raw data for section construction pipeline (tmp + rename so a
      // crash mid-write never leaves a truncated file behind)
      console.log('Saving raw course data...');
      const tmpPath = `${RAW_OUTPUT_PATH}.tmp`;
      writeFileSync(tmpPath, jsonString);
      renameSync(tmpPath, RAW_OUTPUT_PATH);
      console.log(
        `Raw data saved to ${RAW_OUTPUT_PATH} (${Math.round((jsonString.length / 1024 / 1024) * 100) / 100} MB)`,
      );
    }

    console.log('Course data fetch completed successfully!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch course data:', errorMessage);

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
      errorMessage.includes('timed out') ||
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
