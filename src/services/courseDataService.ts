import { ScheduleDB, Department, Course, Section, Period, Time, DayOfWeek } from '../types/types'

export class CourseDataService {
    private static readonly WPI_COURSE_DATA_URL = './course-data-constructed.json';
    private static readonly LOCAL_STORAGE_KEY = 'wpi-course-data';
    private static readonly CACHE_EXPIRY_HOURS = 1;

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
        return departments.map(deptData => {
            const department: Department = {
                abbreviation: deptData.abbreviation,
                name: deptData.name,
                courses: []
            };
            
            department.courses = deptData.courses.map((courseData: any) => {
                const course: Course = {
                    id: courseData.id,
                    number: courseData.number,
                    name: courseData.name,
                    description: this.stripHtml(courseData.description || ''),
                    department: department,
                    sections: this.parseConstructedSections(courseData.sections || []),
                    minCredits: courseData.min_credits || 0,
                    maxCredits: courseData.max_credits || 0
                };
                return course;
            });
            
            return department;
        });
    }

    private parseConstructedSections(sections: any[]): Section[] {
        return sections.map(sectionData => {
            const section: Section = {
                crn: sectionData.crn || 0,
                number: sectionData.number || '',
                seats: sectionData.seats || 0,
                seatsAvailable: sectionData.seats_available || 0,
                actualWaitlist: sectionData.actual_waitlist || 0,
                maxWaitlist: sectionData.max_waitlist || 0,
                note: sectionData.note,
                description: this.stripHtml(sectionData.description || ''),
                term: sectionData.term || '',
                periods: this.parseConstructedPeriods(sectionData.periods || [])
            };
            return section;
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

    private logMA1024Sections(scheduleDB: ScheduleDB): void {
        // Debug logging method - keeping for development purposes but not logging on boot
    }



    private stripHtml(html: string): string {
        return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
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