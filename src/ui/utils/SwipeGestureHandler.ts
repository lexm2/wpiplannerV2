export class SwipeGestureHandler {
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchEndX: number = 0;
  private touchEndY: number = 0;
  private minSwipeDistance: number = 50;
  private maxVerticalDeviation: number = 100;

  constructor(
    private element: HTMLElement,
    private onSwipeLeft: () => void,
    private onSwipeRight: () => void,
    private ignoreWhenMenuOpen: boolean = true
  ) {
    this.setupListeners();
  }

  private setupListeners(): void {
    this.element.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
    this.element.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });
  }

  private handleTouchStart(e: TouchEvent): void {
    if (this.ignoreWhenMenuOpen && this.isSidebarOpen()) return;

    if (this.shouldIgnoreTouch(e.target as HTMLElement)) return;

    this.touchStartX = e.changedTouches[0].screenX;
    this.touchStartY = e.changedTouches[0].screenY;
  }

  private isSidebarOpen(): boolean {
    const sidebar = document.querySelector('.sidebar.mobile-open');
    const rightPanel = document.querySelector('.right-panel.mobile-open');
    const scheduleSidebar = document.querySelector('.schedule-sidebar.mobile-open');
    return !!(sidebar || rightPanel || scheduleSidebar);
  }

  private handleTouchEnd(e: TouchEvent): void {
    this.touchEndX = e.changedTouches[0].screenX;
    this.touchEndY = e.changedTouches[0].screenY;
    this.detectSwipe();
  }

  private detectSwipe(): void {
    const deltaX = this.touchEndX - this.touchStartX;
    const deltaY = Math.abs(this.touchEndY - this.touchStartY);

    if (Math.abs(deltaX) < this.minSwipeDistance) return;
    if (deltaY > this.maxVerticalDeviation) return;

    if (deltaX > 0) {
      this.onSwipeRight();
    } else {
      this.onSwipeLeft();
    }
  }

  private shouldIgnoreTouch(target: HTMLElement): boolean {
    const ignoredSelectors = [
      '.resize-handle',
      '.dual-range-slider',
      'button',
      'input',
      'select',
      'textarea',
      'a'
    ];

    if (this.ignoreWhenMenuOpen) {
      ignoredSelectors.push('.sidebar', '.right-panel', '.schedule-sidebar');
    }

    return ignoredSelectors.some(selector =>
      target.closest(selector) !== null
    );
  }
}
