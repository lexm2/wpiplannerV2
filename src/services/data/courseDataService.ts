import type { ScheduleDB, Department, Course, Section, Period, Time, LectureGroup } from '../../types'
import { DayOfWeek, PeriodType } from '../../types'
import { AcademicTerm } from '../../types/schedule'
import type { RawDepartment, RawCourse, RawSection, RawLectureGroup, RawPeriod } from '../../types/rawData'
import { appState } from '../../core/state/appState.svelte'
import { logger } from '../../utils/logger'

/**
 * Fetches and transforms WPI course catalog data with duplicate resolution and HTML sanitization.
 * Publishes the catalog by reassigning `appState.loadedDepartments`; consumers react to that.
 */
export class CourseDataService {
    private static readonly WPI_COURSE_DATA_URL = './course-data-constructed.json';
    private scheduleDB: ScheduleDB | null = null;
    private latestAcademicYear: number | undefined;

    constructor() {}

    async loadCourseData(): Promise<ScheduleDB> {
        try {
            const freshData = await this.fetchFreshData();
            this.scheduleDB = freshData;

            appState.loadedDepartments = freshData.departments;

            return freshData;
        } catch (error) {
            logger.error('Failed to load course data:', error);
            throw new Error('No course data available');
        }
    }

    private async fetchFreshData(): Promise<ScheduleDB> {
        
        const response = await fetch(CourseDataService.WPI_COURSE_DATA_URL, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
            cache: 'no-cache'
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch course data: ${response.status} ${response.statusText}`);
        }

        const jsonData = await response.json();
        return this.parseJSONData(jsonData);
    }

    private parseJSONData(jsonData: { departments?: RawDepartment[]; generated?: string }): ScheduleDB {

        if (!jsonData.departments || !Array.isArray(jsonData.departments)) {
            logger.error('Invalid JSON data structure:', jsonData);
            throw new Error('Invalid JSON data structure - missing departments array');
        }


        const realDepartments = this.parseConstructedDepartments(jsonData.departments);
        const latestYear = Math.max(...realDepartments.flatMap(d => d.courses.map(c => c.academicYear ?? 0)));
        this.latestAcademicYear = latestYear || undefined;

        const scheduleDB: ScheduleDB = {
            departments: [...realDepartments],
            generated: jsonData.generated || new Date().toISOString()
        };
        
        //this.logMA1024Sections(scheduleDB); << Lots of sections for reference
        
        return scheduleDB;
    }

    private parseConstructedDepartments(departments: RawDepartment[]): Department[] {
        const seenIds = new Set<string>();
        const duplicateIds = new Set<string>();
        let totalCoursesProcessed = 0;
        let duplicatesFixed = 0;
        
        const result = departments.map(deptData => {
            const department: Department = {
                abbreviation: deptData.abbreviation,
                name: deptData.name,
                courses: []
            };
            
            department.courses = deptData.courses.map((courseData: RawCourse) => {
                totalCoursesProcessed++;
                let courseId = courseData.id;

                if (seenIds.has(courseId)) {
                    duplicateIds.add(courseId);

                    const STRICT_VALIDATION = import.meta.env.DEV || import.meta.env.MODE === 'development';

                    if (STRICT_VALIDATION) {
                        // Fail hard in dev to force fixing bad data at the source
                        throw new Error(
                            `CRITICAL DATA ERROR: Duplicate course ID "${courseId}" detected.\n` +
                            `This indicates a data quality issue in course-data-constructed.json.\n` +
                            `Please fix the backend data generation process.\n` +
                            `Duplicate IDs found so far: ${Array.from(duplicateIds).join(', ')}`
                        );
                    } else {
                        // Production fallback: derive a synthetic unique ID
                        const fallbackId = `${department.abbreviation}-${courseData.number}`;
                        logger.error(`DUPLICATE ID: "${courseId}" for ${department.abbreviation}${courseData.number}`);
                        logger.error(`   Using fallback ID: "${fallbackId}"`);
                        courseId = fallbackId;
                        duplicatesFixed++;

                        // If fallback is also a duplicate, append a counter
                        let counter = 2;
                        while (seenIds.has(courseId)) {
                            courseId = `${fallbackId}-${counter}`;
                            counter++;
                        }

                        logger.error('[Data Quality Issue]', {
                            type: 'duplicate_course_id',
                            originalId: courseId,
                            fallbackId: courseId,
                            timestamp: Date.now()
                        });
                    }
                }
                
                seenIds.add(courseId);

                const lectures = this.parseLectureGroups(courseData.lectures || []);
                const standaloneLabs = courseData.standaloneLabs
                    ? this.parseConstructedSections(courseData.standaloneLabs)
                    : undefined;

                const course: Course = {
                    id: courseId,
                    number: courseData.number,
                    name: courseData.name,
                    description: this.stripHtml(courseData.description || ''),
                    category: courseData.category ?? null,
                    departmentAbbr: department.abbreviation,
                    departmentName: department.name,
                    lectures: lectures.length > 0 ? lectures : undefined,
                    standaloneLabs: standaloneLabs,
                    minCredits: courseData.minCredits || 0,
                    maxCredits: courseData.maxCredits || 0,
                    isGraduate: courseData.isGraduate || false,
                    academicYear: courseData.academicYear
                };
                return course;
            });
            
            return department;
        });

        if (duplicatesFixed > 0) {
            logger.warn(`Course ID deduplication: fixed ${duplicatesFixed} of ${totalCoursesProcessed} courses; affected IDs: [${Array.from(duplicateIds).join(', ')}]`);
        }

        
        return result;
    }

    private parseConstructedSections(sections: RawSection[]): Section[] {
        return sections.map(sectionData => {
            const section: Section = {
                crn: sectionData.crn || 0,
                number: sectionData.number || '',
                seats: sectionData.seats || 0,
                seatsAvailable: sectionData.seatsAvailable || 0,
                actualWaitlist: sectionData.actualWaitlist || 0,
                maxWaitlist: sectionData.maxWaitlist || 0,
                note: sectionData.note,
                computedTerm: sectionData.computedTerm as AcademicTerm,
                isInterestList: sectionData.isInterestList,
                periods: this.parseConstructedPeriods(sectionData.periods || [])
            };

            return section;
        });
    }

    /**
     * Each lecture group is a lecture section with its compatible discussions and labs.
     */
    private parseLectureGroups(lectureGroups: RawLectureGroup[]): LectureGroup[] {
        return lectureGroups.map(groupData => {
            const lectureSection = this.parseConstructedSections([groupData.section])[0];
            const compatibleDiscussions = this.parseConstructedSections(groupData.compatibleDiscussions || []);
            const compatibleLabs = this.parseConstructedSections(groupData.compatibleLabs || []);

            return {
                section: lectureSection,
                compatibleDiscussions: compatibleDiscussions,
                compatibleLabs: compatibleLabs
            };
        });
    }

    private parseConstructedPeriods(periods: RawPeriod[]): Period[] {
        return periods.map(periodData => {
            const period: Period = {
                type: this.parsePeriodType(periodData.type || 'Lecture'),
                professor: periodData.professor || '',
                professorEmail: undefined,
                startTime: this.parseConstructedTime(periodData.startTime),
                endTime: this.parseConstructedTime(periodData.endTime),
                location: periodData.location || '',
                building: periodData.building || '',
                room: periodData.room || '',
                seats: periodData.seats || 0,
                seatsAvailable: periodData.seatsAvailable || 0,
                actualWaitlist: periodData.actualWaitlist || 0,
                maxWaitlist: periodData.maxWaitlist || 0,
                days: this.parseConstructedDays(periodData.days || []),
                specificSection: periodData.specificSection,
                isAsync: periodData.isAsync || false
            };
            return period;
        });
    }

    private parsePeriodType(typeString: string): PeriodType {
        const normalizedType = typeString.trim();

        switch (normalizedType) {
            case 'Lecture':
                return PeriodType.LECTURE;
            case 'Lab':
                return PeriodType.LAB;
            case 'Discussion':
                return PeriodType.DISCUSSION;
            case 'Seminar':
                return PeriodType.SEMINAR;
            case 'Workshop':
                return PeriodType.WORKSHOP;
            case 'Experiential':
                return PeriodType.EXPERIENTIAL;
            case 'Independent Study':
                return PeriodType.INDEPENDENT_STUDY;
            case 'Internship':
                return PeriodType.INTERNSHIP;
            case 'Research':
                return PeriodType.RESEARCH;
            case 'Thesis':
                return PeriodType.THESIS;
            default:
                logger.warn(`Unknown period type: "${typeString}", defaulting to Lecture`);
                return PeriodType.LECTURE;
        }
    }
    
    private parseConstructedTime(timeStr: string): Time {
        if (!timeStr || timeStr === 'TBA') {
            return { hours: 0, minutes: 0, displayTime: 'TBD' };
        }
        
        // Parse "HH:MM" format from constructed data
        const match = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (!match) {
            return { hours: 0, minutes: 0, displayTime: timeStr };
        }

        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);

        const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayTime = `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
        
        return { hours, minutes, displayTime };
    }
    
    private parseConstructedDays(days: string[]): Set<DayOfWeek> {
        const daySet = new Set<DayOfWeek>();

        for (const day of days) {
            switch (day.toUpperCase()) {
                case 'M': daySet.add(DayOfWeek.MONDAY); break;
                case 'T': daySet.add(DayOfWeek.TUESDAY); break;
                case 'W': daySet.add(DayOfWeek.WEDNESDAY); break;
                case 'R': daySet.add(DayOfWeek.THURSDAY); break;
                case 'F': daySet.add(DayOfWeek.FRIDAY); break;
                case 'S': daySet.add(DayOfWeek.SATURDAY); break;
                case 'U': daySet.add(DayOfWeek.SUNDAY); break;
            }
        }

        return daySet;
    }


    private stripHtml(html: string): string {
        return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
    }






    getScheduleDB(): ScheduleDB | null {
        return this.scheduleDB;
    }

    searchCourses(query: string, departments?: string[]): Course[] {
        if (!this.scheduleDB) return [];

        const allCourses: Course[] = [];
        
        for (const dept of this.scheduleDB.departments) {
            if (departments && departments.length > 0 && !departments.includes(dept.abbreviation.toLowerCase())) {
                continue;
            }
            allCourses.push(...dept.courses);
        }

        if (!query.trim()) {
            return allCourses;
        }

        const queryLower = query.toLowerCase();
        return allCourses.filter(course =>
            course.name.toLowerCase().includes(queryLower) ||
            course.number.toLowerCase().includes(queryLower) ||
            course.id.toLowerCase().includes(queryLower) ||
            course.departmentAbbr.toLowerCase().includes(queryLower)
        );
    }

    getAllDepartments(): Department[] {
        return this.scheduleDB?.departments || [];
    }

    /** Empty if the course uses the old flat structure or is lab-only. */
    getLecturesForCourse(course: Course): LectureGroup[] {
        return course.lectures || [];
    }

    getDiscussionsForLecture(course: Course, lectureSection: Section): Section[] {
        if (!course.lectures) return [];

        const lectureGroup = course.lectures.find(lg => lg.section.crn === lectureSection.crn);
        return lectureGroup?.compatibleDiscussions ?? [];
    }

    getLabsForLecture(course: Course, lectureSection: Section): Section[] {
        if (!course.lectures) return [];

        const lectureGroup = course.lectures.find(lg => lg.section.crn === lectureSection.crn);
        return lectureGroup?.compatibleLabs ?? [];
    }

    /** Empty if the course has lectures or no standalone labs. */
    getStandaloneLabs(course: Course): Section[] {
        return course.standaloneLabs || [];
    }

    /** True if the course has lecture groups (vs. flat/standalone-lab structure). */
    isHierarchicalCourse(course: Course): boolean {
        return (course.lectures && course.lectures.length > 0) || false;
    }

    /** Lab-only: no lectures, only standalone labs. */
    isLabOnlyCourse(course: Course): boolean {
        return (!course.lectures || course.lectures.length === 0) &&
               (course.standaloneLabs && course.standaloneLabs.length > 0) || false;
    }

    getLatestAcademicYear(): number | undefined {
        return this.latestAcademicYear;
    }

    filterDepartments(predicate: (d: Department) => boolean): void {
        if (!this.scheduleDB) return;
        this.scheduleDB = {
            ...this.scheduleDB,
            departments: this.scheduleDB.departments.filter(predicate),
        };
        this.notifyDataRefreshed();
    }

    async addTutorialDepartment(): Promise<void> {
        if (!this.scheduleDB) return;
        const response = await fetch('./tutorial-courses.json', { cache: 'no-cache' });
        const json = await response.json() as { courses: RawCourse[] };
        const parsedCourses = json.courses.map(raw => {
            const lectures = this.parseLectureGroups(raw.lectures ?? []);
            const standaloneLabs = raw.standaloneLabs ? this.parseConstructedSections(raw.standaloneLabs) : undefined;
            const course: Course = {
                id: raw.id,
                number: raw.number,
                name: raw.name,
                description: raw.description ?? '',
                category: raw.category ?? null,
                departmentAbbr: 'TUT',
                departmentName: 'Tutorial',
                minCredits: raw.minCredits ?? 0,
                maxCredits: raw.maxCredits ?? 0,
                isGraduate: raw.isGraduate ?? false,
                academicYear: raw.academicYear,
                transient: true,
                lectures: lectures.length > 0 ? lectures : undefined,
                standaloneLabs,
            };
            return course;
        });
        const tutDept: Department = {
            abbreviation: 'TUT',
            name: 'Tutorial',
            courses: parsedCourses,
        };
        this.scheduleDB = {
            ...this.scheduleDB,
            departments: [tutDept, ...this.scheduleDB.departments.filter(d => d.abbreviation !== 'TUT')],
        };
        this.notifyDataRefreshed();
    }

    /**
     * Signal that data should be refreshed (e.g., after cloud sync)
     */
    notifyDataRefreshed(): void {
        if (!this.scheduleDB) {
            logger.warn('[CourseDataService] Cannot notify refresh - no data loaded');
            return;
        }

        appState.loadedDepartments = this.scheduleDB.departments;
    }
}