/**
 * "Find element" dot animation — a self-contained WAAPI flourish that flies a dot
 * from screen center to the tutorial step's target and fades out. Extracted from
 * FloatingTextBox.svelte: it appends to document.body and self-cleans, with no
 * component state beyond the target selector.
 */
export function animateFindDot(selector: string): void {
    const target = document.querySelector(selector) as HTMLElement | null;
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

    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
    const growIn = dot.animate(
        [
            { transform: 'translate(-50%, -50%) scale(0)' },
            { transform: 'translate(-50%, -50%) scale(1)' },
        ],
        { duration: 300, easing: 'ease-out', fill: 'forwards' }
    );

    growIn.onfinish = () => {
        const travel = dot.animate(
            [
                { transform: 'translate(-50%, -50%) scale(1)' },
                { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)` },
            ],
            { duration: 500, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fill: 'forwards' }
        );

        travel.onfinish = () => {
            setTimeout(() => {
                overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
                const fadeOut = dot.animate(
                    [
                        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)` },
                        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0)` },
                    ],
                    { duration: 300, easing: 'ease-in', fill: 'forwards' }
                );
                fadeOut.onfinish = cleanup;
            }, 500);
        };
    };
}
