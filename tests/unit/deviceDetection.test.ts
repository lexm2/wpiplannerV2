import { describe, it, expect, vi, afterEach } from 'vitest';
import { DeviceDetection } from '../../src/utils/deviceDetection';

const UA = {
  iPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  iPad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  desktop:
    'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
};

const isPhone = (ua: string): boolean => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  return DeviceDetection.isMobilePhone();
};

describe('DeviceDetection.isMobilePhone', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counts iPhones and Android phones as phones', () => {
    expect(isPhone(UA.iPhone)).toBe(true);
    // The tablet check's lookahead used to pass on every Android UA.
    expect(isPhone(UA.androidPhone)).toBe(true);
  });

  it('does not count tablets or desktops', () => {
    expect(isPhone(UA.androidTablet)).toBe(false);
    expect(isPhone(UA.iPad)).toBe(false);
    expect(isPhone(UA.desktop)).toBe(false);
  });
});
