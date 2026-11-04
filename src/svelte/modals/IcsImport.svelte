<script lang="ts">
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import { modalState } from './modalState.svelte';
  import { appState } from '../../core/state/appState.svelte';
  import { uiState } from '../../services/ui/uiState.svelte';
  import { closeDrawer } from '../drawerState.svelte';
  import { localEventService } from '../../services/scheduling/localEventService';
  import type { LocalEventDraft } from '../../services/scheduling/localEventService';
  import {
    courseCodeInTitle,
    remainingAfterExisting,
    WEEKLY_THRESHOLD,
  } from '../../services/scheduling/weeklyEventDetection';
  import type {
    IcsImportResult,
    SkipReason,
    WeeklyEventCandidate,
  } from '../../services/scheduling/weeklyEventDetection';
  import { EventType } from '../../types/schedule';
  import { daysLabel, timeRangeLabel } from '../../utils/localEventFormat';
  import { getInlineSVG } from '../../utils/iconPaths';
  import styles from '../../styles/components/ics-import-modal.module.css';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const payload = $derived(modalState.icsImport ?? { status: 'idle' as const });

  const percent = Math.round(WEEKLY_THRESHOLD * 100);
  const RULE = `Events that meet on the same day and time in at least ${percent}% of a term's weeks are added to every week of that term.`;

  let fileInput: HTMLInputElement | undefined = $state();

  /** One line of the preview: what is new, what is partly there, what is done. */
  interface Row {
    key: string;
    cand: WeeklyEventCandidate;
    status: 'new' | 'partial' | 'added';
    /** Title names a course in the catalog. */
    course: boolean;
  }

  const existingEvents = $derived(appState.activeSchedule?.localEvents ?? []);

  function normCode(code: string): string {
    return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  const catalogCodes = $derived.by(() => {
    const codes = new Set<string>();
    for (const dept of appState.loadedDepartments) {
      for (const c of dept.courses) {
        codes.add(normCode(`${c.departmentAbbr}${c.number}`));
        for (const x of c.crossListedWith ?? []) codes.add(normCode(x));
      }
    }
    return codes;
  });
  function looksLikeCourse(title: string): boolean {
    const code = courseCodeInTitle(title);
    return !!code && catalogCodes.has(normCode(code));
  }

  const candidates = $derived(
    payload.status === 'ready' ? payload.result.candidates : [],
  );
  const rows = $derived.by((): Row[] => {
    const out: Row[] = [];
    for (const c of candidates) {
      const course = looksLikeCourse(c.title);
      const rest = remainingAfterExisting(c, existingEvents);
      if (rest.length === 0) {
        out.push({ key: c.key, cand: c, status: 'added', course });
      } else if (rest.length === 1 && rest[0].key === c.key) {
        out.push({ key: c.key, cand: c, status: 'new', course });
      } else {
        for (const r of rest) {
          out.push({ key: r.key, cand: r, status: 'partial', course });
        }
      }
    }
    return out;
  });
  const addable = $derived(rows.filter(r => r.status !== 'added'));

  // Rows the user switched off. Replaced, never mutated, so $state.raw sees
  // every change. A new result resets it to the course-like rows, which start
  // off: a student's calendar often holds their own classes.
  let unchecked = $state.raw<ReadonlySet<string>>(new Set());
  let resultSeen: IcsImportResult | null = null;
  $effect(() => {
    const p = payload;
    const result = p.status === 'ready' ? p.result : null;
    if (result === resultSeen) return;
    resultSeen = result;
    unchecked = new Set(
      untrack(() => rows)
        .filter(r => r.course && r.status !== 'added')
        .map(r => r.key),
    );
  });

  const selected = $derived(addable.filter(r => !unchecked.has(r.key)));

  function toggle(key: string): void {
    const next = new Set(unchecked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    unchecked = next;
  }
  function setAll(on: boolean): void {
    unchecked = on ? new Set() : new Set(addable.map(r => r.key));
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

  function coverageText(c: WeeklyEventCandidate): string {
    return c.terms
      .map(t => {
        const cov = c.coverage[t as 'A' | 'B' | 'C' | 'D'];
        if (!cov) return t;
        return cov.met < cov.possible
          ? `${t}: met ${cov.met} of ${cov.possible} weeks, blocks all ${cov.possible}`
          : `${t}: met ${cov.met} of ${cov.possible} weeks`;
      })
      .join(' · ');
  }

  // Why events were left out: how each reason reads in the summary line, and
  // how it heads its list of titles.
  const SKIP_REASONS: Array<{
    reason: SkipReason;
    summary: (year: string) => string;
    heading: (year: string) => string;
  }> = [
    {
      reason: 'occasional',
      summary: () => `not weekly for ${percent}% of a term`,
      heading: () => `Not weekly for ${percent}% of a term`,
    },
    {
      reason: 'weekend',
      summary: () => 'with weekend meetings left off',
      heading: () =>
        'Saturday/Sunday meetings left off (the schedule shows weekdays)',
    },
    {
      reason: 'outsideTerms',
      summary: y => `not during the ${y} terms`,
      heading: y => `Not during the ${y} terms`,
    },
    {
      reason: 'allDay',
      summary: () => 'all-day',
      heading: () => 'All-day events',
    },
    {
      reason: 'overnight',
      summary: () => 'overnight',
      heading: () => 'Overnight events',
    },
    {
      reason: 'cancelled',
      summary: () => 'cancelled',
      heading: () => 'Cancelled events',
    },
    {
      reason: 'tooDense',
      summary: () => 'too frequent to import',
      heading: () => 'Repeat too often to import',
    },
    {
      reason: 'unreadable',
      summary: () => "couldn't be read",
      heading: () => "Couldn't be read",
    },
    {
      reason: 'noLength',
      summary: () => 'with no end time',
      heading: () => 'No end time',
    },
    {
      reason: 'plannerExport',
      summary: () => "of your courses, from this planner's export",
      heading: () =>
        "Your courses from this planner's own export (already on your schedule)",
    },
  ];

  function skippedSummary(result: IcsImportResult, year: number): string {
    const label = yearLabel(year);
    const parts = SKIP_REASONS.filter(r => result.skipped[r.reason] > 0).map(
      r => `${result.skipped[r.reason]} ${r.summary(label)}`,
    );
    return parts.length ? `Not added: ${parts.join(', ')}` : '';
  }

  function skippedGroups(result: IcsImportResult, year: number) {
    const label = yearLabel(year);
    return SKIP_REASONS.filter(r => result.skipped[r.reason] > 0).map(r => {
      const titles = result.skippedTitles[r.reason] ?? [];
      return {
        reason: r.reason,
        heading: r.heading(label),
        count: result.skipped[r.reason],
        titles,
        more: Math.max(0, result.skipped[r.reason] - titles.length),
      };
    });
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

  function add(close: () => void): void {
    // Fresh plain objects: a $state proxy or a Set can't be structured-cloned
    // by the storage worker, and one in persisted state stops every save.
    const drafts: LocalEventDraft[] = selected.map(({ cand: c }) => ({
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
    // Launched by a drop on the grids: on a phone the Courses drawer may still
    // cover them. From the manager, the list underneath is the confirmation.
    if (!uiState.openModals.includes('calendar-events')) closeDrawer();
    close();
  }
</script>

<Modal
  typeId="ics-import"
  title="Import Calendar"
  showHeader
  dialogClass="ics-import-dialog"
  onFileDrop={file => void localEventService.importFile(file)}
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
        <p class={styles.rule}>
          Add work shifts, practices and club meetings from Google, Outlook or
          Apple Calendar. Classes are better added from Classes.
        </p>
        <div class={styles['drop-zone']}>
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
        {@const skipped = skippedSummary(result, payload.year)}
        {#snippet notAdded()}
          {#if skipped}
            <details class={styles.skipped} data-skipped>
              <summary>{skipped}</summary>
              <div class={styles['skipped-groups']}>
                {#each skippedGroups(result, payload.year) as g (g.reason)}
                  <div data-skip-reason={g.reason}>
                    <p class={styles['skipped-heading']}>
                      {g.heading} ({g.count})
                    </p>
                    {#if g.titles.length > 0}
                      <ul class={styles['skipped-titles']}>
                        {#each g.titles as title (title)}
                          <li>{title}</li>
                        {/each}
                        {#if g.more > 0}<li>and {g.more} more</li>{/if}
                      </ul>
                    {/if}
                  </div>
                {/each}
              </div>
            </details>
          {/if}
        {/snippet}
        {#if candidates.length > 0}
          <p class={styles.summary}>{foundText(payload)}</p>
          {@render notAdded()}
          <p class={styles.rule}>{RULE}</p>
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
            {#each rows as row (row.key)}
              {@const c = row.cand}
              {@const added = row.status === 'added'}
              <li>
                <label
                  class={[styles.row, added && styles.disabled]}
                  data-candidate={c.title}
                >
                  <input
                    type="checkbox"
                    checked={!added && !unchecked.has(row.key)}
                    disabled={added}
                    onchange={() => toggle(row.key)}
                  />
                  <span class={styles['row-main']}>
                    <span class={styles['row-title']}>
                      {c.title}
                      {#if c.location}<span class={styles.location}
                          >{c.location}</span
                        >{/if}
                      {#if added}<span class={styles.tag}>Already added</span
                        >{/if}
                      {#if row.status === 'partial'}<span class={styles.tag}
                          >Partly added</span
                        >{/if}
                      {#if row.course && !added}<span class={styles.tag}
                          >Looks like a course</span
                        >{/if}
                    </span>
                    <span class={styles['row-meta']}>
                      <span>{daysLabel(c.days)}</span>
                      <span>{timeRangeLabel(c.startTime, c.endTime)}</span>
                      <span class={styles.badges}>
                        {#each c.terms as t (t)}
                          <span class={styles.badge} data-term-badge>{t}</span>
                        {/each}
                      </span>
                    </span>
                    <span class={styles.coverage}>{coverageText(c)}</span>
                    {#if row.course && !added}
                      <span class={styles.coverage}>
                        Add this from Classes instead, where it shows its real
                        sections. You can still import it here.
                      </span>
                    {/if}
                  </span>
                </label>
              </li>
            {/each}
          </ul>
        {:else}
          <p class={styles.summary}>
            No weekly events were found for the {yearLabel(payload.year)} terms.
          </p>
          {@render notAdded()}
          <p class={styles.rule}>{RULE}</p>
          {#if result.span}
            <p class={styles.span}>
              This file's events run {monthYear(result.span.first)} &ndash; {monthYear(
                result.span.last,
              )}.
            </p>
          {/if}
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
            {#if addable.length === 0}
              Nothing new to add
            {:else}
              {@html getInlineSVG('CHECK', 'btn-icon')}
              Add {selected.length}
              {selected.length === 1 ? 'event' : 'events'}
            {/if}
          </button>
        {/if}
      {/if}
    </div>
  {/snippet}
</Modal>
