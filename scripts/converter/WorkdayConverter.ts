/**
 * Main converter class for transforming Workday JSON to WPI Planner format
 * Implements the NEW hierarchical structure with lecture groups
 */

import { readFile, writeFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WorkdayFeed, WorkdaySection } from './types/workdayTypes.js';
import { PlannerOutput } from './types/outputTypes.js';
import { ConverterConfig, isValidAcademicPeriod } from './ConverterConfig.js';
import { transformCourse } from './transformers/courseTransformer.js';
import { initializeDepartments, getDepartment } from './transformers/departmentTransformer.js';
import { TermBoundsOutput } from './types/termBoundsTypes.js';

export class WorkdayConverter {
    constructor(private config: ConverterConfig) {}

    /**
     * Main conversion method
     * Reads Workday JSON, transforms it, and writes planner JSON
     */
    async convert(inputPath: string, outputPath: string): Promise<void> {
        console.log('Starting Workday to Planner conversion...');
        console.log(`Input: ${inputPath}`);
        console.log(`Output: ${outputPath}`);

        // Read and parse input
        const workdayData = await this.readWorkdayData(inputPath);
        console.log(`Read ${workdayData.Report_Entry.length} sections from Workday`);

        // Pre-filter: Remove canceled sections
        const validSections = this.preFilterSections(workdayData.Report_Entry);
        console.log(`${validSections.length} sections after filtering canceled courses`);

        // Calculate and write term bounds
        const termBounds = this.calculateTermBounds(validSections);
        const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
        await this.writeTermBounds(termBounds, projectRoot);

        // Group sections by course (all terms combined)
        const courseGroups = this.groupSectionsByCourse(validSections);
        console.log(`Grouped into ${courseGroups.length} unique courses`);

        // Initialize departments
        const departments = initializeDepartments();

        // Transform each course group
        let coursesProcessed = 0;
        for (const group of courseGroups) {
            const firstSection = group[0];
            const courseSection = firstSection.Course_Section;
            const dashIndex = courseSection.indexOf('-');
            const subjectAndNumber = courseSection.substring(0, dashIndex);
            const departmentAbbrev = subjectAndNumber.substring(0, subjectAndNumber.indexOf(' '));

            // Transform course
            const course = transformCourse(group, departmentAbbrev, this.config);

            // Add to appropriate department
            const department = getDepartment(departments, departmentAbbrev);
            department.courses.push(course);

            coursesProcessed++;
            if (coursesProcessed % 100 === 0) {
                console.log(`Processed ${coursesProcessed}/${courseGroups.length} courses...`);
            }
        }

        console.log(`Transformed ${coursesProcessed} courses`);

        // Build output
        const output: PlannerOutput = {
            generated: new Date().toLocaleString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }),
            departments: Array.from(departments.values())
        };

        // Write output
        await this.writePlannerData(output, outputPath);
        console.log('Conversion complete!');

        // Print statistics
        this.printStatistics(output);
    }

    /**
     * Reads and parses Workday JSON file
     */
    private async readWorkdayData(inputPath: string): Promise<WorkdayFeed> {
        const content = await readFile(inputPath, 'utf-8');
        return JSON.parse(content) as WorkdayFeed;
    }

    /**
     * Pre-filters sections to remove invalid ones
     */
    private preFilterSections(sections: WorkdaySection[]): WorkdaySection[] {
        return sections.filter(section => {
            // Remove canceled sections
            if (section.Section_Status === 'Canceled: Preliminary') {
                return false;
            }

            // Remove sections from invalid academic periods
            if (!isValidAcademicPeriod(
                section.Offering_Period,
                section.Course_Section,
                section.Instructional_Format,
                this.config
            )) {
                return false;
            }

            return true;
        });
    }

    /**
     * Groups sections by course only (all terms combined)
     * Assumes sections are pre-sorted by course (as they are in Workday data)
     */
    private groupSectionsByCourse(sections: WorkdaySection[]): WorkdaySection[][] {
        const groups: WorkdaySection[][] = [];
        let currentGroup: WorkdaySection[] = [];

        for (const section of sections) {
            const courseSection = section.Course_Section;
            const dashIndex = courseSection.indexOf('-');
            const courseId = courseSection.substring(0, dashIndex); // e.g., "CS 1101"

            // Check if this section belongs to current group
            if (currentGroup.length > 0) {
                const prevSection = currentGroup[0];
                const prevCourseSection = prevSection.Course_Section;
                const prevDashIndex = prevCourseSection.indexOf('-');
                const prevCourseId = prevCourseSection.substring(0, prevDashIndex);

                // Same course? (ignore term - all terms go in same course)
                if (courseId === prevCourseId) {
                    currentGroup.push(section);
                    continue;
                }

                // Different course - start new group
                groups.push(currentGroup);
                currentGroup = [section];
            } else {
                // First section
                currentGroup = [section];
            }
        }

        // Don't forget the last group
        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }

        return groups;
    }

    /**
     * Writes planner data to JSON file
     */
    private async writePlannerData(data: PlannerOutput, outputPath: string): Promise<void> {
        const json = JSON.stringify(data, null, 2);
        await writeFile(outputPath, json, 'utf-8');
        console.log(`Wrote output to ${outputPath}`);

        // Calculate file size
        const stats = await stat(outputPath);
        const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`Output file size: ${sizeInMB} MB`);
    }

    /**
     * Prints conversion statistics
     */
    private printStatistics(output: PlannerOutput): void {
        let totalCourses = 0;
        let totalLectures = 0;
        let totalDiscussions = 0;
        let totalLabs = 0;
        let totalStandaloneLabs = 0;

        for (const dept of output.departments) {
            totalCourses += dept.courses.length;

            for (const course of dept.courses) {
                totalLectures += course.lectures.length;

                for (const lectureGroup of course.lectures) {
                    totalDiscussions += lectureGroup.compatibleDiscussions.length;
                    totalLabs += lectureGroup.compatibleLabs.length;
                }

                if (course.standaloneLabs) {
                    totalStandaloneLabs += course.standaloneLabs.length;
                }
            }
        }

        console.log('\n--- Conversion Statistics ---');
        console.log(`Departments: ${output.departments.filter(d => d.courses.length > 0).length}`);
        console.log(`Courses: ${totalCourses}`);
        console.log(`Lecture groups: ${totalLectures}`);
        console.log(`Total discussions: ${totalDiscussions}`);
        console.log(`Total labs: ${totalLabs}`);
        console.log(`Standalone labs: ${totalStandaloneLabs}`);
        console.log(`Generated: ${output.generated}`);
        console.log('----------------------------\n');
    }

    /**
     * Calculates term bounds from Workday sections using mode (most common dates)
     */
    private calculateTermBounds(sections: WorkdaySection[]): TermBoundsOutput {
        const academicYear = `${this.config.fallYear}-${this.config.springYear}`;

        const FALLBACK_DATES = {
            A: { start: `${this.config.fallYear}-07-25`, end: `${this.config.fallYear}-09-13`, period: `${this.config.fallYear} Fall A Term` },
            B: { start: `${this.config.fallYear}-09-21`, end: `${this.config.fallYear}-11-13`, period: `${this.config.fallYear} Fall B Term` },
            C: { start: `${this.config.springYear}-01-06`, end: `${this.config.springYear}-03-07`, period: `${this.config.springYear} Spring C Term` },
            D: { start: `${this.config.springYear}-03-17`, end: `${this.config.springYear}-05-09`, period: `${this.config.springYear} Spring D Term` },
        };

        const terms = ['A', 'B', 'C', 'D'] as const;
        const result: any = {
            academicYear,
            generated: new Date().toISOString(),
            terms: {}
        };

        for (const term of terms) {
            const termSections = sections.filter(s => {
                const extracted = this.extractTermFromOfferingPeriod(s.Offering_Period);
                return extracted === term;
            });

            if (termSections.length === 0) {
                console.warn(`[TermBounds] No sections found for term ${term}, using fallback`);
                result.terms[term] = {
                    startDate: FALLBACK_DATES[term].start,
                    endDate: FALLBACK_DATES[term].end,
                    offeringPeriod: FALLBACK_DATES[term].period,
                    sampleSize: 0
                };
                continue;
            }

            const datePairs = new Map<string, number>();
            for (const section of termSections) {
                const start = section.Course_Section_Start_Date;
                const end = section.Course_Section_End_Date;

                if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
                    continue;
                }

                const key = `${start}|${end}`;
                datePairs.set(key, (datePairs.get(key) || 0) + 1);
            }

            if (datePairs.size === 0) {
                console.warn(`[TermBounds] No valid dates for term ${term}, using fallback`);
                result.terms[term] = {
                    startDate: FALLBACK_DATES[term].start,
                    endDate: FALLBACK_DATES[term].end,
                    offeringPeriod: FALLBACK_DATES[term].period,
                    sampleSize: 0
                };
                continue;
            }

            let maxCount = 0;
            let modeKey = '';
            for (const [key, count] of datePairs.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    modeKey = key;
                }
            }

            const [startDate, endDate] = modeKey.split('|');
            const sampleSection = termSections.find(s =>
                s.Course_Section_Start_Date === startDate &&
                s.Course_Section_End_Date === endDate
            );

            result.terms[term] = {
                startDate,
                endDate,
                offeringPeriod: sampleSection?.Offering_Period || FALLBACK_DATES[term].period,
                sampleSize: maxCount
            };

            console.log(`[TermBounds] Term ${term}: ${startDate} to ${endDate} (${maxCount}/${termSections.length} sections)`);
        }

        return result as TermBoundsOutput;
    }

    /**
     * Extracts term letter from Offering_Period
     * Examples: "2025 Fall A Term" -> "A", "2026 Spring C Term" -> "C"
     */
    private extractTermFromOfferingPeriod(offeringPeriod: string): string | null {
        const match = offeringPeriod.match(/\b([ABCD])\s+Term$/);
        return match ? match[1] : null;
    }

    private async writeTermBounds(data: TermBoundsOutput, projectRoot: string): Promise<void> {
        const outputPath = join(projectRoot, 'public', 'term-bounds.json');
        const json = JSON.stringify(data, null, 2);
        await writeFile(outputPath, json, 'utf-8');
        console.log(`[TermBounds] Wrote term bounds to ${outputPath}`);
    }
}
