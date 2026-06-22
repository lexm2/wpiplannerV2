<script lang="ts">
  import { tick } from 'svelte';
  import type { TutorialService } from '../../services/tutorial/TutorialService';
  import { tutorialOverlayState } from './tutorialOverlayState.svelte';
  import { animateFindDot } from './findDot';
  import { clampToViewport, repositionIfObstructed, decorateInlineHighlights } from './floatingBox.position';
  import styles from '../../styles/components/floating-text-box.module.css';

  let {
    tutorialService,
    onGoBack,
  }: {
    tutorialService: TutorialService;
    onGoBack: () => Promise<void>;
  } = $props();

  // Step state is driven by the tutorialOverlayState rune store (written by
  // TutorialService) — the runes-native replacement for the old onStepChange
  // callback slot.
  const step = $derived(tutorialOverlayState.step);
  const index = $derived(tutorialOverlayState.index);
  const total = $derived(tutorialOverlayState.total);

  let backDisabled = $state(false);

  let boxEl: HTMLElement;

  const visible = $derived(step !== null);
  const isLastStep = $derived(index + 1 === total);
  const nextLabel = $derived(
    isLastStep ? (tutorialService.getActiveTutorial()?.lastStepLabel ?? 'Next Tutorial') : 'Next'
  );
  const showBack = $derived(index > 0);

  // After each step's {@html} description renders, decorate any inline-highlight
  // spans with the marching-ants dashed-rect SVG, and reposition the box off the
  // highlighted target. tick() (not rAF) is used so this runs after Svelte has
  // flushed the {@html} update — the inline span only exists then.
  $effect(() => {
    if (!step || !boxEl) return;
    const box = boxEl;
    const selector = step.selector;
    tick().then(() => {
      decorateInlineHighlights(box);
      repositionIfObstructed(box, selector);
      clampToViewport(box);
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

  // "Find element" dot animation — flies a dot to the current step's target.
  function onFindElement(): void {
    if (step) animateFindDot(step.selector);
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
    <button class={styles.findBtn} data-tutorial-find onmousedown={stopMousedown} onclick={onFindElement}>
      Find Element
    </button>
    <button class={styles.skipBtn} onmousedown={stopMousedown} onclick={() => tutorialService.skip()}>
      Skip tutorial
    </button>
  </div>
  <div class={styles.body}>
    <div class={styles.stepTitle}>{step?.title ?? ''}</div>
    <!-- eslint-disable-next-line svelte/no-at-html-tags — tutorial copy is author-controlled -->
    <div class={styles.stepDescription}>{@html step?.description ?? ''}</div>
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
