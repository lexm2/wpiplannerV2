/** Worker side of scheduleSearchPool.ts: one search per message. */
import { runSearch, type SearchRequest } from './scheduleSearch';

interface Job {
  id: number;
  request: SearchRequest;
}

self.onmessage = (event: MessageEvent<Job>) => {
  const { id, request } = event.data;
  try {
    self.postMessage({ id, ok: true, response: runSearch(request) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: (error as Error).message });
  }
};
