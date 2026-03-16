import { Department } from '../../types/types'
import { FilterService } from '../../services/filtering/FilterService'
import { groupDepartmentsByCategory } from '../../utils/departmentUtils'

export class DepartmentController {
    private allDepartments: Department[] = [];
    private filterService: FilterService | null = null;
    private expandedCategories: Set<string> = new Set();
    private departmentItemMap: Map<string, HTMLElement> = new Map();
    private departmentList: HTMLElement | null = null;

    constructor() {}

    setFilterService(filterService: FilterService): void {
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
        this.updateCourseCounts();
    }

    setAllDepartments(departments: Department[]): void {
        this.allDepartments = departments;
    }

    getDepartmentById(deptId: string): Department | null {
        return this.allDepartments.find(d => d.abbreviation.toLowerCase() === deptId.toLowerCase()) || null;
    }

    displayDepartments(): void {
        if (!this.departmentList) {
            this.departmentList = document.getElementById('department-list');
            if (!this.departmentList) return;
            this.departmentList.addEventListener('click', (e) => {
                const header = (e.target as HTMLElement).closest<HTMLElement>('.category-header[data-category]');
                if (header?.dataset.category) this.toggleCategory(header.dataset.category);
            });
        }
        const departmentList = this.departmentList;

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

        this.departmentItemMap.clear();
        departmentList.querySelectorAll<HTMLElement>('.department-item').forEach(item => {
            const deptId = item.dataset.deptId;
            if (deptId) this.departmentItemMap.set(deptId, item);
        });
    }

    toggleCategory(categoryName: string): void {
        const header = this.departmentList?.querySelector<HTMLElement>(`.category-header[data-category="${categoryName}"]`);
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

    private updateCourseCounts(): void {
        if (!this.filterService || this.allDepartments.length === 0) return;

        const hasNonDeptFilters = this.filterService.getActiveFilters().some(
            f => f.id !== 'department'
        );

        // Get courses that pass all filters except department
        const allCourses = this.allDepartments.flatMap(d => d.courses);
        const passingCourses = hasNonDeptFilters
            ? new Set(this.filterService.filterCoursesExcluding(allCourses, ['department']).map(c => c.id))
            : null;

        let totalCount = 0;
        this.allDepartments.forEach(dept => {
            const count = passingCourses
                ? dept.courses.filter(c => passingCourses.has(c.id)).length
                : dept.courses.length;
            totalCount += count;

            const item = this.departmentItemMap.get(dept.abbreviation);
            if (item) item.textContent = `${dept.name} (${count})`;
        });

        const allItem = this.departmentItemMap.get('all');
        if (allItem) allItem.textContent = `All Departments (${totalCount})`;
    }

    private getActiveDepartments(): string[] {
        if (!this.filterService) return [];
        const activeFilters = this.filterService.getActiveFilters();
        const deptFilter = activeFilters.find(f => f.id === 'department');
        const criteria = deptFilter?.criteria as { departments?: string[] } | undefined;
        return criteria?.departments || [];
    }

    private updateVisualState(activeDepts: string[]): void {
        this.departmentItemMap.forEach(item => item.classList.remove('active'));

        if (activeDepts.length === 0) {
            this.departmentItemMap.get('all')?.classList.add('active');
        } else {
            activeDepts.forEach(id => this.departmentItemMap.get(id)?.classList.add('active'));
        }

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

        if (this.departmentList) {
            if (activeDepts.length > 1) {
                this.departmentList.classList.add('multi-select-active');
            } else {
                this.departmentList.classList.remove('multi-select-active');
            }
        }
    }
}
