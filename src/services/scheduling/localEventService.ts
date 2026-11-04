import { appState } from '../../core/state/appState.svelte';
import { modalState, showConfirm } from '../../svelte/modals/modalState.svelte';
import { closeModal, openModal, uiState } from '../ui/uiState.svelte';
import { describeEvent } from '../../utils/localEventFormat';
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

/** Decodes a calendar file, honouring a UTF-16 byte-order mark (UTF-8 otherwise). */
function decodeCalendarText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  // TextDecoder drops a UTF-8 BOM itself.
  return new TextDecoder('utf-8').decode(bytes);
}

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

  /** The Calendar Events manager: every event on the active schedule. */
  openManager(): void {
    if (!appState.activeSchedule) return;
    openModal('calendar-events');
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

  /** Opens Edit Event for an event of the active schedule. */
  openEditModal(eventId: string): void {
    const event = this.find(eventId);
    if (!event) return;

    modalState.localEvent = {
      existingEvent: event,
      onSave: draft => this.update(eventId, draft),
      onDelete: () =>
        this.confirmDelete([event], () => closeModal('local-event')),
    };
    openModal('local-event');
  }

  /** Opens the import modal on its "choose a file" screen, over whatever is open. */
  openImportModal(): void {
    if (!appState.activeSchedule) return;
    this.importRun++;
    modalState.icsImport = { status: 'idle' };
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
      // Let "Reading <file>..." paint before the synchronous parse blocks the
      // thread (rAF only defers here; it drives no animation).
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => setTimeout(resolve)),
      );
      const text = decodeCalendarText(await file.arrayBuffer());
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

  /**
   * Themed confirm naming exactly what is removed. `onDeleted` runs after the
   * events are gone (e.g. to close the Edit modal that asked).
   */
  confirmDelete(
    events: readonly LocalCalendarEvent[],
    onDeleted?: () => void,
  ): void {
    if (events.length === 0) return;
    const ids = events.map(e => e.id);
    const shown = events.slice(0, 6).map(describeEvent);
    const more =
      events.length > shown.length
        ? [`and ${events.length - shown.length} more`]
        : [];
    const message =
      events.length === 1
        ? `Delete ${shown[0]}?`
        : [`Delete ${events.length} events?`, ...shown, ...more].join('\n');
    showConfirm({
      title: events.length === 1 ? 'Delete Event' : 'Delete Events',
      message,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        this.deleteMany(ids);
        onDeleted?.();
      },
    });
  }

  private find(eventId: string): LocalCalendarEvent | undefined {
    return (appState.activeSchedule?.localEvents ?? []).find(
      e => e.id === eventId,
    );
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

  /** Saves an edit: same id and createdAt, fresh updatedAt, one undo step. */
  private update(eventId: string, draft: LocalEventDraft): void {
    const schedule = appState.activeSchedule;
    if (!schedule || !this.profileStateManager) return;
    const now = Date.now();
    const localEvents = (schedule.localEvents ?? []).map(e =>
      e.id === eventId
        ? {
            ...draft,
            visible: e.visible,
            id: e.id,
            createdAt: e.createdAt,
            updatedAt: now,
          }
        : e,
    );
    this.profileStateManager.updateSchedule(
      schedule.id,
      { localEvents },
      'calendar-event',
    );
  }

  /** Removes several events as one change (one save, one undo step). */
  deleteMany(eventIds: readonly string[]): void {
    const schedule = appState.activeSchedule;
    if (!schedule || !this.profileStateManager || eventIds.length === 0) return;

    const doomed = new Set(eventIds);
    const localEvents = (schedule.localEvents ?? []).filter(
      e => !doomed.has(e.id),
    );
    this.profileStateManager.updateSchedule(
      schedule.id,
      { localEvents },
      'calendar-event',
    );
  }
}

export const localEventService = new LocalEventService();
