export interface DualRangeSliderOptions {
    min: number;
    max: number;
    step: number;
    minValue: number;
    maxValue: number;
    leftLabel?: string;
    rightLabel?: string;
    onChange?: (minValue: number, maxValue: number) => void;
}

export class DualRangeSlider {
    private container: HTMLElement;
    private track: HTMLElement;
    private rangeBar: HTMLElement;
    private leftThumb: HTMLElement;
    private rightThumb: HTMLElement;
    private leftTooltip: HTMLElement;
    private rightTooltip: HTMLElement;

    private options: DualRangeSliderOptions;
    private isDraggingLeft = false;
    private isDraggingRight = false;

    private currentMinValue: number;
    private currentMaxValue: number;

    constructor(options: DualRangeSliderOptions) {
        this.options = options;
        this.currentMinValue = options.minValue;
        this.currentMaxValue = options.maxValue;

        this.container = this.createContainer();
        this.track = this.createTrack();
        this.rangeBar = this.createRangeBar();
        this.leftThumb = this.createThumb('left');
        this.rightThumb = this.createThumb('right');
        this.leftTooltip = this.createTooltip('left');
        this.rightTooltip = this.createTooltip('right');

        this.assembleComponent();
        this.attachEventListeners();
        this.updateUI();
    }

    private createContainer(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'dual-range-slider';
        return container;
    }

    private createTrack(): HTMLElement {
        const track = document.createElement('div');
        track.className = 'dual-range-track';
        return track;
    }

    private createRangeBar(): HTMLElement {
        const bar = document.createElement('div');
        bar.className = 'dual-range-bar';
        return bar;
    }

    private createThumb(side: 'left' | 'right'): HTMLElement {
        const thumb = document.createElement('div');
        thumb.className = `dual-range-thumb dual-range-thumb-${side}`;
        thumb.setAttribute('role', 'slider');
        thumb.setAttribute('tabindex', '0');
        thumb.setAttribute('aria-valuemin', this.options.min.toString());
        thumb.setAttribute('aria-valuemax', this.options.max.toString());
        thumb.setAttribute('aria-valuenow', side === 'left' ? this.currentMinValue.toString() : this.currentMaxValue.toString());
        if (side === 'left' && this.options.leftLabel) {
            thumb.setAttribute('aria-label', this.options.leftLabel);
        } else if (side === 'right' && this.options.rightLabel) {
            thumb.setAttribute('aria-label', this.options.rightLabel);
        }
        return thumb;
    }

    private createTooltip(side: 'left' | 'right'): HTMLElement {
        const tooltip = document.createElement('div');
        tooltip.className = `dual-range-tooltip dual-range-tooltip-${side}`;
        tooltip.style.display = 'none';
        return tooltip;
    }

    private assembleComponent(): void {
        this.container.appendChild(this.track);
        this.container.appendChild(this.rangeBar);
        this.container.appendChild(this.leftThumb);
        this.container.appendChild(this.rightThumb);
        this.container.appendChild(this.leftTooltip);
        this.container.appendChild(this.rightTooltip);
    }

    private attachEventListeners(): void {
        this.leftThumb.addEventListener('mousedown', (e) => this.onThumbMouseDown(e, 'left'));
        this.rightThumb.addEventListener('mousedown', (e) => this.onThumbMouseDown(e, 'right'));

        this.leftThumb.addEventListener('touchstart', (e) => this.onThumbTouchStart(e, 'left'), { passive: false });
        this.rightThumb.addEventListener('touchstart', (e) => this.onThumbTouchStart(e, 'right'), { passive: false });

        this.leftThumb.addEventListener('keydown', (e) => this.onThumbKeyDown(e, 'left'));
        this.rightThumb.addEventListener('keydown', (e) => this.onThumbKeyDown(e, 'right'));

        this.leftThumb.addEventListener('mouseenter', () => this.showTooltip('left'));
        this.leftThumb.addEventListener('mouseleave', () => this.hideTooltip('left'));
        this.rightThumb.addEventListener('mouseenter', () => this.showTooltip('right'));
        this.rightThumb.addEventListener('mouseleave', () => this.hideTooltip('right'));

        document.addEventListener('mousemove', (e) => this.onDocumentMouseMove(e));
        document.addEventListener('mouseup', () => this.onDocumentMouseUp());
        document.addEventListener('touchmove', (e) => this.onDocumentTouchMove(e), { passive: false });
        document.addEventListener('touchend', () => this.onDocumentTouchEnd());
    }

    private onThumbMouseDown(e: MouseEvent, side: 'left' | 'right'): void {
        e.preventDefault();
        if (side === 'left') {
            this.isDraggingLeft = true;
            this.showTooltip('left');
        } else {
            this.isDraggingRight = true;
            this.showTooltip('right');
        }
    }

    private onThumbTouchStart(e: TouchEvent, side: 'left' | 'right'): void {
        e.preventDefault();
        if (side === 'left') {
            this.isDraggingLeft = true;
            this.showTooltip('left');
        } else {
            this.isDraggingRight = true;
            this.showTooltip('right');
        }
    }

    private onDocumentMouseMove(e: MouseEvent): void {
        if (!this.isDraggingLeft && !this.isDraggingRight) return;

        const rect = this.track.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        if (this.isDraggingLeft) {
            this.updateMinValue(percentage);
        } else if (this.isDraggingRight) {
            this.updateMaxValue(percentage);
        }
    }

    private onDocumentTouchMove(e: TouchEvent): void {
        if (!this.isDraggingLeft && !this.isDraggingRight) return;
        e.preventDefault();

        const touch = e.touches[0];
        const rect = this.track.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));

        if (this.isDraggingLeft) {
            this.updateMinValue(percentage);
        } else if (this.isDraggingRight) {
            this.updateMaxValue(percentage);
        }
    }

    private onDocumentMouseUp(): void {
        if (this.isDraggingLeft) {
            this.hideTooltip('left');
        }
        if (this.isDraggingRight) {
            this.hideTooltip('right');
        }
        this.isDraggingLeft = false;
        this.isDraggingRight = false;
    }

    private onDocumentTouchEnd(): void {
        if (this.isDraggingLeft) {
            this.hideTooltip('left');
        }
        if (this.isDraggingRight) {
            this.hideTooltip('right');
        }
        this.isDraggingLeft = false;
        this.isDraggingRight = false;
    }

    private onThumbKeyDown(e: KeyboardEvent, side: 'left' | 'right'): void {
        const currentValue = side === 'left' ? this.currentMinValue : this.currentMaxValue;
        let newValue = currentValue;

        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowDown':
                e.preventDefault();
                newValue = Math.max(this.options.min, currentValue - this.options.step);
                break;
            case 'ArrowRight':
            case 'ArrowUp':
                e.preventDefault();
                newValue = Math.min(this.options.max, currentValue + this.options.step);
                break;
            case 'Home':
                e.preventDefault();
                newValue = this.options.min;
                break;
            case 'End':
                e.preventDefault();
                newValue = this.options.max;
                break;
            default:
                return;
        }

        const range = this.options.max - this.options.min;
        const percentage = (newValue - this.options.min) / range;

        if (side === 'left') {
            this.updateMinValue(percentage);
        } else {
            this.updateMaxValue(percentage);
        }
    }

    private updateMinValue(percentage: number): void {
        const range = this.options.max - this.options.min;
        let newValue = this.options.min + (percentage * range);
        newValue = this.roundToStep(newValue);
        newValue = Math.max(this.options.min, Math.min(this.currentMaxValue, newValue));

        if (newValue !== this.currentMinValue) {
            this.currentMinValue = newValue;
            this.updateUI();
            this.notifyChange();
        }
    }

    private updateMaxValue(percentage: number): void {
        const range = this.options.max - this.options.min;
        let newValue = this.options.min + (percentage * range);
        newValue = this.roundToStep(newValue);
        newValue = Math.max(this.currentMinValue, Math.min(this.options.max, newValue));

        if (newValue !== this.currentMaxValue) {
            this.currentMaxValue = newValue;
            this.updateUI();
            this.notifyChange();
        }
    }

    private roundToStep(value: number): number {
        return Math.round(value / this.options.step) * this.options.step;
    }

    private updateUI(): void {
        const range = this.options.max - this.options.min;
        const minPercentage = ((this.currentMinValue - this.options.min) / range) * 100;
        const maxPercentage = ((this.currentMaxValue - this.options.min) / range) * 100;

        this.leftThumb.style.left = `${minPercentage}%`;
        this.rightThumb.style.left = `${maxPercentage}%`;

        this.rangeBar.style.left = `${minPercentage}%`;
        this.rangeBar.style.width = `${maxPercentage - minPercentage}%`;

        this.leftTooltip.textContent = this.currentMinValue.toFixed(1);
        this.rightTooltip.textContent = this.currentMaxValue.toFixed(1);
        this.leftTooltip.style.left = `${minPercentage}%`;
        this.rightTooltip.style.left = `${maxPercentage}%`;

        this.leftThumb.setAttribute('aria-valuenow', this.currentMinValue.toString());
        this.rightThumb.setAttribute('aria-valuenow', this.currentMaxValue.toString());
    }

    private showTooltip(side: 'left' | 'right'): void {
        const tooltip = side === 'left' ? this.leftTooltip : this.rightTooltip;
        tooltip.style.display = 'block';
    }

    private hideTooltip(side: 'left' | 'right'): void {
        if ((side === 'left' && this.isDraggingLeft) || (side === 'right' && this.isDraggingRight)) {
            return;
        }
        const tooltip = side === 'left' ? this.leftTooltip : this.rightTooltip;
        tooltip.style.display = 'none';
    }

    private notifyChange(): void {
        if (this.options.onChange) {
            this.options.onChange(this.currentMinValue, this.currentMaxValue);
        }
    }

    public getElement(): HTMLElement {
        return this.container;
    }

    public getMinValue(): number {
        return this.currentMinValue;
    }

    public getMaxValue(): number {
        return this.currentMaxValue;
    }

    public setMinValue(value: number): void {
        value = this.roundToStep(value);
        value = Math.max(this.options.min, Math.min(this.currentMaxValue, value));
        if (value !== this.currentMinValue) {
            this.currentMinValue = value;
            this.updateUI();
        }
    }

    public setMaxValue(value: number): void {
        value = this.roundToStep(value);
        value = Math.max(this.currentMinValue, Math.min(this.options.max, value));
        if (value !== this.currentMaxValue) {
            this.currentMaxValue = value;
            this.updateUI();
        }
    }

    public destroy(): void {
        this.container.remove();
    }
}
