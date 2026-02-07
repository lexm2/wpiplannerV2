import type { ScheduleDB, Department, Course, Section, Period, Time, LectureGroup } from '../../types'
import { DayOfWeek, PeriodType } from '../../types'
import { AcademicTerm } from '../../types/schedule'
import { getAllSections } from '../../utils'
import type { CourseDataEventType, CourseDataEvent, CourseDataEventListener } from './types'

/**
 * Fetches and transforms WPI course catalog data with duplicate resolution and HTML sanitization.
 * Emits events when data is loaded or refreshed.
 */
export class CourseDataService {
    private static readonly WPI_COURSE_DATA_URL = './course-data-constructed.json';
    private scheduleDB: ScheduleDB | null = null;
    private listeners = new Map<CourseDataEventType | '*', Set<CourseDataEventListener>>();

    constructor() {}

    async loadCourseData(): Promise<ScheduleDB> {
        try {
            const freshData = await this.fetchFreshData();
            this.scheduleDB = freshData;

            this.emit({
                type: 'data-loaded',
                timestamp: Date.now(),
                departments: freshData.departments,
                scheduleDB: freshData
            });

            return freshData;
        } catch (error) {
            console.error('Failed to load course data:', error);
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

    private parseJSONData(jsonData: any): ScheduleDB {
        
        if (!jsonData.departments || !Array.isArray(jsonData.departments)) {
            console.error('Invalid JSON data structure:', jsonData);
            throw new Error('Invalid JSON data structure - missing departments array');
        }

        
        const scheduleDB: ScheduleDB = {
            departments: this.parseConstructedDepartments(jsonData.departments),
            generated: jsonData.generated || new Date().toISOString()
        };
        
        //this.logMA1024Sections(scheduleDB); << Lots of sections for reference
        
        return scheduleDB;
    }

    private parseConstructedDepartments(departments: any[]): Department[] {
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
            
            department.courses = deptData.courses.map((courseData: any) => {
                totalCoursesProcessed++;
                let courseId = courseData.id;
                
                // Check for duplicate ID
                if (seenIds.has(courseId)) {
                    duplicateIds.add(courseId);

                    // Strict validation in development mode
                    const STRICT_VALIDATION = import.meta.env.DEV || import.meta.env.MODE === 'development';

                    if (STRICT_VALIDATION) {
                        // FAIL HARD in development - forces fixing bad data at source
                        throw new Error(
                            `CRITICAL DATA ERROR: Duplicate course ID "${courseId}" detected.\n` +
                            `This indicates a data quality issue in course-data-constructed.json.\n` +
                            `Please fix the backend data generation process.\n` +
                            `Duplicate IDs found so far: ${Array.from(duplicateIds).join(', ')}`
                        );
                    } else {
                        // Production fallback (for backward compatibility)
                        const fallbackId = `${department.abbreviation}-${courseData.number}`;
                        console.error(`DUPLICATE ID: "${courseId}" for ${department.abbreviation}${courseData.number}`);
                        console.error(`   Using fallback ID: "${fallbackId}"`);
                        courseId = fallbackId;
                        duplicatesFixed++;

                        // If fallback is also duplicate, add a counter
                        let counter = 2;
                        while (seenIds.has(courseId)) {
                            courseId = `${fallbackId}-${counter}`;
                            counter++;
                        }

                        // Report data quality issue
                        console.error('[Data Quality Issue]', {
                            type: 'duplicate_course_id',
                            originalId: courseId,
                            fallbackId: courseId,
                            timestamp: Date.now()
                        });
                    }
                }
                
                seenIds.add(courseId);
                
                // Parse NEW hierarchical structure (lectures + standaloneLabs)
                const lectures = this.parseLectureGroups(courseData.lectures || []);
                const standaloneLabs = courseData.standaloneLabs
                    ? this.parseConstructedSections(courseData.standaloneLabs)
                    : undefined;

                const course: Course = {
                    id: courseId,
                    number: courseData.number,
                    name: courseData.name,
                    description: this.stripHtml(courseData.description || ''),
                    departmentAbbr: department.abbreviation,
                    departmentName: department.name,
                    lectures: lectures.length > 0 ? lectures : undefined,
                    standaloneLabs: standaloneLabs,
                    minCredits: courseData.minCredits || 0,
                    maxCredits: courseData.maxCredits || 0,
                    isGraduate: courseData.isGraduate || false
                };
                return course;
            });
            
            return department;
        });
        
        // Log summary of duplicate ID fixes
        if (duplicatesFixed > 0) {
            console.log(`Course ID Deduplication Summary:`);
            console.log(`   Total courses processed: ${totalCoursesProcessed}`);
            console.log(`   Duplicate IDs fixed: ${duplicatesFixed}`);
            console.log(`   Affected original IDs: [${Array.from(duplicateIds).join(', ')}]`);
        } else {
            console.log(`Course ID validation complete: ${totalCoursesProcessed} courses, no duplicates found`);
        }
        
        return result;
    }

    private parseConstructedSections(sections: any[]): Section[] {
        return sections.map(sectionData => {
            const rawTerm = sectionData.term || '';
            const sectionNumber = sectionData.number || '';

            // Use pre-computed term from Java backend
            const computedTerm = sectionData.computedTerm as AcademicTerm;

            const section: Section = {
                crn: sectionData.crn || 0,
                number: sectionNumber,
                seats: sectionData.seats || 0,
                seatsAvailable: sectionData.seatsAvailable || 0,
                actualWaitlist: sectionData.actualWaitlist || 0,
                maxWaitlist: sectionData.maxWaitlist || 0,
                note: sectionData.note,
                description: this.stripHtml(sectionData.description || ''),
                term: rawTerm,
                computedTerm: computedTerm,
                isInterestList: sectionData.isInterestList,
                periods: this.parseConstructedPeriods(sectionData.periods || [])
            };

            return section;
        });
    }

    /**
     * Parses lecture groups from the NEW hierarchical structure
     * Each lecture group contains a lecture section with compatible discussions and labs
     */
    private parseLectureGroups(lectureGroups: any[]): LectureGroup[] {
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

    private parseConstructedPeriods(periods: any[]): Period[] {
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
                console.warn(`Unknown period type: "${typeString}", defaulting to Lecture`);
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
        
        // Convert to display format
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

    private logMA1024Sections(_scheduleDB: ScheduleDB): void {
        // Debug logging method - keeping for development purposes but not logging on boot
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

    /**
     * Gets all lecture groups for a course
     * Returns empty array if course uses old flat structure or is lab-only
     */
    getLecturesForCourse(course: Course): LectureGroup[] {
        return course.lectures || [];
    }

    /**
     * Gets compatible discussions for a specific lecture section
     * @param course The course containing the lecture
     * @param lectureSection The lecture section to get discussions for
     * @returns Array of compatible discussion sections
     */
    getDiscussionsForLecture(course: Course, lectureSection: Section): Section[] {
        if (!course.lectures) {
            console.log('[CourseDataService] No lectures array on course');
            return [];
        }

        console.log(`[CourseDataService] Searching for CRN:`, lectureSection.crn, `(type: ${typeof lectureSection.crn})`);
        console.log(`[CourseDataService] Available lectures:`, course.lectures.map(lg => ({
            crn: lg.section.crn,
            type: typeof lg.section.crn,
            number: lg.section.number,
            discussions: lg.compatibleDiscussions.length,
            labs: lg.compatibleLabs.length
        })));

        const lectureGroup = course.lectures.find(lg => lg.section.crn === lectureSection.crn);

        if (!lectureGroup) {
            console.log('[CourseDataService] Lecture group NOT FOUND - CRN mismatch!');
            return [];
        }

        console.log(`[CourseDataService] Found lecture group "${lectureGroup.section.number}", has ${lectureGroup.compatibleDiscussions.length} discussions`);
        return lectureGroup.compatibleDiscussions || [];
    }

    /**
     * Gets compatible labs for a specific lecture section
     * @param course The course containing the lecture
     * @param lectureSection The lecture section to get labs for
     * @returns Array of compatible lab sections
     */
    getLabsForLecture(course: Course, lectureSection: Section): Section[] {
        if (!course.lectures) {
            console.log('[CourseDataService] No lectures array on course');
            return [];
        }

        console.log(`[CourseDataService] Searching for CRN:`, lectureSection.crn, `(type: ${typeof lectureSection.crn})`);
        console.log(`[CourseDataService] Available lectures:`, course.lectures.map(lg => ({
            crn: lg.section.crn,
            type: typeof lg.section.crn,
            number: lg.section.number,
            discussions: lg.compatibleDiscussions.length,
            labs: lg.compatibleLabs.length
        })));

        const lectureGroup = course.lectures.find(lg => lg.section.crn === lectureSection.crn);

        if (!lectureGroup) {
            console.log('[CourseDataService] Lecture group NOT FOUND - CRN mismatch!');
            return [];
        }

        console.log(`[CourseDataService] Found lecture group "${lectureGroup.section.number}", has ${lectureGroup.compatibleLabs.length} labs`);
        return lectureGroup.compatibleLabs || [];
    }

    /**
     * Gets standalone labs for lab-only courses
     * Returns empty array if course has lectures or no standalone labs
     */
    getStandaloneLabs(course: Course): Section[] {
        return course.standaloneLabs || [];
    }

    /**
     * Checks if a course uses the new hierarchical structure
     * @returns true if course has lecture groups, false if flat/standalone labs
     */
    isHierarchicalCourse(course: Course): boolean {
        return (course.lectures && course.lectures.length > 0) || false;
    }

    /**
     * Checks if a course is lab-only (no lectures, only standalone labs)
     */
    isLabOnlyCourse(course: Course): boolean {
        return (!course.lectures || course.lectures.length === 0) &&
               (course.standaloneLabs && course.standaloneLabs.length > 0) || false;
    }

    /**
     * Gets all sections for a course regardless of structure (hierarchical or flat)
     * Useful for backward compatibility and general section iteration
     */
    getAllSectionsForCourse(course: Course): Section[] {
        return getAllSections(course);
    }

    /**
     * Subscribe to course data events
     * @returns Unsubscribe function
     */
    on(eventType: CourseDataEventType | '*', listener: CourseDataEventListener): () => void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType)!.add(listener);

        return () => this.off(eventType, listener);
    }

    /**
     * Unsubscribe from course data events
     */
    off(eventType: CourseDataEventType | '*', listener: CourseDataEventListener): void {
        const listeners = this.listeners.get(eventType);
        if (listeners) {
            listeners.delete(listener);
        }
    }

    /**
     * Emit a course data event to all listeners
     */
    private emit(event: CourseDataEvent): void {
        const specificListeners = this.listeners.get(event.type);
        const wildcardListeners = this.listeners.get('*');

        specificListeners?.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error(`[CourseDataService] Error in listener for ${event.type}:`, error);
            }
        });

        wildcardListeners?.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('[CourseDataService] Error in wildcard listener:', error);
            }
        });
    }

    /**
     * Notify listeners that data should be refreshed (e.g., after cloud sync)
     */
    notifyDataRefreshed(): void {
        if (!this.scheduleDB) {
            console.warn('[CourseDataService] Cannot notify refresh - no data loaded');
            return;
        }

        this.emit({
            type: 'data-refreshed',
            timestamp: Date.now(),
            departments: this.scheduleDB.departments,
            scheduleDB: this.scheduleDB
        });
    }
}