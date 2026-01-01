import type { MockCloudProvider } from '../../tests/mocks/MockCloudProvider';
import type { SyncManager } from '../services/sync/SyncManager';
import { syncEventBus } from '../services/sync/SyncEventBus';
import type { SyncEvent, SyncData } from '../services/sync/types';
import { ProfileStateManager } from '../core/state/ProfileStateManager';

interface OperationLogEntry {
    timestamp: number;
    operation: string;
    status: 'success' | 'error';
    message?: string;
}

/**
 * Browser-based UI for controlling MockCloudProvider during manual testing
 *
 * Features:
 * - Switch between mock devices
 * - View cloud storage state
 * - Manually trigger sync operations
 * - Inject conflicts for testing
 * - Operation history log
 */
export class MockCloudProviderUI {
    private container: HTMLElement;
    private mockProvider: MockCloudProvider;
    private syncManager: SyncManager;
    private operationLog: OperationLogEntry[] = [];
    private isVisible: boolean = true;
    private isDragging: boolean = false;
    private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

    constructor(mockProvider: MockCloudProvider, syncManager: SyncManager) {
        this.mockProvider = mockProvider;
        this.syncManager = syncManager;
        this.container = this.createUI();
        this.attachEventListeners();
        this.setupSyncEventListeners();
        this.makeDraggable();
    }

    /**
     * Get the container element
     */
    public getContainer(): HTMLElement {
        return this.container;
    }

    /**
     * Toggle UI visibility
     */
    public toggle(): void {
        this.isVisible = !this.isVisible;
        this.container.style.display = this.isVisible ? 'block' : 'none';
    }

    /**
     * Create the UI panel
     */
    private createUI(): HTMLElement {
        const panel = document.createElement('div');
        panel.id = 'mock-cloud-provider-ui';
        panel.className = 'mock-provider-panel';
        panel.innerHTML = this.getHTMLContent();
        return panel;
    }

    /**
     * Generate HTML content for the panel
     */
    private getHTMLContent(): string {
        const deviceId = this.mockProvider.getDeviceId();
        const isAuthenticated = this.mockProvider.isAuthenticated();
        const cloudData = this.mockProvider.getSharedCloudData();
        const devices = this.mockProvider.getAllMockDevices();

        return `
            <div class="mock-panel-header" id="mock-panel-header">
                <div class="mock-panel-title">Mock Cloud Provider</div>
                <div class="mock-panel-controls">
                    <button class="mock-btn-minimize" id="mock-minimize" title="Minimize">−</button>
                    <button class="mock-btn-close" id="mock-close" title="Close (Ctrl+Shift+M)">×</button>
                </div>
            </div>
            <div class="mock-panel-body" id="mock-panel-body">
                <div class="mock-section">
                    <div class="mock-section-title">Device Control</div>
                    <div class="mock-control-row">
                        <select id="mock-device-select" class="mock-select">
                            <option value="device-a" ${deviceId === 'device-a' ? 'selected' : ''}>Device A</option>
                            <option value="device-b" ${deviceId === 'device-b' ? 'selected' : ''}>Device B</option>
                            <option value="device-c" ${deviceId === 'device-c' ? 'selected' : ''}>Device C</option>
                        </select>
                        <button id="mock-auth-btn" class="mock-btn ${isAuthenticated ? 'mock-btn-danger' : 'mock-btn-primary'}">
                            ${isAuthenticated ? 'Sign Out' : 'Sign In'}
                        </button>
                    </div>
                    <div class="mock-status">
                        <span class="mock-status-indicator ${isAuthenticated ? 'mock-status-active' : 'mock-status-inactive'}"></span>
                        ${isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
                    </div>
                </div>

                <div class="mock-section">
                    <div class="mock-section-title">Cloud Storage</div>
                    ${this.renderCloudDataInfo(cloudData)}
                    <div class="mock-button-row">
                        <button id="mock-view-data" class="mock-btn mock-btn-secondary">View Data</button>
                        <button id="mock-clear-cloud" class="mock-btn mock-btn-danger">Clear Cloud</button>
                    </div>
                </div>

                <div class="mock-section">
                    <div class="mock-section-title">Actions</div>
                    <div class="mock-button-row">
                        <button id="mock-push-data" class="mock-btn mock-btn-primary" ${!isAuthenticated ? 'disabled' : ''}>Push Data</button>
                        <button id="mock-pull-data" class="mock-btn mock-btn-primary" ${!isAuthenticated ? 'disabled' : ''}>Pull Data</button>
                    </div>
                    <div class="mock-button-row">
                        <button id="mock-inject-conflict" class="mock-btn mock-btn-warning" ${!cloudData ? 'disabled' : ''}>Inject Conflict</button>
                        <button id="mock-clear-all" class="mock-btn mock-btn-danger">Clear All Storage</button>
                    </div>
                </div>

                <div class="mock-section">
                    <div class="mock-section-title">Operation Log</div>
                    <div id="mock-operation-log" class="mock-operation-log">
                        ${this.renderOperationLog()}
                    </div>
                </div>

                <div class="mock-section">
                    <div class="mock-section-title">Devices</div>
                    <div class="mock-devices-list">
                        ${devices.length > 0 ? devices.map(d =>
                            `<div class="mock-device-item ${d === deviceId ? 'mock-device-active' : ''}">
                                ${d} ${d === deviceId ? '(current)' : ''}
                            </div>`
                        ).join('') : '<div class="mock-text-muted">No devices found</div>'}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render cloud data information
     */
    private renderCloudDataInfo(cloudData: SyncData | null): string {
        if (!cloudData) {
            return '<div class="mock-text-muted">No cloud data</div>';
        }

        // Defensive checks for all fields
        if (!cloudData.checksum || !cloudData.timestamp) {
            return `
                <div class="mock-text-warning">
                    ⚠️ Invalid cloud data detected
                    <div class="mock-text-small">
                        Missing required fields.
                        <button id="mock-fix-data" class="mock-btn-link">Clear corrupted data</button>
                    </div>
                </div>
            `;
        }

        const timestamp = new Date(cloudData.timestamp);
        const timeAgo = this.getTimeAgo(cloudData.timestamp);

        return `
            <div class="mock-cloud-info">
                <div class="mock-info-row">
                    <span class="mock-info-label">Last Update:</span>
                    <span class="mock-info-value">${timeAgo}</span>
                </div>
                <div class="mock-info-row">
                    <span class="mock-info-label">Checksum:</span>
                    <span class="mock-info-value mock-text-mono">${cloudData.checksum.substring(0, 12)}...</span>
                </div>
                <div class="mock-info-row">
                    <span class="mock-info-label">Schedules:</span>
                    <span class="mock-info-value">${cloudData.schedules?.length ?? 0}</span>
                </div>
                <div class="mock-info-row">
                    <span class="mock-info-label">Version:</span>
                    <span class="mock-info-value">${cloudData.version ?? 'unknown'}</span>
                </div>
            </div>
        `;
    }

    /**
     * Render operation log
     */
    private renderOperationLog(): string {
        if (this.operationLog.length === 0) {
            return '<div class="mock-text-muted">No operations yet</div>';
        }

        return this.operationLog.slice(-10).reverse().map(entry => {
            const timeAgo = this.getTimeAgo(entry.timestamp);
            const icon = entry.status === 'success' ? '✓' : '✗';
            const className = entry.status === 'success' ? 'mock-log-success' : 'mock-log-error';

            return `
                <div class="mock-log-entry ${className}">
                    <span class="mock-log-icon">${icon}</span>
                    <span class="mock-log-operation">${entry.operation}</span>
                    <span class="mock-log-time">${timeAgo}</span>
                    ${entry.message ? `<div class="mock-log-message">${entry.message}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Attach event listeners to UI elements
     */
    private attachEventListeners(): void {
        // Device selector
        const deviceSelect = this.container.querySelector('#mock-device-select') as HTMLSelectElement;
        deviceSelect?.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            this.switchDevice(target.value);
        });

        // Auth button
        const authBtn = this.container.querySelector('#mock-auth-btn') as HTMLButtonElement;
        authBtn?.addEventListener('click', () => this.handleAuth());

        // Push/Pull buttons
        this.container.querySelector('#mock-push-data')?.addEventListener('click', () => this.handlePushData());
        this.container.querySelector('#mock-pull-data')?.addEventListener('click', () => this.handlePullData());

        // View/Clear buttons
        this.container.querySelector('#mock-view-data')?.addEventListener('click', () => this.handleViewData());
        this.container.querySelector('#mock-clear-cloud')?.addEventListener('click', () => this.handleClearCloud());

        // Inject conflict button
        this.container.querySelector('#mock-inject-conflict')?.addEventListener('click', () => this.handleInjectConflict());

        // Clear all storage
        this.container.querySelector('#mock-clear-all')?.addEventListener('click', () => this.handleClearAll());

        // Clear corrupted data button
        this.container.querySelector('#mock-fix-data')?.addEventListener('click', () => {
            if (confirm('Clear corrupted cloud data? This cannot be undone.')) {
                this.mockProvider.clearCorruptedCloudData();
                this.addLogEntry('clearCorrupted', 'success');
                this.refresh();
            }
        });

        // Close button
        this.container.querySelector('#mock-close')?.addEventListener('click', () => this.toggle());

        // Minimize button
        this.container.querySelector('#mock-minimize')?.addEventListener('click', () => this.handleMinimize());
    }

    /**
     * Setup sync event listeners
     */
    private setupSyncEventListeners(): void {
        const eventListener = (event: SyncEvent) => {
            this.addLogEntry(event.type, 'success');
            this.refresh();
        };

        syncEventBus.on('auth-changed', eventListener);
        syncEventBus.on('sync-pushed', eventListener);
        syncEventBus.on('sync-failed', (event) => {
            this.addLogEntry(event.type, 'error', event.error?.message);
            this.refresh();
        });
        syncEventBus.on('sync-conflict', eventListener);
        syncEventBus.on('sync-resolved', eventListener);
    }

    /**
     * Make panel draggable
     */
    private makeDraggable(): void {
        const header = this.container.querySelector('#mock-panel-header') as HTMLElement;

        header.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            const rect = this.container.getBoundingClientRect();
            this.dragOffset.x = e.clientX - rect.left;
            this.dragOffset.y = e.clientY - rect.top;
            header.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const x = e.clientX - this.dragOffset.x;
            const y = e.clientY - this.dragOffset.y;

            this.container.style.left = `${x}px`;
            this.container.style.top = `${y}px`;
            this.container.style.right = 'auto';
            this.container.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                header.style.cursor = 'grab';
            }
        });
    }

    /**
     * Switch to a different mock device
     */
    private async switchDevice(deviceId: string): Promise<void> {
        this.addLogEntry(`Switch to ${deviceId}`, 'success');
        this.mockProvider.setDeviceId(deviceId);

        // Save current device ID to localStorage
        localStorage.setItem('mock-device-id', deviceId);

        this.refresh();
    }

    /**
     * Handle authentication (sign in/out)
     */
    private async handleAuth(): Promise<void> {
        try {
            if (this.mockProvider.isAuthenticated()) {
                await this.syncManager.signOut();
                this.addLogEntry('signOut', 'success');
            } else {
                await this.mockProvider.signIn();
                this.addLogEntry('signIn', 'success');
            }
        } catch (error) {
            this.addLogEntry('auth', 'error', error instanceof Error ? error.message : 'Unknown error');
        }
        this.refresh();
    }

    /**
     * Handle push data
     */
    private async handlePushData(): Promise<void> {
        try {
            await this.syncManager.pushLocalDataImmediately();
            this.addLogEntry('pushData', 'success');
        } catch (error) {
            this.addLogEntry('pushData', 'error', error instanceof Error ? error.message : 'Unknown error');
        }
        this.refresh();
    }

    /**
     * Handle pull data with conflict detection
     */
    private async handlePullData(): Promise<void> {
        try {
            // Get local data from ProfileStateManager
            const stateManager = ProfileStateManager.getInstance();
            const exportedData = await stateManager.exportData();

            if (!exportedData) {
                this.addLogEntry('pullData', 'error', 'No local data to compare');
                return;
            }

            const data = JSON.parse(exportedData);
            const localData: SyncData = {
                version: data.version || '3.0',
                timestamp: Date.now(),
                checksum: data.checksum || '',
                activeScheduleId: data.activeScheduleId || null,
                schedules: data.schedules || [],
                preferences: data.preferences,
            };

            // Check for conflicts on pull
            const conflictInfo = await this.syncManager.checkConflicts(localData);

            if (conflictInfo) {
                this.addLogEntry('pullData', 'success', `Conflict detected! Local: ${localData.checksum.substring(0, 8)}... vs Cloud: ${conflictInfo.cloudData.checksum.substring(0, 8)}...`);
            } else {
                this.addLogEntry('pullData', 'success', 'No conflicts - data in sync');
            }
        } catch (error) {
            this.addLogEntry('pullData', 'error', error instanceof Error ? error.message : 'Unknown error');
        }
        this.refresh();
    }

    /**
     * Handle view data
     */
    private handleViewData(): void {
        const cloudData = this.mockProvider.getSharedCloudData();
        if (cloudData) {
            console.log('[Mock Provider] Cloud Data:', cloudData);
            alert('Cloud data logged to console. Check the browser console (F12).');
        } else {
            alert('No cloud data available');
        }
    }

    /**
     * Handle clear cloud storage
     */
    private handleClearCloud(): void {
        if (confirm('Clear cloud storage? This will remove all synced data.')) {
            localStorage.removeItem(this.getCloudStorageKey());
            this.addLogEntry('clearCloud', 'success');
            this.refresh();
        }
    }

    /**
     * Handle inject conflict
     */
    private async handleInjectConflict(): Promise<void> {
        const cloudData = this.mockProvider.getSharedCloudData();
        if (!cloudData) {
            alert('No cloud data to modify');
            return;
        }

        if (confirm('Inject a conflict by modifying cloud data?')) {
            // Modify the cloud data to create a conflict
            const modifiedData: SyncData = {
                ...cloudData,
                timestamp: Date.now(),
                checksum: this.createConflictingChecksum(cloudData.checksum),
            };

            // Save directly to cloud storage
            const cloudState = {
                data: modifiedData,
                lastUpdatedBy: 'conflict-injector',
                lastUpdatedAt: Date.now(),
            };

            localStorage.setItem(this.getCloudStorageKey(), JSON.stringify(cloudState));
            this.addLogEntry('injectConflict', 'success');
            this.refresh();
        }
    }

    /**
     * Create a valid but different checksum for conflict simulation
     */
    private createConflictingChecksum(originalChecksum: string): string {
        // Flip hex characters to create different but valid checksum
        const flipHexChar = (char: string): string => {
            const value = parseInt(char, 16);
            return (15 - value).toString(16);
        };

        // Flip first 8 characters to create noticeable difference
        const flipped = originalChecksum
            .substring(0, 8)
            .split('')
            .map(flipHexChar)
            .join('');

        return flipped + originalChecksum.substring(8);
    }

    /**
     * Handle clear all storage
     */
    private handleClearAll(): void {
        if (confirm('Clear ALL mock storage? This will remove all devices and cloud data.')) {
            this.mockProvider.clearAllMockStorage();
            localStorage.removeItem('mock-device-id');
            this.addLogEntry('clearAll', 'success');
            this.refresh();
        }
    }

    /**
     * Handle minimize button
     */
    private handleMinimize(): void {
        const body = this.container.querySelector('#mock-panel-body') as HTMLElement;
        const isMinimized = body.style.display === 'none';

        body.style.display = isMinimized ? 'block' : 'none';

        const minimizeBtn = this.container.querySelector('#mock-minimize') as HTMLElement;
        minimizeBtn.textContent = isMinimized ? '−' : '+';
    }

    /**
     * Add entry to operation log
     */
    private addLogEntry(operation: string, status: 'success' | 'error', message?: string): void {
        this.operationLog.push({
            timestamp: Date.now(),
            operation,
            status,
            message,
        });

        // Keep only last 50 entries
        if (this.operationLog.length > 50) {
            this.operationLog = this.operationLog.slice(-50);
        }
    }

    /**
     * Refresh the UI
     */
    private refresh(): void {
        const oldPanel = this.container;
        const newPanel = this.createUI();

        // Preserve position and visibility
        newPanel.style.left = oldPanel.style.left;
        newPanel.style.top = oldPanel.style.top;
        newPanel.style.right = oldPanel.style.right;
        newPanel.style.bottom = oldPanel.style.bottom;
        newPanel.style.display = oldPanel.style.display;

        oldPanel.replaceWith(newPanel);
        this.container = newPanel;
        this.attachEventListeners();
        this.makeDraggable();
    }

    /**
     * Get cloud storage key
     */
    private getCloudStorageKey(): string {
        return 'mock-cloud-cloud';
    }

    /**
     * Get time ago string
     */
    private getTimeAgo(timestamp: number): string {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);

        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }
}
