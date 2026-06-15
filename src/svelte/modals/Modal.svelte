<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  let {
    typeId,
    closeOnBackdrop = true,
    closeOnEscape = true,
    title,
    onRequestClose,
    children,
  }: {
    typeId: string;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    title?: string;
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
  class="modal-backdrop modal-container"
  class:show={shown}
  class:hide={closing}
  data-modal-type={typeId}
  onclick={backdropClick}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus (dialog onclick only stops backdrop propagation) -->
  <div
    class="modal-dialog"
    class:show={shown}
    class:hide={closing}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    onclick={stop}
  >
    <div class="modal-content">
      {@render children(close)}
    </div>
  </div>
</div>
