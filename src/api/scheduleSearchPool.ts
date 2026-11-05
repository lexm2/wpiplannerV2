/**
 * Runs schedule searches in Bun workers. A search takes up to its whole
 * budget of CPU, and on the server's one thread that would stall every
 * other request (health checks included) for as long. The app does the same
 * in the browser's own worker. A few workers run at once and the rest wait
 * their turn in a bounded queue, so a burst of callers cannot take every
 * core, and what does not fit is refused rather than left to pile up.
 */
import { ApiError } from './errors';
import type {
  ScheduleSearch,
  SearchRequest,
  SearchResponse,
} from './scheduleSearch';

interface Pending {
  request: SearchRequest;
  resolve: (response: SearchResponse) => void;
  reject: (error: Error) => void;
}

type Reply =
  | { id: number; ok: true; response: SearchResponse }
  | { id: number; ok: false; error: string };

interface Slot {
  worker: Worker;
  current: (Pending & { id: number }) | null;
}

export function createSearchPool(options: {
  /** Searches that run at once. */
  workers: number;
  /** Searches that wait for a free worker; more are refused. */
  maxQueue: number;
}): ScheduleSearch & { close: () => void } {
  const slots: Slot[] = [];
  const queue: Pending[] = [];
  let nextId = 1;

  function spawn(): Slot {
    const slot: Slot = {
      worker: new Worker(
        new URL('./scheduleSearch.worker.ts', import.meta.url),
      ),
      current: null,
    };
    slot.worker.onmessage = (event: MessageEvent<Reply>) => {
      const job = slot.current;
      slot.current = null;
      if (job?.id === event.data.id) {
        if (event.data.ok) job.resolve(event.data.response);
        else job.reject(new Error(event.data.error));
      }
      drain();
    };
    // A crashed worker fails its search and is replaced on the next one.
    slot.worker.onerror = event => {
      const job = slot.current;
      slot.current = null;
      job?.reject(new Error(event.message));
      slot.worker.terminate();
      slots.splice(slots.indexOf(slot), 1);
      drain();
    };
    slots.push(slot);
    return slot;
  }

  function drain(): void {
    while (queue.length) {
      const slot =
        slots.find(s => !s.current) ??
        (slots.length < options.workers ? spawn() : null);
      if (!slot) return;
      const job = queue.shift()!;
      const id = nextId++;
      slot.current = { ...job, id };
      slot.worker.postMessage({ id, request: job.request });
    }
  }

  const search: ScheduleSearch = request =>
    new Promise((resolve, reject) => {
      const busy =
        slots.every(s => s.current) && slots.length >= options.workers;
      if (busy && queue.length >= options.maxQueue) {
        reject(
          new ApiError(
            'Too many schedule searches are running; try again in a few seconds.',
            503,
          ),
        );
        return;
      }
      queue.push({ request, resolve, reject });
      drain();
    });

  return Object.assign(search, {
    close: () => {
      for (const { worker } of slots) worker.terminate();
      slots.length = 0;
    },
  });
}
