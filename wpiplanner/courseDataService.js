import { DayOfWeek } from './types.js';
export class CourseDataService {
    constructor() {
        this.scheduleDB = null;
    }
    async loadCourseData() {
        try {
            const cachedData = this.getCachedData();
            if (cachedData && !this.isCacheExpired()) {
                this.scheduleDB = cachedData;
                return cachedData;
            }
            const freshData = await this.fetchFreshData();
            this.cacheData(freshData);
            this.scheduleDB = freshData;
            return freshData;
        }
        catch (error) {
            console.warn('Failed to load fresh course data, falling back to cached data:', error);
            const cachedData = this.getCachedData();
            if (cachedData) {
                this.scheduleDB = cachedData;
                return cachedData;
            }
            throw new Error('No course data available');
        }
    }
    async fetchFreshData() {
        console.log('Fetching fresh course data from GitHub Pages...');
        const response = await fetch(CourseDataService.WPI_COURSE_DATA_URL, {
            method: 'GET',
            headers: {
                'Accept': 'application/xml, text/xml',
            },
            cache: 'no-cache'
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch course data: ${response.status} ${response.statusText}`);
        }
        const xmlText = await response.text();
        return this.parseXMLData(xmlText);
    }
    parseXMLData(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const scheduleDB = {
            departments: [],
            generated: ''
        };
        const schedbElements = xmlDoc.getElementsByTagName('schedb');
        if (schedbElements.length > 0) {
            scheduleDB.generated = schedbElements[0].getAttribute('generated') || '';
        }
        const deptElements = xmlDoc.getElementsByTagName('dept');
        for (let i = 0; i < deptElements.length; i++) {
            const deptElement = deptElements[i];
            const department = this.parseDepartment(deptElement);
            scheduleDB.departments.push(department);
        }
        console.log(`Loaded ${scheduleDB.departments.length} departments with course data`);
        return scheduleDB;
    }
    parseDepartment(deptElement) {
        const department = {
            abbreviation: deptElement.getAttribute('abbrev') || '',
            name: deptElement.getAttribute('name') || '',
            courses: []
        };
        const courseElements = deptElement.getElementsByTagName('course');
        for (let i = 0; i < courseElements.length; i++) {
            const courseElement = courseElements[i];
            const course = this.parseCourse(courseElement, department);
            department.courses.push(course);
        }
        return department;
    }
    parseCourse(courseElement, department) {
        const course = {
            id: `${department.abbreviation}-${courseElement.getAttribute('number')}`,
            number: courseElement.getAttribute('number') || '',
            name: courseElement.getAttribute('name') || '',
            description: courseElement.getAttribute('course_desc') || '',
            department: department,
            sections: [],
            minCredits: parseFloat(courseElement.getAttribute('min-credits') || '3'),
            maxCredits: parseFloat(courseElement.getAttribute('max-credits') || '3')
        };
        const sectionElements = courseElement.getElementsByTagName('section');
        for (let i = 0; i < sectionElements.length; i++) {
            const sectionElement = sectionElements[i];
            const section = this.parseSection(sectionElement);
            course.sections.push(section);
        }
        return course;
    }
    parseSection(sectionElement) {
        const section = {
            crn: parseInt(sectionElement.getAttribute('crn') || '0'),
            number: sectionElement.getAttribute('number') || '',
            seats: parseInt(sectionElement.getAttribute('seats') || '0'),
            seatsAvailable: parseInt(sectionElement.getAttribute('availableseats') || '0'),
            actualWaitlist: parseInt(sectionElement.getAttribute('actual_waitlist') || '0'),
            maxWaitlist: parseInt(sectionElement.getAttribute('max_waitlist') || '0'),
            note: sectionElement.getAttribute('note') || undefined,
            description: sectionElement.getAttribute('sec_desc') || '',
            term: sectionElement.getAttribute('part-of-term') || '',
            periods: []
        };
        const periodElements = sectionElement.getElementsByTagName('period');
        for (let i = 0; i < periodElements.length; i++) {
            const periodElement = periodElements[i];
            const period = this.parsePeriod(periodElement);
            section.periods.push(period);
        }
        return section;
    }
    parsePeriod(periodElement) {
        const building = periodElement.getAttribute('building') || '';
        const room = periodElement.getAttribute('room') || '';
        const period = {
            type: periodElement.getAttribute('type') || '',
            professor: periodElement.getAttribute('professor') || '',
            professorEmail: periodElement.getAttribute('professor_email') || undefined,
            startTime: this.parseTime(periodElement.getAttribute('starts') || ''),
            endTime: this.parseTime(periodElement.getAttribute('ends') || ''),
            building: building,
            room: room,
            location: `${building} ${room}`.trim(),
            seats: parseInt(periodElement.getAttribute('seats') || '0'),
            seatsAvailable: parseInt(periodElement.getAttribute('availableseats') || '0'),
            actualWaitlist: parseInt(periodElement.getAttribute('actual_waitlist') || '0'),
            maxWaitlist: parseInt(periodElement.getAttribute('max_waitlist') || '0'),
            days: this.parseDays(periodElement.getAttribute('days') || ''),
            specificSection: periodElement.getAttribute('section') || undefined
        };
        return period;
    }
    parseTime(timeStr) {
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
        }
        else if (ampm === 'AM' && hours === 12) {
            hours = 0;
        }
        return {
            hours,
            minutes,
            displayTime: timeStr
        };
    }
    parseDays(daysStr) {
        if (!daysStr || daysStr === '?') {
            return [];
        }
        const dayMap = {
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
    getCachedData() {
        try {
            const cached = localStorage.getItem(CourseDataService.LOCAL_STORAGE_KEY);
            if (!cached)
                return null;
            const parsedData = JSON.parse(cached);
            return parsedData.scheduleDB;
        }
        catch (error) {
            console.warn('Failed to parse cached course data:', error);
            return null;
        }
    }
    cacheData(scheduleDB) {
        try {
            const cacheData = {
                scheduleDB,
                timestamp: Date.now()
            };
            localStorage.setItem(CourseDataService.LOCAL_STORAGE_KEY, JSON.stringify(cacheData));
            console.log('Course data cached successfully');
        }
        catch (error) {
            console.warn('Failed to cache course data:', error);
        }
    }
    isCacheExpired() {
        try {
            const cached = localStorage.getItem(CourseDataService.LOCAL_STORAGE_KEY);
            if (!cached)
                return true;
            const parsedData = JSON.parse(cached);
            const cacheAge = Date.now() - parsedData.timestamp;
            const maxAge = CourseDataService.CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
            return cacheAge > maxAge;
        }
        catch (error) {
            return true;
        }
    }
    getScheduleDB() {
        return this.scheduleDB;
    }
    searchCourses(query, departments) {
        if (!this.scheduleDB)
            return [];
        const allCourses = [];
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
        return allCourses.filter(course => course.name.toLowerCase().includes(queryLower) ||
            course.number.toLowerCase().includes(queryLower) ||
            course.id.toLowerCase().includes(queryLower) ||
            course.department.abbreviation.toLowerCase().includes(queryLower));
    }
    getAllDepartments() {
        return this.scheduleDB?.departments || [];
    }
}
CourseDataService.WPI_COURSE_DATA_URL = './new.schedb';
CourseDataService.LOCAL_STORAGE_KEY = 'wpi-course-data';
CourseDataService.CACHE_EXPIRY_HOURS = 1;
//# sourceMappingURL=courseDataService.js.map