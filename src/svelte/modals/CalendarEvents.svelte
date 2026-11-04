<script lang="ts">
  import Modal from './Modal.svelte';
  import { appState } from '../../core/state/appState.svelte';
  import { localEventService } from '../../services/scheduling/localEventService';
  import { EventType } from '../../types/schedule';
  import {
    sortEvents,
    timeRangeLabel,
    whenLabel,
  } from '../../utils/localEventFormat';
  import { getInlineSVG } from '../../utils/iconPaths';
  import styles from '../../styles/components/calendar-events-modal.module.css';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const events = $derived(
    sortEvents(appState.activeSchedule?.localEvents ?? []),
  );

  // Ticked rows, by id. Replaced, never mutated ($state.raw). Ids of events
  // that have since been deleted are ignored via `chosen`.
  let ticked = $state.raw<ReadonlySet<string>>(new Set());
  const chosen = $derived(events.filter(e => ticked.has(e.id)));
  const allChosen = $derived(
    events.length > 0 && chosen.length === events.length,
  );

  function toggle(id: string): void {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    ticked = next;
  }
  function toggleAll(): void {
    ticked = allChosen ? new Set() : new Set(events.map(e => e.id));
  }

  function deleteChosen(): void {
    localEventService.confirmDelete(chosen);
  }
</script>

<Modal
  typeId="calendar-events"
  title="Calendar Events"
  showHeader
  dialogClass="calendar-events-dialog"
  onFileDrop={file => void localEventService.importFile(file)}
  {onRequestClose}
>
  {#snippet children(close)}
    <div class="modal-body {styles.body}">
      <div class={styles.actions}>
        <button
          type="button"
          id="add-event-btn"
          class="modal-btn btn-primary"
          onclick={() => localEventService.openAddModal()}
        >
          {@html getInlineSVG('CALENDAR_REPEAT', 'btn-icon')}
          Add event
        </button>
        <button
          type="button"
          id="import-ics-btn"
          class="modal-btn btn-secondary"
          onclick={() => localEventService.openImportModal()}
        >
          {@html getInlineSVG('CALENDAR_DOWN', 'btn-icon')}
          Import from calendar (.ics)
        </button>
      </div>

      {#if events.length === 0}
        <p class={styles.empty} data-empty>
          Add the times you can't take classes, like a work shift or practice,
          and Auto-Schedule will keep them free. You can also drop a calendar
          file here.
        </p>
      {:else}
        <div class={styles.toolbar}>
          <label class={styles['select-all']}>
            <input
              type="checkbox"
              checked={allChosen}
              indeterminate={chosen.length > 0 && !allChosen}
              onchange={toggleAll}
            />
            <span>
              {chosen.length > 0
                ? `${chosen.length} of ${events.length} selected`
                : `${events.length} ${events.length === 1 ? 'event' : 'events'}`}
            </span>
          </label>
          <button
            type="button"
            class="modal-btn btn-danger"
            disabled={chosen.length === 0}
            onclick={deleteChosen}
          >
            Delete selected ({chosen.length})
          </button>
        </div>
        <ul class={styles.list}>
          {#each events as event (event.id)}
            {@const oneTime = event.eventType === EventType.ONE_TIME}
            <li class={styles.row} data-event-row data-title={event.title}>
              <input
                type="checkbox"
                aria-label="Select {event.title}"
                checked={ticked.has(event.id)}
                onchange={() => toggle(event.id)}
              />
              <div class={styles['row-main']}>
                <span class={styles['row-title']}>
                  {event.title}
                  {#if oneTime}<span class={styles.tag}>One-time</span>{/if}
                </span>
                {#if event.description}
                  <span class={styles.description}>{event.description}</span>
                {/if}
                <span class={styles['row-meta']}>
                  <span>{whenLabel(event)}</span>
                  <span>{timeRangeLabel(event.startTime, event.endTime)}</span>
                  {#if !oneTime}
                    <span class={styles.badges}>
                      {#each event.terms ?? [] as t (t)}
                        <span class={styles.badge} data-term-badge>{t}</span>
                      {/each}
                    </span>
                  {/if}
                </span>
                {#if oneTime}
                  <span class={styles.note}>
                    Not drawn on the weekly grids; included when you export to a
                    calendar.
                  </span>
                {/if}
              </div>
              <button
                type="button"
                class={styles['edit-btn']}
                aria-label="Edit {event.title}"
                onclick={() => localEventService.openEditModal(event.id)}
              >
                Edit
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="modal-footer">
      <button class="modal-btn btn-secondary" onclick={close}>Done</button>
    </div>
  {/snippet}
</Modal>
