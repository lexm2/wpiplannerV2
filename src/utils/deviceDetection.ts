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

  /**
   * Sets html.is-mobile, the phone layout's class: on for a phone user agent
   * (a phone in landscape is wider than 560px) and for any window 560px wide
   * or less, which is where the CSS's own phone rules begin. A narrow desktop
   * window, a split-screen tablet or a phone in "desktop site" mode all get the
   * phone layout that way. Live, so resizing across 560px toggles it.
   */
  static initialize(): void {
    const root = document.documentElement;
    const phoneUserAgent = this.isMobilePhone();
    const narrow = window.matchMedia('(max-width: 560px)');
    const apply = (): void => {
      root.classList.toggle('is-mobile', phoneUserAgent || narrow.matches);
    };
    apply();
    narrow.addEventListener('change', apply);
  }
}
