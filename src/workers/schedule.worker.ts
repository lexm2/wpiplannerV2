import type { WorkerRequest, WorkerResponse } from './protocol';
import {
  SmartScheduler,
  type SchedulerInput,
} from '../services/scheduling/SmartScheduler';
import { ScheduleScorer } from '../services/scheduling/ScheduleScorer';
import type { AutoScheduleSettings } from '../types/schedule';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;
  const { input, settings, maxResults } = payload as {
    input: SchedulerInput;
    settings: AutoScheduleSettings;
    maxResults: number;
  };

  try {
    const schedules = SmartScheduler.findSchedules(input, maxResults);
    const scorer = new ScheduleScorer();
    const effectiveSettings = settings ?? { blockedTimes: [] };
    schedules.sort(
      (a, b) =>
        scorer.score(b, effectiveSettings) - scorer.score(a, effectiveSettings),
    );

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
