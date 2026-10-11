import { afterEach, describe, expect, it, vi } from 'vitest';
import { triggerFileDownload } from '../../src/utils/download';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('triggerFileDownload', () => {
  it('revokes the object URL only after the click has had time to start', () => {
    vi.useFakeTimers();
    // jsdom has no object URLs; stand them in.
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = revoke;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    triggerFileDownload('data', 'file.ics', 'text/calendar');

    expect(click).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
