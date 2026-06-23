import type { StudentRecord } from '../../types/degree';

/**
 * Reactive state for the Degree page. `record` is $state.raw because it's
 * replaced wholesale (and must stay structured-cloneable for persistence),
 * matching the appState.schedules convention.
 */
class DegreeState {
    record = $state.raw<StudentRecord | null>(null);
    status = $state<'empty' | 'parsing' | 'ready' | 'error'>('empty');
    errorMessage = $state<string | null>(null);
}

export const degreeState = new DegreeState();
