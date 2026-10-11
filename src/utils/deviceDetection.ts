export class DeviceDetection {
  static isMobilePhone(): boolean {
    const ua = navigator.userAgent;

    // Android tablets are the Android UAs without "Mobile"; the lookahead has to
    // span the rest of the string, or it passes on every Android phone too.
    if (/iPad|Android(?!.*Mobile)|Tablet|PlayBook|Silk|Kindle/i.test(ua)) {
      return false;
    }

    return /Android.*Mobile|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      ua,
    );
  }

  static initialize(): void {
    if (this.isMobilePhone()) {
      document.documentElement.classList.add('is-mobile');
    }
  }
}
