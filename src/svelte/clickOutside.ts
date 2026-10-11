/**
 * Svelte action for dropdowns and popup menus: call `onOutside` when a click
 * lands outside the node (and outside `ignore`, typically the menu's toggle
 * button, so the toggle's own handler is left to open/close it).
 *
 * It listens on `document` in the capture phase, so it sees every click before
 * any handler can stop it - a bubbling window listener never hears clicks
 * inside a modal, whose dialog stops propagation. Capture also means it runs
 * before the target's handler, while the target is still in the DOM.
 *
 * Clicks inside the node are left alone: a menu item closes the menu itself
 * when it runs.
 */

export interface ClickOutsideParams {
  onOutside: (event: MouseEvent) => void;
  /** Also counted as inside, e.g. the button that toggles the menu. */
  ignore?: Element | null;
  /** Listen only while true (default), for menus that stay mounted. */
  enabled?: boolean;
}

export function clickOutside(node: HTMLElement, params: ClickOutsideParams) {
  let current = params;
  let listening = false;

  function onClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!target || node.contains(target) || current.ignore?.contains(target))
      return;
    current.onOutside(event);
  }

  function listen(on: boolean): void {
    if (on === listening) return;
    listening = on;
    if (on) document.addEventListener('click', onClick, true);
    else document.removeEventListener('click', onClick, true);
  }

  listen(current.enabled ?? true);

  return {
    update(next: ClickOutsideParams): void {
      current = next;
      listen(current.enabled ?? true);
    },
    destroy(): void {
      listen(false);
    },
  };
}
