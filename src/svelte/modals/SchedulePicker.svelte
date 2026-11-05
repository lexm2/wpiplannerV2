<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Modal from './Modal.svelte';
  import { showConfirm } from './modalState.svelte';
  import { appState } from '../../core/state/appState.svelte';
  import { getInlineSVG } from '../../utils/iconPaths';
  import { triggerFileDownload } from '../../utils/download';
  import { logger } from '../../utils/logger';
  import { showAppError, uiState } from '../../services/ui/uiState.svelte';
  import type { ScheduleManagementService } from '../../services/selection/ScheduleManagementService';
  import type { Schedule } from '../../types/schedule';
  import styles from '../../styles/components/schedule-picker-modal.module.css';
  import TextField from '../ui/TextField.svelte';
  import { clickOutside } from '../clickOutside';
  import { menuKeys, focusMenuItem, openingKey } from '../menuKeys';

  let {
    scheduleManagementService,
    onRequestClose,
  }: {
    scheduleManagementService: ScheduleManagementService;
    onRequestClose: () => void;
  } = $props();

  // Menu (⋮) popup geometry.
  const MENU_OFFSET = 4;
  const VIEWPORT_PADDING = 8;

  // Bumped after any list-mutating action (rename/duplicate/delete/import/
  // create/clear) to re-derive the list. Schedule (re)activation + selection
  // changes are already covered by reading the appState runes below.
  let refreshTick = $state(0);

  const schedules = $derived.by<Schedule[]>(() => {
    appState.activeScheduleId; // dep: re-read on schedule switch
    appState.selectedById; // dep: re-read on selection change
    refreshTick; // dep: manual mutations
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
      ? scheduleManagementService
          .getCourseSelectionService()
          .getSelectedCourses().length
      : schedule.selectedCourses.length;
  }

  onMount(() => {
    scheduleManagementService.initialize().then(
      () => {
        refreshTick++;
      },
      (error: unknown) => {
        // Without this the modal just renders an empty list and never says why.
        logger.error('Failed to initialize schedules:', error);
        showAppError('Failed to load schedules. Please try again.');
      },
    );
  });

  let listEl = $state<HTMLElement>();

  // Per-item ⋮ menu
  let openMenuId = $state<string | null>(null);
  // The ⋮ button that opened it: clicks there toggle rather than close-outside.
  let menuTrigger = $state<HTMLElement | null>(null);
  let menuPos = $state<{ left: number; top: number }>({ left: 0, top: 0 });

  // `focus` puts the keyboard on an item as the menu opens: Enter or Space on
  // the button (a click with detail 0) or an arrow key. A mouse click leaves
  // focus on the button.
  async function openMenu(
    trigger: HTMLElement,
    scheduleId: string,
    focus: 'first' | 'last' | null,
  ): Promise<void> {
    menuTrigger = trigger;
    const btnRect = trigger.getBoundingClientRect();
    openMenuId = scheduleId;
    // Position from the menu's real size once it renders: its height depends
    // on how many actions the row offers.
    await tick();
    const menu = listEl?.querySelector<HTMLElement>(
      `[data-schedule-id="${CSS.escape(scheduleId)}"] [data-visible="true"]`,
    );
    if (!menu) return;
    if (focus) focusMenuItem(menu, focus);
    const { width, height } = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = btnRect.right - width;
    let top = btnRect.bottom + MENU_OFFSET;
    if (left < VIEWPORT_PADDING) left = VIEWPORT_PADDING;
    else if (left + width > vw - VIEWPORT_PADDING)
      left = vw - width - VIEWPORT_PADDING;
    if (top + height > vh - VIEWPORT_PADDING)
      top = btnRect.top - height - MENU_OFFSET;
    // Neither side has room: pin it inside the window.
    if (top < VIEWPORT_PADDING)
      top = Math.max(VIEWPORT_PADDING, vh - height - VIEWPORT_PADDING);

    menuPos = { left, top };
  }

  function toggleMenu(e: MouseEvent, scheduleId: string): void {
    if (openMenuId === scheduleId) closeMenus();
    else
      void openMenu(
        e.currentTarget as HTMLElement,
        scheduleId,
        e.detail === 0 ? 'first' : null,
      );
  }

  function onMenuButtonKeydown(e: KeyboardEvent, scheduleId: string): void {
    const which = openingKey(e);
    if (!which) return;
    e.preventDefault();
    if (openMenuId === scheduleId) {
      const menu = listEl?.querySelector<HTMLElement>(
        `[data-schedule-id="${CSS.escape(scheduleId)}"] [data-visible="true"]`,
      );
      focusMenuItem(menu, which);
    } else void openMenu(e.currentTarget as HTMLElement, scheduleId, which);
  }

  function closeMenus(): void {
    openMenuId = null;
  }

  // A click on the dimmed page closes only the menu; Modal would otherwise
  // take the same click as a dismissal of the whole window.
  function onMenuOutside(e: MouseEvent): void {
    closeMenus();
    if (!(e.target as Element).closest('.modal-dialog')) e.stopPropagation();
  }

  // Inline rename
  let editingId = $state<string | null>(null);
  let editValue = $state('');

  async function startEdit(schedule: Schedule): Promise<void> {
    editingId = schedule.id;
    editValue = schedule.name;
    // The field's autofocus only applies when nothing else has focus, and the
    // Rename button that was just clicked does.
    await tick();
    listEl
      ?.querySelector<HTMLInputElement>(
        `[data-schedule-id="${CSS.escape(schedule.id)}"] input`,
      )
      ?.focus();
  }
  async function commitEdit(schedule: Schedule): Promise<void> {
    // Escape clears editingId first; removing the field then blurs it, and
    // that blur must not save.
    if (editingId !== schedule.id) return;
    const newName = editValue.trim();
    if (newName && newName !== schedule.name) {
      try {
        const result = await scheduleManagementService.renameSchedule(
          schedule.id,
          newName,
        );
        if (result.success) refreshTick++;
        else showAppError(`Rename failed: ${result.error || 'Unknown error'}`);
      } catch (error) {
        logger.error('Failed to rename schedule:', error);
        showAppError('Failed to rename schedule. Please try again.');
      }
    }
    editingId = null;
  }
  function onEditKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      // preventDefault tells Modal the key was used, so the picker stays open.
      e.preventDefault();
      editingId = null;
    }
  }

  // Copy-into mode: "Copy Into" picks the source, then clicking another row
  // picks the target. Keyed off copySource rather than the id, so the mode
  // ends by itself if the source schedule goes away (e.g. undone).
  let copySourceId = $state<string | null>(null);
  const copySource = $derived(
    schedules.find(s => s.id === copySourceId) ?? null,
  );

  async function startCopy(schedule: Schedule): Promise<void> {
    copySourceId = schedule.id;
    // The Copy Into button is replaced by the copy-mode row content, so move
    // focus to the first target instead of letting it fall to <body>.
    await tick();
    listEl?.querySelector<HTMLElement>('.copy-target-btn')?.focus();
  }

  async function copyInto(targetId: string): Promise<void> {
    const source = copySource;
    copySourceId = null;
    if (!source) return;
    try {
      const result = await scheduleManagementService.copyScheduleInto(
        source.id,
        targetId,
      );
      if (result.success) refreshTick++;
      else showAppError(`Copy failed: ${result.error}`);
    } catch (error) {
      logger.error('Failed to copy schedule:', error);
      showAppError('Failed to copy schedule. Please try again.');
    }
  }

  function onNameClick(schedule: Schedule): void {
    if (copySource) {
      if (schedule.id !== copySource.id) void copyInto(schedule.id);
      return;
    }
    if (editingId !== schedule.id) void switchToSchedule(schedule.id);
  }

  // Capture phase, so this runs before Modal's Escape handler: Escape backs
  // out of an open menu or copy mode first, and only then closes the picker.
  // Only while the picker is the top modal: a confirm stacked over it gets the
  // key instead.
  function onWindowKeydownCapture(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (uiState.openModals.at(-1) !== 'schedule-picker') return;
    if (openMenuId) {
      e.preventDefault();
      menuTrigger?.focus();
      closeMenus();
    } else if (copySource) {
      e.preventDefault();
      copySourceId = null;
    }
  }

  // Schedule actions
  //
  // The service methods report failure by returning {success:false, error}
  // rather than throwing, so the result needs checking as well as the catch.
  async function switchToSchedule(scheduleId: string): Promise<void> {
    try {
      const result =
        await scheduleManagementService.setActiveSchedule(scheduleId);
      if (!result.success) {
        logger.error('Failed to switch schedule:', result.error);
        showAppError(result.error ?? 'Failed to switch schedule.');
      }
    } catch (error) {
      logger.error('Failed to switch schedule:', error);
      showAppError('Failed to switch schedule. Please try again.');
    }
  }

  async function handleAction(
    action: string,
    schedule: Schedule,
  ): Promise<void> {
    // The menu item is about to hide; the button that opened it keeps the
    // keyboard's place (rename moves on to its field).
    if (openMenuId) menuTrigger?.focus();
    closeMenus();
    try {
      switch (action) {
        case 'rename':
          await startEdit(schedule);
          break;
        case 'duplicate':
          await duplicateSchedule(schedule);
          break;
        case 'copy-into':
          await startCopy(schedule);
          break;
        case 'export':
          await exportSchedule(schedule.id);
          break;
        case 'export-ics':
          await exportScheduleICS(schedule.id);
          break;
        case 'import':
          importSchedule(schedule.id);
          break;
        case 'delete':
          deleteSchedule(schedule);
          break;
      }
    } catch (error) {
      logger.error(`Failed to ${action} schedule:`, error);
      showAppError(`Failed to ${action} schedule. Please try again.`);
    }
  }

  async function duplicateSchedule(schedule: Schedule): Promise<void> {
    const result = await scheduleManagementService.duplicateSchedule(
      schedule.id,
      `${schedule.name} (Copy)`,
    );
    if (result.success) refreshTick++;
    else showAppError(`Duplicate failed: ${result.error || 'Unknown error'}`);
  }

  // showConfirm fires onConfirm later, from the modal, by which point
  // handleAction's try/catch is off the stack -- so each confirm handler has to
  // surface its own failure.
  async function confirmDelete(schedule: Schedule): Promise<void> {
    try {
      const result = await scheduleManagementService.deleteSchedule(
        schedule.id,
      );
      if (result.success) refreshTick++;
      else showAppError(`Delete failed: ${result.error || 'Unknown error'}`);
    } catch (error) {
      logger.error('Failed to delete schedule:', error);
      showAppError('Failed to delete schedule. Please try again.');
    }
  }

  function deleteSchedule(schedule: Schedule): void {
    showConfirm({
      title: 'Delete schedule',
      message: `Are you sure you want to delete "${schedule.name}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        void confirmDelete(schedule);
      },
    });
  }

  async function confirmCreate(name?: string): Promise<void> {
    if (!name) return;
    try {
      const result = await scheduleManagementService.createNewSchedule(name);
      if (result.success) refreshTick++;
      else showAppError(`Create failed: ${result.error || 'Unknown error'}`);
    } catch (error) {
      logger.error('Failed to create schedule:', error);
      showAppError('Failed to create schedule. Please try again.');
    }
  }

  function createNewSchedule(): void {
    showConfirm({
      title: 'New schedule',
      message: 'Enter a name for the new schedule:',
      confirmLabel: 'Create',
      input: true,
      placeholder: 'Schedule name',
      onConfirm: name => {
        void confirmCreate(name);
      },
    });
  }

  async function exportSchedule(scheduleId: string): Promise<void> {
    const result = await scheduleManagementService.exportSchedule(scheduleId);
    if (result.success && result.data) {
      const schedule = scheduleManagementService.getScheduleById(scheduleId);
      triggerFileDownload(
        result.data,
        `${schedule?.name || 'schedule'}.json`,
        'application/json',
      );
    } else {
      showAppError(`Export failed: ${result.error || 'Unknown error'}`);
    }
  }

  async function exportScheduleICS(scheduleId: string): Promise<void> {
    const result =
      await scheduleManagementService.exportScheduleICS(scheduleId);
    if (result.success && result.data) {
      const schedule = scheduleManagementService.getScheduleById(scheduleId);
      triggerFileDownload(
        result.data,
        `${schedule?.name || 'schedule'}.ics`,
        'text/calendar',
      );
    } else {
      showAppError(`ICS Export failed: ${result.error || 'Unknown error'}`);
    }
  }

  // One hidden input (bottom of this component) serves both import paths.
  // pendingImport is the target: a schedule id, or 'new' to create one.
  let fileInput = $state<HTMLInputElement | null>(null);
  let pendingImport = $state<string | null>(null);

  function importSchedule(scheduleId: string): void {
    pendingImport = scheduleId;
    fileInput?.click();
  }

  // Creates a NEW schedule from the chosen file.
  function importNew(): void {
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
        // Created inactive and only switched to once the import succeeds, so a
        // bad file leaves neither an empty schedule nor a changed selection.
        const created = await scheduleManagementService.createNewSchedule(
          name,
          { autoActivate: false },
        );
        const id = created.schedule?.id;
        if (created.success && id) {
          const imported = await scheduleManagementService.importScheduleInto(
            id,
            text,
          );
          if (imported.success) {
            await switchToSchedule(id);
          } else {
            await scheduleManagementService.deleteSchedule(id);
            showAppError(`Import failed: ${imported.error}`);
          }
          refreshTick++;
        } else {
          showAppError(`Import failed: ${created.error || 'Unknown error'}`);
        }
      } else {
        const result = await scheduleManagementService.importScheduleInto(
          target,
          text,
        );
        if (result.success) refreshTick++;
        else showAppError(`Import failed: ${result.error}`);
      }
    } catch (error) {
      logger.error('Failed to import schedule:', error);
      showAppError('Failed to import schedule. Please check the file format.');
    }
  }

  async function exportAllSchedules(): Promise<void> {
    const result = await scheduleManagementService.exportAllSchedules();
    if (result.success && result.data) {
      const timestamp = new Date().toISOString().split('T')[0];
      triggerFileDownload(
        result.data,
        `wpi-schedules-${timestamp}.json`,
        'application/json',
      );
    } else {
      showAppError(`Export failed: ${result.error || 'Unknown error'}`);
    }
  }
</script>

<svelte:window onkeydowncapture={onWindowKeydownCapture} />

<Modal
  typeId="schedule-picker"
  title="Schedules"
  showHeader
  dialogClass="schedule-picker-modal-dialog no-transform"
  {onRequestClose}
>
  <div class="modal-body schedule-picker-body">
    <div class="schedule-list" bind:this={listEl}>
      {#if copySource}
        <div class="schedule-copy-banner" role="status">
          <span
            >Click a schedule to copy the courses from <strong
              >{copySource.name}</strong
            > into it.</span
          >
          <button
            class="btn btn-secondary"
            onclick={() => (copySourceId = null)}>Cancel</button
          >
        </div>
      {/if}
      {#if schedules.length === 0}
        <div class="schedule-list-empty">No schedules found</div>
      {:else}
        {#each schedules as schedule (schedule.id)}
          {@const isActive = schedule.id === activeScheduleId}
          <div
            class="schedule-item"
            class:active={isActive}
            class:copy-source={copySource?.id === schedule.id}
            class:copy-target={copySource !== null &&
              copySource.id !== schedule.id}
            data-schedule-id={schedule.id}
          >
            <div class="schedule-item-info">
              {#if editingId === schedule.id}
                <TextField
                  fieldClass="schedule-name-field"
                  ariaLabel="Schedule name"
                  autofocus
                  bind:value={editValue}
                  onfocus={e => (e.currentTarget as HTMLInputElement).select()}
                  onblur={() => commitEdit(schedule)}
                  onkeydown={onEditKeydown}
                />
              {:else}
                <!-- The name is the row's switch; its ::after stretches over the
                     row so a click anywhere on it works too. -->
                <button
                  type="button"
                  class="schedule-item-name"
                  aria-current={isActive ? 'true' : undefined}
                  aria-describedby="schedule-details-{schedule.id}"
                  tabindex={copySource ? -1 : 0}
                  onclick={() => onNameClick(schedule)}
                  ondblclick={() => {
                    if (!copySource) void startEdit(schedule);
                  }}
                >
                  {schedule.name}
                </button>
              {/if}
              <div
                class="schedule-item-details"
                id="schedule-details-{schedule.id}"
              >
                {courseCount(schedule)} course{courseCount(schedule) === 1
                  ? ''
                  : 's'}
              </div>
            </div>

            {#if copySource?.id === schedule.id}
              <div class="schedule-item-actions copy-hint">Copying from</div>
            {:else if copySource}
              <div class="schedule-item-actions">
                <button
                  class="btn-link copy-hint copy-target-btn"
                  aria-label="Copy here: {schedule.name}"
                  onclick={() => void copyInto(schedule.id)}>Copy here</button
                >
              </div>
            {:else}
              <div class="schedule-item-actions">
                <button
                  class="btn-link inline-action-btn"
                  aria-label="Rename {schedule.name}"
                  onclick={() => void handleAction('rename', schedule)}
                  >Rename</button
                >
                <button
                  class="btn-link inline-action-btn"
                  aria-label="Duplicate {schedule.name}"
                  onclick={() => void handleAction('duplicate', schedule)}
                  >Duplicate</button
                >
                <button
                  class="btn-link {styles['menuBtn']}"
                  title="More options"
                  aria-label="More options for {schedule.name}"
                  aria-haspopup="menu"
                  aria-expanded={openMenuId === schedule.id}
                  onkeydown={e => onMenuButtonKeydown(e, schedule.id)}
                  onclick={e => toggleMenu(e, schedule.id)}>⋮</button
                >
              </div>
            {/if}

            <div
              class={styles['scheduleItemMenu']}
              data-visible={openMenuId === schedule.id}
              role="menu"
              aria-label="Actions for {schedule.name}"
              use:clickOutside={{
                enabled: openMenuId === schedule.id,
                ignore: menuTrigger,
                onOutside: onMenuOutside,
              }}
              use:menuKeys={{ trigger: menuTrigger, onClose: closeMenus }}
              style:left={`${menuPos.left}px`}
              style:top={`${menuPos.top}px`}
            >
              <button
                class="{styles['menuAction']} {styles['inlineAbove']}"
                role="menuitem"
                onclick={() => void handleAction('rename', schedule)}
                >Rename</button
              >
              <button
                class="{styles['menuAction']} {styles['inlineAbove']}"
                role="menuitem"
                onclick={() => void handleAction('duplicate', schedule)}
                >Duplicate</button
              >
              {#if schedules.length > 1}
                <button
                  class={styles['menuAction']}
                  role="menuitem"
                  onclick={() => void handleAction('copy-into', schedule)}
                  >Copy Into</button
                >
              {/if}
              <button
                class={styles['menuAction']}
                role="menuitem"
                onclick={() => void handleAction('export', schedule)}
                >Export</button
              >
              <button
                class={styles['menuAction']}
                role="menuitem"
                onclick={() => void handleAction('export-ics', schedule)}
                >Export ICS</button
              >
              <button
                class={styles['menuAction']}
                role="menuitem"
                onclick={() => void handleAction('import', schedule)}
                >Import</button
              >
              {#if schedules.length > 1}
                <button
                  class="{styles['menuAction']} {styles['danger']}"
                  role="menuitem"
                  onclick={() => void handleAction('delete', schedule)}
                  >Delete</button
                >
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
    <!-- Outside the scrolling list, so they stay in reach however many
         schedules there are. -->
    <div class="schedule-list-actions">
      <button
        class="btn btn-primary"
        id="new-schedule-btn"
        onclick={createNewSchedule}
        >{@html getInlineSVG('CALENDAR_PLUS', 'modal-footer-icon')}<span
          class="btn-text"
        >
          New Schedule</span
        ></button
      >
      <button
        class="btn btn-secondary"
        id="import-schedule-btn"
        onclick={importNew}
        >{@html getInlineSVG('CALENDAR_DOWN', 'modal-footer-icon')}<span
          class="btn-text"
        >
          Import</span
        ></button
      >
      <button
        class="btn btn-secondary"
        id="export-all-schedules-btn"
        onclick={exportAllSchedules}
        >{@html getInlineSVG('CALENDAR_UP', 'modal-footer-icon')}<span
          class="btn-text"
        >
          Export All</span
        ></button
      >
    </div>
  </div>

  <!-- Hidden but real file input, following DegreeImport's pattern. -->
  <input
    bind:this={fileInput}
    type="file"
    accept=".json"
    hidden
    onchange={onFileChosen}
  />
</Modal>
