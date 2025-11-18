import type { ConflictData, CloudStateData } from '../../services/sync/CloudSyncTypes';

export type ConflictResolution = 'keep-local' | 'keep-cloud' | 'cancel';
export type ConflictResolveCallback = (resolution: ConflictResolution) => void;

export class ConflictResolutionModal {
    private modalElement: HTMLElement | null = null;
    private callback: ConflictResolveCallback | null = null;
    private conflictData: ConflictData | null = null;

    constructor() {
    }

    private createModal(): void {
        const existingModal = document.getElementById('conflict-resolution-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'conflict-resolution-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Cloud Sync Conflict</h2>
                    <button class="modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="conflict-message">
                        Your schedules have been modified on different devices.
                        Please choose which version to keep:
                    </p>
                    <div class="conflict-comparison">
                        <div class="version-card local-version">
                            <h3>Local Version (This Device)</h3>
                            <div class="version-details">
                                <p class="version-info">
                                    <span class="label">Last Modified:</span>
                                    <span id="local-timestamp">-</span>
                                </p>
                                <p class="version-info">
                                    <span class="label">Device:</span>
                                    <span id="local-device">This device</span>
                                </p>
                                <p class="version-info">
                                    <span class="label">Schedules:</span>
                                    <span id="local-schedules">-</span>
                                </p>
                            </div>
                        </div>
                        <div class="version-card cloud-version">
                            <h3>Cloud Version (OneDrive)</h3>
                            <div class="version-details">
                                <p class="version-info">
                                    <span class="label">Last Modified:</span>
                                    <span id="cloud-timestamp">-</span>
                                </p>
                                <p class="version-info">
                                    <span class="label">Device:</span>
                                    <span id="cloud-device">-</span>
                                </p>
                                <p class="version-info">
                                    <span class="label">Schedules:</span>
                                    <span id="cloud-schedules">-</span>
                                </p>
                            </div>
                        </div>
                    </div>
                    <div class="conflict-warning">
                        <strong>Warning:</strong> The version you don't choose will be overwritten and cannot be recovered.
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="keep-local-btn" class="btn btn-primary">Keep Local Version</button>
                    <button id="keep-cloud-btn" class="btn btn-primary">Keep Cloud Version</button>
                    <button id="cancel-btn" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modalElement = modal;
        this.attachEventListeners();
    }

    private attachEventListeners(): void {
        if (!this.modalElement) return;

        const backdrop = this.modalElement.querySelector('.modal-backdrop');
        const closeBtn = this.modalElement.querySelector('.modal-close');
        const keepLocalBtn = this.modalElement.querySelector('#keep-local-btn');
        const keepCloudBtn = this.modalElement.querySelector('#keep-cloud-btn');
        const cancelBtn = this.modalElement.querySelector('#cancel-btn');

        backdrop?.addEventListener('click', () => this.handleResolve('cancel'));
        closeBtn?.addEventListener('click', () => this.handleResolve('cancel'));
        keepLocalBtn?.addEventListener('click', () => this.handleResolve('keep-local'));
        keepCloudBtn?.addEventListener('click', () => this.handleResolve('keep-cloud'));
        cancelBtn?.addEventListener('click', () => this.handleResolve('cancel'));
    }

    show(conflictData: ConflictData, callback: ConflictResolveCallback): void {
        this.conflictData = conflictData;
        this.callback = callback;

        if (!this.modalElement) {
            this.createModal();
        }

        this.updateContent();
        this.modalElement?.classList.add('visible');
        document.body.style.overflow = 'hidden';
    }

    hide(): void {
        this.modalElement?.classList.remove('visible');
        setTimeout(() => {
            this.modalElement?.remove();
            this.modalElement = null;
            document.body.style.overflow = '';
            this.callback = null;
            this.conflictData = null;
        }, 200);
    }

    private updateContent(): void {
        if (!this.conflictData || !this.modalElement) return;

        const { local, cloud } = this.conflictData;

        const localTimestamp = this.modalElement.querySelector('#local-timestamp');
        const localDevice = this.modalElement.querySelector('#local-device');
        const localSchedules = this.modalElement.querySelector('#local-schedules');

        const cloudTimestamp = this.modalElement.querySelector('#cloud-timestamp');
        const cloudDevice = this.modalElement.querySelector('#cloud-device');
        const cloudSchedules = this.modalElement.querySelector('#cloud-schedules');

        if (localTimestamp) {
            localTimestamp.textContent = this.formatTimestamp(local.syncMetadata.lastSyncTimestamp);
        }
        if (localDevice) {
            localDevice.textContent = local.syncMetadata.deviceName || 'This device';
        }
        if (localSchedules) {
            localSchedules.textContent = `${local.schedules.length} schedule(s)`;
        }

        if (cloudTimestamp) {
            cloudTimestamp.textContent = this.formatTimestamp(cloud.syncMetadata.lastSyncTimestamp);
        }
        if (cloudDevice) {
            cloudDevice.textContent = cloud.syncMetadata.deviceName || 'Unknown device';
        }
        if (cloudSchedules) {
            cloudSchedules.textContent = `${cloud.schedules.length} schedule(s)`;
        }
    }

    private handleResolve(resolution: ConflictResolution): void {
        if (this.callback) {
            this.callback(resolution);
        }
        this.hide();
    }

    private formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

        return date.toLocaleString();
    }

    destroy(): void {
        this.modalElement?.remove();
        this.modalElement = null;
        this.callback = null;
        this.conflictData = null;
    }
}
