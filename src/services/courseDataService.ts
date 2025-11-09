import { ScheduleDB, Department, Course, Section, Period, Time, DayOfWeek } from '../types/types'
import { getAllSections } from '../utils/courseUtils'

/**
 * Fetches and transforms WPI course catalog data with duplicate resolution and HTML sanitization
 */
export class CourseDataService {
    private static readonly WPI_COURSE_DATA_URL = './course-data-constructed.json';
    private scheduleDB: ScheduleDB | null = null;

    constructor() {}

    async loadCourseData(): Promise<ScheduleDB> {
        try {
            const freshData = await this.fetchFreshData();
            this.scheduleDB = freshData;
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
        
        
        // Log sections for MA1024 specifically
        this.logMA1024Sections(scheduleDB);
        
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
                    const fallbackId = `${department.abbreviation}-${courseData.number}`;
                    console.warn(`Duplicate course ID detected: "${courseId}" for ${department.abbreviation}${courseData.number}`);
                    console.warn(`   Using fallback ID: "${fallbackId}"`);
                    courseId = fallbackId;
                    duplicatesFixed++;
                    
                    // If fallback is also duplicate, add a counter
                    let counter = 2;
                    while (seenIds.has(courseId)) {
                        courseId = `${fallbackId}-${counter}`;
                        counter++;
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
                    department: department,
                    lectures: lectures.length > 0 ? lectures : undefined,
                    standaloneLabs: standaloneLabs,
                    minCredits: courseData.min_credits || 0,
                    maxCredits: courseData.max_credits || 0
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
            const computedTerm: string = sectionData.computedTerm;

            const section: Section = {
                crn: sectionData.crn || 0,
                number: sectionNumber,
                seats: sectionData.seats || 0,
                seatsAvailable: sectionData.seats_available || 0,
                actualWaitlist: sectionData.actual_waitlist || 0,
                maxWaitlist: sectionData.max_waitlist || 0,
                note: sectionData.note,
                description: this.stripHtml(sectionData.description || ''),
                term: rawTerm,
                computedTerm: computedTerm,
                periods: this.parseConstructedPeriods(sectionData.periods || [])
            };

            return section;
        });
    }

    /**
     * Parses lecture groups from the NEW hierarchical structure
     * Each lecture group contains a lecture section with compatible discussions and labs
     */
    private parseLectureGroups(lectureGroups: any[]): import('../types/types').LectureGroup[] {
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
                type: periodData.type || 'Lecture',
                professor: periodData.professor || '',
                professorEmail: undefined,
                startTime: this.parseConstructedTime(periodData.start_time),
                endTime: this.parseConstructedTime(periodData.end_time),
                location: periodData.location || '',
                building: periodData.building || '',
                room: periodData.room || '',
                seats: periodData.seats || 0,
                seatsAvailable: periodData.seats_available || 0,
                actualWaitlist: periodData.actual_waitlist || 0,
                maxWaitlist: periodData.max_waitlist || 0,
                days: this.parseConstructedDays(periodData.days || []),
                specificSection: periodData.specific_section
            };
            return period;
        });
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
            course.department.abbreviation.toLowerCase().includes(queryLower)
        );
    }

    getAllDepartments(): Department[] {
        return this.scheduleDB?.departments || [];
    }

    /**
     * ═══════════════════════════════════════════════════════════════════════════════
     * NEW HIERARCHICAL STRUCTURE HELPER METHODS
     * ═══════════════════════════════════════════════════════════════════════════════
     * These methods provide access to the NEW hierarchical course structure with
     * lectures, compatible discussions, and compatible labs.
     */

    /**
     * Gets all lecture groups for a course
     * Returns empty array if course uses old flat structure or is lab-only
     */
    getLecturesForCourse(course: Course): import('../types/types').LectureGroup[] {
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

        console.log(`[CourseDataService] ✓ Found lecture group "${lectureGroup.section.number}", has ${lectureGroup.compatibleDiscussions.length} discussions`);
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

        console.log(`[CourseDataService] ✓ Found lecture group "${lectureGroup.section.number}", has ${lectureGroup.compatibleLabs.length} labs`);
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

}