<script lang="ts">
  import Modal from './Modal.svelte';
  import { modalState } from './modalState.svelte';
  import type { LocalCalendarEvent } from '../../types/schedule';
  import { AcademicTerm, EventType } from '../../types/schedule';
  import { DayOfWeek } from '../../types/types';
  import { getInlineSVG } from '../../utils/iconPaths';
  import styles from '../../styles/components/local-event-modal.module.css';

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

  // Error flags (mirrors the vanilla form-error class toggles).
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
        <div class="form-group">
          <label for="event-title">Title <span class="required">*</span></label>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            id="event-title"
            class="form-input"
            class:form-error={titleError}
            placeholder="Event title"
            autofocus
            bind:value={title}
            oninput={() => (titleError = false)}
            onkeydown={(e) => onTitleKeydown(e, close)}
          />
        </div>

        <div class="form-group">
          <label for="event-description">Description</label>
          <textarea
            id="event-description"
            class="form-input form-textarea"
            placeholder="Optional description"
            bind:value={description}
          ></textarea>
        </div>

        <div class="form-group">
          <span class="form-label" id="event-type-label">Event Type</span>
          <div
            class={styles['event-type-selector']}
            role="group"
            aria-labelledby="event-type-label"
          >
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
        </div>

        {#if eventType === EventType.ONE_TIME}
          <div class={styles['one-time-fields']}>
            <div class="form-group">
              <label for="event-date">Date</label>
              <input
                type="date"
                id="event-date"
                class="form-input"
                class:form-error={dateError}
                bind:value={date}
                oninput={() => (dateError = false)}
              />
            </div>
          </div>
        {:else}
          <div class={styles['recurring-fields']}>
            <div class="form-group">
              <span class="form-label" id="event-days-label">Days <span class="required">*</span></span>
              <div
                class={styles['day-selector']}
                class:form-error={dayError}
                role="group"
                aria-labelledby="event-days-label"
              >
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
            </div>

            <div class="form-group">
              <span class="form-label" id="event-terms-label">Terms</span>
              <div
                class={styles['event-term-checkboxes']}
                class:form-error={termError}
                role="group"
                aria-labelledby="event-terms-label"
              >
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
            </div>
          </div>
        {/if}

        <div class="form-group">
          <span class="form-label" id="event-time-label">Time</span>
          <div class={styles['time-row']} role="group" aria-labelledby="event-time-label">
            <div class={styles['form-group-time']}>
              <input type="time" id="event-start" class="form-input" bind:value={startTime} />
            </div>
            <span class={styles['time-separator']}>to</span>
            <div class={styles['form-group-time']}>
              <input
                type="time"
                id="event-end"
                class="form-input"
                class:form-error={endError}
                bind:value={endTime}
                oninput={() => (endError = false)}
              />
            </div>
          </div>
        </div>
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
