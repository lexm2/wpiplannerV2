export class DeviceDetection {
  static isMobilePhone(): boolean {
    const ua = navigator.userAgent;

    if (/iPad|Android.*(?!Mobile)|Tablet|PlayBook|Silk|Kindle/i.test(ua)) {
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
