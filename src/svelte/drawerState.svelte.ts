import { MediaQuery } from 'svelte/reactivity';
import { uiState, openModal, closeModal } from '../services/ui/uiState.svelte';

/**
 * Side panels that turn into drawers on narrow screens.
 *
 * Below its breakpoint a page hides a side panel; SidePanel then parks it
 * off-canvas and this module slides it in. An open drawer is an entry in
 * `uiState.openModals`, not a store of its own: it then takes part in the
 * modal stack like any dialog - Escape reaches the topmost entry only, a modal
 * opened from the drawer stacks above it, and the guards that stand down while
 * a modal is open (the section wizard's Escape, the term pager's keys) stand
 * down for a drawer too. `closeAllModals` and tutorial restores clear it with
 * the rest.
 */
export type DrawerId = 'departments' | 'details' | 'schedule';

/**
 * Where each panel is hidden. These mirror the page CSS (`.app-body` collapses
 * at 1200px, `.schedule-page-layout` at 1024px, and the toggles in
 * side-panel.css), which cannot read a variable inside a media query.
 */
const QUERIES: Record<DrawerId, string> = {
  departments: '(max-width: 1200px)',
  details: '(max-width: 1200px)',
  schedule: '(max-width: 1024px)',
};

/** Live "is this panel a drawer right now?" per panel. */
export const drawerMode = Object.fromEntries(
  Object.entries(QUERIES).map(([id, q]) => [id, new MediaQuery(q)]),
) as Record<DrawerId, MediaQuery>;

const PREFIX = 'drawer-';
const modalId = (id: DrawerId) => `${PREFIX}${id}`;

/** The open drawer, if any - at most one is ever open. */
export function openDrawerId(): DrawerId | null {
  const entry = uiState.openModals.find(m => m.startsWith(PREFIX));
  return entry ? (entry.slice(PREFIX.length) as DrawerId) : null;
}

export function isDrawerOpen(id: DrawerId): boolean {
  return uiState.openModals.includes(modalId(id));
}

/** Open and on top of the stack, so Escape is the drawer's to take. */
export function isTopmostDrawer(id: DrawerId): boolean {
  return uiState.openModals.at(-1) === modalId(id);
}

/**
 * Slide a panel in - only where it is actually hidden, since above its
 * breakpoint the panel is already on screen and an entry in the modal stack
 * would silence keys meant for the page. Returns whether it opened.
 */
export function openDrawer(id: DrawerId): boolean {
  if (!drawerMode[id].current) return false;
  closeDrawer();
  openModal(modalId(id));
  return true;
}

/** Close the given drawer, or whichever is open. */
export function closeDrawer(id: DrawerId | null = openDrawerId()): void {
  if (id) closeModal(modalId(id));
}
