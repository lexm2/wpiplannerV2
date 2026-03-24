export enum WorkerTaskType {
  COMPRESS_DATA = 'compress_data',
  DECOMPRESS_DATA = 'decompress_data',
  GENERATE_SCHEDULES = 'generate_schedules',
}

export interface WorkerRequest {
  id: string;
  type: WorkerTaskType;
  payload: unknown;
  timestamp: number;
}

export interface WorkerResponse {
  id: string;
  type: WorkerTaskType;
  success: boolean;
  data?: unknown;
  error?: string;
}
