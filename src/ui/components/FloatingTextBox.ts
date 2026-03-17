import type { TutorialService } from '../../services/tutorial/TutorialService';
import type { TutorialStep } from '../../types/tutorial';
import styles from '../../styles/components/floating-text-box.module.css';

export class FloatingTextBox {
    private el: HTMLElement;
    private stepTitleEl: HTMLElement;
    private stepDescEl: HTMLElement;
    private stepCounterEl: HTMLElement;
    private nextBtn: HTMLButtonElement;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private isDragging = false;

    private boundMouseMove = this.onMouseMove.bind(this);
    private boundMouseUp = this.onMouseUp.bind(this);

    constructor(private tutorialService: TutorialService) {
        this.el = this.createElement();
        this.stepTitleEl = this.el.querySelector(`.${styles.stepTitle}`) as HTMLElement;
        this.stepDescEl = this.el.querySelector(`.${styles.stepDescription}`) as HTMLElement;
        this.stepCounterEl = this.el.querySelector(`.${styles.stepCounter}`) as HTMLElement;
        this.nextBtn = this.el.querySelector(`.${styles.nextBtn}`) as HTMLButtonElement;

        this.tutorialService.onStepChange((step, index, total) => this.onStepChange(step, index, total));
    }

    mount(): void {
        document.body.appendChild(this.el);
    }

    private onStepChange(step: TutorialStep | null, index: number, total: number): void {
        if (!step) {
            this.el.classList.add(styles.hidden);
            return;
        }
        this.el.classList.remove(styles.hidden);
        this.stepTitleEl.textContent = step.title;
        this.stepDescEl.textContent = step.description;
        this.stepCounterEl.textContent = `Step ${index + 1} of ${total}`;
        if (step.waitFor === 'manual') {
            this.nextBtn.classList.remove(styles.hidden);
        } else {
            this.nextBtn.classList.add(styles.hidden);
        }
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
                <button class="${styles.nextBtn} ${styles.hidden}" data-tutorial-next>Next</button>
            </div>
        `;

        const header = el.querySelector(`.${styles.header}`) as HTMLElement;
        header.addEventListener('mousedown', this.onDragStart.bind(this));

        const skipBtn = el.querySelector(`.${styles.skipBtn}`) as HTMLButtonElement;
        skipBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        skipBtn.addEventListener('click', () => this.tutorialService.skip());

        const nextBtn = el.querySelector(`.${styles.nextBtn}`) as HTMLButtonElement;
        nextBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        nextBtn.addEventListener('click', () => this.tutorialService.nextStep());

        return el;
    }

    private onDragStart(e: MouseEvent): void {
        e.preventDefault();
        const rect = this.el.getBoundingClientRect();
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
        this.el.style.bottom = '';
    }

    private onMouseUp(): void {
        this.isDragging = false;
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);
    }
}
