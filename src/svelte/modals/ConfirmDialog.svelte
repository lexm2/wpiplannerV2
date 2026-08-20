<script lang="ts">
  /**
   * Generic confirm / prompt dialog — the themed replacement for native
   * confirm() and prompt().
   *
   * Deliberately one parameterized component rather than one per case: the call
   * sites differ only in wording, button colour and whether a text input is
   * needed. DeleteLocalEvent.svelte predates this and is left alone; it works.
   *
   * Styled entirely with modal.css's existing shared classes (.modal-header,
   * .modal-body, .modal-text, .modal-footer, .modal-btn + .btn-danger), so it
   * needed no new CSS. The variant drives the confirm button's colour; the
   * old .modal-confirm/.modal-warning classes only ever styled a .modal-icon
   * child we don't render, so they are not used here.
   */
  import Modal from './Modal.svelte';
  import { modalState } from './modalState.svelte';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const payload = $derived(modalState.confirm);

  // Seeded per open. Keyed on payload identity so reopening for a different
  // action re-seeds rather than keeping the previous entry.
  let inputValue = $state('');
  let seededFor: unknown = null;
  $effect(() => {
    const p = modalState.confirm;
    if (p !== seededFor) {
      seededFor = p;
      inputValue = p?.defaultValue ?? '';
    }
  });

  function submit(close: () => void): void {
    const p = payload;
    if (!p) return;
    if (p.input && !inputValue.trim()) return; // nothing to submit
    p.onConfirm(p.input ? inputValue.trim() : undefined);
    close();
  }

  function onKeydown(e: KeyboardEvent, close: () => void): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(close);
    }
  }
</script>

{#if payload}
  <Modal
    typeId="confirm"
    title={payload.title}
    {onRequestClose}
  >
    {#snippet children(close)}
      <div class="modal-header">
        <h2 class="modal-title">{payload.title}</h2>
      </div>
      <div class="modal-body">
        <div class="modal-text">
          {#each payload.message.split('\n') as line}
            <p>{line}</p>
          {/each}
          {#if payload.input}
            <!-- svelte-ignore a11y_autofocus (a prompt replacement should focus its field) -->
            <input
              class="filter-range-input"
              type="text"
              autofocus
              bind:value={inputValue}
              placeholder={payload.placeholder ?? ''}
              onkeydown={(e) => onKeydown(e, close)}
            />
          {/if}
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn btn-secondary" onclick={close}>
          {payload.cancelLabel ?? 'Cancel'}
        </button>
        <button
          id="modal-primary-btn"
          class="modal-btn {payload.variant === 'danger' ? 'btn-danger' : 'btn-primary'}"
          disabled={payload.input && !inputValue.trim()}
          onclick={() => submit(close)}
        >
          {payload.confirmLabel ?? 'Confirm'}
        </button>
      </div>
    {/snippet}
  </Modal>
{/if}
