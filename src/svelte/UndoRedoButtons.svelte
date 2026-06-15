<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import type { ProfileStateManager } from '../core/state/ProfileStateManager';

  let { profileStateManager, onUndo, onRedo }: {
    profileStateManager: ProfileStateManager;
    onUndo: () => void;
    onRedo: () => void;
  } = $props();

  // `undoRedoGeneration` is bumped on every history change. Reading it inside
  // the derived (via the comma expression) establishes the reactive dependency,
  // then we return the current canUndo/canRedo result — replacing the old
  // imperative updateUndoRedoButtons() + watch() wiring.
  const canUndo = $derived((appState.undoRedoGeneration, profileStateManager.canUndo()));
  const canRedo = $derived((appState.undoRedoGeneration, profileStateManager.canRedo()));
</script>

<button id="undo-btn" class="btn btn-icon" title="Undo (Ctrl+Z)" disabled={!canUndo} onclick={onUndo}>{@html getInlineSVG('ARROW_BACK_UP')}</button>
<button id="redo-btn" class="btn btn-icon" title="Redo (Ctrl+Y)" disabled={!canRedo} onclick={onRedo}>{@html getInlineSVG('ARROW_FORWARD_UP')}</button>
