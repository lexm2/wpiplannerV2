import LZString from 'lz-string';
import { WorkerRequest, WorkerResponse, WorkerTaskType } from './protocol';
import { setReplacer } from '../utils/jsonSerializer';

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;
  const typedPayload = payload as { data?: unknown; compressed?: string };

  try {
    let result: string | null;

    switch (type) {
      case WorkerTaskType.COMPRESS_DATA: {
        const serialized = JSON.stringify(typedPayload.data, setReplacer);
        result = LZString.compress(serialized);
        break;
      }

      case WorkerTaskType.DECOMPRESS_DATA: {
        result = LZString.decompress(typedPayload.compressed!);
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
