<script lang="ts">
  import { tick } from 'svelte';
  import type { TutorialService } from '../../services/tutorial/TutorialService';
  import { tutorialOverlayState } from './tutorialOverlayState.svelte';
  import { animateFindDot } from './findDot';
  import { scaleFade } from '../transitions';
  import {
    clampToViewport,
    coversTarget,
    layoutKey,
    placeBox,
    decorateInlineHighlights,
    targetOnScreen,
  } from './floatingBox.position';
  import styles from '../../styles/components/floating-text-box.module.css';

  let {
    tutorialService,
    onGoBack,
  }: {
    tutorialService: TutorialService;
    onGoBack: () => Promise<void>;
  } = $props();

  // Step state is driven by the tutorialOverlayState rune store (written by
  // TutorialService).
  const step = $derived(tutorialOverlayState.step);
  const index = $derived(tutorialOverlayState.index);
  const total = $derived(tutorialOverlayState.total);

  const SETTLE_MS = 1200;
  const FIND_WAIT_MS = 1500;
  const TARGET_WATCH_MS = 500;

  let backDisabled = $state(false);

  // Bound inside an {#if}, so it must be reactive.
  let boxEl = $state<HTMLElement | null>(null);

  const visible = $derived(step !== null);
  const isLastStep = $derived(index + 1 === total);
  const nextLabel = $derived(
    isLastStep
      ? (tutorialService.getActiveTutorial()?.lastStepLabel ?? 'Next Tutorial')
      : 'Next',
  );
  const showBack = $derived(index > 0);
  // The last tutorial names its final step's button, and has nothing after it.
  const hasNextTutorial = $derived(
    step !== null && !tutorialService.getActiveTutorial()?.lastStepLabel,
  );

  // Set once the student drags the box: from then on their spot stands, unless
  // it's on what the step needs.
  let dragged = false;

  // After each step's {@html} description renders, decorate any inline-highlight
  // spans with the marching-ants dashed-rect SVG, and move the box out of the way.
  // tick() (not rAF) is used so this runs after Svelte has flushed the {@html}
  // update - the inline span only exists then.
  //
  // Placing once isn't enough, since a step's window or page is often still
  // arriving when this runs. So the first moments of a step watch each frame and
  // place again whenever the target has moved and come to rest, then once more at
  // the end for anything that changed without moving the target. The rAF here only
  // throttles measurement; it drives no animation.
  //
  // After that only the target matters. Scrolling a list slides rows under the box
  // and that shouldn't send it anywhere, but TutorialService scrolling the target
  // itself under the box should, as should a menu the step's click opened.
  $effect(() => {
    if (!step || !boxEl) {
      dragged = false;
      return;
    }
    const box = boxEl;
    const selectors = [step.selector];
    if (step.waitForSelector) selectors.push(step.waitForSelector);

    let disposed = false;
    let placedFor = '';
    // A list full of schedules leaves no clear spot. Once the box has done its
    // best, re-placing it on every scroll would only make it hop around.
    let nowhereClear = false;
    const place = () => {
      placedFor = layoutKey(box, selectors);
      placeBox(box, selectors, { onlyOffTarget: dragged });
      clampToViewport(box);
      nowhereClear = coversTarget(box, selectors);
    };
    void tick().then(() => {
      if (disposed) return;
      decorateInlineHighlights(box);
      place();
    });

    const settleUntil = performance.now() + SETTLE_MS;
    let lastKey = '';
    let settleFrame = 0;
    const settle = () => {
      if (performance.now() >= settleUntil) {
        place();
        return;
      }
      const key = layoutKey(box, selectors);
      if (key === lastKey && key !== placedFor) place();
      lastKey = key;
      settleFrame = requestAnimationFrame(settle);
    };
    settleFrame = requestAnimationFrame(settle);

    let frame = 0;
    const onNextFrame = (work: () => void) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        work();
      });
    };
    const keepOffTarget = () => {
      if (!nowhereClear && coversTarget(box, selectors)) place();
    };
    const onScroll = () => onNextFrame(keepOffTarget);
    const onResize = () => onNextFrame(place);
    const watch = setInterval(keepOffTarget, TARGET_WATCH_MS);

    document.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', onResize);
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      cancelAnimationFrame(settleFrame);
      clearInterval(watch);
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
    };
  });

  // Once a step has settled, notice when its target is out of reach (the student
  // closed its window, say) and offer the way back.
  let targetLost = $state(false);
  $effect(() => {
    if (!step) return;
    const selector = step.selector;
    const settleUntil = performance.now() + SETTLE_MS;
    targetLost = false;
    const poll = setInterval(() => {
      if (performance.now() > settleUntil) {
        targetLost = !targetOnScreen(selector);
      }
    }, 500);
    return () => clearInterval(poll);
  });

  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  // Pointer Events (not mouse) so the box is draggable by touch and pen too -
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
    const x = Math.max(
      0,
      Math.min(window.innerWidth - boxEl.offsetWidth, e.clientX - dragOffsetX),
    );
    const y = Math.max(
      0,
      Math.min(
        window.innerHeight - boxEl.offsetHeight,
        e.clientY - dragOffsetY,
      ),
    );
    boxEl.style.left = `${x}px`;
    boxEl.style.top = `${y}px`;
    dragged = true;
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

  // Relocating can take a moment to mount the target, so the dot waits for it.
  function onFindElement(): void {
    tutorialService.relocate();
    const selector = step?.selector;
    if (!selector) return;
    const giveUpAt = performance.now() + FIND_WAIT_MS;
    const fly = () => {
      if (tutorialOverlayState.step?.selector !== selector) return;
      if (targetOnScreen(selector)) animateFindDot(selector);
      else if (performance.now() < giveUpAt) setTimeout(fly, 100);
    };
    fly();
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
  <div
    bind:this={boxEl}
    class={styles['container']}
    role="dialog"
    aria-label="Tutorial"
    data-tutorial-box
    transition:scaleFade={{ duration: 200 }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class={styles['header']}
      onpointerdown={onDragStart}
      onpointermove={onDragMove}
      onpointerup={onDragEnd}
      onpointercancel={onDragEnd}
    >
      <span class={styles['title']}>Tutorial</span>
      <button
        class={styles['findBtn']}
        data-tutorial-find
        onpointerdown={stopPointerdown}
        onclick={onFindElement}
      >
        Find Element
      </button>
      {#if hasNextTutorial}
        <button
          class={styles['nextTutorialBtn']}
          data-tutorial-next-tutorial
          onpointerdown={stopPointerdown}
          onclick={() => tutorialService.skipToNextTutorial()}
        >
          Next Tutorial
        </button>
      {/if}
      <button
        class={styles['skipBtn']}
        data-tutorial-skip
        onpointerdown={stopPointerdown}
        onclick={() => tutorialService.exit()}
      >
        Skip tutorial
      </button>
    </div>
    <div class={styles['body']} aria-live="polite">
      <div class={styles['stepTitle']}>{step?.title ?? ''}</div>
      <!-- eslint-disable-next-line svelte/no-at-html-tags - tutorial copy is author-controlled -->
      <div class={styles['stepDescription']}>
        {@html step?.description ?? ''}
      </div>
      {#if targetLost}
        <div class={styles['lostHint']} data-tutorial-lost>
          Can't see it? Find Element brings it back, or use Back.
        </div>
      {/if}
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
