export class TimestampManager {
    constructor() {}

    updateClientTimestamp(): void {
        const clientTimestampElement = document.getElementById('client-timestamp');
        if (clientTimestampElement) {
            const now = new Date();
            const options: Intl.DateTimeFormatOptions = {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            };
            const formattedTime = now.toLocaleDateString('en-US', options).replace(',', ' at');
            clientTimestampElement.textContent = `Client loaded: ${formattedTime}`;
        }
    }

    async loadServerTimestamp(): Promise<void> {
        const serverTimestampElement = document.getElementById('server-timestamp');
        if (!serverTimestampElement) return;

        try {
            const response = await fetch('./last-updated.json', {
                cache: 'no-cache'
            });
            
            if (response.ok) {
                const timestampData = await response.json();
                const serverDate = new Date(timestampData.timestamp);
                const options: Intl.DateTimeFormatOptions = {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                };
                const formattedTime = serverDate.toLocaleDateString('en-US', options).replace(',', ' at');
                serverTimestampElement.textContent = `Server updated: ${formattedTime}`;
            } else {
                throw new Error(`Failed to fetch server timestamp: ${response.status}`);
            }
        } catch (error) {
            console.warn('Failed to load server timestamp:', error);
            serverTimestampElement.textContent = 'Server timestamp unavailable';
        }
    }
}