<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import { modalState, showConfirm } from './modalState.svelte';
  import { appState } from '../../core/state/appState.svelte';
  import { getInlineSVG } from '../../utils/iconPaths';
  import { logger } from '../../utils/logger';
  import { ThemeManager } from '../../themes/ThemeManager';
  import { openModal, showAppError } from '../../services/ui/uiState.svelte';
  import type { ScheduleManagementService } from '../../services/selection/ScheduleManagementService';
  import type { ProfileStateManager } from '../../core/state/ProfileStateManager';
  import type { TutorialSetup } from '../../services/tutorial/setupTutorial';
  import type { Schedule } from '../../types/schedule';
  import styles from '../../styles/components/schedule-picker-modal.module.css';
  import TextField from '../ui/TextField.svelte';

  let { scheduleManagementService, profileStateManager, getTutorial, onRequestClose }: {
    scheduleManagementService: ScheduleManagementService;
    profileStateManager: ProfileStateManager;
    getTutorial: () => TutorialSetup | undefined;
    onRequestClose: () => void;
  } = $props();

  // Menu (⋮) popup geometry — mirrors the old SchedulePickerModal constants.
  const MENU_WIDTH = 120;
  const MENU_HEIGHT = 160;
  const MENU_OFFSET = 4;
  const VIEWPORT_PADDING = 8;

  // Bumped after any list-mutating action (rename/duplicate/delete/import/
  // create/clear) to re-derive the list — replaces the old imperative
  // updateScheduleList() calls. Schedule (re)activation + selection changes are
  // already covered by reading the appState runes below.
  let refreshTick = $state(0);

  const schedules = $derived.by<Schedule[]>(() => {
    appState.activeScheduleId; // dep: re-read on schedule switch
    appState.selectedById;     // dep: re-read on selection change
    refreshTick;               // dep: manual mutations
    return scheduleManagementService.getAllSchedules();
  });
  const activeScheduleId = $derived.by<string | null>(() => {
    appState.activeScheduleId;
    refreshTick;
    return scheduleManagementService.getActiveScheduleId();
  });

  function courseCount(schedule: Schedule): number {
    // Active schedule's live count comes from the selection service (which
    // appState.selectedById tracks); inactive schedules use their stored list.
    appState.selectedById; // keep the active count reactive
    return schedule.id === activeScheduleId
      ? scheduleManagementService.getCourseSelectionService().getSelectedCourses().length
      : schedule.selectedCourses.length;
  }

  onMount(() => {
    scheduleManagementService.initialize().then(() => { refreshTick++; });
  });

  // Tab navigation (horizontal page slide)
  let pagesContainer = $state<HTMLElement>();
  let activeTab = $state<'schedules' | 'settings'>('schedules');

  // Tutorial-driven tab navigation channel (replaces navigateToTab). Apply then
  // clear so a later tutorial run can push the same value again.
  $effect(() => {
    const tab = modalState.schedulePickerTab;
    if (!tab) return;
    untrack(() => { activeTab = tab; });
    modalState.schedulePickerTab = null;
  });

  // Drive the container scroll position from the active tab (CSS scroll-behavior
  // animates it). offsetWidth is one page wide.
  $effect(() => {
    const tab = activeTab;
    const c = pagesContainer;
    if (!c) return;
    c.scrollLeft = tab === 'settings' ? c.offsetWidth : 0;
  });

  // Per-item ⋮ menu
  let openMenuId = $state<string | null>(null);
  let menuPos = $state<{ left: number; top: number }>({ left: 0, top: 0 });

  function toggleMenu(e: MouseEvent, scheduleId: string): void {
    e.stopPropagation();
    if (openMenuId === scheduleId) { openMenuId = null; return; }

    const btnRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let left = btnRect.right - MENU_WIDTH;
    let top = btnRect.bottom + MENU_OFFSET;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (left < VIEWPORT_PADDING) left = VIEWPORT_PADDING;
    else if (left + MENU_WIDTH > vw - VIEWPORT_PADDING) left = vw - MENU_WIDTH - VIEWPORT_PADDING;
    if (top + MENU_HEIGHT > vh - VIEWPORT_PADDING) top = btnRect.top - MENU_HEIGHT - MENU_OFFSET;

    menuPos = { left, top };
    openMenuId = scheduleId;
  }

  function closeMenus(): void { openMenuId = null; }

  // Inline rename
  let editingId = $state<string | null>(null);
  let editValue = $state('');

  function startEdit(schedule: Schedule): void {
    editingId = schedule.id;
    editValue = schedule.name;
  }
  async function commitEdit(schedule: Schedule): Promise<void> {
    const newName = editValue.trim();
    if (newName && newName !== schedule.name) {
      try {
        await scheduleManagementService.renameSchedule(schedule.id, newName);
        refreshTick++;
      } catch (error) {
        logger.error('Failed to rename schedule:', error);
        showAppError('Failed to rename schedule. Please try again.');
      }
    }
    editingId = null;
  }
  function onEditKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); }
    else if (e.key === 'Escape') { editingId = null; }
  }

  // Schedule actions
  function switchToSchedule(scheduleId: string): void {
    try {
      scheduleManagementService.setActiveSchedule(scheduleId);
    } catch (error) {
      logger.error('Failed to switch schedule:', error);
      showAppError('Failed to switch schedule. Please try again.');
    }
  }

  async function handleAction(action: string, schedule: Schedule): Promise<void> {
    closeMenus();
    try {
      switch (action) {
        case 'rename': startEdit(schedule); break;
        case 'duplicate': await duplicateSchedule(schedule); break;
        case 'export': await exportSchedule(schedule.id); break;
        case 'export-ics': await exportScheduleICS(schedule.id); break;
        case 'import': await importSchedule(schedule.id); break;
        case 'delete': await deleteSchedule(schedule); break;
      }
    } catch (error) {
      logger.error(`Failed to ${action} schedule:`, error);
      showAppError(`Failed to ${action} schedule. Please try again.`);
    }
  }

  async function duplicateSchedule(schedule: Schedule): Promise<void> {
    await scheduleManagementService.duplicateSchedule(schedule.id, `${schedule.name} (Copy)`);
    refreshTick++;
  }

  function deleteSchedule(schedule: Schedule): void {
    showConfirm({
      title: 'Delete schedule',
      message: `Are you sure you want to delete "${schedule.name}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        await scheduleManagementService.deleteSchedule(schedule.id);
        refreshTick++;
      },
    });
  }

  function createNewSchedule(): void {
    showConfirm({
      title: 'New schedule',
      message: 'Enter a name for the new schedule:',
      confirmLabel: 'Create',
      input: true,
      placeholder: 'Schedule name',
      onConfirm: async (name) => {
        if (!name) return;
        await scheduleManagementService.createNewSchedule(name);
        refreshTick++;
      },
    });
  }

  let downloadLink = $state<HTMLAnchorElement | null>(null);

  function triggerFileDownload(data: string, filename: string, mimeType: string): void {
    if (!downloadLink) return;
    const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.click();
    URL.revokeObjectURL(url);
  }

  async function exportSchedule(scheduleId: string): Promise<void> {
    const result = await scheduleManagementService.exportSchedule(scheduleId);
    if (result.success && result.data) {
      const schedule = scheduleManagementService.getScheduleById(scheduleId);
      triggerFileDownload(result.data, `${schedule?.name || 'schedule'}.json`, 'application/json');
    } else {
      showAppError(`Export failed: ${result.error || 'Unknown error'}`);
    }
  }

  async function exportScheduleICS(scheduleId: string): Promise<void> {
    const result = await scheduleManagementService.exportScheduleICS(scheduleId);
    if (result.success && result.data) {
      const schedule = scheduleManagementService.getScheduleById(scheduleId);
      triggerFileDownload(result.data, `${schedule?.name || 'schedule'}.ics`, 'text/calendar');
    } else {
      showAppError(`ICS Export failed: ${result.error || 'Unknown error'}`);
    }
  }

  // One hidden input (bottom of this component) serves both import paths.
  // pendingImport is the target: a schedule id, or 'new' to create one.
  let fileInput = $state<HTMLInputElement | null>(null);
  let pendingImport = $state<string | 'new' | null>(null);

  function importSchedule(scheduleId: string): void {
    pendingImport = scheduleId;
    fileInput?.click();
  }

  // Settings-page "Import" — creates a NEW schedule from the chosen file.
  function importNewFromSettings(): void {
    pendingImport = 'new';
    fileInput?.click();
  }

  async function onFileChosen(): Promise<void> {
    const file = fileInput?.files?.[0];
    const target = pendingImport;
    pendingImport = null;
    if (fileInput) fileInput.value = ''; // allow re-picking the same file
    if (!file || !target) return;

    try {
      const text = await file.text();
      if (target === 'new') {
        const name = file.name.replace(/\.json$/i, '');
        const created = await scheduleManagementService.createNewSchedule(name);
        if (created.success && created.schedule?.id) {
          const imported = await scheduleManagementService.importScheduleInto(created.schedule.id, text);
          if (!imported.success) showAppError(`Import failed: ${imported.error}`);
          refreshTick++;
        }
      } else {
        const result = await scheduleManagementService.importScheduleInto(target, text);
        if (result.success) refreshTick++;
        else showAppError(`Import failed: ${result.error}`);
      }
    } catch (error) {
      logger.error('Failed to import schedule:', error);
      showAppError('Failed to import schedule. Please check the file format.');
    }
  }

  function exportActiveICS(): void {
    const activeId = scheduleManagementService.getActiveScheduleId();
    if (activeId) exportScheduleICS(activeId);
  }

  async function exportAllSchedules(): Promise<void> {
    const result = await scheduleManagementService.exportAllSchedules();
    if (result.success && result.data) {
      const timestamp = new Date().toISOString().split('T')[0];
      triggerFileDownload(result.data, `wpi-schedules-${timestamp}.json`, 'application/json');
    } else {
      showAppError(`Export failed: ${result.error || 'Unknown error'}`);
    }
  }

  function clearAllData(): void {
    showConfirm({
      title: 'Clear all data',
      message:
        'Are you sure you want to clear ALL schedules and data?\n' +
        'This will delete all schedules, clear all selected courses and reset all preferences.\n' +
        'This action CANNOT be undone.',
      confirmLabel: 'Clear everything',
      variant: 'danger',
      onConfirm: async () => {
        await scheduleManagementService.clearAllSchedules();
        refreshTick++;
      },
    });
  }

  // Settings actions — call the real services directly (mirrors App.svelte's
  // header handlers) instead of synthesizing clicks on app-shell buttons.
  function toggleTheme(): void {
    const tm = ThemeManager.getInstance();
    tm.setTheme(tm.getCurrentThemeId() === 'wpi-dark' ? 'wpi-light' : 'wpi-dark');
  }
  function undo(): void {
    profileStateManager.undo().catch(error => {
      logger.error('Undo failed:', error);
      showAppError('Failed to undo. Please try again.');
    });
  }
  function redo(): void {
    profileStateManager.redo().catch(error => {
      logger.error('Redo failed:', error);
      showAppError('Failed to redo. Please try again.');
    });
  }

  function openChangelog(): void { openModal('changelog'); }
  function openTutorials(close: () => void): void {
    close();
    if (getTutorial()) openModal('tutorials');
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (window click closes any open ⋮ menu) -->
<svelte:window onclick={closeMenus} />

<Modal
  typeId="schedule-picker"
  title="Schedules"
  showHeader
  dialogClass="schedule-picker-modal-dialog no-transform"
  {onRequestClose}
>
  {#snippet children(close)}
    <div class="modal-body schedule-picker-body">
      <div class="modal-pages-container" bind:this={pagesContainer}>
        <div class="modal-page schedules-page">
          <div class="schedule-list">
            {#if schedules.length === 0}
              <div class="schedule-list-empty">No schedules found</div>
            {:else}
              {#each schedules as schedule (schedule.id)}
                {@const isActive = schedule.id === activeScheduleId}
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (row is a click-to-activate surface; actions stop propagation) -->
                <div
                  class="schedule-item"
                  class:active={isActive}
                  data-schedule-id={schedule.id}
                  onclick={() => { if (editingId !== schedule.id) switchToSchedule(schedule.id); }}
                >
                  <div class="schedule-item-info">
                    {#if editingId === schedule.id}
                      <TextField
                        fieldClass="schedule-name-field"
                        ariaLabel="Schedule name"
                        autofocus
                        bind:value={editValue}
                        onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
                        onclick={(e) => e.stopPropagation()}
                        onblur={() => commitEdit(schedule)}
                        onkeydown={onEditKeydown}
                      />
                    {:else}
                      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (double-click to rename) -->
                      <div
                        class="schedule-item-name"
                        ondblclick={(e) => { e.stopPropagation(); startEdit(schedule); }}
                      >{schedule.name}</div>
                    {/if}
                    <div class="schedule-item-details">{courseCount(schedule)} course{courseCount(schedule) === 1 ? '' : 's'}</div>
                  </div>

                  <div class="schedule-item-actions">
                    <button class="btn-link inline-action-btn" onclick={(e) => { e.stopPropagation(); handleAction('rename', schedule); }}>Rename</button>
                    <button class="btn-link inline-action-btn" onclick={(e) => { e.stopPropagation(); handleAction('duplicate', schedule); }}>Duplicate</button>
                    <button class="btn-link inline-action-btn" onclick={(e) => { e.stopPropagation(); handleAction('export', schedule); }}>Export</button>
                    <button class="btn-link inline-action-btn" onclick={(e) => { e.stopPropagation(); handleAction('export-ics', schedule); }}>Export ICS</button>
                    <button class="btn-link inline-action-btn" onclick={(e) => { e.stopPropagation(); handleAction('import', schedule); }}>Import</button>
                    {#if schedules.length > 1}
                      <button class="btn-link inline-action-btn danger" onclick={(e) => { e.stopPropagation(); handleAction('delete', schedule); }}>Delete</button>
                    {/if}
                    <button class="btn-link {styles['menuBtn']}" title="More options" onclick={(e) => toggleMenu(e, schedule.id)}>⋮</button>
                  </div>

                  <div
                    class={styles['scheduleItemMenu']}
                    data-visible={openMenuId === schedule.id}
                    style:left={`${menuPos.left}px`}
                    style:top={`${menuPos.top}px`}
                  >
                    <button class={styles['menuAction']} onclick={(e) => { e.stopPropagation(); handleAction('rename', schedule); }}>Rename</button>
                    <button class={styles['menuAction']} onclick={(e) => { e.stopPropagation(); handleAction('duplicate', schedule); }}>Duplicate</button>
                    <button class={styles['menuAction']} onclick={(e) => { e.stopPropagation(); handleAction('export', schedule); }}>Export</button>
                    <button class={styles['menuAction']} onclick={(e) => { e.stopPropagation(); handleAction('export-ics', schedule); }}>Export ICS</button>
                    <button class={styles['menuAction']} onclick={(e) => { e.stopPropagation(); handleAction('import', schedule); }}>Import</button>
                    {#if schedules.length > 1}
                      <button class="{styles['menuAction']} danger" onclick={(e) => { e.stopPropagation(); handleAction('delete', schedule); }}>Delete</button>
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}
            <button class="btn btn-primary schedule-list-add-btn" onclick={createNewSchedule}>
              {@html getInlineSVG('CALENDAR_PLUS', 'modal-footer-icon')}<span class="btn-text"> New Schedule</span>
            </button>
          </div>
        </div>

        <div class="modal-page settings-page">
          <button class="btn btn-primary" id="new-schedule-btn-settings" onclick={createNewSchedule}>{@html getInlineSVG('CALENDAR_PLUS', 'modal-footer-icon')}<span class="btn-text"> New Schedule</span></button>
          <button class="btn btn-secondary" id="import-schedule-btn-settings" onclick={importNewFromSettings}>{@html getInlineSVG('CALENDAR_DOWN', 'modal-footer-icon')}<span class="btn-text"> Import</span></button>
          <button class="btn btn-secondary" id="export-ics-btn-settings" onclick={exportActiveICS}>{@html getInlineSVG('CALENDAR_SHARE', 'modal-footer-icon')}<span class="btn-text"> Export Current Schedule to Calendar</span></button>
          <button class="btn btn-secondary" id="export-schedule-btn-settings" onclick={exportAllSchedules}>{@html getInlineSVG('CALENDAR_UP', 'modal-footer-icon')}<span class="btn-text"> Export All</span></button>
          <button class="btn btn-secondary" id="toggle-theme-btn-settings" onclick={toggleTheme}>{@html getInlineSVG('BRIGHTNESS', 'modal-footer-icon')}<span class="btn-text"> Toggle Theme</span></button>
          <div class="settings-btn-row">
            <button class="btn btn-secondary" id="undo-btn-settings" onclick={undo}>{@html getInlineSVG('ARROW_BACK_UP', 'modal-footer-icon')}<span class="btn-text"> Undo</span></button>
            <button class="btn btn-secondary" id="redo-btn-settings" onclick={redo}>{@html getInlineSVG('ARROW_FORWARD_UP', 'modal-footer-icon')}<span class="btn-text"> Redo</span></button>
          </div>
          <button class="btn btn-secondary" id="changelog-btn-settings" onclick={openChangelog}>{@html getInlineSVG('CLOCK', 'modal-footer-icon')}<span class="btn-text"> What's New</span></button>
          {#if getTutorial()}
            <button class="btn btn-secondary" id="tutorials-btn-settings" onclick={() => openTutorials(close)}>{@html getInlineSVG('CALENDAR_REPEAT', 'modal-footer-icon')}<span class="btn-text"> Tutorials</span></button>
          {/if}
          <button class="btn btn-danger" id="clear-all-data-btn-settings" onclick={clearAllData}>{@html getInlineSVG('TRASH', 'modal-footer-icon')}<span class="btn-text"> Clear All Data</span></button>
        </div>
      </div>
    </div>

    <div class="modal-footer schedule-picker-footer">
      <div class="nav-tabs-pill">
        <button class="nav-tab" class:active={activeTab === 'schedules'} data-tab="schedules" onclick={() => activeTab = 'schedules'}>Schedules</button>
        <button class="nav-tab" class:active={activeTab === 'settings'} data-tab="settings" onclick={() => activeTab = 'settings'}>Settings</button>
      </div>
    </div>

    <!-- Hidden but real file IO elements, following DegreeImport's pattern. -->
    <input
      bind:this={fileInput}
      type="file"
      accept=".json"
      hidden
      onchange={onFileChosen}
    />
    <!-- svelte-ignore a11y_missing_attribute (programmatic download target, never focused) -->
    <a bind:this={downloadLink} hidden aria-hidden="true"></a>
  {/snippet}
</Modal>
