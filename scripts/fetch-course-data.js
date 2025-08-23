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
    
    const outputPath = join(__dirname, '..', 'public', 'course-data.json');
    writeFileSync(outputPath, JSON.stringify(data, null, 2));
    
    console.log(`Course data saved to ${outputPath}`);
    console.log(`Data contains ${Object.keys(data).length} top-level properties`);
    
  } catch (error) {
    console.error('Failed to fetch course data:', error);
    process.exit(1);
  }
}

fetchCourseData();