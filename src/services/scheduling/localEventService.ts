import { appState } from '../../core/state/appState.svelte';
import { modalState, showConfirm } from '../../svelte/modals/modalState.svelte';
import { closeModal, openModal, uiState } from '../ui/uiState.svelte';
import { TermBoundsService } from '../../utils/termBounds';
import { ICSGenerator } from '../../utils/icsGenerator';
import type { TermWindow } from './weeklyEventDetection';
import type { ProfileStateManager } from '../../core/state/ProfileStateManager';
import type { LocalCalendarEvent } from '../../types/schedule';
import { logger } from '../../utils/logger';

/**
 * Standalone local calendar-event CRUD for the schedule page.
 *
 * Reads the active schedule from the `appState.activeSchedule` rune and persists
 * add/delete by replacing the schedule immutably via
 * ProfileStateManager.updateSchedule - so the `$derived` activeSchedule
 * re-derives and the reactive grid drops/adds the calendar-event blocks on its
 * own.
 *
 * Needs ProfileStateManager (not a singleton), injected once via init().
 */
/** A new event, before it gets an id and timestamps. */
export type LocalEventDraft = Omit<
  LocalCalendarEvent,
  'id' | 'createdAt' | 'updatedAt'
>;

const MAX_ICS_BYTES = 20 * 1024 * 1024;
const TERM_LETTERS = ['A', 'B', 'C', 'D'] as const;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

class LocalEventService {
  private profileStateManager: ProfileStateManager | null = null;
  /** Identifies the latest import, so a slow parse can't overwrite a newer one. */
  private importRun = 0;

  init(profileStateManager: ProfileStateManager): void {
    this.profileStateManager = profileStateManager;
  }

  openAddModal(): void {
    if (!appState.activeSchedule) {
      logger.warn(
        '[localEventService] Cannot open add event modal - no active schedule',
      );
      return;
    }

    modalState.localEvent = {
      onSave: eventData => this.add(eventData),
    };
    openModal('local-event');
  }

  /** Opens the import modal on its "choose a file" screen. */
  openImportModal(): void {
    if (!appState.activeSchedule) return;
    this.importRun++;
    modalState.icsImport = { status: 'idle' };
    closeModal('local-event');
    openModal('ics-import');
  }

  /**
   * Reads an .ics file and shows what weekly events it holds in the import
   * modal. Problems with the file are shown there, not logged: only an
   * unexpected failure reaches the logger.
   */
  async importFile(file: File): Promise<void> {
    const schedule = appState.activeSchedule;
    if (!schedule) return;

    const run = ++this.importRun;
    const show = (payload: NonNullable<typeof modalState.icsImport>): void => {
      if (run === this.importRun) modalState.icsImport = payload;
    };
    const fileName = file.name;

    modalState.icsImport = { status: 'parsing', fileName };
    closeModal('local-event');
    // Already open when a second file is dropped onto the schedule.
    if (!uiState.openModals.includes('ics-import')) openModal('ics-import');

    const looksZipped = /\.zip$/i.test(fileName) || /zip/i.test(file.type);
    if (looksZipped) {
      show({
        status: 'error',
        fileName,
        message:
          'Google Calendar exports a .zip. Unzip it and choose the .ics file inside.',
      });
      return;
    }
    if (file.size > MAX_ICS_BYTES) {
      show({
        status: 'error',
        fileName,
        message: 'That file is too large to be a calendar export (over 20 MB).',
      });
      return;
    }

    try {
      const text = await file.text();
      if (text.startsWith('PK')) {
        show({
          status: 'error',
          fileName,
          message:
            'That file is a zip archive. Unzip it and choose the .ics file inside.',
        });
        return;
      }
      if (!/BEGIN:VCALENDAR/i.test(text)) {
        show({
          status: 'error',
          fileName,
          message: "That doesn't look like a calendar (.ics) file.",
        });
        return;
      }

      const year =
        schedule.year ??
        TermBoundsService.getInstance().getCurrentAcademicYear() ??
        new Date().getFullYear();
      const terms: TermWindow[] = [];
      for (const term of TERM_LETTERS) {
        const range = ICSGenerator.getTermDates(term, year);
        if (range) {
          terms.push({
            term,
            start: startOfDay(range.start),
            end: startOfDay(range.end),
          });
        }
      }

      // Dynamic: keeps ical.js out of the main bundle.
      const { importIcsText, IcsImportError } = await import('./icsImport');
      try {
        const result = importIcsText(text, terms);
        show({ status: 'ready', fileName, year, result });
      } catch (error) {
        if (error instanceof IcsImportError) {
          show({ status: 'error', fileName, message: error.message });
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error('[localEventService] Calendar import failed', error);
      show({
        status: 'error',
        fileName,
        message: "Couldn't read that file. Try exporting the calendar again.",
      });
    }
  }

  /** Delete-confirmation modal for a local event (the grid's external-event-block click target). */
  openDeleteModal(eventId: string): void {
    const schedule = appState.activeSchedule;
    if (!schedule) return;

    const localEvent = (schedule.localEvents || []).find(e => e.id === eventId);
    const title = localEvent?.title || 'Untitled Event';
    showConfirm({
      title: 'Delete Event',
      message: `Delete "${title}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => this.delete(eventId),
    });
  }

  private add(eventData: LocalEventDraft): void {
    this.addMany([eventData]);
  }

  /**
   * Adds several events as one change (one save, one undo step). Drafts must
   * be plain objects: a `$state` proxy can't be structured-cloned by the
   * storage worker.
   */
  addMany(drafts: LocalEventDraft[]): void {
    const schedule = appState.activeSchedule;
    if (!schedule || !this.profileStateManager || drafts.length === 0) return;

    const now = Date.now();
    const newEvents: LocalCalendarEvent[] = drafts.map(draft => ({
      ...draft,
      id: `local-${now}-${Math.random().toString(36).substring(2, 11)}`,
      createdAt: now,
      updatedAt: now,
    }));

    const updatedLocalEvents = [...(schedule.localEvents || []), ...newEvents];
    this.profileStateManager.updateSchedule(
      schedule.id,
      { localEvents: updatedLocalEvents },
      'calendar-event',
    );
  }

  private delete(eventId: string): void {
    const schedule = appState.activeSchedule;
    if (!schedule || !this.profileStateManager) return;

    const updatedLocalEvents = (schedule.localEvents || []).filter(
      e => e.id !== eventId,
    );
    this.profileStateManager.updateSchedule(
      schedule.id,
      { localEvents: updatedLocalEvents },
      'calendar-event',
    );
  }
}

export const localEventService = new LocalEventService();
