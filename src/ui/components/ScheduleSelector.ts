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
        console.log('🚀 [ScheduleSelector] init() called');
        this.render();
        this.setupEventListeners();
        this.setupScheduleChangeListener();
        this.setupCourseSelectionListener();
        
        console.log('🔄 [ScheduleSelector] Getting initial active schedule...');
        this.currentActiveSchedule = this.scheduleManagementService.getActiveSchedule();
        console.log('📋 [ScheduleSelector] Initial active schedule:', this.currentActiveSchedule);
        
        this.updateDisplay();
        
        // IMPORTANT: Always populate the schedule list during initialization
        // This ensures schedules show up even if dropdown hasn't been opened yet
        console.log('🔄 [ScheduleSelector] Performing initial schedule list population...');
        this.initialScheduleListPopulation();
        
        console.log('✅ [ScheduleSelector] init() completed');
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
                this.closeAllScheduleMenus();
            }
        });

        newScheduleBtn?.addEventListener('click', (e) => {
            console.log('🆕 [ScheduleSelector] "+ New" button clicked');
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
            console.log('Dropdown click event:', e.target);
        });
    }

    private setupScheduleChangeListener(): void {
        // Listen for active schedule changes
        this.scheduleManagementService.onActiveScheduleChange((activeSchedule) => {
            console.log('🔄 [ScheduleSelector] Active schedule change event received');
            console.log('📋 [ScheduleSelector] Previous active schedule:', this.currentActiveSchedule);
            console.log('📋 [ScheduleSelector] New active schedule:', activeSchedule);
            
            this.currentActiveSchedule = activeSchedule;
            console.log('🔄 [ScheduleSelector] Updated currentActiveSchedule, calling updateDisplay()');
            this.updateDisplay();
        });
        
        // Listen for schedule list changes (creation, deletion, etc.)
        this.scheduleManagementService.addScheduleListener((event) => {
            console.log('📋 [ScheduleSelector] Schedule list change event received:', event.type);
            console.log('📋 [ScheduleSelector] Event details:', event);
            
            // Always refresh the schedule list when schedules are created/deleted/updated
            console.log('🔄 [ScheduleSelector] Refreshing schedule list due to schedule change');
            this.refreshScheduleList();
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

    private closeAllScheduleMenus(): void {
        document.querySelectorAll('.schedule-item-menu').forEach(menu => {
            (menu as HTMLElement).style.display = 'none';
        });
    }

    private updateDisplay(): void {
        console.log('🖼️ [ScheduleSelector] updateDisplay() called');
        console.log('📋 [ScheduleSelector] Current active schedule:', this.currentActiveSchedule);
        
        const activeScheduleNameEl = this.container.querySelector('#active-schedule-name') as HTMLElement;
        
        if (activeScheduleNameEl) {
            const previousText = activeScheduleNameEl.textContent;
            
            if (this.currentActiveSchedule) {
                activeScheduleNameEl.textContent = this.currentActiveSchedule.name;
                console.log(`✅ [ScheduleSelector] Updated display text from "${previousText}" to "${this.currentActiveSchedule.name}"`);
            } else {
                activeScheduleNameEl.textContent = 'No Schedule';
                console.log(`⚠️ [ScheduleSelector] No active schedule - updated display text from "${previousText}" to "No Schedule"`);
            }
        } else {
            console.error('❌ [ScheduleSelector] updateDisplay failed - activeScheduleNameEl element not found');
        }

        if (this.isDropdownOpen) {
            console.log('📋 [ScheduleSelector] Dropdown is open, updating schedule list');
            this.updateScheduleList();
        } else {
            console.log('📋 [ScheduleSelector] Dropdown is closed, skipping schedule list update');
        }
        
        console.log('✅ [ScheduleSelector] updateDisplay() completed');
    }

    private initialScheduleListPopulation(): void {
        console.log('🔄 [ScheduleSelector] initialScheduleListPopulation() called');
        
        try {
            const schedules = this.scheduleManagementService.getAllSchedules();
            console.log(`📊 [ScheduleSelector] Found ${schedules.length} schedules during initialization`);
            
            if (schedules.length > 0) {
                console.log('📋 [ScheduleSelector] Schedules found, populating list immediately');
                this.updateScheduleList();
            } else {
                console.log('⚠️ [ScheduleSelector] No schedules found during initialization, will retry when dropdown opens');
            }
        } catch (error) {
            console.error('❌ [ScheduleSelector] Error during initial schedule population:', error);
            console.log('🔄 [ScheduleSelector] Will retry schedule population when dropdown opens');
        }
        
        console.log('✅ [ScheduleSelector] initialScheduleListPopulation() completed');
    }

    private updateScheduleList(): void {
        console.log('🔄 [ScheduleSelector] updateScheduleList() called');
        const scheduleList = this.container.querySelector('#schedule-list') as HTMLElement;
        if (!scheduleList) {
            console.error('❌ [ScheduleSelector] Schedule list element not found');
            return;
        }

        const schedules = this.scheduleManagementService.getAllSchedules();
        const activeScheduleId = this.scheduleManagementService.getActiveScheduleId();
        console.log(`📊 [ScheduleSelector] updateScheduleList: ${schedules.length} schedules, active: ${activeScheduleId}`);

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
            console.log('Schedule list HTML updated, setting up listeners...');
            this.setupScheduleItemListeners();
            
            // Debug: verify menu buttons exist
            const menuButtons = scheduleList.querySelectorAll('.menu-btn');
            console.log(`Found ${menuButtons.length} menu buttons after DOM update`);
            menuButtons.forEach((btn, index) => {
                console.log(`Menu button ${index}:`, btn);
            });
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
            console.log('Schedule list click:', target.className, target.tagName);

            if (target.classList.contains('switch-btn')) {
                const scheduleId = target.closest('.schedule-item')?.getAttribute('data-schedule-id');
                if (scheduleId) {
                    this.switchToSchedule(scheduleId);
                }
            }

            if (target.classList.contains('menu-btn')) {
                console.log('Menu button clicked:', target);
                e.stopPropagation();
                this.toggleScheduleMenu(target);
            }

            if (target.classList.contains('menu-action')) {
                const action = target.getAttribute('data-action');
                const scheduleId = target.closest('.schedule-item')?.getAttribute('data-schedule-id');
                console.log('Menu action clicked:', action, scheduleId);
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
        console.log('toggleScheduleMenu called with:', menuBtn);
        
        // Close all other menus first
        document.querySelectorAll('.schedule-item-menu').forEach(menu => {
            const currentMenu = menuBtn.closest('.schedule-item')?.querySelector('.schedule-item-menu');
            if (menu !== currentMenu) {
                (menu as HTMLElement).style.display = 'none';
                console.log('Closed other menu:', menu);
            }
        });

        // Find the menu for this button using closest parent approach
        const scheduleItem = menuBtn.closest('.schedule-item');
        console.log('Found schedule item:', scheduleItem);
        
        if (!scheduleItem) {
            console.error('Could not find schedule item parent for menu button');
            return;
        }

        const menu = scheduleItem.querySelector('.schedule-item-menu') as HTMLElement;
        console.log('Found menu element:', menu);
        
        if (menu) {
            const isCurrentlyHidden = menu.style.display === 'none' || menu.style.display === '';
            menu.style.display = isCurrentlyHidden ? 'block' : 'none';
            console.log('Menu display set to:', menu.style.display);
        } else {
            console.error('Could not find menu element in schedule item');
        }
    }

    private handleScheduleAction(action: string, scheduleId: string): void {
        console.log(`Handling schedule action: ${action} for schedule: ${scheduleId}`);
        
        try {
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
                default:
                    console.warn(`Unknown schedule action: ${action}`);
                    return;
            }
        } catch (error) {
            console.error(`Error handling schedule action ${action}:`, error);
            alert(`Failed to ${action} schedule. Please try again.`);
        }

        // Close all menus after action
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

    private async createNewSchedule(): Promise<void> {
        console.log('🔄 [ScheduleSelector] Starting new schedule creation process');
        
        const name = prompt('Enter name for new schedule:', 'New Schedule');
        console.log(`📝 [ScheduleSelector] User entered schedule name: "${name}"`);
        
        if (name && name.trim()) {
            const trimmedName = name.trim();
            console.log(`✅ [ScheduleSelector] Name validation passed, proceeding with: "${trimmedName}"`);
            console.log('⏳ [ScheduleSelector] Setting loading state to true');
            this.setLoadingState(true);
            
            try {
                console.log('🚀 [ScheduleSelector] Calling scheduleManagementService.createNewSchedule()');
                const startTime = Date.now();
                const result = await this.scheduleManagementService.createNewSchedule(trimmedName);
                const createDuration = Date.now() - startTime;
                console.log(`📊 [ScheduleSelector] createNewSchedule completed in ${createDuration}ms`);
                console.log('📋 [ScheduleSelector] Create result:', result);
                
                if (result.success && result.schedule) {
                    console.log(`✅ [ScheduleSelector] Schedule created successfully with ID: ${result.schedule.id}`);
                    console.log('🔄 [ScheduleSelector] Setting new schedule as active');
                    
                    const activateStartTime = Date.now();
                    await this.scheduleManagementService.setActiveSchedule(result.schedule.id);
                    const activateDuration = Date.now() - activateStartTime;
                    console.log(`📊 [ScheduleSelector] setActiveSchedule completed in ${activateDuration}ms`);
                    console.log('✅ [ScheduleSelector] Schedule activation successful');
                } else {
                    console.error('❌ [ScheduleSelector] Schedule creation failed:', result.error);
                    throw new Error(result.error || 'Failed to create schedule');
                }
            } catch (error) {
                console.error('💥 [ScheduleSelector] Exception during schedule creation:', error);
                console.error('💥 [ScheduleSelector] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
                alert('Failed to create new schedule. Please try again.');
            } finally {
                console.log('🔚 [ScheduleSelector] Entering finally block - scheduling cleanup');
                setTimeout(() => {
                    console.log('🧹 [ScheduleSelector] Cleanup timeout executing - clearing loading state');
                    this.setLoadingState(false);
                    console.log('📤 [ScheduleSelector] Closing dropdown');
                    this.closeDropdown();
                    console.log('✅ [ScheduleSelector] Schedule creation process complete');
                }, 100);
            }
        } else {
            console.log('❌ [ScheduleSelector] No valid schedule name provided, canceling creation');
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

    private async deleteSchedule(scheduleId: string): Promise<void> {
        const schedule = this.scheduleManagementService.loadSchedule(scheduleId);
        if (!schedule) return;

        const confirmDelete = confirm(`Are you sure you want to delete "${schedule.name}"? This action cannot be undone.`);
        if (confirmDelete) {
            const result = await this.scheduleManagementService.deleteSchedule(scheduleId);
            if (result.success) {
                this.updateScheduleList();
            } else {
                alert(result.error || 'Cannot delete the last remaining schedule.');
            }
        }
    }

    private async exportSchedule(scheduleId: string): Promise<void> {
        const exportResult = await this.scheduleManagementService.exportSchedule(scheduleId);
        if (exportResult.success && exportResult.data) {
            const schedule = this.scheduleManagementService.loadSchedule(scheduleId);
            const filename = `${schedule?.name || 'schedule'}.json`;
            this.downloadJSON(exportResult.data, filename);
        } else {
            alert(exportResult.error || 'Failed to export schedule');
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
                reader.onload = async (event) => {
                    const jsonData = event.target?.result as string;
                    const importResult = await this.scheduleManagementService.importSchedule(jsonData);
                    
                    if (importResult.success && importResult.schedule) {
                        alert(`Successfully imported "${importResult.schedule.name}"`);
                        this.updateScheduleList();
                    } else {
                        alert(importResult.error || 'Failed to import schedule. Please check the file format.');
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
        console.log('🔄 [ScheduleSelector] refresh() called explicitly');
        const previousSchedule = this.currentActiveSchedule;
        this.currentActiveSchedule = this.scheduleManagementService.getActiveSchedule();
        console.log('📋 [ScheduleSelector] Previous schedule in refresh:', previousSchedule);
        console.log('📋 [ScheduleSelector] New schedule from service:', this.currentActiveSchedule);
        this.updateDisplay();
        this.refreshScheduleList();
    }

    public refreshScheduleList(): void {
        console.log('🔄 [ScheduleSelector] refreshScheduleList() called');
        
        // Always update the schedule list, regardless of dropdown state
        // This ensures the list is current when the dropdown is opened
        try {
            this.updateScheduleList();
            console.log('✅ [ScheduleSelector] Schedule list refreshed successfully');
        } catch (error) {
            console.error('❌ [ScheduleSelector] Error refreshing schedule list:', error);
        }
    }

    private setLoadingState(loading: boolean): void {
        console.log(`🎨 [ScheduleSelector] setLoadingState called with loading=${loading}`);
        
        const trigger = this.container.querySelector('#schedule-selector-trigger') as HTMLElement;
        const activeScheduleName = this.container.querySelector('#active-schedule-name') as HTMLElement;
        
        if (trigger && activeScheduleName) {
            if (loading) {
                console.log('⏳ [ScheduleSelector] Applying loading state - dimming UI and showing "Switching..."');
                trigger.style.opacity = '0.6';
                trigger.style.pointerEvents = 'none';
                activeScheduleName.textContent = 'Switching...';
                console.log('✅ [ScheduleSelector] Loading state applied successfully');
            } else {
                console.log('🔄 [ScheduleSelector] Clearing loading state - restoring UI and updating display');
                trigger.style.opacity = '1';
                trigger.style.pointerEvents = 'auto';
                console.log('🔄 [ScheduleSelector] Calling updateDisplay() to refresh schedule name');
                this.updateDisplay();
                console.log('✅ [ScheduleSelector] Loading state cleared and display updated');
            }
        } else {
            console.error('❌ [ScheduleSelector] setLoadingState failed - trigger or activeScheduleName element not found');
            console.error('🔍 [ScheduleSelector] trigger element:', trigger);
            console.error('🔍 [ScheduleSelector] activeScheduleName element:', activeScheduleName);
        }
    }
}