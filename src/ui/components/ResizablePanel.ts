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

  private boundDocumentMouseMove: (e: MouseEvent) => void;
  private boundDocumentMouseUp: () => void;
  private boundDocumentTouchMove: (e: TouchEvent) => void;
  private boundDocumentTouchEnd: () => void;

  constructor(options: ResizablePanelOptions) {
    this.options = options;

    this.boundDocumentMouseMove = this.onDocumentMouseMove.bind(this);
    this.boundDocumentMouseUp = this.onDocumentMouseUp.bind(this);
    this.boundDocumentTouchMove = this.onDocumentTouchMove.bind(this);
    this.boundDocumentTouchEnd = this.onDocumentTouchEnd.bind(this);

    this.initialize();
  }

  private initialize(): void {
    this.options.panels.forEach((config) => {
      // Set initial width from config
      this.setWidth(config, config.defaultWidth);

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

  public resetWidths(): void {
    this.options.panels.forEach((config) => {
      this.setWidth(config, config.defaultWidth);
    });
  }

  public destroy(): void {
    document.removeEventListener('mousemove', this.boundDocumentMouseMove);
    document.removeEventListener('mouseup', this.boundDocumentMouseUp);
    document.removeEventListener('touchmove', this.boundDocumentTouchMove);
    document.removeEventListener('touchend', this.boundDocumentTouchEnd);
  }
}
