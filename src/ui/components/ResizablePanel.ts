import styles from '../../styles/components/resize-handle.module.css';

export interface ResizablePanelConfig {
  handleSelector: string;
  targetProperty: string;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  direction: 'left' | 'right';
}

export interface ResizablePanelOptions {
  panels: ResizablePanelConfig[];
  onResize?: (targetProperty: string, width: number) => void;
}

export class ResizablePanel {
  private options: ResizablePanelOptions;
  private activeHandle: HTMLElement | null = null;
  private activeConfig: ResizablePanelConfig | null = null;
  private startX: number = 0;
  private startWidth: number = 0;
  private resizeDebounceTimeout: number | null = null;

  private boundDocumentMouseMove: (e: MouseEvent) => void;
  private boundDocumentMouseUp: () => void;
  private boundDocumentTouchMove: (e: TouchEvent) => void;
  private boundDocumentTouchEnd: () => void;
  private boundWindowResize: () => void;

  constructor(options: ResizablePanelOptions) {
    this.options = options;

    this.boundDocumentMouseMove = this.onDocumentMouseMove.bind(this);
    this.boundDocumentMouseUp = this.onDocumentMouseUp.bind(this);
    this.boundDocumentTouchMove = this.onDocumentTouchMove.bind(this);
    this.boundDocumentTouchEnd = this.onDocumentTouchEnd.bind(this);
    this.boundWindowResize = this.onWindowResize.bind(this);

    this.initialize();
  }

  private initialize(): void {
    this.options.panels.forEach((config) => {
      const userPreference = this.loadUserPreference(config);
      const initialWidth = userPreference !== null
        ? userPreference
        : this.calculateResponsiveDefault(config);

      this.setWidth(config, initialWidth);

      const handle = document.querySelector(
        config.handleSelector
      ) as HTMLElement;
      if (handle) {
        handle.addEventListener('mousedown', (e) => this.onMouseDown(e, config));
        handle.addEventListener(
          'touchstart',
          (e) => this.onTouchStart(e, config),
          { passive: false }
        );
      }
    });

    document.addEventListener('mousemove', this.boundDocumentMouseMove);
    document.addEventListener('mouseup', this.boundDocumentMouseUp);
    document.addEventListener('touchmove', this.boundDocumentTouchMove, {
      passive: false,
    });
    document.addEventListener('touchend', this.boundDocumentTouchEnd);
    window.addEventListener('resize', this.boundWindowResize);
  }

  private onMouseDown(e: MouseEvent, config: ResizablePanelConfig): void {
    e.preventDefault();
    this.startDrag(e.clientX, config, e.target as HTMLElement);
  }

  private onTouchStart(e: TouchEvent, config: ResizablePanelConfig): void {
    e.preventDefault();
    const touch = e.touches[0];
    this.startDrag(touch.clientX, config, e.target as HTMLElement);
  }

  private startDrag(
    clientX: number,
    config: ResizablePanelConfig,
    handle: HTMLElement
  ): void {
    this.activeHandle = handle;
    this.activeConfig = config;
    this.startX = clientX;
    this.startWidth = this.getCurrentWidth(config);

    handle.classList.add(styles.dragging);
    document.body.classList.add(styles.resizing);
  }

  private onDocumentMouseMove(e: MouseEvent): void {
    if (!this.activeConfig) return;
    this.updateWidth(e.clientX);
  }

  private onDocumentTouchMove(e: TouchEvent): void {
    if (!this.activeConfig) return;
    e.preventDefault();
    const touch = e.touches[0];
    this.updateWidth(touch.clientX);
  }

  private updateWidth(clientX: number): void {
    if (!this.activeConfig) return;

    const delta = clientX - this.startX;
    const multiplier = this.activeConfig.direction === 'left' ? 1 : -1;
    const newWidth = this.startWidth + delta * multiplier;

    const clampedWidth = Math.max(
      this.activeConfig.minWidth,
      Math.min(this.activeConfig.maxWidth, newWidth)
    );

    this.setWidth(this.activeConfig, clampedWidth);

    if (this.options.onResize) {
      this.options.onResize(this.activeConfig.targetProperty, clampedWidth);
    }
  }

  private onDocumentMouseUp(): void {
    this.endDrag();
  }

  private onDocumentTouchEnd(): void {
    this.endDrag();
  }

  private endDrag(): void {
    if (this.activeHandle) {
      this.activeHandle.classList.remove(styles.dragging);
    }
    document.body.classList.remove(styles.resizing);

    if (this.activeConfig) {
      const currentWidth = this.getCurrentWidth(this.activeConfig);
      this.saveUserPreference(this.activeConfig, currentWidth);
    }

    this.activeHandle = null;
    this.activeConfig = null;
  }

  private getCurrentWidth(config: ResizablePanelConfig): number {
    const value = getComputedStyle(document.documentElement).getPropertyValue(
      config.targetProperty
    );
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? config.defaultWidth : parsed;
  }

  private setWidth(config: ResizablePanelConfig, width: number): void {
    document.documentElement.style.setProperty(
      config.targetProperty,
      `${width}px`
    );
  }

  private calculateResponsiveDefault(config: ResizablePanelConfig): number {
    const viewportWidth = window.innerWidth;

    if (viewportWidth <= 1200) {
      return config.defaultWidth;
    }

    const calculatedWidth = viewportWidth * 0.25;
    return Math.max(config.minWidth, Math.min(config.maxWidth, calculatedWidth));
  }

  private loadUserPreference(config: ResizablePanelConfig): number | null {
    const stored = localStorage.getItem(`panel-width-${config.targetProperty}`);
    if (stored) {
      const width = parseInt(stored, 10);
      if (!isNaN(width)) {
        return Math.max(config.minWidth, Math.min(config.maxWidth, width));
      }
    }
    return null;
  }

  private saveUserPreference(config: ResizablePanelConfig, width: number): void {
    localStorage.setItem(`panel-width-${config.targetProperty}`, width.toString());
  }

  private onWindowResize(): void {
    if (this.resizeDebounceTimeout !== null) {
      clearTimeout(this.resizeDebounceTimeout);
    }

    this.resizeDebounceTimeout = window.setTimeout(() => {
      this.options.panels.forEach((config) => {
        const userPreference = this.loadUserPreference(config);
        if (userPreference === null) {
          const responsiveWidth = this.calculateResponsiveDefault(config);
          this.setWidth(config, responsiveWidth);
        }
      });
      this.resizeDebounceTimeout = null;
    }, 300);
  }

  public resetWidths(): void {
    this.options.panels.forEach((config) => {
      localStorage.removeItem(`panel-width-${config.targetProperty}`);
      const responsiveWidth = this.calculateResponsiveDefault(config);
      this.setWidth(config, responsiveWidth);
    });
  }

  public destroy(): void {
    if (this.resizeDebounceTimeout !== null) {
      clearTimeout(this.resizeDebounceTimeout);
    }

    document.removeEventListener('mousemove', this.boundDocumentMouseMove);
    document.removeEventListener('mouseup', this.boundDocumentMouseUp);
    document.removeEventListener('touchmove', this.boundDocumentTouchMove);
    document.removeEventListener('touchend', this.boundDocumentTouchEnd);
    window.removeEventListener('resize', this.boundWindowResize);
  }
}
