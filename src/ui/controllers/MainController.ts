import { Course, Department } from '../../types/types'
import { CourseDataService } from '../../services/courseDataService'
import { ThemeSelector } from '../components/ThemeSelector'
import { DataRefreshService } from '../../services/DataRefreshService'

export class MainController {
    private courseDataService: CourseDataService;
    private themeSelector: ThemeSelector;
    private dataRefreshService: DataRefreshService;
    private allDepartments: Department[] = [];
    private selectedDepartment: Department | null = null;

    // Department categories based on WPI structure
    private departmentCategories: { [key: string]: string } = {
        // Science
        'BB': 'Science',
        'BCB': 'Science', 
        'CH': 'Science',
        'CS': 'Science',
        'DS': 'Science',
        'GE': 'Science',
        'IMGD': 'Science',
        'MA': 'Science',
        'MTE': 'Science',
        'PTE': 'Science',
        'NE': 'Science',
        'PH': 'Science',
        
        // Engineering
        'AE': 'Engineering',
        'AR': 'Engineering',
        'ARE': 'Engineering',
        'BME': 'Engineering',
        'CE': 'Engineering',
        'CHE': 'Engineering',
        'ECE': 'Engineering',
        'ES': 'Engineering',
        'FP': 'Engineering',
        'ME': 'Engineering',
        'MFE': 'Engineering',
        'MSE': 'Engineering',
        'NUE': 'Engineering',
        'RBE': 'Engineering',
        'SYE': 'Engineering',
        
        // Business & Management
        'BUS': 'Business & Management',
        'ECON': 'Business & Management',
        'MIS': 'Business & Management',
        'OIE': 'Business & Management',
        
        // Humanities & Arts
        'EN': 'Humanities & Arts',
        'HI': 'Humanities & Arts',
        'HU': 'Humanities & Arts',
        'MU': 'Humanities & Arts',
        'RE': 'Humanities & Arts',
        'SP': 'Humanities & Arts',
        'TH': 'Humanities & Arts',
        'WR': 'Humanities & Arts',
        
        // Social Sciences
        'GOV': 'Social Sciences',
        'PSY': 'Social Sciences',
        'SOC': 'Social Sciences',
        'SS': 'Social Sciences'
    };

    constructor() {
        this.courseDataService = new CourseDataService();
        this.themeSelector = new ThemeSelector();
        this.dataRefreshService = new DataRefreshService();
        this.init();
    }

    private async init(): Promise<void> {
        this.showLoadingState();
        await this.loadCourseData();
        this.displayDepartments();
        this.setupEventListeners();
        this.setupDataRefreshListener();
    }

    private async loadCourseData(): Promise<void> {
        try {
            console.log('Loading course data...');
            const scheduleDB = await this.courseDataService.loadCourseData();
            this.allDepartments = scheduleDB.departments;
            console.log(`Loaded ${this.allDepartments.length} departments`);
        } catch (error) {
            console.error('Failed to load course data:', error);
            this.showErrorMessage('Failed to load course data. Please try refreshing the page.');
        }
    }

    private displayDepartments(): void {
        const departmentList = document.getElementById('department-list');
        if (!departmentList) return;

        // Group departments by category
        const categories = this.groupDepartmentsByCategory();
        
        let html = '';
        Object.entries(categories).forEach(([categoryName, departments]) => {
            if (departments.length === 0) return;
            
            html += `
                <div class="department-category">
                    <div class="category-header">${categoryName}</div>
                    <div class="department-list">
            `;
            
            departments.forEach(dept => {
                const courseCount = dept.courses.length;
                html += `
                    <div class="department-item" data-dept-id="${dept.abbreviation}">
                        ${dept.name} (${courseCount})
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });

        departmentList.innerHTML = html;
    }

    private groupDepartmentsByCategory(): { [key: string]: Department[] } {
        const categories: { [key: string]: Department[] } = {
            'Science': [],
            'Engineering': [],
            'Business & Management': [],
            'Humanities & Arts': [],
            'Social Sciences': [],
            'Other': []
        };

        this.allDepartments.forEach(dept => {
            const category = this.departmentCategories[dept.abbreviation] || 'Other';
            categories[category].push(dept);
        });

        // Sort departments within each category
        Object.keys(categories).forEach(category => {
            categories[category].sort((a, b) => a.name.localeCompare(b.name));
        });

        return categories;
    }

    private setupEventListeners(): void {
        // Department selection
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            
            if (target.classList.contains('department-item')) {
                const deptId = target.dataset.deptId;
                if (deptId) {
                    this.selectDepartment(deptId);
                    
                    // Update active state
                    document.querySelectorAll('.department-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    target.classList.add('active');
                }
            }
            
            if (target.classList.contains('section-badge')) {
                target.classList.toggle('selected');
            }
        });

        // Search functionality
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.handleSearch(searchInput.value);
            });
        }

        // Clear selection
        const clearButton = document.getElementById('clear-selection');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                this.clearSelection();
            });
        }
    }

    private selectDepartment(deptId: string): void {
        const department = this.allDepartments.find(d => d.abbreviation === deptId);
        if (!department) return;

        this.selectedDepartment = department;
        this.displayCourses(department.courses);
        
        // Update content header
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            contentHeader.textContent = `${department.name} Courses`;
        }
    }

    private displayCourses(courses: Course[]): void {
        const courseContainer = document.getElementById('course-container');
        if (!courseContainer) return;

        if (courses.length === 0) {
            courseContainer.innerHTML = '<div class="empty-state">No courses found in this department.</div>';
            return;
        }

        // Sort courses by course number
        const sortedCourses = courses.sort((a, b) => a.number.localeCompare(b.number));

        let html = '<div class="course-list">';
        
        sortedCourses.forEach(course => {
            const hasWarning = this.courseHasWarning(course);
            const sections = course.sections.map(s => s.number).filter(Boolean);
            
            html += `
                <div class="course-item" data-course-id="${course.id}">
                    <div class="course-header">
                        <div class="course-code">${course.department.abbreviation}${course.number}</div>
                        <div class="course-details">
                            <div class="course-name">
                                ${course.name}
                                ${hasWarning ? '<span class="warning-icon">⚠</span>' : ''}
                            </div>
                            <div class="course-sections">
                                ${sections.map(section => 
                                    `<span class="section-badge" data-section="${section}">${section}</span>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        courseContainer.innerHTML = html;
    }

    private courseHasWarning(course: Course): boolean {
        // Add logic to determine if a course has warnings
        // For now, randomly add warnings to some courses for demo
        return Math.random() > 0.7;
    }

    private handleSearch(query: string): void {
        if (!query.trim()) {
            if (this.selectedDepartment) {
                this.displayCourses(this.selectedDepartment.courses);
            }
            return;
        }

        const allCourses: Course[] = [];
        this.allDepartments.forEach(dept => {
            allCourses.push(...dept.courses);
        });

        const filteredCourses = allCourses.filter(course => 
            course.name.toLowerCase().includes(query.toLowerCase()) ||
            course.number.toLowerCase().includes(query.toLowerCase()) ||
            course.id.toLowerCase().includes(query.toLowerCase())
        );

        this.displayCourses(filteredCourses);
        
        // Update header for search results
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            contentHeader.textContent = `Search Results (${filteredCourses.length})`;
        }
    }

    private clearSelection(): void {
        // Clear selected sections
        document.querySelectorAll('.section-badge.selected').forEach(badge => {
            badge.classList.remove('selected');
        });

        // Clear search
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        if (searchInput) {
            searchInput.value = '';
        }

        // Reset to default state
        const courseContainer = document.getElementById('course-container');
        if (courseContainer) {
            courseContainer.innerHTML = '<div class="loading-message">Select a department to view courses...</div>';
        }

        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            contentHeader.textContent = 'Course Listings';
        }

        // Clear active department
        document.querySelectorAll('.department-item').forEach(item => {
            item.classList.remove('active');
        });
        this.selectedDepartment = null;
    }

    private setupDataRefreshListener(): void {
        window.addEventListener('data-refreshed', async () => {
            console.log('Data refresh detected, reloading course data...');
            this.showLoadingState();
            await this.loadCourseData();
            this.displayDepartments();
            
            // If we have a selected department, refresh its courses too
            if (this.selectedDepartment) {
                const updatedDept = this.allDepartments.find(d => d.abbreviation === this.selectedDepartment!.abbreviation);
                if (updatedDept) {
                    this.selectedDepartment = updatedDept;
                    this.displayCourses(updatedDept.courses);
                }
            }
        });
    }

    private showLoadingState(): void {
        const departmentList = document.getElementById('department-list');
        if (departmentList) {
            departmentList.innerHTML = '<div class="loading-message">Loading departments...</div>';
        }
    }

    private showErrorMessage(message: string): void {
        const departmentList = document.getElementById('department-list');
        if (departmentList) {
            departmentList.innerHTML = `<div class="error-message">${message}</div>`;
        }
        
        const courseContainer = document.getElementById('course-container');
        if (courseContainer) {
            courseContainer.innerHTML = `<div class="error-message">${message}</div>`;
        }
    }
}