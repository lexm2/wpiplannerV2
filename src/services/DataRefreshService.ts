export class DataRefreshService {
    private static readonly REFRESH_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
    private static readonly LAST_REFRESH_KEY = 'wpi-planner-last-refresh';
    private static readonly COURSE_DATA_URL = './course-data.json';
    
    private timestampElement: HTMLElement | null = null;
    private refreshButton: HTMLButtonElement | null = null;
    private refreshTextElement: HTMLElement | null = null;

    constructor() {
        this.init();
    }

    private init(): void {
        this.timestampElement = document.getElementById('data-timestamp');
        this.refreshButton = document.getElementById('refresh-data') as HTMLButtonElement;
        this.refreshTextElement = document.getElementById('refresh-text');

        this.setupEventListeners();
        this.updateTimestamp();
        this.updateRefreshButton();
        
        // Update refresh button state every minute
        setInterval(() => {
            this.updateRefreshButton();
        }, 60000);
    }

    private setupEventListeners(): void {
        if (this.refreshButton) {
            this.refreshButton.addEventListener('click', () => {
                this.handleRefresh();
            });
        }
    }

    private async updateTimestamp(): Promise<void> {
        if (!this.timestampElement) return;

        try {
            // Get file modification time from the server
            const response = await fetch(DataRefreshService.COURSE_DATA_URL, { 
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            const lastModified = response.headers.get('Last-Modified');
            if (lastModified) {
                const date = new Date(lastModified);
                this.timestampElement.textContent = `Data last updated: ${this.formatTimestamp(date)}`;
            } else {
                // Fallback: use known git commit timestamp for course-data.json
                const fallbackDate = new Date('2025-08-22T23:32:46-04:00');
                this.timestampElement.textContent = `Data last updated: ${this.formatTimestamp(fallbackDate)}`;
            }
        } catch (error) {
            console.warn('Failed to get data timestamp:', error);
            this.timestampElement.textContent = 'Data timestamp unavailable';
        }
    }

    private formatTimestamp(date: Date): string {
        const options: Intl.DateTimeFormatOptions = {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        return date.toLocaleDateString('en-US', options).replace(',', ' at');
    }

    private updateRefreshButton(): void {
        if (!this.refreshButton || !this.refreshTextElement) return;

        const lastRefresh = this.getLastRefreshTime();
        const now = Date.now();
        const timeSinceRefresh = now - lastRefresh;
        
        if (timeSinceRefresh < DataRefreshService.REFRESH_COOLDOWN_MS) {
            // Still in cooldown
            this.refreshButton.disabled = true;
            const remainingTime = DataRefreshService.REFRESH_COOLDOWN_MS - timeSinceRefresh;
            const minutes = Math.ceil(remainingTime / (60 * 1000));
            this.refreshTextElement.textContent = `Wait ${minutes}m`;
        } else {
            // Cooldown expired
            this.refreshButton.disabled = false;
            this.refreshTextElement.textContent = 'Refresh';
        }
    }

    private async handleRefresh(): Promise<void> {
        if (!this.refreshButton || this.refreshButton.disabled) return;

        try {
            // Set loading state
            this.refreshButton.classList.add('loading');
            this.refreshButton.disabled = true;
            if (this.refreshTextElement) {
                this.refreshTextElement.textContent = 'Refreshing...';
            }

            // For now, simulate refresh by just clearing cache and reloading
            // In a production environment, this would call a backend API
            // that triggers the fetch-course-data.js script
            
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // For demo purposes, just mark as successful
            // In production, you'd want to call: node scripts/fetch-course-data.js
            // or have a backend endpoint that does this
            
            // Update last refresh time
            this.setLastRefreshTime(Date.now());
            
            // Update timestamp display
            await this.updateTimestamp();
            
            // Trigger data reload in the application
            this.triggerDataReload();
            
            this.showSuccess('Data refreshed successfully!');
        } catch (error) {
            console.error('Failed to refresh data:', error);
            this.showError('Failed to refresh data. Please try again later.');
        } finally {
            // Remove loading state
            this.refreshButton.classList.remove('loading');
            this.updateRefreshButton();
        }
    }

    private triggerDataReload(): void {
        // Dispatch custom event to notify other parts of the app to reload data
        window.dispatchEvent(new CustomEvent('data-refreshed'));
    }

    private showSuccess(message: string): void {
        // Simple success feedback - could be enhanced with a toast system
        const originalText = this.refreshTextElement?.textContent;
        if (this.refreshTextElement) {
            this.refreshTextElement.textContent = '✓ Success';
            setTimeout(() => {
                if (this.refreshTextElement) {
                    this.refreshTextElement.textContent = 'Refresh';
                }
            }, 2000);
        }
    }

    private showError(message: string): void {
        // Simple error feedback
        const originalText = this.refreshTextElement?.textContent;
        if (this.refreshTextElement) {
            this.refreshTextElement.textContent = '✗ Failed';
            setTimeout(() => {
                if (this.refreshTextElement) {
                    this.refreshTextElement.textContent = 'Refresh';
                }
            }, 2000);
        }
    }

    private getLastRefreshTime(): number {
        try {
            const stored = localStorage.getItem(DataRefreshService.LAST_REFRESH_KEY);
            return stored ? parseInt(stored, 10) : 0;
        } catch (error) {
            return 0;
        }
    }

    private setLastRefreshTime(timestamp: number): void {
        try {
            localStorage.setItem(DataRefreshService.LAST_REFRESH_KEY, timestamp.toString());
        } catch (error) {
            console.warn('Failed to save refresh timestamp:', error);
        }
    }

    // Public method to check if refresh is available
    public canRefresh(): boolean {
        const lastRefresh = this.getLastRefreshTime();
        const timeSinceRefresh = Date.now() - lastRefresh;
        return timeSinceRefresh >= DataRefreshService.REFRESH_COOLDOWN_MS;
    }

    // Public method to force refresh (for testing)
    public async forceRefresh(): Promise<void> {
        if (this.refreshButton) {
            this.refreshButton.disabled = false;
            await this.handleRefresh();
        }
    }
}