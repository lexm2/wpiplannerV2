<script lang="ts">
  import Modal from './Modal.svelte';
  import TextField from '../ui/TextField.svelte';
  import { showConfirm } from './modalState.svelte';
  import { degreeState } from '../degree/degreeState.svelte';
  import { degreeBucketService } from '../../services/degree/degreeBucketService';
  import type { DegreeBucket } from '../../services/degree/degreeBuckets';
  import { flip } from 'svelte/animate';
  import { dur } from '../transitions';

  /**
   * Add, rename, retarget, reorder and delete the Degree page's buckets.
   * Imported buckets are edited through an override layer and "deleted" by
   * hiding them, leaving the Workday record authoritative.
   */
  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const buckets = $derived(degreeState.buckets);

  let editingId = $state<string | null>(null);
  let draftName = $state('');
  let draftCredits = $state('');

  function startEdit(bucket: DegreeBucket): void {
    editingId = bucket.id;
    draftName = bucket.name;
    draftCredits = bucket.creditsRequired?.toString() ?? '';
  }

  function commitEdit(): void {
    if (!editingId) return;
    const name = draftName.trim();
    const bucket = buckets.find(b => b.id === editingId);
    if (bucket && name) {
      degreeBucketService.updateBucket(editingId, {
        name,
        creditsRequired: parseTarget(draftCredits),
      });
    }
    editingId = null;
  }

  /** Blank clears the credit target. */
  function parseTarget(raw: string): number | null {
    const n = Number(raw.trim());
    return raw.trim() && Number.isFinite(n) && n > 0 ? n : null;
  }

  let adding = $state(false);
  let newName = $state('');
  let newCredits = $state('');
  let newDepartments = $state('');

  function submitNew(): void {
    const name = newName.trim();
    if (!name) return;
    degreeBucketService.addBucket({
      name,
      creditsRequired: parseTarget(newCredits),
      coursesRemaining: null,
      departments: newDepartments
        .split(',')
        .map(d => d.trim().toUpperCase())
        .filter(Boolean),
    });
    newName = '';
    newCredits = '';
    newDepartments = '';
    adding = false;
  }

  function remove(bucket: DegreeBucket): void {
    const held = degreeBucketService.assignedCount(bucket.id);
    const consequence = held
      ? ` ${held} course${held === 1 ? '' : 's'} placed in it will return to Unassigned.`
      : '';
    showConfirm({
      title: 'Delete bucket',
      message: `Delete "${bucket.name}"?${consequence}`,
      confirmLabel: 'Delete',
      variant: 'danger',
      // onConfirm fires later, so it needs its own catch.
      onConfirm: () => {
        try {
          degreeBucketService.deleteBucket(bucket.id);
        } catch {
          /* the service logs persistence failures */
        }
      },
    });
  }

  // The row itself moves under the pointer, vertically only and clamped to the
  // list, while the rows it displaces slide aside to open the gap it lands in.
  let dragId = $state<string | null>(null);
  let dragDy = $state(0);
  let dropIndex = $state<number | null>(null);
  let dragIndex = $state<number | null>(null);
  /** How far a displaced row slides: the dragged row's height plus the gap. */
  let slotHeight = $state(0);
  let listEl = $state<HTMLElement | null>(null);

  /**
   * Rows between the dragged row's old slot and the one it is over slide by a
   * full slot, in whichever direction closes the space it left behind.
   */
  function shiftFor(i: number): number {
    if (dragIndex === null || dropIndex === null || i === dragIndex) return 0;
    if (dropIndex < dragIndex && i >= dropIndex && i < dragIndex)
      return slotHeight;
    if (dropIndex > dragIndex && i > dragIndex && i <= dropIndex)
      return -slotHeight;
    return 0;
  }

  function startReorder(e: PointerEvent, bucket: DegreeBucket): void {
    if (e.button !== 0 || editingId === bucket.id) return;
    const row = (e.currentTarget as HTMLElement).closest<HTMLElement>(
      '.bucket-config-row',
    );
    const list = listEl;
    if (!row || !list) return;

    e.preventDefault();
    // Capture so the release still reaches us outside the window.
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);

    const rows = [...list.querySelectorAll<HTMLElement>('.bucket-config-row')];
    const index = rows.indexOf(row);
    const startY = e.clientY;

    // Layout coordinates, not viewport rects: the list is the offsetParent, so
    // these ignore both the drag transform and any scrolling underneath us.
    const tops = rows.map(r => r.offsetTop);
    const heights = rows.map(r => r.offsetHeight);
    const mids = tops.map((t, i) => t + heights[i] / 2);

    dragId = bucket.id;
    dragDy = 0;
    dropIndex = index;
    dragIndex = index;
    // Row pitch (height + gap), taken from the neighbour when there is one.
    slotHeight =
      rows.length > 1
        ? Math.abs(
            index === 0 ? tops[1] - tops[0] : tops[index] - tops[index - 1],
          )
        : heights[index];

    const onMove = (ev: PointerEvent) => {
      // Clamp so the row can never leave the list box.
      const min = -tops[index];
      const max = list.clientHeight - (tops[index] + heights[index]);
      dragDy = Math.max(min, Math.min(max, ev.clientY - startY));

      // Land in whichever slot the row's own midpoint now sits in. `<=` matters
      // at the clamped extremes, where the midpoints coincide exactly.
      const mid = mids[index] + dragDy;
      let next = rows.length - 1;
      for (let i = 0; i < rows.length; i++) {
        if (mid <= mids[i]) {
          next = i;
          break;
        }
      }
      dropIndex = next;
    };

    const onUp = () => {
      handle.releasePointerCapture?.(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (dropIndex !== null && dropIndex !== index) {
        const ids = buckets.map(b => b.id);
        const [moved] = ids.splice(index, 1);
        ids.splice(dropIndex, 0, moved);
        degreeBucketService.reorder(ids);
      }
      dragId = null;
      dragDy = 0;
      dropIndex = null;
      dragIndex = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function targetLabel(bucket: DegreeBucket): string {
    if (bucket.creditsRequired !== null)
      return `${bucket.creditsRequired} credits`;
    if (bucket.coursesRemaining !== null)
      return `${bucket.coursesRemaining} courses`;
    return 'No target';
  }
</script>

<Modal
  typeId="bucket-config"
  title="Configure buckets"
  showHeader
  dialogClass="bucket-config-dialog"
  {onRequestClose}
>
  {#snippet children(close)}
    <div class="modal-body">
      <p class="modal-text">
        Buckets are where you place the courses from your schedule. Reorder them
        by dragging, and edit or delete any of them - including the ones your
        Workday import created.
      </p>

      <div class="bucket-config-list" role="list" bind:this={listEl}>
        {#each buckets as bucket, i (bucket.id)}
          <div
            class="bucket-config-row"
            class:is-dragging={dragId === bucket.id}
            role="listitem"
            data-bucket-id={bucket.id}
            animate:flip={{ duration: dur(200) }}
            style:transform={dragId === bucket.id
              ? `translateY(${dragDy}px)`
              : shiftFor(i)
                ? `translateY(${shiftFor(i)}px)`
                : undefined}
          >
            <span
              class="bucket-config-handle"
              aria-hidden="true"
              onpointerdown={e => startReorder(e, bucket)}>⠿</span
            >

            {#if editingId === bucket.id}
              <div class="bucket-config-edit">
                <TextField
                  bind:value={draftName}
                  ariaLabel="Bucket name"
                  placeholder="Bucket name"
                  autofocus
                  onkeydown={e => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') editingId = null;
                  }}
                />
                <TextField
                  bind:value={draftCredits}
                  type="number"
                  min={0}
                  ariaLabel="Credits required"
                  placeholder="Credits"
                  onkeydown={e => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') editingId = null;
                  }}
                />
                <button
                  type="button"
                  class="modal-btn btn-primary"
                  onclick={commitEdit}>Save</button
                >
                <button
                  type="button"
                  class="modal-btn btn-secondary"
                  onclick={() => (editingId = null)}>Cancel</button
                >
              </div>
            {:else}
              <span class="bucket-config-name">{bucket.name}</span>
              <span class="bucket-config-target">{targetLabel(bucket)}</span>
              {#if bucket.source === 'custom'}
                <span class="course-badge">Custom</span>
              {/if}
              <button
                type="button"
                class="bucket-config-action"
                aria-label="Edit {bucket.name}"
                onclick={() => startEdit(bucket)}>Edit</button
              >
              <button
                type="button"
                class="bucket-config-action is-danger"
                aria-label="Delete {bucket.name}"
                onclick={() => remove(bucket)}>Delete</button
              >
            {/if}
          </div>
        {:else}
          <p class="empty-state">No buckets yet.</p>
        {/each}
      </div>

      {#if adding}
        <div class="bucket-config-add">
          <TextField
            bind:value={newName}
            label="Bucket name"
            id="new-bucket-name"
            placeholder="e.g. Robotics minor"
            autofocus
            onkeydown={e => {
              if (e.key === 'Enter') submitNew();
            }}
          />
          <TextField
            bind:value={newCredits}
            type="number"
            min={0}
            label="Credits required"
            hint="Leave blank if this bucket has no credit target."
            placeholder="e.g. 9"
          />
          <TextField
            bind:value={newDepartments}
            label="Departments"
            hint="Comma-separated codes used by “Browse courses”, e.g. RBE, ME."
            placeholder="Optional"
          />
          <div class="bucket-config-add-actions">
            <button
              type="button"
              class="modal-btn btn-primary"
              id="bucket-config-save-btn"
              disabled={!newName.trim()}
              onclick={submitNew}>Add bucket</button
            >
            <button
              type="button"
              class="modal-btn btn-secondary"
              onclick={() => (adding = false)}>Cancel</button
            >
          </div>
        </div>
      {:else}
        <button
          type="button"
          class="modal-btn btn-secondary bucket-config-add-btn"
          id="bucket-config-add-btn"
          onclick={() => (adding = true)}>+ Add bucket</button
        >
      {/if}
    </div>

    <div class="modal-footer">
      <button type="button" class="modal-btn btn-primary" onclick={close}
        >Done</button
      >
    </div>
  {/snippet}
</Modal>
