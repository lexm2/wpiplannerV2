export enum WorkerTaskType {
  COMPRESS_DATA = 'compress_data',
  DECOMPRESS_DATA = 'decompress_data',
}

export interface WorkerRequest {
  id: string;
  type: WorkerTaskType;
  payload: any;
  timestamp: number;
}

export interface WorkerResponse {
  id: string;
  type: WorkerTaskType;
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
}
