<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Snippet } from 'svelte';
  import { trapFocus } from './trapFocus';
  import { zoom, dur } from '../transitions';

  let {
    typeId,
    closeOnBackdrop = true,
    closeOnEscape = true,
    title,
    header,
    showHeader = false,
    hideClose = false,
    extraClass,
    dialogClass,
    onRequestClose,
    children,
  }: {
    typeId: string;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    title?: string;
    /**
     * Custom header content (receives `close`). Overrides the default
     * title+close header. For modals with tabs/extra controls in the header.
     */
    header?: Snippet<[() => void]>;
    /** Render the built-in `title` + close-button header inside the content. */
    showHeader?: boolean;
    /** Hide the close button in the built-in header (e.g. forced-acknowledge modals). */
    hideClose?: boolean;
    /** Extra class(es) on the backdrop, e.g. 'filter-modal' for width/scoping. */
    extraClass?: string;
    /** Extra class(es) on the dialog, e.g. 'schedule-picker-modal-dialog no-transform'. */
    dialogClass?: string;
    onRequestClose: () => void;
    children: Snippet<[() => void]>;
  } = $props();

  // Backdrop fades, dialog zooms. `|global` because ModalLayer's {#each}
  // unmounts us, so a local outro wouldn't play. `no-transform` dialogs
  // (position:fixed descendants) skip the zoom; the backdrop fade still covers them.
  const noTransform = $derived((dialogClass ?? '').includes('no-transform'));

  function close(): void {
    onRequestClose();
  }

  function backdropClick(event: MouseEvent): void {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      close();
    }
  }

  function stop(event: MouseEvent): void {
    event.stopPropagation();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (closeOnEscape && event.key === 'Escape') {
      close();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (backdrop is click-to-close; Escape is handled on svelte:window) -->
<div
  class="modal-backdrop modal-container {extraClass ?? ''}"
  data-modal-type={typeId}
  transition:fade|global={{ duration: dur(200) }}
  onclick={backdropClick}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus (dialog onclick only stops backdrop propagation) -->
  <div
    class="modal-dialog {dialogClass ?? ''}"
    transition:zoom|global={{ enabled: !noTransform }}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    onclick={stop}
    use:trapFocus
  >
    <div class="modal-content">
      {#if header}
        {@render header(close)}
      {:else if showHeader}
        <div class="modal-header">
          <h2 class="modal-title">{title}</h2>
          {#if !hideClose}
            <button class="modal-close" aria-label="Close" onclick={close}
              >&times;</button
            >
          {/if}
        </div>
      {/if}
      {@render children(close)}
    </div>
  </div>
</div>
