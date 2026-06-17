<script lang="ts">
  import type { TutorialService } from '../../services/tutorial/TutorialService';
  import type { TutorialStep } from '../../types/tutorial';
  import styles from '../../styles/components/floating-text-box.module.css';

  let {
    tutorialService,
    onGoBack,
  }: {
    tutorialService: TutorialService;
    onGoBack: () => Promise<void>;
  } = $props();

  let step = $state<TutorialStep | null>(null);
  let index = $state(0);
  let total = $state(0);
  let backDisabled = $state(false);

  let boxEl: HTMLElement;
  let descEl: HTMLElement;

  const visible = $derived(step !== null);
  const isLastStep = $derived(index + 1 === total);
  const nextLabel = $derived(
    isLastStep ? (tutorialService.getActiveTutorial()?.lastStepLabel ?? 'Next Tutorial') : 'Next'
  );
  const showBack = $derived(index > 0);

  // The service notifies the box on every step change (single callback slot).
  $effect(() => {
    tutorialService.onStepChange((s, i, t) => {
      step = s;
      index = i;
      total = t;
    });
  });

  // After the description renders, decorate any inline-highlight spans with the
  // same dashed-rect SVG the old imperative box drew.
  $effect(() => {
    if (!step || !descEl) return;
    const node = descEl;
    requestAnimationFrame(() => {
      node.querySelectorAll<HTMLElement>('.tutorial-inline-highlight').forEach((span) => {
        if (span.querySelector('svg')) return;
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
  });

  // Reposition the box if it covers the highlighted target (per step).
  $effect(() => {
    if (!step || !boxEl) return;
    const selector = step.selector;
    requestAnimationFrame(() => {
      repositionIfObstructed(selector);
      clampToViewport();
    });
  });

  // --- Dragging (header grab) -------------------------------------------------
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function onDragStart(e: MouseEvent): void {
    e.preventDefault();
    const rect = boxEl.getBoundingClientRect();
    boxEl.style.transition = 'none';
    boxEl.style.top = `${rect.top}px`;
    boxEl.style.bottom = 'auto';
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    dragging = true;
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }

  function onDragMove(e: MouseEvent): void {
    if (!dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - boxEl.offsetWidth, e.clientX - dragOffsetX));
    const y = Math.max(0, Math.min(window.innerHeight - boxEl.offsetHeight, e.clientY - dragOffsetY));
    boxEl.style.left = `${x}px`;
    boxEl.style.top = `${y}px`;
  }

  function onDragEnd(): void {
    dragging = false;
    boxEl.style.transition = '';
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }

  // Clean up any in-flight drag listeners if the box is ever torn down.
  $effect(() => {
    return () => {
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
    };
  });

  function clampToViewport(): void {
    const rect = boxEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left;
    let top = rect.top;

    if (rect.bottom > vh) top = vh - rect.height - 8;
    if (top < 0) top = 8;
    if (rect.right > vw) left = vw - rect.width - 8;
    if (rect.left < 0) left = 8;

    if (left !== rect.left || top !== rect.top) {
      boxEl.style.left = `${left}px`;
      boxEl.style.top = `${top}px`;
      boxEl.style.bottom = 'auto';
    }
  }

  function repositionIfObstructed(selector: string): void {
    const target = document.querySelector(selector) as HTMLElement | null;
    if (!target || boxEl.contains(target)) return;

    const targetRect = target.getBoundingClientRect();

    if (targetRect.width === 0 && targetRect.height === 0) {
      const obs = new MutationObserver(() => {
        const r = target.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        obs.disconnect();
        repositionIfObstructed(selector);
        clampToViewport();
      });
      obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
      setTimeout(() => obs.disconnect(), 1000);
      return;
    }

    const boxRect = boxEl.getBoundingClientRect();
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
        boxEl.style.left = `${pos.left}px`;
        boxEl.style.top = `${pos.top}px`;
        boxEl.style.bottom = 'auto';
        return;
      }
    }
  }

  // --- "Find element" dot animation ------------------------------------------
  function animateFindDot(): void {
    if (!step) return;
    const target = document.querySelector(step.selector) as HTMLElement | null;
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

  function onNext(): void {
    tutorialService.disarmCurrentListener();
    tutorialService.nextStep();
  }

  async function onBack(): Promise<void> {
    backDisabled = true;
    try {
      await onGoBack();
    } finally {
      backDisabled = false;
    }
  }

  const stopMousedown = (e: MouseEvent) => e.stopPropagation();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={boxEl} class="{styles.container} {visible ? '' : styles.hidden}">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class={styles.header} onmousedown={onDragStart}>
    <span class={styles.title}>Tutorial</span>
    <button class={styles.findBtn} data-tutorial-find onmousedown={stopMousedown} onclick={animateFindDot}>
      Find Element
    </button>
    <button class={styles.skipBtn} onmousedown={stopMousedown} onclick={() => tutorialService.skip()}>
      Skip tutorial
    </button>
  </div>
  <div class={styles.body}>
    <div class={styles.stepTitle}>{step?.title ?? ''}</div>
    <!-- eslint-disable-next-line svelte/no-at-html-tags — tutorial copy is author-controlled -->
    <div class={styles.stepDescription} bind:this={descEl}>{@html step?.description ?? ''}</div>
  </div>
  <div class={styles.footer}>
    <span class={styles.stepCounter}>Step {index + 1} of {total}</span>
    <button
      class={styles.backBtn}
      data-tutorial-back
      style:display={showBack ? '' : 'none'}
      disabled={backDisabled}
      onmousedown={stopMousedown}
      onclick={onBack}
    >
      <span>Back</span>
    </button>
    <button
      class={styles.nextBtn}
      data-tutorial-next
      style:margin-left={showBack ? '' : 'auto'}
      onmousedown={stopMousedown}
      onclick={onNext}
    >
      <span>{nextLabel}</span>
    </button>
  </div>
</div>
