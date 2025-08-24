import { Schedule } from '../../types/schedule'
import { ScheduleManagementService } from '../../services/ScheduleManagementService'

export class ScheduleSelector {
    private scheduleManagementService: ScheduleManagementService;
    private container: HTMLElement;
    private currentActiveSchedule: Schedule | null = null;
    private isDropdownOpen = false;
    private scheduleListClickHandler: ((e: Event) => void) | null = null;
    private scheduleListDblClickHandler: ((e: Event) => void) | null = null;
    private lastScheduleListHTML = '';

    constructor(scheduleManagementService: ScheduleManagementService, containerId: string) {
        this.scheduleManagementService = scheduleManagementService;
        
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container with ID '${containerId}' not found`);
        }
        
        this.container = container;
        this.init();
    }

    private init(): void {
        this.render();
        this.setupEventListeners();
        this.setupScheduleChangeListener();
        this.setupCourseSelectionListener();
        this.currentActiveSchedule = this.scheduleManagementService.getActiveSchedule();
        this.updateDisplay();
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="schedule-selector">
                <div class="schedule-selector-trigger" id="schedule-selector-trigger">
                    <div class="schedule-selector-content">
                        <div class="schedule-selector-icon">📋</div>
                        <div class="schedule-selector-text">
                            <div class="schedule-name" id="active-schedule-name">My Schedule</div>
                            <div class="schedule-subtitle">Active Schedule</div>
                        </div>
                    </div>
                    <div class="schedule-selector-arrow">▼</div>
                </div>
                
                <div class="schedule-selector-dropdown" id="schedule-selector-dropdown">
                    <div class="schedule-dropdown-header">
                        <h3>Schedules</h3>
                        <button class="btn btn-primary btn-small" id="new-schedule-btn">+ New</button>
                    </div>
                    
                    <div class="schedule-list" id="schedule-list">
                        <!-- Schedule items will be populated here -->
                    </div>
                    
                    <div class="schedule-dropdown-footer">
                        <button class="btn btn-secondary btn-small" id="import-schedule-btn">Import</button>
                        <button class="btn btn-secondary btn-small" id="export-schedule-btn">Export</button>
                    </div>
                </div>
            </div>
        `;
    }

    private setupEventListeners(): void {
        const trigger = this.container.querySelector('#schedule-selector-trigger') as HTMLElement;
        const dropdown = this.container.querySelector('#schedule-selector-dropdown') as HTMLElement;
        const newScheduleBtn = this.container.querySelector('#new-schedule-btn') as HTMLElement;
        const importBtn = this.container.querySelector('#import-schedule-btn') as HTMLElement;
        const exportBtn = this.container.querySelector('#export-schedule-btn') as HTMLElement;

        trigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target as Node)) {
                this.closeDropdown();
            }
        });

        newScheduleBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.createNewSchedule();
        });

        importBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.importSchedule();
        });

        exportBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.exportActiveSchedule();
        });

        dropdown?.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    private setupScheduleChangeListener(): void {
        this.scheduleManagementService.onActiveScheduleChange((activeSchedule) => {
            this.currentActiveSchedule = activeSchedule;
            this.updateDisplay();
        });
    }

    private setupCourseSelectionListener(): void {
        // Listen for course selection changes to update the course count display
        this.scheduleManagementService.getCourseSelectionService().onSelectionChange(() => {
            // Only update the schedule list if dropdown is open to avoid unnecessary DOM work
            if (this.isDropdownOpen) {
                this.updateScheduleList();
            }
        });
    }

    private toggleDropdown(): void {
        if (this.isDropdownOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    private openDropdown(): void {
        const dropdown = this.container.querySelector('#schedule-selector-dropdown') as HTMLElement;
        if (dropdown) {
            dropdown.style.display = 'block';
            this.isDropdownOpen = true;
            this.container.classList.add('dropdown-open');
            this.updateScheduleList();
        }
    }

    private closeDropdown(): void {
        const dropdown = this.container.querySelector('#schedule-selector-dropdown') as HTMLElement;
        if (dropdown) {
            dropdown.style.display = 'none';
            this.isDropdownOpen = false;
            this.container.classList.remove('dropdown-open');
        }
    }

    private updateDisplay(): void {
        const activeScheduleNameEl = this.container.querySelector('#active-schedule-name') as HTMLElement;
        
        if (activeScheduleNameEl) {
            if (this.currentActiveSchedule) {
                activeScheduleNameEl.textContent = this.currentActiveSchedule.name;
            } else {
                activeScheduleNameEl.textContent = 'No Schedule';
            }
        }

        if (this.isDropdownOpen) {
            this.updateScheduleList();
        }
    }

    private updateScheduleList(): void {
        const scheduleList = this.container.querySelector('#schedule-list') as HTMLElement;
        if (!scheduleList) return;

        const schedules = this.scheduleManagementService.getAllSchedules();
        const activeScheduleId = this.scheduleManagementService.getActiveScheduleId();

        if (schedules.length === 0) {
            const emptyHTML = '<div class="schedule-list-empty">No schedules found</div>';
            if (scheduleList.innerHTML !== emptyHTML) {
                scheduleList.innerHTML = emptyHTML;
            }
            return;
        }

        const newHTML = schedules.map(schedule => {
            const isActive = schedule.id === activeScheduleId;
            
            // For active schedule, get live course count; for others, use stored count
            const courseCount = isActive ? 
                this.scheduleManagementService.getCourseSelectionService().getSelectedCourses().length :
                schedule.selectedCourses.length;
            
            return `
                <div class="schedule-item ${isActive ? 'active' : ''}" data-schedule-id="${schedule.id}">
                    <div class="schedule-item-info">
                        <div class="schedule-item-name" data-editable="true" data-original-name="${schedule.name}">${schedule.name}</div>
                        <div class="schedule-item-details">${courseCount} course${courseCount === 1 ? '' : 's'}</div>
                    </div>
                    <div class="schedule-item-actions">
                        ${isActive ? '<span class="active-indicator">✓</span>' : '<button class="btn-link switch-btn">Switch</button>'}
                        <button class="btn-link menu-btn" title="More options">⋮</button>
                    </div>
                    <div class="schedule-item-menu" style="display: none;">
                        <button class="menu-action" data-action="rename">Rename</button>
                        <button class="menu-action" data-action="duplicate">Duplicate</button>
                        <button class="menu-action" data-action="export">Export</button>
                        ${schedules.length > 1 ? '<button class="menu-action danger" data-action="delete">Delete</button>' : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Only update DOM if content has actually changed
        if (this.lastScheduleListHTML !== newHTML) {
            this.lastScheduleListHTML = newHTML;
            scheduleList.innerHTML = newHTML;
            this.setupScheduleItemListeners();
        }
    }

    private setupScheduleItemListeners(): void {
        const scheduleList = this.container.querySelector('#schedule-list') as HTMLElement;
        if (!scheduleList) return;

        // Remove existing listeners to prevent memory leaks
        this.removeScheduleItemListeners();

        // Create and store new handlers
        this.scheduleListClickHandler = (e) => {
            const target = e.target as HTMLElement;

            if (target.classList.contains('switch-btn')) {
                const scheduleId = target.closest('.schedule-item')?.getAttribute('data-schedule-id');
                if (scheduleId) {
                    this.switchToSchedule(scheduleId);
                }
            }

            if (target.classList.contains('menu-btn')) {
                e.stopPropagation();
                this.toggleScheduleMenu(target);
            }

            if (target.classList.contains('menu-action')) {
                const action = target.getAttribute('data-action');
                const scheduleId = target.closest('.schedule-item')?.getAttribute('data-schedule-id');
                if (action && scheduleId) {
                    this.handleScheduleAction(action, scheduleId);
                }
            }
        };

        this.scheduleListDblClickHandler = (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('schedule-item-name')) {
                this.startRenaming(target);
            }
        };

        // Add listeners
        scheduleList.addEventListener('click', this.scheduleListClickHandler);
        scheduleList.addEventListener('dblclick', this.scheduleListDblClickHandler);
    }

    private removeScheduleItemListeners(): void {
        const scheduleList = this.container.querySelector('#schedule-list') as HTMLElement;
        if (!scheduleList) return;

        if (this.scheduleListClickHandler) {
            scheduleList.removeEventListener('click', this.scheduleListClickHandler);
        }
        if (this.scheduleListDblClickHandler) {
            scheduleList.removeEventListener('dblclick', this.scheduleListDblClickHandler);
        }
    }

    private toggleScheduleMenu(menuBtn: HTMLElement): void {
        document.querySelectorAll('.schedule-item-menu').forEach(menu => {
            if (menu !== menuBtn.parentElement?.querySelector('.schedule-item-menu')) {
                (menu as HTMLElement).style.display = 'none';
            }
        });

        const menu = menuBtn.parentElement?.querySelector('.schedule-item-menu') as HTMLElement;
        if (menu) {
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        }
    }

    private handleScheduleAction(action: string, scheduleId: string): void {
        switch (action) {
            case 'rename':
                this.renameSchedule(scheduleId);
                break;
            case 'duplicate':
                this.duplicateSchedule(scheduleId);
                break;
            case 'export':
                this.exportSchedule(scheduleId);
                break;
            case 'delete':
                this.deleteSchedule(scheduleId);
                break;
        }

        document.querySelectorAll('.schedule-item-menu').forEach(menu => {
            (menu as HTMLElement).style.display = 'none';
        });
    }

    private switchToSchedule(scheduleId: string): void {
        this.setLoadingState(true);
        
        try {
            this.scheduleManagementService.setActiveSchedule(scheduleId);
        } catch (error) {
            console.error('Failed to switch schedule:', error);
            alert('Failed to switch schedule. Please try again.');
        } finally {
            setTimeout(() => {
                this.setLoadingState(false);
                this.closeDropdown();
            }, 100);
        }
    }

    private createNewSchedule(): void {
        const name = prompt('Enter name for new schedule:', 'New Schedule');
        if (name && name.trim()) {
            this.setLoadingState(true);
            
            try {
                const schedule = this.scheduleManagementService.createNewSchedule(name.trim());
                this.scheduleManagementService.setActiveSchedule(schedule.id);
            } catch (error) {
                console.error('Failed to create new schedule:', error);
                alert('Failed to create new schedule. Please try again.');
            } finally {
                setTimeout(() => {
                    this.setLoadingState(false);
                    this.closeDropdown();
                }, 100);
            }
        }
    }

    private renameSchedule(scheduleId: string): void {
        const schedule = this.scheduleManagementService.loadSchedule(scheduleId);
        if (!schedule) return;

        const newName = prompt('Enter new name:', schedule.name);
        if (newName && newName.trim() && newName.trim() !== schedule.name) {
            this.scheduleManagementService.renameSchedule(scheduleId, newName.trim());
            this.updateScheduleList();
        }
    }

    private duplicateSchedule(scheduleId: string): void {
        const schedule = this.scheduleManagementService.loadSchedule(scheduleId);
        if (!schedule) return;

        const newName = prompt('Enter name for duplicate:', `${schedule.name} (Copy)`);
        if (newName && newName.trim()) {
            this.scheduleManagementService.duplicateSchedule(scheduleId, newName.trim());
            this.updateScheduleList();
        }
    }

    private deleteSchedule(scheduleId: string): void {
        const schedule = this.scheduleManagementService.loadSchedule(scheduleId);
        if (!schedule) return;

        const confirmDelete = confirm(`Are you sure you want to delete "${schedule.name}"? This action cannot be undone.`);
        if (confirmDelete) {
            const success = this.scheduleManagementService.deleteSchedule(scheduleId);
            if (success) {
                this.updateScheduleList();
            } else {
                alert('Cannot delete the last remaining schedule.');
            }
        }
    }

    private exportSchedule(scheduleId: string): void {
        const exportData = this.scheduleManagementService.exportSchedule(scheduleId);
        if (exportData) {
            const schedule = this.scheduleManagementService.loadSchedule(scheduleId);
            const filename = `${schedule?.name || 'schedule'}.json`;
            this.downloadJSON(exportData, filename);
        }
    }

    private exportActiveSchedule(): void {
        const activeScheduleId = this.scheduleManagementService.getActiveScheduleId();
        if (activeScheduleId) {
            this.exportSchedule(activeScheduleId);
            this.closeDropdown();
        }
    }

    private importSchedule(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const jsonData = event.target?.result as string;
                    const importedSchedule = this.scheduleManagementService.importSchedule(jsonData);
                    
                    if (importedSchedule) {
                        alert(`Successfully imported "${importedSchedule.name}"`);
                        this.updateScheduleList();
                    } else {
                        alert('Failed to import schedule. Please check the file format.');
                    }
                };
                reader.readAsText(file);
            }
        };
        
        input.click();
        this.closeDropdown();
    }

    private downloadJSON(data: string, filename: string): void {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private startRenaming(nameElement: HTMLElement): void {
        const originalName = nameElement.getAttribute('data-original-name') || nameElement.textContent || '';
        const scheduleId = nameElement.closest('.schedule-item')?.getAttribute('data-schedule-id');
        if (!scheduleId) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalName;
        input.className = 'schedule-name-input';

        const finishRename = () => {
            const newName = input.value.trim();
            if (newName && newName !== originalName) {
                this.scheduleManagementService.renameSchedule(scheduleId, newName);
            }
            nameElement.textContent = newName || originalName;
            nameElement.setAttribute('data-original-name', newName || originalName);
            nameElement.style.display = 'block';
            input.remove();
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = originalName;
                input.blur();
            }
        });

        nameElement.style.display = 'none';
        nameElement.parentNode?.insertBefore(input, nameElement.nextSibling);
        input.focus();
        input.select();
    }

    public refresh(): void {
        this.currentActiveSchedule = this.scheduleManagementService.getActiveSchedule();
        this.updateDisplay();
    }

    private setLoadingState(loading: boolean): void {
        const trigger = this.container.querySelector('#schedule-selector-trigger') as HTMLElement;
        const activeScheduleName = this.container.querySelector('#active-schedule-name') as HTMLElement;
        
        if (trigger && activeScheduleName) {
            if (loading) {
                trigger.style.opacity = '0.6';
                trigger.style.pointerEvents = 'none';
                activeScheduleName.textContent = 'Switching...';
            } else {
                trigger.style.opacity = '1';
                trigger.style.pointerEvents = 'auto';
                // The display will be updated through the normal refresh cycle
            }
        }
    }
}