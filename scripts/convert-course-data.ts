#!/usr/bin/env node

/**
 * CLI script for converting Workday course data to WPI Planner format
 * This script is executed by GitHub Actions to generate course data
 */

import { WorkdayConverter } from './converter/WorkdayConverter.js';
import { converterConfig } from './converter.config.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// After compilation, __dirname will be dist/scripts/, so go up 2 levels to get project root
const projectRoot = join(__dirname, '..', '..');

// File paths
const INPUT_PATH = join(projectRoot, 'public', 'course-data.json');
const OUTPUT_PATH = join(projectRoot, 'public', 'course-data-constructed.json');

async function main() {
    console.log('='.repeat(60));
    console.log('WPI Course Data Converter');
    console.log('Workday → Planner Hierarchical Format');
    console.log('='.repeat(60));
    console.log();

    try {
        const converter = new WorkdayConverter(converterConfig);
        await converter.convert(INPUT_PATH, OUTPUT_PATH);

        console.log('✅ Conversion successful!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Conversion failed:', error);
        if (error instanceof Error) {
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

main();
