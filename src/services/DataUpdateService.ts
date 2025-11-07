interface UpdateCheckMessage {
  type: 'start' | 'stop' | 'check-now' | 'visibility-change';
  lastLoadedTimestamp?: string;
  isVisible?: boolean;
}

interface UpdateResponseMessage {
  type: 'update-available' | 'no-update' | 'error';
  serverTimestamp?: string;
  error?: string;
}

export class DataUpdateService {
  private worker: Worker | null = null;
  private lastLoadedTimestamp: string | null = null;
  private readonly STORAGE_KEY = 'lastLoadedTimestamp';

  constructor() {
    this.lastLoadedTimestamp = this.loadLastTimestamp();
    this.setupVisibilityListener();
  }

  start(): void {
    if (this.worker) {
      return;
    }

    this.worker = new Worker(
      new URL('../workers/dataUpdateChecker.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.addEventListener('message', this.handleWorkerMessage.bind(this));
    this.worker.addEventListener('error', this.handleWorkerError.bind(this));

    const message: UpdateCheckMessage = {
      type: 'start',
      lastLoadedTimestamp: this.lastLoadedTimestamp || undefined,
    };
    this.worker.postMessage(message);
  }

  stop(): void {
    if (this.worker) {
      const message: UpdateCheckMessage = { type: 'stop' };
      this.worker.postMessage(message);
      this.worker.terminate();
      this.worker = null;
    }
  }

  checkNow(): void {
    if (this.worker) {
      const message: UpdateCheckMessage = { type: 'check-now' };
      this.worker.postMessage(message);
    }
  }

  updateLastLoadedTimestamp(timestamp: string): void {
    this.lastLoadedTimestamp = timestamp;
    localStorage.setItem(this.STORAGE_KEY, timestamp);

    if (this.worker) {
      const message: UpdateCheckMessage = {
        type: 'start',
        lastLoadedTimestamp: timestamp,
      };
      this.worker.postMessage(message);
    }
  }

  private handleWorkerMessage(event: MessageEvent<UpdateResponseMessage>): void {
    const { type, serverTimestamp, error } = event.data;

    switch (type) {
      case 'update-available':
        if (serverTimestamp) {
          this.dispatchUpdateEvent(serverTimestamp);
        }
        break;
      case 'error':
        console.error('Data update check error:', error);
        break;
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    console.error('Worker error:', error);
  }

  private dispatchUpdateEvent(serverTimestamp: string): void {
    const event = new CustomEvent('data-update-available', {
      detail: { serverTimestamp },
    });
    window.dispatchEvent(event);
  }

  private setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      if (this.worker) {
        const message: UpdateCheckMessage = {
          type: 'visibility-change',
          isVisible: !document.hidden,
        };
        this.worker.postMessage(message);
      }
    });
  }

  private loadLastTimestamp(): string | null {
    return localStorage.getItem(this.STORAGE_KEY);
  }
}
