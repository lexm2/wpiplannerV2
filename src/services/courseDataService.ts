import { ScheduleDB, Department, Course, Section, Period, Time, DayOfWeek } from '../types/types'

export class CourseDataService {
    private static readonly WPI_COURSE_DATA_URL = './course-data.json';
    private static readonly LOCAL_STORAGE_KEY = 'wpi-course-data';
    private static readonly CACHE_EXPIRY_HOURS = 1;

    private scheduleDB: ScheduleDB | null = null;

    constructor() {}

    async loadCourseData(): Promise<ScheduleDB> {
        try {
            console.log('Loading course data...');
            const freshData = await this.fetchFreshData();
            this.scheduleDB = freshData;
            return freshData;
        } catch (error) {
            console.error('Failed to load course data:', error);
            throw new Error('No course data available');
        }
    }

    private async fetchFreshData(): Promise<ScheduleDB> {
        console.log('Fetching course data from local static file...');
        
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
        console.log('Parsing JSON data...');
        const scheduleDB: ScheduleDB = {
            departments: [],
            generated: new Date().toISOString()
        };

        if (!jsonData.Report_Entry || !Array.isArray(jsonData.Report_Entry)) {
            console.error('Invalid JSON data structure:', jsonData);
            throw new Error('Invalid JSON data structure');
        }

        console.log(`Processing ${jsonData.Report_Entry.length} course entries...`);
        const departmentMap = new Map<string, Department>();

        let processed = 0;
        for (const entry of jsonData.Report_Entry) {
            try {
                this.processJSONEntry(entry, departmentMap);
                processed++;
            } catch (error) {
                console.warn('Failed to process entry:', entry, error);
            }
        }

        scheduleDB.departments = Array.from(departmentMap.values());
        console.log(`Successfully processed ${processed}/${jsonData.Report_Entry.length} entries`);
        console.log(`Loaded ${scheduleDB.departments.length} departments with course data`);
        return scheduleDB;
    }

    private processJSONEntry(entry: any, departmentMap: Map<string, Department>): void {
        const courseTitle = entry.Course_Title || '';
        const courseTitleMatch = courseTitle.match(/^([A-Z]+)\s+(\d+)\s*-\s*(.+)$/);
        if (!courseTitleMatch) return;

        const [, deptCode, courseNum, courseName] = courseTitleMatch;
        const deptName = entry.Academic_Units || entry.Subject || deptCode;
        
        let department = departmentMap.get(deptCode);
        if (!department) {
            department = {
                abbreviation: deptCode,
                name: deptName,
                courses: []
            };
            departmentMap.set(deptCode, department);
        }

        const courseId = `${deptCode}-${courseNum}`;
        let course = department.courses.find(c => c.id === courseId);
        if (!course) {
            course = {
                id: courseId,
                number: courseNum,
                name: courseName,
                description: this.stripHtml(entry.Course_Description || ''),
                department: department,
                sections: [],
                minCredits: parseFloat(entry.Credits || '3'),
                maxCredits: parseFloat(entry.Credits || '3')
            };
            department.courses.push(course);
        }

        const sectionMatch = entry.Course_Section?.match(/([A-Z]+\s+\d+)-([A-Z0-9]+)/);
        const sectionNumber = sectionMatch ? sectionMatch[2] : '';
        
        const [enrolled, capacity] = (entry.Enrolled_Capacity || '0/0').split('/').map((n: string) => parseInt(n) || 0);
        const [waitlisted, waitlistCap] = (entry.Waitlist_Waitlist_Capacity || '0/0').split('/').map((n: string) => parseInt(n) || 0);
        
        const section: Section = {
            crn: 0, // Not available in new format
            number: sectionNumber,
            seats: capacity,
            seatsAvailable: capacity - enrolled,
            actualWaitlist: waitlisted,
            maxWaitlist: waitlistCap,
            note: entry.Section_Status === 'Waitlist' ? 'Waitlist Available' : undefined,
            description: this.stripHtml(entry.Course_Section_Description || ''),
            term: entry.Offering_Period || '',
            periods: []
        };

        if (entry.Meeting_Patterns && entry.Locations && entry.Instructors) {
            const period: Period = {
                type: entry.Instructional_Format || 'Lecture',
                professor: entry.Instructors || '',
                professorEmail: undefined,
                startTime: this.parseTimeFromPattern(entry.Meeting_Patterns, true),
                endTime: this.parseTimeFromPattern(entry.Meeting_Patterns, false),
                building: this.extractBuilding(entry.Locations),
                room: this.extractRoom(entry.Locations),
                location: entry.Locations,
                seats: capacity,
                seatsAvailable: capacity - enrolled,
                actualWaitlist: waitlisted,
                maxWaitlist: waitlistCap,
                days: this.parseDaysFromPattern(entry.Meeting_Day_Patterns || ''),
                specificSection: sectionNumber
            };
            section.periods.push(period);
        }

        course.sections.push(section);
    }

    private stripHtml(html: string): string {
        return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
    }

    private extractBuilding(location: string): string {
        const match = location.match(/^([^0-9]+)/);
        return match ? match[1].trim() : '';
    }

    private extractRoom(location: string): string {
        const match = location.match(/([0-9]+[A-Z]*)$/);
        return match ? match[1] : '';
    }

    private parseTimeFromPattern(pattern: string, isStart: boolean): Time {
        const timeMatch = pattern.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/);
        if (!timeMatch) return { hours: 0, minutes: 0, displayTime: 'TBD' };
        
        const timeStr = isStart ? timeMatch[1] : timeMatch[2];
        return this.parseTime(timeStr);
    }

    private parseDaysFromPattern(dayPattern: string): Set<DayOfWeek> {
        const days = new Set<DayOfWeek>();
        const dayMap: { [key: string]: DayOfWeek } = {
            'M': DayOfWeek.MONDAY,
            'T': DayOfWeek.TUESDAY, 
            'W': DayOfWeek.WEDNESDAY,
            'R': DayOfWeek.THURSDAY,
            'F': DayOfWeek.FRIDAY,
            'S': DayOfWeek.SATURDAY,
            'U': DayOfWeek.SUNDAY
        };

        for (const char of dayPattern.replace(/-/g, '')) {
            if (dayMap[char]) {
                days.add(dayMap[char]);
            }
        }
        return days;
    }

    private parseTime(timeStr: string): Time {
        if (!timeStr || timeStr === '?') {
            return { hours: 0, minutes: 0, displayTime: 'TBD' };
        }

        const match = timeStr.match(/(\d{1,2}):(\d{2})(AM|PM)/i);
        if (!match) {
            return { hours: 0, minutes: 0, displayTime: timeStr };
        }

        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const ampm = match[3].toUpperCase();

        if (ampm === 'PM' && hours !== 12) {
            hours += 12;
        } else if (ampm === 'AM' && hours === 12) {
            hours = 0;
        }

        return {
            hours,
            minutes,
            displayTime: timeStr
        };
    }

    private parseDays(daysStr: string): DayOfWeek[] {
        if (!daysStr || daysStr === '?') {
            return [];
        }

        const dayMap: { [key: string]: DayOfWeek } = {
            'mon': DayOfWeek.MONDAY,
            'tue': DayOfWeek.TUESDAY,
            'wed': DayOfWeek.WEDNESDAY,
            'thu': DayOfWeek.THURSDAY,
            'fri': DayOfWeek.FRIDAY,
            'sat': DayOfWeek.SATURDAY,
            'sun': DayOfWeek.SUNDAY
        };

        return daysStr.split(',').map(day => dayMap[day.trim().toLowerCase()]).filter(Boolean);
    }

    private getCachedData(): ScheduleDB | null {
        try {
            const cached = localStorage.getItem(CourseDataService.LOCAL_STORAGE_KEY);
            if (!cached) return null;

            const parsedData = JSON.parse(cached);
            return parsedData.scheduleDB;
        } catch (error) {
            console.warn('Failed to parse cached course data:', error);
            return null;
        }
    }

    private cacheData(scheduleDB: ScheduleDB): void {
        try {
            const cacheData = {
                scheduleDB,
                timestamp: Date.now()
            };
            localStorage.setItem(CourseDataService.LOCAL_STORAGE_KEY, JSON.stringify(cacheData));
            console.log('Course data cached successfully');
        } catch (error) {
            console.warn('Failed to cache course data:', error);
        }
    }

    private isCacheExpired(): boolean {
        try {
            const cached = localStorage.getItem(CourseDataService.LOCAL_STORAGE_KEY);
            if (!cached) return true;

            const parsedData = JSON.parse(cached);
            const cacheAge = Date.now() - parsedData.timestamp;
            const maxAge = CourseDataService.CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
            
            return cacheAge > maxAge;
        } catch (error) {
            return true;
        }
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

}