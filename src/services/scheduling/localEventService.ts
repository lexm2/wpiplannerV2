import { appState } from '../../core/state/appState.svelte'
import { modalState } from '../../svelte/modals/modalState.svelte'
import type { ProfileStateManager } from '../../core/state/ProfileStateManager'
import type { UIStateManager } from '../ui/UIStateManager'
import type { LocalCalendarEvent } from '../../types/schedule'

/**
 * Standalone local calendar-event CRUD for the schedule page.
 *
 * Reads the active schedule from the `appState.activeSchedule` rune and persists
 * add/delete by replacing the schedule immutably via
 * ProfileStateManager.updateSchedule — so the `$derived` activeSchedule
 * re-derives and the reactive grid drops/adds the calendar-event blocks on its
 * own.
 *
 * Needs ProfileStateManager (not a singleton) + UIStateManager, injected once via
 * init().
 */
class LocalEventService {
    private profileStateManager: ProfileStateManager | null = null
    private uiStateManager: UIStateManager | null = null

    init(profileStateManager: ProfileStateManager, uiStateManager: UIStateManager): void {
        this.profileStateManager = profileStateManager
        this.uiStateManager = uiStateManager
    }

    openAddModal(): void {
        if (!appState.activeSchedule) {
            console.warn('[localEventService] Cannot open add event modal - no active schedule')
            return
        }

        modalState.localEvent = {
            onSave: (eventData) => this.add(eventData),
        }
        this.uiStateManager?.modalOpened('local-event')
    }

    /** Delete-confirmation modal for a local event (the grid's external-event-block click target). */
    openDeleteModal(eventId: string): void {
        const schedule = appState.activeSchedule
        if (!schedule || !this.uiStateManager) return

        const localEvent = (schedule.localEvents || []).find(e => e.id === eventId)
        const title = localEvent?.title || 'Untitled Event'
        modalState.deleteLocalEvent = { title, onConfirm: () => this.delete(eventId) }
        this.uiStateManager.modalOpened('delete-local-event')
    }

    private add(eventData: Omit<LocalCalendarEvent, 'id' | 'createdAt' | 'updatedAt'>): void {
        const schedule = appState.activeSchedule
        if (!schedule || !this.profileStateManager) return

        const now = Date.now()
        const newEvent: LocalCalendarEvent = {
            ...eventData,
            id: `local-${now}-${Math.random().toString(36).substring(2, 11)}`,
            createdAt: now,
            updatedAt: now,
        }

        const updatedLocalEvents = [...(schedule.localEvents || []), newEvent]
        this.profileStateManager.updateSchedule(
            schedule.id,
            { localEvents: updatedLocalEvents },
            'calendar-event-exclusion',
        )
    }

    private delete(eventId: string): void {
        const schedule = appState.activeSchedule
        if (!schedule || !this.profileStateManager) return

        const updatedLocalEvents = (schedule.localEvents || []).filter(e => e.id !== eventId)
        this.profileStateManager.updateSchedule(
            schedule.id,
            { localEvents: updatedLocalEvents },
            'calendar-event-exclusion',
        )
    }
}

export const localEventService = new LocalEventService()
