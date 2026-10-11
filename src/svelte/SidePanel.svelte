<script lang="ts">
  import type { Snippet } from 'svelte';
  import ResizeHandle from './ResizeHandle.svelte';
  import type { PanelWidthConfig } from './panelWidths';
  import { trapFocus } from './modals/trapFocus';
  import { fade } from 'svelte/transition';
  import { dur } from './transitions';
  import { horizontalSwipe } from './horizontalSwipe';
  import {
    drawerMode,
    isDrawerOpen,
    isTopmostDrawer,
    closeDrawer,
    type DrawerId,
  } from './drawerState.svelte';

  /**
   * A resizable side panel: the shell every one of them needs, plus its handle.
   *
   * The shell exists to hold two invariants that are easy to get wrong
   * separately. ResizeHandle is absolutely positioned and measures its
   * parentElement, so the panel must be `position: relative` AND must not be
   * the scrolling element - otherwise the handle scrolls away with the content
   * and reports the wrong width. Content therefore scrolls in a child, never
   * here.
   *
   * Layout of the contents stays with the caller: one panel is a plain column,
   * another a two-row grid, another a header/content/footer stack. Only the
   * shell and the handle are shared. The panel's WIDTH also stays with the
   * caller, because it comes from a grid template on some pages and from the
   * panel's own `width` on others - both read the same `config.cssVar`.
   *
   * With `drawer`, the panel becomes an off-canvas drawer wherever its page
   * hides it (see drawerState): parked off screen until opened, then slid in
   * over a backdrop with focus trapped inside, and closed by the backdrop,
   * Escape, its close button, or a swipe back toward the side it docks on. It
   * slides from that side - the opposite of `edge`.
   */
  interface Props {
    /** Drives the handle: which custom property to write, bounds, persistence. */
    config: PanelWidthConfig;
    /** Edge the handle sits on - the side facing the page's content. */
    edge: 'left' | 'right';
    /** Accessible label for the resize separator. */
    resizeLabel: string;
    /** Accessible label for the panel region itself. */
    label?: string;
    /** Makes the panel a drawer on narrow screens; `title` heads it there. */
    drawer?: { id: DrawerId; title: string };
    /** Called when the user dismisses the drawer. */
    onDrawerClose?: () => void;
    /** The page's own class, for its layout and width rules. */
    class?: string;
    children: Snippet;
    /** Anything else lands on the <aside> - notably the stable `data-*` hooks
     * that tests and tutorial steps address the panel by, since `class` is a
     * hashed CSS-module name and cannot be selected on. */
    [key: string]: unknown;
  }

  let {
    config,
    edge,
    resizeLabel,
    label,
    drawer,
    onDrawerClose,
    class: className = '',
    children,
    ...rest
  }: Props = $props();

  const asDrawer = $derived(!!drawer && drawerMode[drawer.id].current);
  const open = $derived(!!drawer && asDrawer && isDrawerOpen(drawer.id));

  // Widening past the breakpoint puts the panel back inline, so the drawer
  // must leave the modal stack too - or it would keep silencing page keys.
  $effect(() => {
    if (drawer && !asDrawer && isDrawerOpen(drawer.id)) closeDrawer(drawer.id);
  });

  function close(): void {
    if (!drawer) return;
    closeDrawer(drawer.id);
    onDrawerClose?.();
  }

  // Same rule as Modal.svelte: only the topmost entry takes Escape, and not
  // once something else has claimed the key.
  function onKeydown(event: KeyboardEvent): void {
    if (
      drawer &&
      event.key === 'Escape' &&
      !event.defaultPrevented &&
      isTopmostDrawer(drawer.id)
    ) {
      event.preventDefault();
      close();
    }
  }

  // trapFocus moves focus in, keeps Tab inside, locks page scroll and hands
  // focus back to the opener - attached only while the drawer is open.
  function focusTrap(node: HTMLElement): () => void {
    const trap = trapFocus(node);
    return () => trap.destroy();
  }

  let backdrop = $state<HTMLDivElement | null>(null);

  // Past this share of its width, or flicked, a dragged drawer closes;
  // otherwise it springs back open.
  const CLOSE_AT = 0.35;
  const FLICK = 0.5; // px/ms

  // Swipe toward the side it docks on to close: the drawer follows the finger
  // (only outward; .side-panel-dragging holds its transition off meanwhile)
  // and the backdrop fades with it. Letting go hands back to the drawer's CSS
  // transition, which runs from wherever the finger left it, either to closed
  // or back to open.
  function swipeToClose(node: HTMLElement): () => void {
    // A panel whose handle faces right docks on the left, and closes leftward.
    const out = edge === 'right' ? -1 : 1;
    return horizontalSwipe(node, {
      onMove(dx) {
        const travel = Math.max(0, dx * out);
        node.classList.add('side-panel-dragging');
        node.style.transform = `translateX(${travel * out}px)`;
        if (backdrop)
          backdrop.style.opacity = String(1 - travel / node.offsetWidth);
      },
      onEnd(dx, vx) {
        const travel = dx * out;
        node.classList.remove('side-panel-dragging');
        node.style.transform = '';
        if (backdrop) backdrop.style.opacity = '';
        const flicked = vx * out > FLICK && travel > 0;
        if (travel > node.offsetWidth * CLOSE_AT || flicked) close();
      },
    });
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (click-to-close; Escape is handled on svelte:window) -->
  <div
    class="side-panel-backdrop"
    transition:fade={{ duration: dur(200) }}
    onclick={close}
    bind:this={backdrop}
  ></div>
{/if}

<aside
  class="side-panel side-panel-{edge} {className}"
  class:side-panel-drawer={asDrawer}
  class:side-panel-open={open}
  aria-label={label}
  aria-modal={open ? 'true' : undefined}
  role={open ? 'dialog' : undefined}
  style:--side-panel-drawer-width="var({config.cssVar}, {config.defaultWidth}px)"
  {@attach open ? focusTrap : undefined}
  {@attach open ? swipeToClose : undefined}
  {...rest}
>
  {#if asDrawer && drawer}
    <div class="side-panel-drawer-bar">
      <h2 class="side-panel-drawer-title">{drawer.title}</h2>
      <button
        type="button"
        class="side-panel-drawer-close"
        aria-label="Close {drawer.title}"
        onclick={close}>&times;</button
      >
    </div>
  {/if}
  {@render children()}
  {#if !asDrawer}
    <ResizeHandle {config} {edge} label={resizeLabel} />
  {/if}
</aside>
