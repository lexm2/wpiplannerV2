<script lang="ts">
  import { tick } from 'svelte';
  import type { TutorialService } from '../../services/tutorial/TutorialService';
  import { tutorialOverlayState } from './tutorialOverlayState.svelte';
  import { animateFindDot } from './findDot';
  import { scaleFade } from '../transitions';
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

  // Bound inside an {#if}, so it must be reactive: it is set on mount and
  // cleared on unmount as the tutorial starts and stops.
  let boxEl = $state<HTMLElement | null>(null);

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

  // Dragging (header grab)
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  // Pointer Events (not mouse) so the box is draggable by touch and pen too —
  // it can obstruct the very element the tutorial is highlighting. Pointer
  // capture keeps move/up coming to the header even once the pointer leaves it,
  // so no document-level listeners (and no teardown bookkeeping) are needed.
  // Same pattern as ResizeHandle.svelte.
  function onDragStart(e: PointerEvent): void {
    e.preventDefault();
    if (!boxEl) return;
    const rect = boxEl.getBoundingClientRect();
    boxEl.style.top = `${rect.top}px`;
    boxEl.style.bottom = 'auto';
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    dragging = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort; dragging still works without it */
    }
  }

  function onDragMove(e: PointerEvent): void {
    if (!dragging || !boxEl) return;
    const x = Math.max(0, Math.min(window.innerWidth - boxEl.offsetWidth, e.clientX - dragOffsetX));
    const y = Math.max(0, Math.min(window.innerHeight - boxEl.offsetHeight, e.clientY - dragOffsetY));
    boxEl.style.left = `${x}px`;
    boxEl.style.top = `${y}px`;
  }

  function onDragEnd(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op if capture was never established */
    }
  }

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

  const stopPointerdown = (e: PointerEvent) => e.stopPropagation();
</script>

{#if visible}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={boxEl} class={styles['container']} transition:scaleFade={{ duration: 200 }}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class={styles['header']}
    onpointerdown={onDragStart}
    onpointermove={onDragMove}
    onpointerup={onDragEnd}
    onpointercancel={onDragEnd}
  >
    <span class={styles['title']}>Tutorial</span>
    <button class={styles['findBtn']} data-tutorial-find onpointerdown={stopPointerdown} onclick={onFindElement}>
      Find Element
    </button>
    <button class={styles['skipBtn']} onpointerdown={stopPointerdown} onclick={() => tutorialService.skip()}>
      Skip tutorial
    </button>
  </div>
  <div class={styles['body']}>
    <div class={styles['stepTitle']}>{step?.title ?? ''}</div>
    <!-- eslint-disable-next-line svelte/no-at-html-tags — tutorial copy is author-controlled -->
    <div class={styles['stepDescription']}>{@html step?.description ?? ''}</div>
  </div>
  <div class={styles['footer']}>
    <span class={styles['stepCounter']}>Step {index + 1} of {total}</span>
    <button
      class={styles['backBtn']}
      data-tutorial-back
      style:display={showBack ? '' : 'none'}
      disabled={backDisabled}
      onpointerdown={stopPointerdown}
      onclick={onBack}
    >
      <span>Back</span>
    </button>
    <button
      class={styles['nextBtn']}
      data-tutorial-next
      style:margin-left={showBack ? '' : 'auto'}
      onpointerdown={stopPointerdown}
      onclick={onNext}
    >
      <span>{nextLabel}</span>
    </button>
  </div>
</div>
{/if}
