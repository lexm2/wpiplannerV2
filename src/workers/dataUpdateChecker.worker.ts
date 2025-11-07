interface UpdateCheckMessage {
  type: 'start' | 'stop' | 'check-now';
  lastLoadedTimestamp?: string;
}

interface UpdateResponseMessage {
  type: 'update-available' | 'no-update' | 'error';
  serverTimestamp?: string;
  error?: string;
}

let checkInterval: number | null = null;
let lastLoadedTimestamp: string | null = null;
let isPageVisible = true;
const CHECK_INTERVAL_MS = 60000; // 1 minute

self.addEventListener('message', (event: MessageEvent<UpdateCheckMessage>) => {
  const { type, lastLoadedTimestamp: timestamp } = event.data;

  switch (type) {
    case 'start':
      if (timestamp) {
        lastLoadedTimestamp = timestamp;
      }
      startChecking();
      break;
    case 'stop':
      stopChecking();
      break;
    case 'check-now':
      checkForUpdates();
      break;
  }
});

function startChecking(): void {
  if (checkInterval !== null) {
    return;
  }

  checkForUpdates();
  checkInterval = self.setInterval(() => {
    if (isPageVisible) {
      checkForUpdates();
    }
  }, CHECK_INTERVAL_MS);
}

function stopChecking(): void {
  if (checkInterval !== null) {
    self.clearInterval(checkInterval);
    checkInterval = null;
  }
}

async function checkForUpdates(): Promise<void> {
  try {
    const response = await fetch('/wpiplannerV2/last-updated.json', {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json() as { timestamp: string; utc: string };
    const serverTimestamp = data.timestamp;

    if (!lastLoadedTimestamp) {
      lastLoadedTimestamp = serverTimestamp;
      return;
    }

    if (serverTimestamp > lastLoadedTimestamp) {
      const message: UpdateResponseMessage = {
        type: 'update-available',
        serverTimestamp,
      };
      self.postMessage(message);
    }
  } catch (error) {
    const message: UpdateResponseMessage = {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    self.postMessage(message);
  }
}

self.addEventListener('message', (event: MessageEvent) => {
  if (event.data.type === 'visibility-change') {
    isPageVisible = event.data.isVisible;
  }
});
