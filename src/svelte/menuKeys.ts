/**
 * Svelte action giving a popup menu the keyboard model of a menu button:
 * Arrow Up/Down, Home and End move between its items, and the menu closes when
 * focus leaves it for somewhere other than its trigger (Tab walking on).
 *
 * Escape and clicks outside are the owner's, since they differ per menu (a
 * modal's own Escape handler has to be beaten to it).
 */

const ITEMS = '[role="menuitem"], [role="menuitemradio"]';

export interface MenuKeysParams {
  /** The button that opens the menu; focus moving back to it is not leaving. */
  trigger: Element | null;
  onClose: () => void;
}

/** The menu's enabled, visible items. */
function itemsOf(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>(ITEMS)].filter(
    el =>
      !(el as HTMLButtonElement).disabled &&
      (el.offsetWidth > 0 || el.offsetHeight > 0),
  );
}

/** Moves focus to a menu's first or last item, as opening it by keyboard does. */
export function focusMenuItem(
  menu: HTMLElement | null | undefined,
  which: 'first' | 'last' = 'first',
): void {
  if (!menu) return;
  const items = itemsOf(menu);
  (which === 'first' ? items[0] : items.at(-1))?.focus();
}

/**
 * Whether a trigger's key press should open its menu with focus inside, like
 * the arrow keys on a native menu button. Enter and Space click the button
 * themselves; the caller tells those apart with `event.detail === 0`.
 */
export function openingKey(e: KeyboardEvent): 'first' | 'last' | null {
  if (e.key === 'ArrowDown') return 'first';
  if (e.key === 'ArrowUp') return 'last';
  return null;
}

export function menuKeys(node: HTMLElement, params: MenuKeysParams) {
  let current = params;

  function onKeydown(e: KeyboardEvent): void {
    const items = itemsOf(node);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (e.key) {
      case 'ArrowDown':
        next = at < 0 ? 0 : (at + 1) % items.length;
        break;
      case 'ArrowUp':
        next =
          at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    items[next].focus();
  }

  function onFocusout(e: FocusEvent): void {
    // No destination (window blur, a click on dead space) is not a Tab away;
    // clicks outside are the owner's clickOutside.
    const to = e.relatedTarget as Node | null;
    if (!to || node.contains(to) || current.trigger?.contains(to)) return;
    current.onClose();
  }

  node.addEventListener('keydown', onKeydown);
  node.addEventListener('focusout', onFocusout);

  return {
    update(next: MenuKeysParams): void {
      current = next;
    },
    destroy(): void {
      node.removeEventListener('keydown', onKeydown);
      node.removeEventListener('focusout', onFocusout);
    },
  };
}
