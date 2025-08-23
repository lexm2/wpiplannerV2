import { ScheduleDB, Department, Course } from './types.js';
export declare class CourseDataService {
    private static readonly WPI_COURSE_DATA_URL;
    private static readonly LOCAL_STORAGE_KEY;
    private static readonly CACHE_EXPIRY_HOURS;
    private scheduleDB;
    constructor();
    loadCourseData(): Promise<ScheduleDB>;
    private fetchFreshData;
    private parseXMLData;
    private parseDepartment;
    private parseCourse;
    private parseSection;
    private parsePeriod;
    private parseTime;
    private parseDays;
    private getCachedData;
    private cacheData;
    private isCacheExpired;
    getScheduleDB(): ScheduleDB | null;
    searchCourses(query: string, departments?: string[]): Course[];
    getAllDepartments(): Department[];
}
//# sourceMappingURL=courseDataService.d.ts.map