import { Department } from '../../types/types'
import { CourseFilterService } from '../../services/filtering/CourseFilterService'
import { groupDepartmentsByCategory } from '../../utils/departmentUtils'

export class DepartmentController {
    private allDepartments: Department[] = [];
    private filterService: CourseFilterService | null = null;
    private expandedCategories: Set<string> = new Set();

    constructor() {}

    setFilterService(filterService: CourseFilterService): void {
        this.filterService = filterService;

        // Listen for filter changes to sync sidebar visual state
        this.filterService.addEventListener(() => {
            this.syncVisualState();
        });
    }

    /** Sync sidebar visual state with current filter state */
    syncVisualState(): void {
        const activeDepts = this.getActiveDepartments();
        this.updateVisualState(activeDepts);
    }

    setAllDepartments(departments: Department[]): void {
        this.allDepartments = departments;
    }

    getDepartmentById(deptId: string): Department | null {
        return this.allDepartments.find(d => d.abbreviation.toLowerCase() === deptId.toLowerCase()) || null;
    }

    displayDepartments(): void {
        const departmentList = document.getElementById('department-list');
        if (!departmentList) return;

        const totalCourseCount = this.allDepartments.reduce((total, dept) => total + dept.courses.length, 0);

        const categories = groupDepartmentsByCategory(this.allDepartments);

        // Initialize all categories as expanded by default
        Object.keys(categories).forEach(categoryName => {
            this.expandedCategories.add(categoryName);
        });

        let html = `
            <div class="department-category">
                <div class="department-list expanded">
                    <div class="department-item all-departments active" data-dept-id="all">
                        All Departments (${totalCourseCount})
                    </div>
                </div>
            </div>
        `;

        Object.entries(categories).forEach(([categoryName, departments]) => {
            if (departments.length === 0) return;

            const isExpanded = this.expandedCategories.has(categoryName);

            html += `
                <div class="department-category">
                    <div class="category-header" data-category="${categoryName}" aria-expanded="${isExpanded}">
                        ${categoryName}
                    </div>
                    <div class="department-list${isExpanded ? ' expanded' : ''}">
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
        this.setupCategoryToggleListeners();
    }

    private setupCategoryToggleListeners(): void {
        document.querySelectorAll('.category-header[data-category]').forEach(header => {
            header.addEventListener('click', (_e) => {
                const categoryName = (header as HTMLElement).dataset.category;
                if (categoryName) {
                    this.toggleCategory(categoryName);
                }
            });
        });
    }

    toggleCategory(categoryName: string): void {
        const header = document.querySelector(`.category-header[data-category="${categoryName}"]`);
        if (!header) return;

        const departmentList = header.nextElementSibling as HTMLElement;
        if (!departmentList) return;

        const isCurrentlyExpanded = this.expandedCategories.has(categoryName);

        if (isCurrentlyExpanded) {
            this.expandedCategories.delete(categoryName);
            header.setAttribute('aria-expanded', 'false');
            departmentList.classList.remove('expanded');
        } else {
            this.expandedCategories.add(categoryName);
            header.setAttribute('aria-expanded', 'true');
            departmentList.classList.add('expanded');
        }
    }

    handleDepartmentClick(deptId: string, multiSelect: boolean = false): Department | null {
        if (!this.filterService) return null;

        if (deptId === 'all') {
            this.filterService.removeFilter('department');
            this.updateVisualState([]);
            return null;
        }

        const department = this.allDepartments.find(d => d.abbreviation === deptId);
        if (!department) return null;

        const current = this.getActiveDepartments();
        let newDepts: string[];

        if (multiSelect) {
            newDepts = current.includes(deptId)
                ? current.filter(id => id !== deptId)
                : [...current, deptId];
        } else {
            newDepts = (current.length === 1 && current[0] === deptId) ? [] : [deptId];
        }

        if (newDepts.length > 0) {
            this.filterService.addFilter('department', { departments: newDepts });
        } else {
            this.filterService.removeFilter('department');
        }

        this.updateVisualState(newDepts);
        return department;
    }

    private getActiveDepartments(): string[] {
        if (!this.filterService) return [];
        const activeFilters = this.filterService.getActiveFilters();
        const deptFilter = activeFilters.find(f => f.id === 'department');
        const criteria = deptFilter?.criteria as { departments?: string[] } | undefined;
        return criteria?.departments || [];
    }

    private updateVisualState(activeDepts: string[]): void {
        document.querySelectorAll('.department-item').forEach(item => {
            item.classList.remove('active');
        });

        if (activeDepts.length === 0) {
            document.querySelector('[data-dept-id="all"]')?.classList.add('active');
        } else {
            activeDepts.forEach(id => {
                document.querySelector(`[data-dept-id="${id}"]`)?.classList.add('active');
            });
        }

        // Update sidebar header for multi-selection
        const sidebarHeader = document.querySelector('.sidebar-header h2');
        if (sidebarHeader) {
            if (activeDepts.length === 0) {
                sidebarHeader.textContent = 'Departments';
            } else if (activeDepts.length === 1) {
                sidebarHeader.textContent = `Departments (1 selected)`;
            } else {
                sidebarHeader.textContent = `Departments (${activeDepts.length} selected)`;
            }
        }

        // Update multi-select indicator
        const departmentList = document.getElementById('department-list');
        if (departmentList) {
            if (activeDepts.length > 1) {
                departmentList.classList.add('multi-select-active');
            } else {
                departmentList.classList.remove('multi-select-active');
            }
        }
    }
}
