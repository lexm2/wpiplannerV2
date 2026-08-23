<script lang="ts">
  /**
   * Themed replacement for native confirm() and prompt().
   *
   * One parameterized component rather than one per case: the call sites differ
   * only in wording, button colour and whether a text input is needed.
   * DeleteLocalEvent.svelte predates this and is left as-is.
   */

  import Modal from './Modal.svelte';
  import TextField from '../ui/TextField.svelte';
  import { modalState } from './modalState.svelte';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const payload = $derived(modalState.confirm);

  // Keyed on payload identity so reopening re-seeds the field.
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
            <TextField
              fieldClass="confirm-input"
              autofocus
              ariaLabel={payload.placeholder ?? payload.title}
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
