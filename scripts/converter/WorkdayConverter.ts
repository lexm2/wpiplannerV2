/**
 * Main converter class for transforming Workday JSON to WPI Planner format
 * Implements the NEW hierarchical structure with lecture groups
 */

import { readFile, writeFile, stat } from 'fs/promises';
import { WorkdayFeed, WorkdaySection } from './types/workdayTypes.js';
import { PlannerOutput } from './types/outputTypes.js';
import { ConverterConfig, isValidAcademicPeriod } from './ConverterConfig.js';
import { transformCourse } from './transformers/courseTransformer.js';
import { initializeDepartments, getDepartment } from './transformers/departmentTransformer.js';

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

        // Group sections by course and term
        const courseGroups = this.groupSectionsByCourse(validSections);
        console.log(`Grouped into ${courseGroups.length} course-term combinations`);

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
     * Groups sections by course and term
     * Assumes sections are pre-sorted by course (as they are in Workday data)
     */
    private groupSectionsByCourse(sections: WorkdaySection[]): WorkdaySection[][] {
        const groups: WorkdaySection[][] = [];
        let currentGroup: WorkdaySection[] = [];

        for (const section of sections) {
            const courseSection = section.Course_Section;
            const dashIndex = courseSection.indexOf('-');
            const courseId = courseSection.substring(0, dashIndex); // e.g., "CS 1101"
            const term = section.Starting_Academic_Period_Type;

            // Check if this section belongs to current group
            if (currentGroup.length > 0) {
                const prevSection = currentGroup[0];
                const prevCourseSection = prevSection.Course_Section;
                const prevDashIndex = prevCourseSection.indexOf('-');
                const prevCourseId = prevCourseSection.substring(0, prevDashIndex);
                const prevTerm = prevSection.Starting_Academic_Period_Type;

                // Same course and term?
                if (courseId === prevCourseId && term === prevTerm) {
                    currentGroup.push(section);
                    continue;
                }

                // Different course/term - start new group
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
}
