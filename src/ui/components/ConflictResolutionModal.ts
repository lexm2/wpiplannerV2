import type { ConflictInfo, ConflictResolution } from '../../services/sync/types';
import { BaseModal } from './BaseModal';
import { ModalService } from '../../services/ui/ModalService';
import { getInlineSVG } from '../../utils/iconPaths';

export type ConflictResolveCallback = (resolution: ConflictResolution) => void;

export class ConflictResolutionModal extends BaseModal {
    private conflictInfo: ConflictInfo | null = null;
    private callback: ConflictResolveCallback | null = null;

    constructor(modalService: ModalService) {
        super(modalService);
    }

    private createModalElement(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.id = 'conflict-resolution-modal';
        backdrop.style.pointerEvents = 'auto';
        backdrop.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Cloud Sync Conflict</h2>
                        <button class="modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="conflict-intro">
                        <p class="conflict-message">
                            Your data differs between this device and the cloud.
                            Review the details below and choose which version to keep.
                        </p>
                    </div>
                    <div class="modal-body">
                        <div class="conflict-comparison">
                            <div class="version-card local-version" data-version="local">
                                <div class="version-card-header">
                                    <h3>This Device</h3>
                                    <div class="version-time-badge" id="local-time-badge"></div>
                                </div>
                                <div class="version-stats">
                                    <div class="version-stat">
                                        <span class="version-stat-label">Last Updated</span>
                                        <span class="version-stat-value" id="local-timestamp">-</span>
                                    </div>
                                    <div class="version-stat">
                                        <span class="version-stat-label">Total Courses</span>
                                        <span class="version-stat-value" id="local-courses">-</span>
                                    </div>
                                </div>
                                <div id="local-schedules-container">
                                    <!-- Populated dynamically -->
                                </div>
                            </div>
                            <div class="version-card cloud-version" data-version="cloud">
                                <div class="version-card-header">
                                    <h3>Cloud</h3>
                                    <div class="version-time-badge" id="cloud-time-badge"></div>
                                </div>
                                <div class="version-stats">
                                    <div class="version-stat">
                                        <span class="version-stat-label">Last Updated</span>
                                        <span class="version-stat-value" id="cloud-timestamp">-</span>
                                    </div>
                                    <div class="version-stat">
                                        <span class="version-stat-label">Total Courses</span>
                                        <span class="version-stat-value" id="cloud-courses">-</span>
                                    </div>
                                </div>
                                <div id="cloud-schedules-container">
                                    <!-- Populated dynamically -->
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <div class="footer-warning-tooltip">
                            ${getInlineSVG('ALERT_CIRCLE', 'footer-warning-icon')}
                            <div class="footer-warning-popup">
                                <strong>Warning:</strong> The version you don't choose will be overwritten and cannot be recovered.
                            </div>
                        </div>
                        <button id="cancel-btn" class="modal-btn btn-secondary">Cancel (Sign Out)</button>
                        <button id="keep-cloud-btn" class="modal-btn btn-primary">Use Cloud Data</button>
                        <button id="keep-local-btn" class="modal-btn btn-primary">Use Local Data</button>
                    </div>
                </div>
            </div>
        `;

        // Setup event listeners
        const dialog = backdrop.querySelector('.modal-dialog') as HTMLElement;
        const closeBtn = backdrop.querySelector('.modal-close');
        const keepLocalBtn = backdrop.querySelector('#keep-local-btn');
        const keepCloudBtn = backdrop.querySelector('#keep-cloud-btn');
        const cancelBtn = backdrop.querySelector('#cancel-btn');

        // Stop propagation on dialog to prevent backdrop click from closing
        dialog?.addEventListener('click', (e) => e.stopPropagation());

        closeBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleResolve('cancel');
        });
        keepLocalBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleResolve('local');
        });
        keepCloudBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleResolve('cloud');
        });
        cancelBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleResolve('cancel');
        });

        return backdrop;
    }

    show(conflictInfo: ConflictInfo, callback: ConflictResolveCallback): void {
        this.conflictInfo = conflictInfo;
        this.callback = callback;

        const element = this.createModalElement();
        this.updateContent(element);
        this.showModal(element, { closeOnBackdrop: false });
    }

    private renderSchedulesList(schedules: any[], activeScheduleId?: string | null): string {
        if (!schedules || schedules.length === 0) {
            return `
                <div class="version-schedules">
                    <div class="version-schedules-header">
                        <span class="version-schedules-label">Schedules</span>
                        <span class="version-schedules-count">0</span>
                    </div>
                    <p class="version-schedules-empty">No schedules saved</p>
                </div>
            `;
        }

        // Limit display to first 5 schedules
        const displaySchedules = schedules.slice(0, 5);
        const hasMore = schedules.length > 5;

        const scheduleItems = displaySchedules.map(s => {
            const isActive = s.id === activeScheduleId;
            const activeIndicator = isActive ? '<span class="schedule-active-dot"></span>' : '';
            const activeClass = isActive ? 'active' : '';
            const title = this.escapeHtml(s.name || 'Unnamed Schedule');

            return `<li class="version-schedule-item ${activeClass}" title="${title}">
                ${activeIndicator}${title}
            </li>`;
        }).join('');

        const moreIndicator = hasMore
            ? `<li class="version-schedule-item more-indicator">
                +${schedules.length - 5} more
            </li>`
            : '';

        return `
            <div class="version-schedules">
                <div class="version-schedules-header">
                    <span class="version-schedules-label">Schedules</span>
                    <span class="version-schedules-count">${schedules.length}</span>
                </div>
                <ul class="version-schedules-list">
                    ${scheduleItems}
                    ${moreIndicator}
                </ul>
            </div>
        `;
    }

    private updateTimeBadges(element: HTMLElement): void {
        if (!this.conflictInfo) return;

        const { localData, cloudData } = this.conflictInfo;
        const localBadge = element.querySelector('#local-time-badge');
        const cloudBadge = element.querySelector('#cloud-time-badge');

        if (!localBadge || !cloudBadge) return;

        const timeDiff = localData.timestamp - cloudData.timestamp;
        const threshold = 60000; // 1 minute tolerance for "same time"

        if (Math.abs(timeDiff) < threshold) {
            // Timestamps are essentially the same
            localBadge.className = 'version-time-badge same-time';
            localBadge.textContent = 'Same Time';
            cloudBadge.className = 'version-time-badge same-time';
            cloudBadge.textContent = 'Same Time';
        } else if (timeDiff > 0) {
            // Local is newer
            localBadge.className = 'version-time-badge newer';
            localBadge.textContent = 'Newer';
            cloudBadge.className = 'version-time-badge older';
            cloudBadge.textContent = 'Older';
        } else {
            // Cloud is newer
            localBadge.className = 'version-time-badge older';
            localBadge.textContent = 'Older';
            cloudBadge.className = 'version-time-badge newer';
            cloudBadge.textContent = 'Newer';
        }
    }

    private updateContent(element: HTMLElement): void {
        if (!this.conflictInfo) return;

        const { localData, cloudData } = this.conflictInfo;

        // Helper to count total courses across schedules
        const countCourses = (schedules: any[]) => {
            return schedules.reduce((total, s) => total + (s.selectedCourses?.length || 0), 0);
        };

        // Helper to format timestamp as readable date/time
        const formatTimestamp = (timestamp: number): string => {
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            // Format based on recency - add "Updated" prefix for clarity
            if (diffMins < 1) {
                return 'Updated just now';
            } else if (diffMins < 60) {
                return `Updated ${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
            } else if (diffHours < 24) {
                return `Updated ${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
            } else if (diffDays < 7) {
                return `Updated ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
            } else {
                // Show both relative and absolute for older dates
                const absolute = date.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return `Updated ${absolute}`;
            }
        };

        // Update time badges
        this.updateTimeBadges(element);

        // Update local version info
        const localCourses = element.querySelector('#local-courses');
        const localTimestamp = element.querySelector('#local-timestamp');
        const localSchedulesContainer = element.querySelector('#local-schedules-container');

        if (localCourses) {
            localCourses.textContent = String(countCourses(localData.schedules || []));
        }
        if (localTimestamp) {
            localTimestamp.textContent = formatTimestamp(localData.timestamp);
        }
        if (localSchedulesContainer) {
            localSchedulesContainer.innerHTML = this.renderSchedulesList(
                localData.schedules || [],
                localData.activeScheduleId
            );
        }

        // Update cloud version info
        const cloudCourses = element.querySelector('#cloud-courses');
        const cloudTimestamp = element.querySelector('#cloud-timestamp');
        const cloudSchedulesContainer = element.querySelector('#cloud-schedules-container');

        if (cloudCourses) {
            cloudCourses.textContent = String(countCourses(cloudData.schedules || []));
        }
        if (cloudTimestamp) {
            cloudTimestamp.textContent = formatTimestamp(cloudData.timestamp);
        }
        if (cloudSchedulesContainer) {
            cloudSchedulesContainer.innerHTML = this.renderSchedulesList(
                cloudData.schedules || [],
                cloudData.activeScheduleId
            );
        }
    }

    private handleResolve(resolution: ConflictResolution): void {
        if (this.callback) {
            this.callback(resolution);
        }
        this.hide();
    }

    destroy(): void {
        this.modalElement?.remove();
        this.modalElement = null;
        this.callback = null;
        this.conflictInfo = null;
    }
}
