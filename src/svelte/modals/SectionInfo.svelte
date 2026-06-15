<script lang="ts">
  import Modal from './Modal.svelte';
  import { modalState } from './modalState.svelte';
  import { rateMyProfessorService } from '../../services/external/RateMyProfessorService';
  import { getInlineSVG } from '../../utils/iconPaths';
  import type { PeriodType, Period } from '../../types/types';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  const data = $derived(modalState.sectionInfo);

  // Professor list with RMP links — mirrors generateModalBody.
  interface ProfessorLink { name: string; rmpUrl: string | null; }
  const professors = $derived.by<ProfessorLink[]>(() => {
    if (!data) return [];
    const names = [...new Set(data.section.periods.map(p => p.professor).filter(p => p && p.trim()))];
    return names.map(name => ({ name, rmpUrl: rateMyProfessorService.getProfessorRMPUrl(name) }));
  });

  const creditsDisplay = $derived(
    data
      ? data.course.minCredits === data.course.maxCredits
        ? `${data.course.minCredits}`
        : `${data.course.minCredits}-${data.course.maxCredits}`
      : ''
  );

  const isAvailable = $derived(!!data && data.section.seatsAvailable > 0);
  const enrollmentClass = $derived(
    isAvailable ? 'section-enrollment-indicator--available' : 'section-enrollment-indicator--full'
  );
  const enrollmentText = $derived(
    data ? (isAvailable ? `${data.section.seatsAvailable} seats available` : 'Full') : ''
  );

  function isAsyncPeriod(period: Period): boolean {
    return !!period.isAsync || (
      period.startTime.displayTime === '12:00 PM' &&
      period.endTime.displayTime === '12:00 PM');
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

  function getPeriodTypeClass(type: string | PeriodType): string {
    const typeStr = String(type).toLowerCase();

    if (typeStr.includes('lab')) return 'section-period-type--lab';
    if (typeStr.includes('dis') || typeStr.includes('discussion')) return 'section-period-type--dis';
    if (typeStr.includes('rec') || typeStr.includes('recitation')) return 'section-period-type--rec';
    if (typeStr.includes('sem') || typeStr.includes('seminar')) return 'section-period-type--sem';
    if (typeStr.includes('studio')) return 'section-period-type--stu';
    if (typeStr.includes('workshop')) return 'section-period-type--wks';
    if (typeStr.includes('experiential')) return 'section-period-type--exp';
    if (typeStr.includes('internship')) return 'section-period-type--int';
    if (typeStr.includes('independent')) return 'section-period-type--ind';
    if (typeStr.includes('research')) return 'section-period-type--res';
    if (typeStr.includes('thesis')) return 'section-period-type--ths';
    if (typeStr.includes('conference') || typeStr.includes('conf')) return 'section-period-type--conf';

    return '';
  }

  function getPeriodTypeLabel(type: string | PeriodType): string {
    const typeStr = String(type);
    const lower = typeStr.toLowerCase();

    if (lower.includes('lec') || lower.includes('lecture')) return 'LEC';
    if (lower.includes('lab')) return 'LAB';
    if (lower.includes('dis') || lower.includes('discussion')) return 'DIS';
    if (lower.includes('rec') || lower.includes('recitation')) return 'REC';
    if (lower.includes('sem') || lower.includes('seminar')) return 'SEM';
    if (lower.includes('studio')) return 'STU';
    if (lower.includes('conference') || lower.includes('conf')) return 'CONF';
    if (lower.includes('workshop')) return 'WKS';
    if (lower.includes('experiential')) return 'EXP';
    if (lower.includes('independent')) return 'IND';
    if (lower.includes('internship')) return 'INT';
    if (lower.includes('research')) return 'RES';
    if (lower.includes('thesis')) return 'THS';

    return typeStr.substring(0, Math.min(4, typeStr.length)).toUpperCase();
  }

  function onColorInput(event: Event): void {
    data?.onColorChange?.((event.target as HTMLInputElement).value);
  }
</script>

{#if data}
  <Modal
    typeId="section-info"
    title={`${data.courseCode} - ${data.courseName}`}
    {onRequestClose}
  >
    {#snippet children(close)}
      <div class="modal-header">
        <h3 class="modal-title">{data.courseCode} - {data.courseName}</h3>
        <button class="modal-close" onclick={close}>×</button>
      </div>
      <div class="modal-body">
        <div class="section-modal-content">
          <!-- Primary Card: Section Overview -->
          <div class="section-card section-card--primary">
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
                      {#each professors as prof, i}
                        {#if i > 0}, {/if}
                        {#if prof.rmpUrl}
                          <a href={prof.rmpUrl} target="_blank" rel="noopener noreferrer" class="professor-link">{prof.name}</a>
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
                <div class="section-info-item">
                  <span class="section-info-label">Color</span>
                  <div class="section-color-inline">
                    <input
                      type="color"
                      class="section-color-input course-color-input"
                      value={data.currentColor}
                      onchange={onColorInput}
                    />
                  </div>
                </div>
              </div>
              <div class="section-enrollment-badge">
                <span class="section-enrollment-indicator {enrollmentClass}">
                  <span class="section-enrollment-dot"></span>
                  {enrollmentText}
                </span>
                {#if data.section.maxWaitlist > 0}
                  <span class="section-enrollment-waitlist">Waitlist: {data.section.actualWaitlist}/{data.section.maxWaitlist}</span>
                {/if}
              </div>
            </div>
          </div>

          <!-- Schedule Card: Meeting Times -->
          <div class="section-card section-card--schedule">
            <div class="section-card-header">
              {@html getInlineSVG('CLOCK', 'section-card-header-icon')}
              <span class="section-card-header-label">Meeting Times</span>
            </div>
            <div class="section-card-content">
              <div class="section-periods-list">
                {#each data.section.periods as period}
                  {#if isAsyncPeriod(period)}
                    <div class="section-period section-period--async">
                      <div class="section-period-type {getPeriodTypeClass(period.type)}">{getPeriodTypeLabel(period.type)}</div>
                      <div class="section-period-details">
                        <div class="section-card-async-badge">
                          {@html getInlineSVG('CLOCK', 'async-icon')}
                          <span>Asynchronous</span>
                        </div>
                      </div>
                    </div>
                  {:else}
                    <div class="section-period">
                      <div class="section-period-type {getPeriodTypeClass(period.type)}">{getPeriodTypeLabel(period.type)}</div>
                      <div class="section-period-details">
                        <div class="section-period-schedule">{periodDays(period)}  {periodTime(period)}</div>
                        <div class="section-period-location">{periodLocation(period)}</div>
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          </div>

          {#if data.section.note}
            <div class="section-card section-card--note">
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
