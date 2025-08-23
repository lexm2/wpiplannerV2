import { Course, Department, ScheduleDB } from '../../types/types'
import { CourseDataService } from '../../services/courseDataService'

export class MainController {
    private courseDataService: CourseDataService;
    private courses: Course[] = [];

    constructor() {
        this.courseDataService = new CourseDataService();
        this.init();
    }

    private async init(): Promise<void> {
        this.showLoadingState();
        await this.loadCourseData();
        this.displayCourseData();
    }

    private async loadCourseData(): Promise<void> {
        try {
            const scheduleDB = await this.courseDataService.loadCourseData();
            
            for (const dept of scheduleDB.departments) {
                this.courses.push(...dept.courses);
            }
            
            console.log(`Loaded ${this.courses.length} courses from ${scheduleDB.departments.length} departments`);
        } catch (error) {
            console.error('Failed to load course data:', error);
            this.showErrorMessage('Failed to load course data. Please try refreshing the page.');
        }
    }

    private displayCourseData(): void {
        const mainContent = document.getElementById('app');
        if (!mainContent) return;

        let html = `
            <h1>WPI Course Data</h1>
            <p>Loaded ${this.courses.length} courses</p>
            <div class="course-stats">
                <h2>Departments:</h2>
                <ul>`;

        const deptMap = new Map<string, number>();
        this.courses.forEach(course => {
            const dept = course.department.abbreviation;
            deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
        });

        Array.from(deptMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([dept, count]) => {
                html += `<li>${dept}: ${count} courses</li>`;
            });

        html += `
                </ul>
            </div>
            <div class="sample-courses">
                <h2>Sample Courses:</h2>
                <ul>`;

        this.courses.slice(0, 10).forEach(course => {
            const credits = course.minCredits === course.maxCredits ? 
                course.minCredits : 
                `${course.minCredits}-${course.maxCredits}`;
            html += `
                <li>
                    <strong>${course.department.abbreviation} ${course.number}</strong>: 
                    ${course.name} (${credits} credits)
                    <br><small>${course.description}</small>
                </li>`;
        });

        html += `
                </ul>
            </div>`;

        mainContent.innerHTML = html;
    }

    private showLoadingState(): void {
        const mainContent = document.getElementById('app');
        if (mainContent) {
            mainContent.innerHTML = '<div class="loading-message">Loading course data from WPI servers...</div>';
        }
    }

    private showErrorMessage(message: string): void {
        const mainContent = document.getElementById('app');
        if (mainContent) {
            mainContent.innerHTML = `<div class="error-message">${message}</div>`;
        }
    }
}