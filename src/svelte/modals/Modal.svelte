<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

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

  // Mirrors ModalService.showModal/hideModal animation sequencing:
  //  - show: double rAF then add `.show` to backdrop + dialog
  //  - hide: add `.hide`, wait 200ms, then remove from DOM (here: ask parent to
  //    drop our id from uiState.openModals, which unmounts us).
  let shown = $state(false);
  let closing = $state(false);

  onMount(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        shown = true;
      });
    });
  });

  function close(): void {
    if (closing) return;
    closing = true;
    setTimeout(() => onRequestClose(), 200);
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
    if (closeOnEscape && event.key === 'Escape' && shown && !closing) {
      close();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (backdrop is click-to-close; Escape is handled on svelte:window) -->
<div
  class="modal-backdrop modal-container {extraClass ?? ''}"
  class:show={shown}
  class:hide={closing}
  data-modal-type={typeId}
  onclick={backdropClick}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus (dialog onclick only stops backdrop propagation) -->
  <div
    class="modal-dialog {dialogClass ?? ''}"
    class:show={shown}
    class:hide={closing}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    onclick={stop}
  >
    <div class="modal-content">
      {#if header}
        {@render header(close)}
      {:else if showHeader}
        <div class="modal-header">
          <h2 class="modal-title">{title}</h2>
          {#if !hideClose}
            <button class="modal-close" aria-label="Close" onclick={close}>&times;</button>
          {/if}
        </div>
      {/if}
      {@render children(close)}
    </div>
  </div>
</div>
