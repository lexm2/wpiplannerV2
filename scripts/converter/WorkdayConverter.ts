import { readFile, writeFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WorkdayFeed, WorkdaySection } from './types/workdayTypes.js';
import { PlannerOutput } from './types/outputTypes.js';
import { ConverterConfig, isValidAcademicPeriod } from './ConverterConfig.js';
import { transformCourse } from './transformers/courseTransformer.js';
import {
  initializeDepartments,
  getDepartment,
} from './transformers/departmentTransformer.js';
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

    const workdayData = await this.readWorkdayData(inputPath);
    console.log(
      `Read ${workdayData.Report_Entry.length} sections from Workday`,
    );

    const validSections = this.preFilterSections(workdayData.Report_Entry);
    console.log(
      `${validSections.length} sections after filtering canceled courses`,
    );

    const termBounds = this.calculateTermBounds(validSections);
    const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
    await this.writeTermBounds(termBounds, projectRoot);

    const courseGroups = this.groupSectionsByCourse(validSections);
    console.log(`Grouped into ${courseGroups.length} unique courses`);

    const departments = initializeDepartments();

    let coursesProcessed = 0;
    for (const group of courseGroups) {
      const firstSection = group[0];
      const courseSection = firstSection.Course_Section;
      const dashIndex = courseSection.indexOf('-');
      const subjectAndNumber = courseSection.substring(0, dashIndex);
      const departmentAbbrev = subjectAndNumber.substring(
        0,
        subjectAndNumber.indexOf(' '),
      );

      const course = transformCourse(group, departmentAbbrev, this.config);

      const department = getDepartment(departments, departmentAbbrev);
      department.courses.push(course);

      coursesProcessed++;
      if (coursesProcessed % 100 === 0) {
        console.log(
          `Processed ${coursesProcessed}/${courseGroups.length} courses...`,
        );
      }
    }

    console.log(`Transformed ${coursesProcessed} courses`);

    const output: PlannerOutput = {
      generated: new Date().toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      departments: Array.from(departments.values()),
    };

    await this.writePlannerData(output, outputPath);
    console.log('Conversion complete!');

    this.printStatistics(output);
  }

  private async readWorkdayData(inputPath: string): Promise<WorkdayFeed> {
    const content = await readFile(inputPath, 'utf-8');
    return JSON.parse(content) as WorkdayFeed;
  }

  private preFilterSections(sections: WorkdaySection[]): WorkdaySection[] {
    return sections.filter(section => {
      if (section.Section_Status === 'Canceled: Preliminary') {
        return false;
      }

      if (
        !isValidAcademicPeriod(
          section.Offering_Period,
          section.Course_Section,
          section.Instructional_Format,
          this.config,
        )
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Groups sections by course AND academic year (all terms combined within a year).
   * Uses a Map because the Workday feed interleaves years per section
   * (e.g. CS-1101-2025, CS-1101-2026, CS-1102-2025, CS-1102-2026, ...)
   * rather than grouping all sections for a course consecutively.
   */
  private groupSectionsByCourse(
    sections: WorkdaySection[],
  ): WorkdaySection[][] {
    const groupMap = new Map<string, WorkdaySection[]>();

    for (const section of sections) {
      const courseSection = section.Course_Section;
      const dashIndex = courseSection.indexOf('-');
      const courseId = courseSection.substring(0, dashIndex); // e.g., "CS 1101"
      const academicYear = parseInt(section.Academic_Year);
      const key = `${courseId}|${academicYear}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(section);
    }

    return Array.from(groupMap.values());
  }

  private async writePlannerData(
    data: PlannerOutput,
    outputPath: string,
  ): Promise<void> {
    const json = JSON.stringify(data, null, 2);
    await writeFile(outputPath, json, 'utf-8');
    console.log(`Wrote output to ${outputPath}`);

    const stats = await stat(outputPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`Output file size: ${sizeInMB} MB`);
  }

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
    console.log(
      `Departments: ${output.departments.filter(d => d.courses.length > 0).length}`,
    );
    console.log(`Courses: ${totalCourses}`);
    console.log(`Lecture groups: ${totalLectures}`);
    console.log(`Total discussions: ${totalDiscussions}`);
    console.log(`Total labs: ${totalLabs}`);
    console.log(`Standalone labs: ${totalStandaloneLabs}`);
    console.log(`Generated: ${output.generated}`);
    console.log('----------------------------\n');
  }

  private calculateTermBounds(sections: WorkdaySection[]): TermBoundsOutput {
    const uniqueYears = [
      ...new Set(sections.map(s => parseInt(s.Academic_Year))),
    ].sort();
    console.log(
      `[TermBounds] Detected academic years: ${uniqueYears.join(', ')}`,
    );

    const result: TermBoundsOutput = {
      generated: new Date().toISOString(),
      years: {},
    };

    for (const fallYear of uniqueYears) {
      const springYear = fallYear + 1;
      const yearSections = sections.filter(
        s => parseInt(s.Academic_Year) === fallYear,
      );

      const FALLBACK_DATES = {
        A: {
          start: `${fallYear}-07-25`,
          end: `${fallYear}-09-13`,
          period: `${fallYear} Fall A Term`,
        },
        B: {
          start: `${fallYear}-09-21`,
          end: `${fallYear}-11-13`,
          period: `${fallYear} Fall B Term`,
        },
        C: {
          start: `${springYear}-01-06`,
          end: `${springYear}-03-07`,
          period: `${springYear} Spring C Term`,
        },
        D: {
          start: `${springYear}-03-17`,
          end: `${springYear}-05-09`,
          period: `${springYear} Spring D Term`,
        },
      };

      const terms = ['A', 'B', 'C', 'D'] as const;
      const yearBounds: any = {};

      for (const term of terms) {
        const termSections = yearSections.filter(
          s => this.extractTermFromOfferingPeriod(s.Offering_Period) === term,
        );

        if (termSections.length === 0) {
          console.warn(
            `[TermBounds] No sections for year ${fallYear} term ${term}, using fallback`,
          );
          yearBounds[term] = {
            startDate: FALLBACK_DATES[term].start,
            endDate: FALLBACK_DATES[term].end,
            offeringPeriod: FALLBACK_DATES[term].period,
            sampleSize: 0,
          };
          continue;
        }

        const datePairs = new Map<string, number>();
        for (const section of termSections) {
          const start = section.Course_Section_Start_Date;
          const end = section.Course_Section_End_Date;
          if (
            !start ||
            !end ||
            !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(end)
          ) {
            continue;
          }
          const key = `${start}|${end}`;
          datePairs.set(key, (datePairs.get(key) || 0) + 1);
        }

        if (datePairs.size === 0) {
          console.warn(
            `[TermBounds] No valid dates for year ${fallYear} term ${term}, using fallback`,
          );
          yearBounds[term] = {
            startDate: FALLBACK_DATES[term].start,
            endDate: FALLBACK_DATES[term].end,
            offeringPeriod: FALLBACK_DATES[term].period,
            sampleSize: 0,
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
        const sampleSection = termSections.find(
          s =>
            s.Course_Section_Start_Date === startDate &&
            s.Course_Section_End_Date === endDate,
        );

        yearBounds[term] = {
          startDate,
          endDate,
          offeringPeriod:
            sampleSection?.Offering_Period || FALLBACK_DATES[term].period,
          sampleSize: maxCount,
        };

        console.log(
          `[TermBounds] Year ${fallYear} Term ${term}: ${startDate} to ${endDate} (${maxCount}/${termSections.length} sections)`,
        );
      }

      result.years[fallYear] = yearBounds;
    }

    return result;
  }

  /**
   * Extracts term letter from Offering_Period
   * Examples: "2025 Fall A Term" -> "A", "2026 Spring C Term" -> "C"
   */
  private extractTermFromOfferingPeriod(offeringPeriod: string): string | null {
    const match = offeringPeriod.match(/\b([ABCD])\s+Term$/);
    return match ? match[1] : null;
  }

  private async writeTermBounds(
    data: TermBoundsOutput,
    projectRoot: string,
  ): Promise<void> {
    const outputPath = join(projectRoot, 'public', 'term-bounds.json');
    const json = JSON.stringify(data, null, 2);
    await writeFile(outputPath, json, 'utf-8');
    console.log(`[TermBounds] Wrote term bounds to ${outputPath}`);
  }
}
