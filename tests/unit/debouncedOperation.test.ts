/**
 * DebouncedOperation settles every promise it hands out: a call superseded by
 * a newer one, or dropped by cancel(), rejects with CancellationError.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DebouncedOperation,
  OperationManager,
} from '../../src/utils/RequestCancellation';

afterEach(() => {
  vi.useRealTimers();
});

describe('DebouncedOperation', () => {
  it('rejects a superseded call and runs only the latest', async () => {
    vi.useFakeTimers();
    const debounced = new DebouncedOperation(new OperationManager(), 'op', 300);
    const ran: string[] = [];

    const first = debounced.execute(() => {
      ran.push('first');
      return Promise.resolve('first');
    });
    const second = debounced.execute(() => {
      ran.push('second');
      return Promise.resolve('second');
    });

    await expect(first).rejects.toMatchObject({ name: 'CancellationError' });
    await vi.advanceTimersByTimeAsync(300);
    await expect(second).resolves.toBe('second');
    expect(ran).toEqual(['second']);
  });

  it('rejects a waiting call on cancel()', async () => {
    vi.useFakeTimers();
    const debounced = new DebouncedOperation(new OperationManager(), 'op', 300);
    const operation = vi.fn(() => Promise.resolve(1));

    const pending = debounced.execute(operation);
    debounced.cancel();

    await expect(pending).rejects.toMatchObject({ name: 'CancellationError' });
    await vi.advanceTimersByTimeAsync(300);
    expect(operation).not.toHaveBeenCalled();
  });

  it('leaves a call that already ran alone', async () => {
    vi.useFakeTimers();
    const debounced = new DebouncedOperation(new OperationManager(), 'op', 300);

    const done = debounced.execute(() => Promise.resolve('done'));
    await vi.advanceTimersByTimeAsync(300);
    await expect(done).resolves.toBe('done');

    const next = debounced.execute(() => Promise.resolve('next'));
    await vi.advanceTimersByTimeAsync(300);
    await expect(next).resolves.toBe('next');
  });
});
