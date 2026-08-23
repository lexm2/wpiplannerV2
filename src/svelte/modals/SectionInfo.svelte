<script lang="ts">
  import Modal from './Modal.svelte';
  import Field from '../ui/Field.svelte';
  import { scaleFade } from '../transitions';
  import { modalState } from './modalState.svelte';
  import { rateMyProfessorService } from '../../services/external/RateMyProfessorService';
  import { getInlineSVG } from '../../utils/iconPaths';
  import {
    getPeriodTypeClass,
    getPeriodTypeLabel,
  } from '../../utils/periodType';
  import { componentWizardService } from '../../services/scheduling/componentWizardService';
  import type { Period } from '../../types/types';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const data = $derived(modalState.sectionInfo);

  // Professor list with RMP links - mirrors generateModalBody.
  interface ProfessorLink {
    name: string;
    rmpUrl: string | null;
  }
  const professors = $derived.by<ProfessorLink[]>(() => {
    if (!data) return [];
    const names = [
      ...new Set(
        data.section.periods.map(p => p.professor).filter(p => p && p.trim()),
      ),
    ];
    return names.map(name => ({
      name,
      rmpUrl: rateMyProfessorService.getProfessorRMPUrl(name),
    }));
  });

  const creditsDisplay = $derived(
    data
      ? data.course.minCredits === data.course.maxCredits
        ? `${data.course.minCredits}`
        : `${data.course.minCredits}-${data.course.maxCredits}`
      : '',
  );

  const isAvailable = $derived(!!data && data.section.seatsAvailable > 0);
  const enrollmentClass = $derived(
    isAvailable
      ? 'section-enrollment-indicator--available'
      : 'section-enrollment-indicator--full',
  );
  const enrollmentText = $derived(
    data
      ? isAvailable
        ? `${data.section.seatsAvailable} seats available`
        : 'Full'
      : '',
  );

  function isAsyncPeriod(period: Period): boolean {
    return (
      !!period.isAsync ||
      (period.startTime.displayTime === '12:00 PM' &&
        period.endTime.displayTime === '12:00 PM')
    );
  }

  function periodDays(period: Period): string {
    return Array.from(period.days).sort().join(', ').toUpperCase();
  }

  function periodTime(period: Period): string {
    return `${period.startTime.displayTime} - ${period.endTime.displayTime}`;
  }

  function periodLocation(period: Period): string {
    return period.building && period.room
      ? `${period.building} ${period.room}`
      : period.location || 'TBA';
  }

  function onColorInput(event: Event): void {
    data?.onColorChange?.((event.target as HTMLInputElement).value);
  }

  function changeSections(close: () => void): void {
    if (!data) return;
    componentWizardService.openComponentWizard(data.course);
    close();
  }
</script>

{#if data}
  <Modal
    typeId="section-info"
    title={`${data.courseCode} - ${data.courseName}`}
    showHeader
    extraClass="section-info-modal"
    {onRequestClose}
  >
    {#snippet children(close)}
      <div class="modal-body">
        <div class="section-modal-content">
          <button
            class="section-change-btn"
            onclick={() => changeSections(close)}
          >
            {@html getInlineSVG('WAND', 'section-change-btn-icon')}
            <span>Change Sections</span>
          </button>

          <div
            class="section-card section-card--primary"
            in:scaleFade|global={{ duration: 300 }}
          >
            <div class="section-card-header">
              {@html getInlineSVG('BOOKMARK', 'section-card-header-icon')}
              <span class="section-card-header-label">Section Overview</span>
            </div>
            <div class="section-card-content">
              <div class="section-info-grid">
                <div class="section-info-item">
                  <span class="section-info-label">Professor</span>
                  <span class="section-info-value">
                    {#if professors.length > 0}
                      {#each professors as prof, i (i)}
                        {#if i > 0},
                        {/if}
                        {#if prof.rmpUrl}
                          <a
                            href={prof.rmpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="professor-link">{prof.name}</a
                          >
                        {:else}
                          {prof.name}
                        {/if}
                      {/each}
                    {:else}
                      TBA
                    {/if}
                  </span>
                </div>
                <div class="section-info-item">
                  <span class="section-info-label">Section</span>
                  <span class="section-info-value">{data.section.number}</span>
                </div>
                <div class="section-info-item">
                  <span class="section-info-label">CRN</span>
                  <span class="section-info-value">{data.section.crn}</span>
                </div>
                <div class="section-info-item">
                  <span class="section-info-label">Credits</span>
                  <span class="section-info-value">{creditsDisplay}</span>
                </div>
                <Field
                  label="Color"
                  controlId="section-info-color"
                  fieldClass="section-info-item"
                >
                  <div class="section-color-inline">
                    <input
                      type="color"
                      id="section-info-color"
                      class="section-color-input"
                      value={data.currentColor}
                      onchange={onColorInput}
                    />
                  </div>
                </Field>
              </div>
              <div class="section-enrollment-badge">
                <span class="section-enrollment-indicator {enrollmentClass}">
                  <span class="section-enrollment-dot"></span>
                  {enrollmentText}
                </span>
                {#if data.section.maxWaitlist > 0}
                  <span class="section-enrollment-waitlist"
                    >Waitlist: {data.section.actualWaitlist}/{data.section
                      .maxWaitlist}</span
                  >
                {/if}
              </div>
            </div>
          </div>

          <div
            class="section-card section-card--schedule"
            in:scaleFade|global={{ duration: 300 }}
          >
            <div class="section-card-header">
              {@html getInlineSVG('CLOCK', 'section-card-header-icon')}
              <span class="section-card-header-label">Meeting Times</span>
            </div>
            <div class="section-card-content">
              <div class="section-periods-list">
                {#each data.section.periods as period, i (i)}
                  {#if isAsyncPeriod(period)}
                    <div class="section-period section-period--async">
                      <div
                        class="section-period-type {getPeriodTypeClass(
                          period.type,
                        )}"
                      >
                        {getPeriodTypeLabel(period.type)}
                      </div>
                      <div class="section-period-details">
                        <div class="section-card-async-badge">
                          {@html getInlineSVG('CLOCK', 'async-icon')}
                          <span>Asynchronous</span>
                        </div>
                      </div>
                    </div>
                  {:else}
                    <div class="section-period">
                      <div
                        class="section-period-type {getPeriodTypeClass(
                          period.type,
                        )}"
                      >
                        {getPeriodTypeLabel(period.type)}
                      </div>
                      <div class="section-period-details">
                        <div class="section-period-schedule">
                          {periodDays(period)}
                          {periodTime(period)}
                        </div>
                        <div class="section-period-location">
                          {periodLocation(period)}
                        </div>
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          </div>

          {#if data.section.note}
            <div
              class="section-card section-card--note"
              in:scaleFade|global={{ duration: 300 }}
            >
              <div class="section-card-header">
                <span class="section-card-header-label">Section Note</span>
              </div>
              <div class="section-card-content">
                <p class="section-note-text">{data.section.note}</p>
              </div>
            </div>
          {/if}
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn btn-primary" onclick={close}>Close</button>
      </div>
    {/snippet}
  </Modal>
{/if}
