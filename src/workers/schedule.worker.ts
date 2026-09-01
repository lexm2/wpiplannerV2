import type { WorkerRequest, WorkerResponse } from './protocol';
import {
  SmartScheduler,
  type SchedulerInput,
} from '../services/scheduling/SmartScheduler';
import { ScheduleScorer } from '../services/scheduling/ScheduleScorer';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;
  const { input, maxResults } = payload as {
    input: SchedulerInput;
    maxResults: number;
  };

  try {
    const schedules = SmartScheduler.findSchedules(input, maxResults);
    const scorer = new ScheduleScorer();
    schedules.sort((a, b) => scorer.score(b) - scorer.score(a));

    const response: WorkerResponse = {
      id,
      type,
      success: true,
      data: schedules,
    };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      type,
      success: false,
      error: (error as Error).message,
    };
    self.postMessage(response);
  }
};
