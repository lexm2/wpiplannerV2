import { ScheduleManagementService } from '../../services/selection/ScheduleManagementService';
import { ModalService } from '../../services/ui/ModalService';
import { Schedule } from '../../types/schedule';
import { BaseModal } from './BaseModal';
import { getInlineSVG } from '../../utils/iconPaths';
import styles from '../../styles/components/schedule-picker-modal.module.css';

export class SchedulePickerModal extends BaseModal {
    private static readonly MENU_WIDTH = 120;
    private static readonly MENU_HEIGHT = 160;
    private static readonly MENU_OFFSET = 4;
    private static readonly VIEWPORT_PADDING = 8;
    private scheduleManagementService: ScheduleManagementService;
    private scheduleListClickHandler: ((e: Event) => void) | null = null;
    private scheduleListDblClickHandler: ((e: Event) => void) | null = null;

    constructor(
        modalService: ModalService,
        scheduleManagementService: ScheduleManagementService
    ) {
        super(modalService);
        this.scheduleManagementService = scheduleManagementService;

        this.scheduleManagementService.onActiveScheduleChange(() => {
            if (this.modalElement) {
                this.updateScheduleList();
                this.updateStorageUsage();
            }
        });
    }

    async show(): Promise<void> {
        await this.scheduleManagementService.initialize();

        // Generate ID first so createModalElement can use it
        this.modalId = this.modalService.generateId();

        const element = this.createModalElement();
        this.modalElement = element;
        this.modalService.showModal(this.modalId, element);
        this.modalService.setupModalBehavior(element, this.modalId, {
            closeOnBackdrop: true,
            closeOnEscape: true
        });

        setTimeout(() => {
            this.updateScheduleList();
            this.updateStorageUsage();
            this.setupCourseSelectionListener();
        }, 0);
    }

    private createModalElement(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = `
            <div class="modal-dialog schedule-picker-modal-dialog no-transform">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">Schedules</h2>
                        <button class="btn btn-primary new-schedule-btn-header" id="new-schedule-btn-header-modal" style="display: none;">+ New Schedule</button>
                        <button class="modal-close" data-modal-close="${this.modalId}">×</button>
                    </div>
                    <div class="modal-body schedule-picker-body">
                        <div class="schedule-list" id="schedule-list-modal-${this.modalId}">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <div class="storage-usage-container" id="storage-usage-container-modal">
                            <div class="storage-usage-text">Storage: Loading...</div>
                            <div class="storage-usage-bar">
                                <div class="storage-usage-fill" id="storage-usage-fill-modal" style="width: 0%"></div>
                            </div>
                        </div>
                        <div class="modal-footer-buttons">
                            <button class="btn btn-primary" id="new-schedule-btn-modal">${getInlineSVG('CALENDAR_PLUS', 'modal-footer-icon')}<span class="btn-text"> New Schedule</span></button>
                            <button class="btn btn-secondary" id="import-schedule-btn-modal">${getInlineSVG('CALENDAR_DOWN', 'modal-footer-icon')}<span class="btn-text"> Import</span></button>
                            <button class="btn btn-secondary" id="export-schedule-btn-modal">${getInlineSVG('CALENDAR_UP', 'modal-footer-icon')}<span class="btn-text"> Export All</span></button>
                            <button class="btn btn-danger" id="clear-all-data-btn-modal">${getInlineSVG('TRASH', 'modal-footer-icon')}<span class="btn-text"> Clear All Data</span></button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupModalEventListeners(backdrop);
        return backdrop;
    }

    private renderScheduleList(): string {
        const schedules = this.scheduleManagementService.getAllSchedules();
        const activeScheduleId = this.scheduleManagementService.getActiveScheduleId();

        if (schedules.length === 0) {
            return '<div class="schedule-list-empty">No schedules found</div>';
        }

        return schedules.map(schedule => {
            const isActive = schedule.id === activeScheduleId;
            const courseCount = isActive ?
                this.scheduleManagementService.getCourseSelectionService().getSelectedCourses().length :
                schedule.selectedCourses.length;

            return `
                <div class="schedule-item ${isActive ? 'active' : ''}" data-schedule-id="${schedule.id}">
                    <div class="schedule-item-info">
                        <div class="schedule-item-name" data-editable="true" data-original-name="${this.escapeHtml(schedule.name)}">${this.escapeHtml(schedule.name)}</div>
                        <div class="schedule-item-details">${courseCount} course${courseCount === 1 ? '' : 's'}</div>
                    </div>
                    <div class="schedule-item-actions">
                        <button class="btn-link inline-action-btn" data-action="rename">Rename</button>
                        <button class="btn-link inline-action-btn" data-action="duplicate">Duplicate</button>
                        <button class="btn-link inline-action-btn" data-action="export">Export</button>
                        <button class="btn-link inline-action-btn" data-action="export-ics">Export ICS</button>
                        ${schedules.length > 1 ? '<button class="btn-link inline-action-btn danger" data-action="delete">Delete</button>' : ''}
                        <button class="btn-link ${styles['menuBtn']}" title="More options">⋮</button>
                    </div>
                    <div class="${styles['scheduleItemMenu']}" data-visible="false">
                        <button class="${styles['menuAction']}" data-action="rename">Rename</button>
                        <button class="${styles['menuAction']}" data-action="duplicate">Duplicate</button>
                        <button class="${styles['menuAction']}" data-action="export">Export</button>
                        <button class="${styles['menuAction']}" data-action="export-ics">Export ICS</button>
                        ${schedules.length > 1 ? `<button class="${styles['menuAction']} danger" data-action="delete">Delete</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    private updateScheduleList(): void {
        if (!this.modalElement) return;

        const listContainer = this.modalElement.querySelector(`#schedule-list-modal-${this.modalId}`);
        if (listContainer) {
            listContainer.innerHTML = this.renderScheduleList();
            this.setupScheduleItemListeners();
        }
    }

    private async updateStorageUsage(): Promise<void> {
        if (!this.modalElement) return;

        try {
            const stats = await this.scheduleManagementService.getStorageStats();
            const storageText = this.modalElement.querySelector('.storage-usage-text') as HTMLElement;
            const storageFill = this.modalElement.querySelector('#storage-usage-fill-modal') as HTMLElement;

            if (!storageText || !storageFill) return;

            const sizeMB = (stats.estimatedSize / 1024 / 1024).toFixed(2);
            const storageType = stats.isUsingIndexedDB ? 'IndexedDB' : 'localStorage';

            let percentUsed = 0;
            let warningClass = '';

            if (!stats.isUsingIndexedDB) {
                const maxSizeMB = 5;
                percentUsed = (stats.estimatedSize / (maxSizeMB * 1024 * 1024)) * 100;

                if (percentUsed >= 90) {
                    warningClass = 'storage-critical';
                } else if (percentUsed >= 70) {
                    warningClass = 'storage-warning';
                }

                storageText.textContent = `Storage: ${sizeMB} MB / ~${maxSizeMB} MB (${storageType})`;
            } else {
                storageText.textContent = `Storage: ${sizeMB} MB (${storageType})`;
            }

            storageFill.style.width = `${Math.min(percentUsed, 100)}%`;
            storageFill.className = `storage-usage-fill ${warningClass}`;
        } catch (error) {
            console.error('Failed to update storage usage:', error);
        }
    }

    private setupModalEventListeners(modal: HTMLElement): void {
        const newScheduleBtn = modal.querySelector('#new-schedule-btn-modal');
        const newScheduleBtnHeader = modal.querySelector('#new-schedule-btn-header-modal');
        const importBtn = modal.querySelector('#import-schedule-btn-modal');
        const exportBtn = modal.querySelector('#export-schedule-btn-modal');
        const clearAllBtn = modal.querySelector('#clear-all-data-btn-modal');
        const closeBtn = modal.querySelector(`[data-modal-close="${this.modalId}"]`);

        newScheduleBtn?.addEventListener('click', () => this.createNewSchedule());
        newScheduleBtnHeader?.addEventListener('click', () => this.createNewSchedule());
        importBtn?.addEventListener('click', () => this.importSchedule());
        exportBtn?.addEventListener('click', () => this.exportActiveSchedule());
        clearAllBtn?.addEventListener('click', () => this.clearAllData());
        closeBtn?.addEventListener('click', () => this.hide());

        document.addEventListener('click', (e) => {
            if (modal.contains(e.target as Node)) {
                const target = e.target as HTMLElement;
                const isInMenu = target.closest('.schedule-item-menu') || target.closest(`.${styles['scheduleItemMenu']}`);
                const isMenuBtn = target.closest('.menu-btn') || target.closest(`.${styles['menuBtn']}`);

                if (!isInMenu && !isMenuBtn) {
                    this.closeAllScheduleMenus();
                }
            }
        });
    }

    private setupScheduleItemListeners(): void {
        if (!this.modalElement) return;

        const scheduleList = this.modalElement.querySelector(`#schedule-list-modal-${this.modalId}`) as HTMLElement;
        if (!scheduleList) return;

        this.removeScheduleItemListeners();

        this.scheduleListClickHandler = (e) => {
            const target = e.target as HTMLElement;

            // Handle menu button click
            if (target.classList.contains('menu-btn') || target.classList.contains(styles['menuBtn'])) {
                e.stopPropagation();
                this.toggleScheduleMenu(target);
                return;
            }

            // Handle action button clicks
            if (target.classList.contains('menu-action') || target.classList.contains(styles['menuAction']) || target.classList.contains('inline-action-btn')) {
                const action = target.getAttribute('data-action');
                const scheduleId = target.closest('.schedule-item')?.getAttribute('data-schedule-id');
                if (action && scheduleId) {
                    this.handleScheduleAction(action, scheduleId);
                }
                return;
            }

            // Handle clicking anywhere on the schedule item (except buttons)
            const scheduleItem = target.closest('.schedule-item') as HTMLElement;
            if (scheduleItem && !target.closest('button') && !target.classList.contains('schedule-item-name')) {
                const scheduleId = scheduleItem.getAttribute('data-schedule-id');
                if (scheduleId) {
                    this.switchToSchedule(scheduleId);
                }
            }
        };

        this.scheduleListDblClickHandler = (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('schedule-item-name')) {
                this.startRenaming(target);
            }
        };

        scheduleList.addEventListener('click', this.scheduleListClickHandler);
        scheduleList.addEventListener('dblclick', this.scheduleListDblClickHandler);
    }

    private removeScheduleItemListeners(): void {
        if (!this.modalElement) return;

        const scheduleList = this.modalElement.querySelector(`#schedule-list-modal-${this.modalId}`) as HTMLElement;
        if (!scheduleList) return;

        if (this.scheduleListClickHandler) {
            scheduleList.removeEventListener('click', this.scheduleListClickHandler);
        }
        if (this.scheduleListDblClickHandler) {
            scheduleList.removeEventListener('dblclick', this.scheduleListDblClickHandler);
        }
    }

    private switchToSchedule(scheduleId: string): void {
        try {
            this.scheduleManagementService.setActiveSchedule(scheduleId);
        } catch (error) {
            console.error('Failed to switch schedule:', error);
            alert('Failed to switch schedule. Please try again.');
        }
    }

    private toggleScheduleMenu(menuBtn: HTMLElement): void {
        if (!this.modalElement) return;

        this.modalElement.querySelectorAll(`.schedule-item-menu, .${styles['scheduleItemMenu']}`).forEach(menu => {
            const currentMenu = menuBtn.closest('.schedule-item')?.querySelector(`.schedule-item-menu, .${styles['scheduleItemMenu']}`);
            if (menu !== currentMenu) {
                (menu as HTMLElement).setAttribute('data-visible', 'false');
            }
        });

        const scheduleItem = menuBtn.closest('.schedule-item');
        if (!scheduleItem) return;

        const menu = scheduleItem.querySelector(`.schedule-item-menu, .${styles['scheduleItemMenu']}`) as HTMLElement;
        if (menu) {
            const isCurrentlyHidden = menu.getAttribute('data-visible') !== 'true';

            if (isCurrentlyHidden) {
                const btnRect = menuBtn.getBoundingClientRect();
                const menuWidth = SchedulePickerModal.MENU_WIDTH;
                const menuHeight = SchedulePickerModal.MENU_HEIGHT;

                let left = btnRect.right - menuWidth;
                let top = btnRect.bottom + SchedulePickerModal.MENU_OFFSET;

                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                if (left < SchedulePickerModal.VIEWPORT_PADDING) {
                    left = SchedulePickerModal.VIEWPORT_PADDING;
                } else if (left + menuWidth > viewportWidth - SchedulePickerModal.VIEWPORT_PADDING) {
                    left = viewportWidth - menuWidth - SchedulePickerModal.VIEWPORT_PADDING;
                }

                if (top + menuHeight > viewportHeight - SchedulePickerModal.VIEWPORT_PADDING) {
                    top = btnRect.top - menuHeight - SchedulePickerModal.MENU_OFFSET;
                }

                menu.style.left = `${left}px`;
                menu.style.top = `${top}px`;
                menu.setAttribute('data-visible', 'true');
            } else {
                menu.setAttribute('data-visible', 'false');
            }
        }
    }

    private closeAllScheduleMenus(): void {
        if (!this.modalElement) return;

        this.modalElement.querySelectorAll(`.schedule-item-menu, .${styles['scheduleItemMenu']}`).forEach(menu => {
            (menu as HTMLElement).setAttribute('data-visible', 'false');
        });
    }

    private async handleScheduleAction(action: string, scheduleId: string): Promise<void> {
        try {
            switch (action) {
                case 'rename':
                    this.renameSchedule(scheduleId);
                    break;
                case 'duplicate':
                    await this.duplicateSchedule(scheduleId);
                    break;
                case 'export':
                    await this.exportSchedule(scheduleId);
                    break;
                case 'export-ics':
                    await this.exportScheduleICS(scheduleId);
                    break;
                case 'delete':
                    await this.deleteSchedule(scheduleId);
                    break;
            }
        } catch (error) {
            console.error(`Failed to ${action} schedule:`, error);
            alert(`Failed to ${action} schedule. Please try again.`);
        }

        this.closeAllScheduleMenus();
    }

    private startRenaming(nameElement: HTMLElement): void {
        const originalName = nameElement.getAttribute('data-original-name') || nameElement.textContent || '';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalName;
        input.className = 'schedule-name-input';

        const finishRenaming = async () => {
            const newName = input.value.trim();
            if (newName && newName !== originalName) {
                const scheduleId = nameElement.closest('.schedule-item')?.getAttribute('data-schedule-id');
                if (scheduleId) {
                    try {
                        await this.scheduleManagementService.renameSchedule(scheduleId, newName);
                        nameElement.textContent = newName;
                        nameElement.setAttribute('data-original-name', newName);
                    } catch (error) {
                        console.error('Failed to rename schedule:', error);
                        alert('Failed to rename schedule. Please try again.');
                    }
                }
            }
            nameElement.textContent = nameElement.getAttribute('data-original-name') || originalName;
            input.remove();
        };

        input.addEventListener('blur', finishRenaming);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = originalName;
                input.blur();
            }
        });

        nameElement.textContent = '';
        nameElement.appendChild(input);
        input.focus();
        input.select();
    }

    private renameSchedule(scheduleId: string): void {
        if (!this.modalElement) return;

        const scheduleItem = this.modalElement.querySelector(`.schedule-item[data-schedule-id="${scheduleId}"]`);
        const nameElement = scheduleItem?.querySelector('.schedule-item-name') as HTMLElement;
        if (nameElement) {
            this.startRenaming(nameElement);
        }
    }

    private async duplicateSchedule(scheduleId: string): Promise<void> {
        const schedule = this.scheduleManagementService.getAllSchedules().find(s => s.id === scheduleId);
        if (schedule) {
            const newName = `${schedule.name} (Copy)`;
            await this.scheduleManagementService.duplicateSchedule(scheduleId, newName);
            this.updateScheduleList();
        }
    }

    private triggerFileDownload(data: string, filename: string, mimeType: string): void {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    private async exportSchedule(scheduleId: string): Promise<void> {
        const result = await this.scheduleManagementService.exportSchedule(scheduleId);
        if (result.success && result.data) {
            const schedule = this.scheduleManagementService.getScheduleById(scheduleId);
            const filename = `${schedule?.name || 'schedule'}.json`;
            this.triggerFileDownload(result.data, filename, 'application/json');
        } else {
            alert(`Export failed: ${result.error || 'Unknown error'}`);
        }
    }

    private async exportScheduleICS(scheduleId: string): Promise<void> {
        const result = await this.scheduleManagementService.exportScheduleICS(scheduleId);
        if (result.success && result.data) {
            const schedule = this.scheduleManagementService.getScheduleById(scheduleId);
            const filename = `${schedule?.name || 'schedule'}.ics`;
            this.triggerFileDownload(result.data, filename, 'text/calendar');
        } else {
            alert(`ICS Export failed: ${result.error || 'Unknown error'}`);
        }
    }

    private async deleteSchedule(scheduleId: string): Promise<void> {
        const schedule = this.scheduleManagementService.getAllSchedules().find(s => s.id === scheduleId);
        if (schedule && confirm(`Are you sure you want to delete "${schedule.name}"?`)) {
            await this.scheduleManagementService.deleteSchedule(scheduleId);
            this.updateScheduleList();
        }
    }

    private async createNewSchedule(): Promise<void> {
        const name = prompt('Enter schedule name:');
        if (name?.trim()) {
            await this.scheduleManagementService.createNewSchedule(name.trim());
            this.updateScheduleList();
        }
    }

    private async importSchedule(): Promise<void> {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async () => {
            const file = input.files?.[0];
            if (file) {
                try {
                    const text = await file.text();
                    const result = await this.scheduleManagementService.importSchedule(text);

                    if (result.success) {
                        this.updateScheduleList();
                        if (result.message) {
                            alert(result.message);
                        }
                        if (result.warnings && result.warnings.length > 0) {
                            console.warn('Import warnings:', result.warnings);
                        }
                    } else {
                        alert(`Import failed: ${result.error}`);
                    }
                } catch (error) {
                    console.error('Failed to import schedule:', error);
                    alert('Failed to import schedule. Please check the file format.');
                }
            }
        };

        input.click();
    }

    private async exportActiveSchedule(): Promise<void> {
        const result = await this.scheduleManagementService.exportAllSchedules();
        if (result.success && result.data) {
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `wpi-schedules-${timestamp}.json`;
            this.triggerFileDownload(result.data, filename, 'application/json');
        } else {
            alert(`Export failed: ${result.error || 'Unknown error'}`);
        }
    }

    private async exportActiveScheduleICS(): Promise<void> {
        const activeScheduleId = this.scheduleManagementService.getActiveScheduleId();
        if (activeScheduleId) {
            await this.exportScheduleICS(activeScheduleId);
        }
    }

    private setupCourseSelectionListener(): void {
        this.scheduleManagementService.getCourseSelectionService().onSelectionChange(() => {
            if (this.modalElement) {
                this.updateScheduleList();
            }
        });
    }

    private async clearAllData(): Promise<void> {
        const confirmed = confirm(
            'Are you sure you want to clear ALL schedules and data?\n\n' +
            'This will:\n' +
            '• Delete all schedules\n' +
            '• Clear all selected courses\n' +
            '• Reset all preferences\n\n' +
            'This action CANNOT be undone!'
        );

        if (!confirmed) return;

        await this.scheduleManagementService.clearAllSchedules();
        this.updateScheduleList();
        this.updateStorageUsage();
    }
}
