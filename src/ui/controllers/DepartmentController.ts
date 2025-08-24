import { Department } from '../../types/types'
import { DepartmentSyncService } from '../../services/DepartmentSyncService'
import { groupDepartmentsByCategory } from '../../utils/departmentUtils'

export class DepartmentController {
    private allDepartments: Department[] = [];
    private selectedDepartment: Department | null = null;
    private departmentSyncService: DepartmentSyncService | null = null;


    constructor() {}

    setDepartmentSyncService(departmentSyncService: DepartmentSyncService): void {
        this.departmentSyncService = departmentSyncService;
    }

    setAllDepartments(departments: Department[]): void {
        this.allDepartments = departments;
    }

    getSelectedDepartment(): Department | null {
        return this.selectedDepartment;
    }

    getDepartmentById(deptId: string): Department | null {
        return this.allDepartments.find(d => d.abbreviation === deptId) || null;
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
        return groupDepartmentsByCategory(this.allDepartments);
    }

    handleDepartmentClick(deptId: string, multiSelect: boolean = false): Department | null {
        const department = this.allDepartments.find(d => d.abbreviation === deptId);
        if (!department) return null;

        // Use sync service if available, otherwise fall back to old behavior
        if (this.departmentSyncService) {
            this.departmentSyncService.syncSidebarToFilter(deptId, multiSelect);
        } else {
            // Fallback to old behavior for backward compatibility
            const selectedDept = this.selectDepartment(deptId);
            
            // Update active state manually if no sync service
            document.querySelectorAll('.department-item').forEach(item => {
                item.classList.remove('active');
            });
            
            const clickedElement = document.querySelector(`[data-dept-id="${deptId}"]`);
            if (clickedElement) {
                clickedElement.classList.add('active');
            }
        }

        return department;
    }

    clearDepartmentSelection(): void {
        this.selectedDepartment = null;
        
        // Clear active department visual state
        document.querySelectorAll('.department-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Reset sidebar header
        const sidebarHeader = document.querySelector('.sidebar-header h2');
        if (sidebarHeader) {
            sidebarHeader.textContent = 'Departments';
        }
        
        // Remove multi-select indicator
        const departmentList = document.getElementById('department-list');
        if (departmentList) {
            departmentList.classList.remove('multi-select-active');
        }
    }
}