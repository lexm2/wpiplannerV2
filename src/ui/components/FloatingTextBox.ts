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
    private backBtn: HTMLButtonElement;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private isDragging = false;
    private currentStep: TutorialStep | null = null;
    private goBackFn: (() => Promise<void>) | null = null;

    private boundMouseMove = this.onMouseMove.bind(this);
    private boundMouseUp = this.onMouseUp.bind(this);

    constructor(private tutorialService: TutorialService) {
        this.el = this.createElement();
        this.stepTitleEl = this.el.querySelector(`.${styles.stepTitle}`) as HTMLElement;
        this.stepDescEl = this.el.querySelector(`.${styles.stepDescription}`) as HTMLElement;
        this.stepCounterEl = this.el.querySelector(`.${styles.stepCounter}`) as HTMLElement;
        this.nextBtn = this.el.querySelector(`.${styles.nextBtn}`) as HTMLButtonElement;
        this.nextBtnLabel = this.nextBtn.querySelector('span') as HTMLSpanElement;
        this.backBtn = this.el.querySelector(`.${styles.backBtn}`) as HTMLButtonElement;

        this.tutorialService.onStepChange((step, index, total) => this.onStepChange(step, index, total));
    }

    setGoBack(fn: () => Promise<void>): void {
        this.goBackFn = fn;
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
        this.stepDescEl.innerHTML = step.description;
        requestAnimationFrame(() => {
            this.stepDescEl.querySelectorAll<HTMLElement>('.tutorial-inline-highlight').forEach(span => {
                const w = span.offsetWidth + 4;
                const h = span.offsetHeight + 4;
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', String(w));
                svg.setAttribute('height', String(h));
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', '1');
                rect.setAttribute('y', '1');
                rect.setAttribute('rx', '4');
                rect.setAttribute('width', String(w - 2));
                rect.setAttribute('height', String(h - 2));
                rect.setAttribute('fill', 'none');
                rect.setAttribute('stroke-width', '2');
                rect.setAttribute('stroke-dasharray', '8 6');
                svg.appendChild(rect);
                span.insertBefore(svg, span.firstChild);
            });
        });
        this.stepCounterEl.textContent = `Step ${index + 1} of ${total}`;
        const isLastStep = index + 1 === total;
        const activeTutorial = this.tutorialService.getActiveTutorial();
        this.nextBtnLabel.textContent = isLastStep
            ? (activeTutorial?.lastStepLabel ?? 'Next Tutorial')
            : 'Next';
        const showBack = index > 0;
        this.backBtn.style.display = showBack ? '' : 'none';
        this.nextBtn.style.marginLeft = showBack ? '' : 'auto';
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
                <button class="${styles.findBtn}" data-tutorial-find>Find Element</button>
                <button class="${styles.skipBtn}">Skip tutorial</button>
            </div>
            <div class="${styles.body}">
                <div class="${styles.stepTitle}"></div>
                <div class="${styles.stepDescription}"></div>
            </div>
            <div class="${styles.footer}">
                <span class="${styles.stepCounter}"></span>
                <button class="${styles.backBtn}" data-tutorial-back style="display:none"><span>Back</span></button>
                <button class="${styles.nextBtn}" data-tutorial-next><span>Next</span></button>
            </div>
        `;

        const header = el.querySelector(`.${styles.header}`) as HTMLElement;
        header.addEventListener('mousedown', this.onDragStart.bind(this));

        const skipBtn = el.querySelector(`.${styles.skipBtn}`) as HTMLButtonElement;
        skipBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        skipBtn.addEventListener('click', () => this.tutorialService.skip());

        const findBtn = el.querySelector(`.${styles.findBtn}`) as HTMLButtonElement;
        findBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        findBtn.addEventListener('click', () => this.animateFindDot());

        const nextBtn = el.querySelector(`.${styles.nextBtn}`) as HTMLButtonElement;
        nextBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        nextBtn.addEventListener('click', () => {
            this.tutorialService.disarmCurrentListener();
            this.tutorialService.nextStep();
        });

        const backBtn = el.querySelector(`.${styles.backBtn}`) as HTMLButtonElement;
        backBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        backBtn.addEventListener('click', async () => {
            if (!this.goBackFn) return;
            backBtn.disabled = true;
            try {
                await this.goBackFn();
            } finally {
                backBtn.disabled = false;
            }
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

    private animateFindDot(): void {
        if (!this.currentStep) return;

        const target = document.querySelector(this.currentStep.selector) as HTMLElement | null;
        if (!target) return;

        const targetRect = target.getBoundingClientRect();
        if (targetRect.width === 0 && targetRect.height === 0) return;

        const overlay = document.createElement('div');
        overlay.className = 'tutorial-find-overlay';
        overlay.style.opacity = '0';

        const startX = window.innerWidth / 2;
        const startY = window.innerHeight / 2;
        const endX = targetRect.left + targetRect.width / 2;
        const endY = targetRect.top + targetRect.height / 2;
        const dx = endX - startX;
        const dy = endY - startY;

        const dot = document.createElement('div');
        dot.className = 'tutorial-find-dot';
        dot.style.left = `${startX}px`;
        dot.style.top = `${startY}px`;
        dot.style.transform = 'translate(-50%, -50%) scale(0)';

        document.body.appendChild(overlay);
        document.body.appendChild(dot);

        const cleanup = () => {
            overlay.remove();
            dot.remove();
        };

        const overlayFade = overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
        const growIn = dot.animate([
            { transform: 'translate(-50%, -50%) scale(0)' },
            { transform: 'translate(-50%, -50%) scale(1)' },
        ], { duration: 300, easing: 'ease-out', fill: 'forwards' });

        growIn.onfinish = () => {
            const travel = dot.animate([
                { transform: 'translate(-50%, -50%) scale(1)' },
                { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)` },
            ], { duration: 500, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fill: 'forwards' });

            travel.onfinish = () => {
                setTimeout(() => {
                    overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
                    const fadeOut = dot.animate([
                        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)` },
                        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0)` },
                    ], { duration: 300, easing: 'ease-in', fill: 'forwards' });
                    fadeOut.onfinish = cleanup;
                }, 500);
            };
        };
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
