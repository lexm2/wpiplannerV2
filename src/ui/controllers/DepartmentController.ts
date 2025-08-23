import { Department } from '../../types/types'

export class DepartmentController {
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

    constructor() {}

    setAllDepartments(departments: Department[]): void {
        this.allDepartments = departments;
    }

    getSelectedDepartment(): Department | null {
        return this.selectedDepartment;
    }

    selectDepartment(deptId: string): Department | null {
        const department = this.allDepartments.find(d => d.abbreviation === deptId);
        if (!department) return null;

        this.selectedDepartment = department;
        
        // Update content header
        const contentHeader = document.querySelector('.content-header h2');
        if (contentHeader) {
            contentHeader.textContent = `${department.name} Courses`;
        }

        return department;
    }

    displayDepartments(): void {
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

    handleDepartmentClick(deptId: string): Department | null {
        const department = this.selectDepartment(deptId);
        
        // Update active state
        document.querySelectorAll('.department-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const clickedElement = document.querySelector(`[data-dept-id="${deptId}"]`);
        if (clickedElement) {
            clickedElement.classList.add('active');
        }

        return department;
    }

    clearDepartmentSelection(): void {
        this.selectedDepartment = null;
        
        // Clear active department
        document.querySelectorAll('.department-item').forEach(item => {
            item.classList.remove('active');
        });
    }
}