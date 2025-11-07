export interface DataUpdateAvailableEvent extends CustomEvent {
  detail: {
    serverTimestamp: string;
  };
}

declare global {
  interface WindowEventMap {
    'data-update-available': DataUpdateAvailableEvent;
  }
}
