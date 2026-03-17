import type { TutorialService } from '../../services/tutorial/TutorialService';
import type { TutorialStep } from '../../types/tutorial';
import styles from '../../styles/components/floating-text-box.module.css';

export class FloatingTextBox {
    private el: HTMLElement;
    private stepTitleEl: HTMLElement;
    private stepDescEl: HTMLElement;
    private stepCounterEl: HTMLElement;
    private nextBtn: HTMLButtonElement;
    private nextBtnLabel: HTMLSpanElement;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private isDragging = false;
    private currentStep: TutorialStep | null = null;

    private boundMouseMove = this.onMouseMove.bind(this);
    private boundMouseUp = this.onMouseUp.bind(this);

    constructor(private tutorialService: TutorialService) {
        this.el = this.createElement();
        this.stepTitleEl = this.el.querySelector(`.${styles.stepTitle}`) as HTMLElement;
        this.stepDescEl = this.el.querySelector(`.${styles.stepDescription}`) as HTMLElement;
        this.stepCounterEl = this.el.querySelector(`.${styles.stepCounter}`) as HTMLElement;
        this.nextBtn = this.el.querySelector(`.${styles.nextBtn}`) as HTMLButtonElement;
        this.nextBtnLabel = this.nextBtn.querySelector('span') as HTMLSpanElement;

        this.tutorialService.onStepChange((step, index, total) => this.onStepChange(step, index, total));
    }

    mount(): void {
        document.body.appendChild(this.el);
    }

    private onStepChange(step: TutorialStep | null, index: number, total: number): void {
        if (!step) {
            this.el.classList.add(styles.hidden);
            this.currentStep = null;
            return;
        }
        this.currentStep = step;
        this.el.classList.remove(styles.hidden);
        this.stepTitleEl.textContent = step.title;
        this.stepDescEl.textContent = step.description;
        this.stepCounterEl.textContent = `Step ${index + 1} of ${total}`;
        this.nextBtnLabel.textContent = index + 1 === total ? 'Next Tutorial' : 'Next';
        requestAnimationFrame(() => {
            this.repositionIfObstructed(step.selector);
            this.clampToViewport();
        });
    }

    private createElement(): HTMLElement {
        const el = document.createElement('div');
        el.className = `${styles.container} ${styles.hidden}`;
        el.innerHTML = `
            <div class="${styles.header}">
                <span class="${styles.title}">Tutorial</span>
                <button class="${styles.skipBtn}">Skip tutorial</button>
            </div>
            <div class="${styles.body}">
                <div class="${styles.stepTitle}"></div>
                <div class="${styles.stepDescription}"></div>
            </div>
            <div class="${styles.footer}">
                <span class="${styles.stepCounter}"></span>
                <button class="${styles.nextBtn}" data-tutorial-next><span>Next</span></button>
            </div>
        `;

        const header = el.querySelector(`.${styles.header}`) as HTMLElement;
        header.addEventListener('mousedown', this.onDragStart.bind(this));

        const skipBtn = el.querySelector(`.${styles.skipBtn}`) as HTMLButtonElement;
        skipBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        skipBtn.addEventListener('click', () => this.tutorialService.skip());

        const nextBtn = el.querySelector(`.${styles.nextBtn}`) as HTMLButtonElement;
        nextBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        nextBtn.addEventListener('click', () => {
            this.tutorialService.disarmCurrentListener();
            this.currentStep?.action?.();
            this.tutorialService.nextStep();
        });

        return el;
    }

    private onDragStart(e: MouseEvent): void {
        e.preventDefault();
        const rect = this.el.getBoundingClientRect();
        this.el.style.transition = 'none';
        this.el.style.top = `${rect.top}px`;
        this.el.style.bottom = 'auto';
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;
        this.isDragging = true;
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.isDragging) return;
        const x = Math.max(0, Math.min(window.innerWidth - this.el.offsetWidth, e.clientX - this.dragOffsetX));
        const y = Math.max(0, Math.min(window.innerHeight - this.el.offsetHeight, e.clientY - this.dragOffsetY));
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
    }

    private onMouseUp(): void {
        this.isDragging = false;
        this.el.style.transition = '';
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);
    }

    private clampToViewport(): void {
        const rect = this.el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = rect.left;
        let top = rect.top;

        if (rect.bottom > vh) top = vh - rect.height - 8;
        if (top < 0) top = 8;
        if (rect.left < 0) left = 8;

        if (left !== rect.left || top !== rect.top) {
            this.el.style.left = `${left}px`;
            this.el.style.top = `${top}px`;
            this.el.style.bottom = 'auto';
        }
    }

    private repositionIfObstructed(selector: string): void {
        const target = document.querySelector(selector) as HTMLElement | null;
        if (!target || this.el.contains(target)) return;

        const targetRect = target.getBoundingClientRect();

        if (targetRect.width === 0 && targetRect.height === 0) {
            const obs = new MutationObserver(() => {
                const r = target.getBoundingClientRect();
                if (r.width === 0 && r.height === 0) return;
                obs.disconnect();
                this.repositionIfObstructed(selector);
                this.clampToViewport();
            });
            obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
            setTimeout(() => obs.disconnect(), 1000);
            return;
        }

        const boxRect = this.el.getBoundingClientRect();

        const overlaps = (a: DOMRect, b: DOMRect) =>
            !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

        if (!overlaps(boxRect, targetRect)) return;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const boxW = boxRect.width;
        const boxH = boxRect.height;

        const candidates = [
            { left: 20, top: vh - boxH - 20 },
            { left: vw - boxW - 20, top: vh - boxH - 20 },
            { left: vw - boxW - 20, top: 20 },
            { left: 20, top: 20 },
        ];

        for (const pos of candidates) {
            const candidate = new DOMRect(pos.left, pos.top, boxW, boxH);
            if (!overlaps(candidate, targetRect)) {
                this.el.style.left = `${pos.left}px`;
                this.el.style.top = `${pos.top}px`;
                this.el.style.bottom = 'auto';
                return;
            }
        }
    }
}
