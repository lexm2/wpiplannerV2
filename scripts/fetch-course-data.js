#!/usr/bin/env node

import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WPI_DATA_URL = 'https://courselistings.wpi.edu/assets/prod-data-raw.json';

async function fetchCourseData() {
  try {
    console.log('Fetching WPI course data...');
    
    const response = await fetch(WPI_DATA_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Data fetched successfully');
    
    // Save raw data for section construction pipeline
    const rawOutputPath = join(__dirname, '..', 'public', 'course-data.json');
    writeFileSync(rawOutputPath, JSON.stringify(data, null, 2));
    console.log(`Raw data saved to ${rawOutputPath}`);
    
    // Create timestamp file with current UTC time
    const timestampPath = join(__dirname, '..', 'public', 'last-updated.json');
    const now = new Date();
    const timestamp = {
      timestamp: now.toISOString(),
      utc: now.toUTCString().replace('GMT', 'UTC')
    };
    writeFileSync(timestampPath, JSON.stringify(timestamp, null, 2));
    
    console.log(`Raw data saved to ${rawOutputPath}`);
    console.log(`Timestamp saved to ${timestampPath}`);
    console.log(`Data contains ${Object.keys(data).length} top-level properties`);
    
  } catch (error) {
    console.error('Failed to fetch course data:', error);
    process.exit(1);
  }
}

fetchCourseData();