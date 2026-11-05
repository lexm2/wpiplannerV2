<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { wizardState } from './wizardState.svelte';

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
  // History would rewrite the schedule behind the open section wizard.
  const frozen = $derived(wizardState.isOpen);
</script>

<button
  id="undo-btn"
  class="btn btn-icon"
  title="Undo (Ctrl+Z)"
  disabled={!canUndo || frozen}
  onclick={onUndo}>{@html getInlineSVG('ARROW_BACK_UP')}</button
>
<button
  id="redo-btn"
  class="btn btn-icon"
  title="Redo (Ctrl+Y)"
  disabled={!canRedo || frozen}
  onclick={onRedo}>{@html getInlineSVG('ARROW_FORWARD_UP')}</button
>
