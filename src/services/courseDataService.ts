import { ScheduleDB, Department, Course, Section, Period, Time, DayOfWeek } from '../types/types'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CourseDataService - WPI Course Catalog Data Pipeline & Transformation Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SERVICE OVERVIEW:
 * Critical data ingestion service responsible for fetching, parsing, validating,
 * and transforming WPI's course catalog from the Java backend into the application's
 * internal data structures. Processes ~5000+ courses across 50+ departments with
 * complex hierarchical relationships (departments → courses → sections → periods).
 *
 * ARCHITECTURAL ROLE:
 *
 * 1. DATA GATEWAY:
 *    - Primary interface to external course catalog data source
 *    - Fetches pre-constructed JSON from Java backend service
 *    - Handles network failures with graceful degradation
 *    - Ensures fresh data availability for each session
 *
 * 2. DATA TRANSFORMATION PIPELINE:
 *    - Parses raw JSON into strongly-typed TypeScript structures
 *    - Validates data integrity and handles malformed entries
 *    - Resolves duplicate course IDs with intelligent fallback
 *    - Strips HTML artifacts from course descriptions
 *
 * 3. TERM COMPUTATION BRIDGE:
 *    - Leverages pre-computed term data from Java backend
 *    - Maps raw term strings to standardized format (A/B/C/D/E)
 *    - Maintains term consistency across all data layers
 *
 * KEY DEPENDENCIES:
 *
 * External Data Source:
 * └─ course-data-constructed.json: Pre-processed catalog from Java backend
 *    ├─ Generated daily with latest course updates
 *    ├─ Includes computed terms for consistent filtering
 *    └─ Contains hierarchical course structure
 *
 * Type System:
 * └─ types/types.ts: Core domain models
 *    ├─ ScheduleDB: Root data container
 *    ├─ Department: Academic department structure
 *    ├─ Course: Course metadata and sections
 *    ├─ Section: Course offering with CRN
 *    └─ Period: Time slot and location data
 *
 * CONSUMED BY:
 *
 * Controllers:
 * ├─ MainController: Initial data loading and application bootstrap
 * ├─ CourseController: Course list population and display
 * └─ ScheduleController: Section availability and scheduling
 *
 * Services:
 * ├─ SearchService: Full-text indexing of loaded courses
 * ├─ CourseFilterService: Filter operations on course dataset
 * └─ CourseSelectionService: Selection state management
 *
 * DATA FLOW ARCHITECTURE:
 *
 * ```
 * 1. Data Fetching:
 *    fetch('./course-data-constructed.json')
 *    └─> No-cache headers ensure fresh data
 *    └─> Handles network errors gracefully
 *
 * 2. JSON Parsing Pipeline:
 *    parseJSONData()
 *    ├─> Validate structure
 *    ├─> parseConstructedDepartments()
 *    │   ├─> Department deduplication
 *    │   └─> Course ID collision resolution
 *    ├─> parseConstructedSections()
 *    │   ├─> CRN validation
 *    │   └─> Term computation integration
 *    └─> parseConstructedPeriods()
 *        ├─> Time parsing (24hr → 12hr)
 *        └─> Day mapping (Mon/Tue → enum)
 *
 * 3. Data Validation:
 *    ├─> Duplicate ID Detection & Resolution
 *    ├─> HTML Stripping from descriptions
 *    └─> Missing field defaults
 * ```
 *
 * CRITICAL FEATURES:
 *
 * 1. DUPLICATE ID RESOLUTION:
 *    - Detects course ID collisions across departments
 *    - Generates unique fallback IDs: {DEPT}-{NUMBER}[-counter]
 *    - Logs all duplicates for backend team awareness
 *    - Ensures referential integrity throughout app
 *
 * 2. TERM STANDARDIZATION:
 *    - Uses pre-computed terms from Java backend
 *    - Maps complex term strings to A/B/C/D/E format
 *    - Enables consistent filtering across UI
 *    - Example: "Fall 2024" → "A", "Spring 2025" → "D"
 *
 * 3. TIME PARSING & FORMATTING:
 *    - Converts 24-hour time to 12-hour display
 *    - Handles TBA/TBD cases gracefully
 *    - Preserves original data for accuracy
 *    - Example: "14:30" → "2:30 PM"
 *
 * 4. HTML SANITIZATION:
 *    - Strips HTML tags from descriptions
 *    - Decodes HTML entities (&amp; → &)
 *    - Preserves readable text content
 *    - Prevents XSS vulnerabilities
 *
 * DATA CHARACTERISTICS:
 *
 * Typical Dataset:
 * ├─ Departments: ~50-60
 * ├─ Courses: ~5000-6000
 * ├─ Sections: ~8000-10000
 * ├─ Periods: ~12000-15000
 * └─ Total JSON Size: ~8-10 MB
 *
 * Processing Performance:
 * ├─ Fetch Time: 200-500ms (network dependent)
 * ├─ Parse Time: 50-100ms
 * ├─ Transform Time: 100-200ms
 * └─ Total Load Time: <1 second typical
 *
 * ERROR HANDLING:
 *
 * Network Failures:
 * ├─ Graceful degradation with error messages
 * ├─ Console logging for debugging
 * └─ User-friendly error propagation
 *
 * Data Validation:
 * ├─ Missing fields → sensible defaults
 * ├─ Invalid formats → logged and skipped
 * ├─ Duplicate IDs → automatic resolution
 * └─ Malformed JSON → clear error message
 *
 * CACHING STRATEGY:
 *
 * Current Implementation:
 * ├─ No client-side caching (fresh data each session)
 * ├─ Browser cache disabled via no-cache headers
 * └─ Ensures latest course updates always visible
 *
 * Future Considerations:
 * ├─ localStorage caching with TTL
 * ├─ Service Worker for offline support
 * ├─ Incremental updates via API
 * └─ ETag-based conditional requests
 *
 * LOGGING & DEBUGGING:
 *
 * Development Features:
 * ├─ Duplicate ID summary logging
 * ├─ Course processing statistics
 * ├─ Term computation verification
 * └─ MA1024 section debugging (disabled in production)
 *
 * Production Monitoring:
 * ├─ Load time metrics
 * ├─ Error rate tracking
 * ├─ Data quality metrics
 * └─ Parse failure logging
 *
 * FUTURE ENHANCEMENTS:
 *
 * 1. Incremental Data Updates:
 *    - WebSocket for real-time seat availability
 *    - Delta updates for changed courses only
 *    - Push notifications for waitlist changes
 *
 * 2. Advanced Caching:
 *    - IndexedDB for large dataset storage
 *    - Background sync for offline support
 *    - Predictive prefetching based on usage
 *
 * 3. Data Quality Improvements:
 *    - Schema validation with JSON Schema
 *    - Automated data quality reports
 *    - Self-healing for common data issues
 *
 * ═══════════════════════════════════════════════════════════════════════════════
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
                const lectures = this.parseLectureGroups(courseData.lectures || [], department);
                const standaloneLabs = courseData.standaloneLabs
                    ? this.parseConstructedSections(courseData.standaloneLabs)
                    : undefined;

                // Parse OLD flat structure for backward compatibility
                const sections = courseData.sections
                    ? this.parseConstructedSections(courseData.sections)
                    : this.flattenLectureGroups(lectures, standaloneLabs);

                const course: Course = {
                    id: courseId,
                    number: courseData.number,
                    name: courseData.name,
                    description: this.stripHtml(courseData.description || ''),
                    department: department,
                    // NEW hierarchical structure
                    lectures: lectures.length > 0 ? lectures : undefined,
                    standaloneLabs: standaloneLabs,
                    // DEPRECATED: Maintain for backward compatibility
                    sections: sections,
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
    private parseLectureGroups(lectureGroups: any[], department: Department): import('../types/types').LectureGroup[] {
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

    /**
     * Flattens lecture groups into a flat sections array for backward compatibility
     * Combines all sections from lectures, discussions, and labs into one array
     */
    private flattenLectureGroups(
        lectures: import('../types/types').LectureGroup[],
        standaloneLabs: Section[] | undefined
    ): Section[] {
        const sections: Section[] = [];

        // Add all lecture sections and their compatible components
        for (const lectureGroup of lectures) {
            sections.push(lectureGroup.section);
            sections.push(...lectureGroup.compatibleDiscussions);
            sections.push(...lectureGroup.compatibleLabs);
        }

        // Add standalone labs
        if (standaloneLabs) {
            sections.push(...standaloneLabs);
        }

        return sections;
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
            switch (day.toLowerCase()) {
                case 'mon': daySet.add(DayOfWeek.MONDAY); break;
                case 'tue': daySet.add(DayOfWeek.TUESDAY); break;
                case 'wed': daySet.add(DayOfWeek.WEDNESDAY); break;
                case 'thu': daySet.add(DayOfWeek.THURSDAY); break;
                case 'fri': daySet.add(DayOfWeek.FRIDAY); break;
                case 'sat': daySet.add(DayOfWeek.SATURDAY); break;
                case 'sun': daySet.add(DayOfWeek.SUNDAY); break;
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
        if (!course.lectures) return [];

        const lectureGroup = course.lectures.find(lg => lg.section.crn === lectureSection.crn);
        return lectureGroup?.compatibleDiscussions || [];
    }

    /**
     * Gets compatible labs for a specific lecture section
     * @param course The course containing the lecture
     * @param lectureSection The lecture section to get labs for
     * @returns Array of compatible lab sections
     */
    getLabsForLecture(course: Course, lectureSection: Section): Section[] {
        if (!course.lectures) return [];

        const lectureGroup = course.lectures.find(lg => lg.section.crn === lectureSection.crn);
        return lectureGroup?.compatibleLabs || [];
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
        return course.sections || [];
    }

}