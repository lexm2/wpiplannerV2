import LZString from 'lz-string';
import { WorkerRequest, WorkerResponse, WorkerTaskType } from './protocol';

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;
  const startTime = performance.now();

  try {
    let result: any;

    switch (type) {
      case WorkerTaskType.COMPRESS_DATA: {
        const serialized = JSON.stringify(payload.data);
        result = LZString.compress(serialized);
        break;
      }

      case WorkerTaskType.DECOMPRESS_DATA: {
        result = LZString.decompress(payload.compressed);
        break;
      }

      default:
        throw new Error(`Unknown task type: ${type}`);
    }

    const response: WorkerResponse = {
      id,
      type,
      success: true,
      data: result,
      duration: performance.now() - startTime
    };

    self.postMessage(response);

  } catch (error) {
    const response: WorkerResponse = {
      id,
      type,
      success: false,
      error: (error as Error).message
    };

    self.postMessage(response);
  }
};
