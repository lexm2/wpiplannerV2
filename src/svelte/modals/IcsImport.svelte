<script lang="ts">
  import Modal from './Modal.svelte';
  import { modalState } from './modalState.svelte';
  import { appState } from '../../core/state/appState.svelte';
  import { localEventService } from '../../services/scheduling/localEventService';
  import type { LocalEventDraft } from '../../services/scheduling/localEventService';
  import {
    matchesExistingEvent,
    WEEKLY_THRESHOLD,
  } from '../../services/scheduling/weeklyEventDetection';
  import type {
    IcsImportResult,
    WeeklyEventCandidate,
  } from '../../services/scheduling/weeklyEventDetection';
  import { EventType } from '../../types/schedule';
  import { DayOfWeek } from '../../types/types';
  import { TimeUtils } from '../../utils/timeUtils';
  import { getInlineSVG } from '../../utils/iconPaths';
  import styles from '../../styles/components/ics-import-modal.module.css';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const payload = $derived(modalState.icsImport ?? { status: 'idle' as const });

  const DAY_NAMES: Partial<Record<DayOfWeek, string>> = {
    [DayOfWeek.MONDAY]: 'Mon',
    [DayOfWeek.TUESDAY]: 'Tue',
    [DayOfWeek.WEDNESDAY]: 'Wed',
    [DayOfWeek.THURSDAY]: 'Thu',
    [DayOfWeek.FRIDAY]: 'Fri',
  };
  const percent = Math.round(WEEKLY_THRESHOLD * 100);

  let fileInput: HTMLInputElement | undefined = $state();
  let dragging = $state(false);

  // Candidates the user switched off. Replaced, never mutated, so $state.raw
  // sees every change; reset whenever a new result arrives.
  let unchecked = $state.raw<ReadonlySet<string>>(new Set());
  let resultSeen: IcsImportResult | null = null;
  $effect(() => {
    const p = payload;
    const result = p.status === 'ready' ? p.result : null;
    if (result === resultSeen) return;
    resultSeen = result;
    unchecked = new Set();
  });

  const existingEvents = $derived(appState.activeSchedule?.localEvents ?? []);
  function isAdded(c: WeeklyEventCandidate): boolean {
    return existingEvents.some(e => matchesExistingEvent(c, e));
  }

  const candidates = $derived(
    payload.status === 'ready' ? payload.result.candidates : [],
  );
  const addable = $derived(candidates.filter(c => !isAdded(c)));
  const selected = $derived(addable.filter(c => !unchecked.has(c.key)));

  function toggle(key: string): void {
    const next = new Set(unchecked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    unchecked = next;
  }
  function setAll(on: boolean): void {
    unchecked = on ? new Set() : new Set(addable.map(c => c.key));
  }

  function yearLabel(year: number): string {
    return `${year}–${String(year + 1).slice(2)}`;
  }

  function monthYear(iso: string): string {
    const [y, m] = iso.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }

  function dayList(c: WeeklyEventCandidate): string {
    return c.days.map(d => DAY_NAMES[d] ?? d).join(', ');
  }

  function timeRange(c: WeeklyEventCandidate): string {
    return TimeUtils.formatTimeRange(
      { ...c.startTime, displayTime: '' },
      { ...c.endTime, displayTime: '' },
    );
  }

  function coverageText(c: WeeklyEventCandidate): string {
    return c.terms
      .map(t => {
        const cov = c.coverage[t as 'A' | 'B' | 'C' | 'D'];
        return cov ? `${t}: ${cov.met} of ${cov.possible} weeks` : t;
      })
      .join(' · ');
  }

  function skippedText(result: IcsImportResult, year: number): string {
    const s = result.skipped;
    const parts: Array<[number, string]> = [
      [s.occasional, `occasional (not weekly for ${percent}% of a term)`],
      [s.weekend, 'weekend only (the schedule shows weekdays)'],
      [s.allDay, 'all-day'],
      [s.outsideTerms, `not during the ${yearLabel(year)} terms`],
      [s.cancelled, 'cancelled'],
      [s.overnight, 'overnight'],
      [s.tooDense, 'repeating too often to import'],
    ];
    const shown = parts.filter(([n]) => n > 0).map(([n, t]) => `${n} ${t}`);
    return shown.length ? `Not added: ${shown.join(', ')}` : '';
  }

  function foundText(p: { fileName: string; year: number }): string {
    const n = candidates.length;
    return `Found ${n} weekly ${n === 1 ? 'event' : 'events'} in ${p.fileName} for the ${yearLabel(p.year)} terms`;
  }

  function pick(): void {
    fileInput?.click();
  }

  function onPicked(): void {
    const file = fileInput?.files?.[0];
    if (fileInput) fileInput.value = '';
    if (file) void localEventService.importFile(file);
  }

  function hasFiles(e: DragEvent): boolean {
    return !!e.dataTransfer?.types.includes('Files');
  }
  function onDragOver(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragging = true;
  }
  function onDrop(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) void localEventService.importFile(file);
  }

  function add(close: () => void): void {
    // Fresh plain objects: a $state proxy or a Set can't be structured-cloned
    // by the storage worker, and one in persisted state stops every save.
    const drafts: LocalEventDraft[] = selected.map(c => ({
      title: c.title,
      description: c.location || undefined,
      eventType: EventType.RECURRING,
      days: [...c.days],
      terms: [...c.terms],
      startTime: { hours: c.startTime.hours, minutes: c.startTime.minutes },
      endTime: { hours: c.endTime.hours, minutes: c.endTime.minutes },
      visible: true,
    }));
    localEventService.addMany(drafts);
    close();
  }
</script>

<Modal
  typeId="ics-import"
  title="Import Calendar"
  showHeader
  dialogClass="ics-import-dialog"
  {onRequestClose}
>
  {#snippet children(close)}
    <input
      bind:this={fileInput}
      type="file"
      accept=".ics,text/calendar"
      class={styles['hidden-input']}
      aria-label="Calendar file"
      data-ics-input
      onchange={onPicked}
    />
    <div class="modal-body {styles.body}">
      {#if payload.status === 'idle' || payload.status === 'error'}
        {#if payload.status === 'error'}
          <p class={styles.error} role="alert">
            {#if payload.fileName}<strong>{payload.fileName}:</strong>
            {/if}{payload.message}
          </p>
        {/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class={[styles['drop-zone'], dragging && styles.dragging]}
          ondragover={onDragOver}
          ondragleave={() => (dragging = false)}
          ondrop={onDrop}
        >
          {@html getInlineSVG('CALENDAR_DOWN', 'drop-icon')}
          <span class={styles['drop-title']}>Drop an .ics file here</span>
          <button type="button" class="modal-btn btn-primary" onclick={pick}>
            Choose file
          </button>
        </div>
        <ul class={styles.help}>
          <li>
            <strong>Google Calendar:</strong> Settings, Import &amp; export, Export.
            Unzip the download.
          </li>
          <li>
            <strong>Outlook:</strong> Save calendar, or Export as .ics.
          </li>
          <li>
            <strong>Apple Calendar:</strong> File, Export, Export&hellip;
          </li>
        </ul>
      {:else if payload.status === 'parsing'}
        <p class={styles.status} role="status">
          Reading {payload.fileName}&hellip;
        </p>
      {:else}
        {@const result = payload.result}
        {@const skipped = skippedText(result, payload.year)}
        {#if candidates.length > 0}
          <p class={styles.summary}>{foundText(payload)}</p>
          <p class={styles.rule}>
            Events that repeat on the same day and time for at least {percent}%
            of a term's weeks are added to those terms.
          </p>
          {#if addable.length > 1}
            <div class={styles['select-row']}>
              <span>{selected.length} of {addable.length} selected</span>
              <span>
                <button
                  type="button"
                  class={styles['link-btn']}
                  onclick={() => setAll(true)}>Select all</button
                >
                &middot;
                <button
                  type="button"
                  class={styles['link-btn']}
                  onclick={() => setAll(false)}>None</button
                >
              </span>
            </div>
          {/if}
          <ul class={styles.list}>
            {#each candidates as c (c.key)}
              {@const added = isAdded(c)}
              <li>
                <label
                  class={[styles.row, added && styles.disabled]}
                  data-candidate={c.title}
                  title={coverageText(c)}
                >
                  <input
                    type="checkbox"
                    checked={!added && !unchecked.has(c.key)}
                    disabled={added}
                    onchange={() => toggle(c.key)}
                  />
                  <span class={styles['row-main']}>
                    <span class={styles['row-title']}>
                      {c.title}
                      {#if c.location}<span class={styles.location}
                          >{c.location}</span
                        >{/if}
                      {#if added}<span class={styles.tag}>Already added</span
                        >{/if}
                    </span>
                    <span class={styles['row-meta']}>
                      <span>{dayList(c)}</span>
                      <span>{timeRange(c)}</span>
                      <span class={styles.badges}>
                        {#each c.terms as t (t)}
                          <span class={styles.badge} data-term-badge>{t}</span>
                        {/each}
                      </span>
                    </span>
                    <span class={styles.coverage}>{coverageText(c)}</span>
                  </span>
                </label>
              </li>
            {/each}
          </ul>
        {:else}
          <p class={styles.summary}>
            No weekly events were found for the {yearLabel(payload.year)} terms.
          </p>
          <p class={styles.rule}>
            Events that repeat on the same day and time for at least {percent}%
            of a term's weeks are added to those terms.
          </p>
          {#if result.span}
            <p class={styles.span}>
              This file's events run {monthYear(result.span.first)} &ndash; {monthYear(
                result.span.last,
              )}.
            </p>
          {/if}
        {/if}
        {#if skipped}
          <p class={styles.skipped}>{skipped}</p>
        {/if}
      {/if}
    </div>
    <div class="modal-footer">
      <button class="modal-btn btn-secondary" onclick={close}>Cancel</button>
      {#if payload.status === 'ready'}
        <button
          class="modal-btn {candidates.length > 0
            ? 'btn-secondary'
            : 'btn-primary'}"
          onclick={pick}
        >
          Choose another file
        </button>
        {#if candidates.length > 0}
          <button
            class="modal-btn btn-primary"
            disabled={selected.length === 0}
            onclick={() => add(close)}
          >
            {@html getInlineSVG('CHECK', 'btn-icon')}
            Add {selected.length}
            {selected.length === 1 ? 'event' : 'events'}
          </button>
        {/if}
      {/if}
    </div>
  {/snippet}
</Modal>
