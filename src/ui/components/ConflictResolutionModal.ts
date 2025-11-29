import type { ConflictInfo, ConflictResolution } from '../../services/sync/types';
import { BaseModal } from './BaseModal';
import { ModalService } from '../../services/ModalService';

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
                    <div class="modal-body">
                        <p class="conflict-message">
                            Your data differs between this device and the cloud.
                            Please choose which version to keep:
                        </p>
                        <div class="conflict-details" id="conflict-details">
                            <!-- Populated dynamically -->
                        </div>
                        <div class="conflict-comparison">
                            <div class="version-card local-version">
                                <h3>Local Version</h3>
                                <div class="version-details">
                                    <p class="version-info">
                                        <span class="label">Schedules:</span>
                                        <span id="local-schedules">-</span>
                                    </p>
                                    <p class="version-info">
                                        <span class="label">Courses:</span>
                                        <span id="local-courses">-</span>
                                    </p>
                                </div>
                            </div>
                            <div class="version-card cloud-version">
                                <h3>Cloud Version</h3>
                                <div class="version-details">
                                    <p class="version-info">
                                        <span class="label">Schedules:</span>
                                        <span id="cloud-schedules">-</span>
                                    </p>
                                    <p class="version-info">
                                        <span class="label">Courses:</span>
                                        <span id="cloud-courses">-</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div class="conflict-warning">
                            <strong>Warning:</strong> The version you don't choose will be overwritten and cannot be recovered.
                        </div>
                    </div>
                    <div class="modal-footer">
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

    private updateContent(element: HTMLElement): void {
        if (!this.conflictInfo) return;

        const { localData, cloudData } = this.conflictInfo;

        // Show simple message that data differs
        const detailsEl = element.querySelector('#conflict-details');
        if (detailsEl) {
            detailsEl.innerHTML = `
                <p class="conflict-explanation">
                    Your local data and cloud data are different.
                    Compare the details below to decide which version to keep.
                </p>
            `;
        }

        // Helper to count total courses across schedules
        const countCourses = (schedules: any[]) => {
            return schedules.reduce((total, s) => total + (s.selectedCourses?.length || 0), 0);
        };

        // Update local version info
        const localSchedules = element.querySelector('#local-schedules');
        const localCourses = element.querySelector('#local-courses');

        if (localSchedules) {
            localSchedules.textContent = String(localData.schedules?.length || 0);
        }
        if (localCourses) {
            localCourses.textContent = String(countCourses(localData.schedules || []));
        }

        // Update cloud version info
        const cloudSchedules = element.querySelector('#cloud-schedules');
        const cloudCourses = element.querySelector('#cloud-courses');

        if (cloudSchedules) {
            cloudSchedules.textContent = String(cloudData.schedules?.length || 0);
        }
        if (cloudCourses) {
            cloudCourses.textContent = String(countCourses(cloudData.schedules || []));
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
