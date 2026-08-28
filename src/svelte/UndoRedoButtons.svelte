<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';

  let {
    onUndo,
    onRedo,
  }: {
    onUndo: () => void;
    onRedo: () => void;
  } = $props();

  // UndoRedoManager publishes availability to these runes on every history
  // change, so the buttons' disabled state stays in sync automatically.
  const canUndo = $derived(appState.canUndo);
  const canRedo = $derived(appState.canRedo);
</script>

<button
  id="undo-btn"
  class="btn btn-icon"
  title="Undo (Ctrl+Z)"
  disabled={!canUndo}
  onclick={onUndo}>{@html getInlineSVG('ARROW_BACK_UP')}</button
>
<button
  id="redo-btn"
  class="btn btn-icon"
  title="Redo (Ctrl+Y)"
  disabled={!canRedo}
  onclick={onRedo}>{@html getInlineSVG('ARROW_FORWARD_UP')}</button
>
