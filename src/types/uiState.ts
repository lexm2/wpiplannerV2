import type { ComponentKind } from './types';
import type { DrawerId } from '../svelte/drawerState.svelte';

export type PageId = 'planner' | 'schedule' | 'degree';
export type ViewMode = 'list' | 'grid';

interface WizardState {
  isOpen: boolean;
  courseId: string | null;
  step: ComponentKind | null;
}

export interface UIState {
  currentPage: PageId;
  currentView: ViewMode;
  openModals: string[];
  wizard: WizardState;
  /** Disclosure ids (MoreSection) to hold open while the step is showing. */
  openDisclosures?: string[];
  /** Side panels to slide in while the step is showing, where they are drawers. */
  openDrawers?: DrawerId[];
}
