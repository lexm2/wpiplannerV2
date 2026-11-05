/**
 * The schedule search as a function the API can run in either place: in
 * this thread (tests, and the callers that have no worker) or in a worker
 * (scheduleSearchPool.ts), so a long search never holds up the requests
 * behind it.
 */
import {
  SmartScheduler,
  type SchedulerInput,
} from '../services/scheduling/SmartScheduler';
import type { ScheduleResult } from '../services/scheduling/AutoScheduler';

export interface SearchRequest {
  input: SchedulerInput;
  /** Schedules to collect before the best are picked. */
  cap: number;
  /** Longest the search itself runs, counted from when it starts. */
  budgetMs: number;
}

export interface SearchResponse {
  schedules: ScheduleResult[][];
  cutShort: boolean;
}

export type ScheduleSearch = (
  request: SearchRequest,
) => Promise<SearchResponse>;

/** The search itself; the worker calls this too. */
export function runSearch({
  input,
  cap,
  budgetMs,
}: SearchRequest): SearchResponse {
  return SmartScheduler.findSchedulesBefore(
    input,
    cap,
    performance.now() + budgetMs,
  );
}

export const searchInThisThread: ScheduleSearch = request =>
  Promise.resolve(runSearch(request));
