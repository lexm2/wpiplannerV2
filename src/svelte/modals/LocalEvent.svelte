<script lang="ts">
  import Modal from './Modal.svelte';
  import { modalState } from './modalState.svelte';
  import type { LocalCalendarEvent } from '../../types/schedule';
  import { AcademicTerm, EventType } from '../../types/schedule';
  import { DayOfWeek } from '../../types/types';
  import { getInlineSVG } from '../../utils/iconPaths';
  import styles from '../../styles/components/local-event-modal.module.css';
  import Field from '../ui/Field.svelte';
  import TextField from '../ui/TextField.svelte';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const payload = $derived(modalState.localEvent);

  interface DayOption { value: DayOfWeek; label: string; short: string; }
  const WEEKDAYS: DayOption[] = [
    { value: DayOfWeek.MONDAY, label: 'Monday', short: 'M' },
    { value: DayOfWeek.TUESDAY, label: 'Tuesday', short: 'T' },
    { value: DayOfWeek.WEDNESDAY, label: 'Wednesday', short: 'W' },
    { value: DayOfWeek.THURSDAY, label: 'Thursday', short: 'T' },
    { value: DayOfWeek.FRIDAY, label: 'Friday', short: 'F' },
  ];
  const TERMS = ['A', 'B', 'C', 'D'];

  function formatTime(hours: number, minutes: number): string {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  function parseTime(value: string): { hours: number; minutes: number } {
    const [hours, minutes] = value.split(':').map(Number);
    return { hours: hours || 0, minutes: minutes || 0 };
  }
  function todayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  const existing = $derived(payload?.existingEvent);
  const isEditMode = $derived(!!existing);

  // Form state, initialised from the existing event (edit) or defaults (add).
  // Keyed on payload identity so opening the modal afresh re-seeds the fields.
  let title = $state('');
  let description = $state('');
  let eventType = $state<EventType>(EventType.RECURRING);
  let date = $state(todayDate());
  let startTime = $state('09:00');
  let endTime = $state('10:00');
  let selectedDays = $state<Set<DayOfWeek>>(new Set([DayOfWeek.MONDAY]));
  let selectedTerms = $state<Set<string>>(new Set(TERMS));

  // Error flags. Each drives the `error` prop on its surrounding Field.
  let titleError = $state(false);
  let dayError = $state(false);
  let termError = $state(false);
  let dateError = $state(false);
  let endError = $state(false);

  // Re-seed whenever a (new) payload arrives.
  let seededFor: object | null = null;
  $effect(() => {
    const p = payload;
    if (!p || p === seededFor) return;
    seededFor = p;
    const ev = p.existingEvent;
    title = ev?.title ?? '';
    description = ev?.description ?? '';
    eventType = ev?.eventType ?? EventType.RECURRING;
    date = ev?.date ?? todayDate();
    startTime = ev?.startTime ? formatTime(ev.startTime.hours, ev.startTime.minutes) : '09:00';
    endTime = ev?.endTime ? formatTime(ev.endTime.hours, ev.endTime.minutes) : '10:00';
    selectedDays = new Set(ev?.days?.length ? ev.days : [DayOfWeek.MONDAY]);
    selectedTerms = new Set(ev?.terms?.length ? ev.terms : TERMS);
    titleError = dayError = termError = dateError = endError = false;
  });

  function toggleDay(day: DayOfWeek): void {
    const next = new Set(selectedDays);
    if (next.has(day)) {
      if (next.size > 1) next.delete(day); // keep at least one
    } else {
      next.add(day);
    }
    selectedDays = next;
    dayError = false;
  }

  function toggleTerm(term: string): void {
    const next = new Set(selectedTerms);
    if (next.has(term)) next.delete(term); else next.add(term);
    selectedTerms = next;
    termError = false;
  }

  function validate(): boolean {
    titleError = !title.trim();
    if (titleError) return false;

    if (eventType === EventType.RECURRING) {
      dayError = selectedDays.size === 0;
      if (dayError) return false;
      termError = selectedTerms.size === 0;
      if (termError) return false;
    } else {
      dateError = !date;
      if (dateError) return false;
    }

    const s = parseTime(startTime);
    const e = parseTime(endTime);
    endError = (e.hours * 60 + e.minutes) <= (s.hours * 60 + s.minutes);
    if (endError) return false;

    return true;
  }

  function save(close: () => void): void {
    if (!payload || !validate()) return;

    const eventData: Omit<LocalCalendarEvent, 'id' | 'createdAt' | 'updatedAt'> = {
      title: title.trim(),
      description: description.trim() || undefined,
      eventType,
      startTime: parseTime(startTime),
      endTime: parseTime(endTime),
      visible: true,
    };

    if (eventType === EventType.ONE_TIME) {
      eventData.date = date;
    } else {
      eventData.days = Array.from(selectedDays);
      eventData.terms = Array.from(selectedTerms) as AcademicTerm[];
    }

    payload.onSave(eventData);
    close();
  }

  function onTitleKeydown(e: KeyboardEvent, close: () => void): void {
    if (e.key === 'Enter') { e.preventDefault(); save(close); }
  }
</script>

{#if payload}
  <Modal typeId="local-event" title={isEditMode ? 'Edit Event' : 'Add Event'} showHeader {onRequestClose}>
    {#snippet children(close)}
      <div class="modal-body {styles['local-event-form']}" data-type={eventType}>
        <TextField
          id="event-title"
          label="Title"
          required
          autofocus
          placeholder="Event title"
          error={titleError ? 'Enter a title.' : undefined}
          bind:value={title}
          oninput={() => (titleError = false)}
          onkeydown={(e) => onTitleKeydown(e, close)}
        />

        <TextField
          id="event-description"
          label="Description"
          multiline
          placeholder="Optional description"
          bind:value={description}
        />

        <Field group label="Event Type" controlId="event-type" fieldClass={styles.hug}>
          {#snippet children()}
            <div class={styles['event-type-selector']}>
              <button
                type="button"
                class={styles['event-type-option']}
                class:selected={eventType === EventType.ONE_TIME}
                onclick={() => (eventType = EventType.ONE_TIME)}
              >
                {@html getInlineSVG('CALENDAR_DOWN', 'type-icon')}
                One-time
              </button>
              <button
                type="button"
                class={styles['event-type-option']}
                class:selected={eventType === EventType.RECURRING}
                onclick={() => (eventType = EventType.RECURRING)}
              >
                {@html getInlineSVG('CALENDAR_REPEAT', 'type-icon')}
                Recurring
              </button>
            </div>
          {/snippet}
        </Field>

        {#if eventType === EventType.ONE_TIME}
          <div class={styles['one-time-fields']}>
            <TextField
              id="event-date"
              type="date"
              label="Date"
              error={dateError ? 'Pick a date.' : undefined}
              bind:value={date}
              oninput={() => (dateError = false)}
            />
          </div>
        {:else}
          <div class={styles['recurring-fields']}>
            <Field
              group
              required
              label="Days"
              controlId="event-days"
              error={dayError ? 'Pick at least one day.' : undefined}
            >
              {#snippet children()}
                <div class={styles['day-selector']}>
                  {#each WEEKDAYS as day}
                    <button
                      type="button"
                      class={styles['day-pill']}
                      class:selected={selectedDays.has(day.value)}
                      title={day.label}
                      onclick={() => toggleDay(day.value)}
                    >
                      {day.short}
                    </button>
                  {/each}
                </div>
              {/snippet}
            </Field>

            <Field
              group
              label="Terms"
              controlId="event-terms"
              error={termError ? 'Pick at least one term.' : undefined}
            >
              {#snippet children()}
                <div class={styles['event-term-checkboxes']}>
                  {#each TERMS as term}
                    <label class={styles['event-term-label']}>
                      <span class={styles['event-term-text']}>Term {term}</span>
                      <input
                        type="checkbox"
                        class={styles['event-term-toggle']}
                        name="terms"
                        value={term}
                        checked={selectedTerms.has(term)}
                        onchange={() => toggleTerm(term)}
                      />
                    </label>
                  {/each}
                </div>
              {/snippet}
            </Field>
          </div>
        {/if}

        <Field group label="Time" controlId="event-time" fieldClass={styles.hug}>
          {#snippet children()}
            <div class={styles['time-row']}>
              <TextField
                id="event-start"
                type="time"
                ariaLabel="Start time"
                fieldClass={styles['form-group-time']}
                bind:value={startTime}
              />
              <span class={styles['time-separator']}>to</span>
              <TextField
                id="event-end"
                type="time"
                ariaLabel="End time"
                fieldClass={styles['form-group-time']}
                error={endError ? 'End time must be after the start time.' : undefined}
                bind:value={endTime}
                oninput={() => (endError = false)}
              />
            </div>
          {/snippet}
        </Field>
      </div>
      <div class="modal-footer">
        <button class="modal-btn btn-secondary" onclick={close}>Cancel</button>
        <button class="modal-btn btn-primary" onclick={() => save(close)}>
          {@html getInlineSVG('CHECK', 'btn-icon')}
          {isEditMode ? 'Save Changes' : 'Add Event'}
        </button>
      </div>
    {/snippet}
  </Modal>
{/if}
