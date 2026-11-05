import { tick } from 'svelte';

/**
 * Hand keyboard focus on after an action unmounts the control that held it
 * (a placed course leaving the rail, a removed tile): without this focus falls
 * to <body> and the next Tab starts from the top of the page. Waits for the DOM
 * to catch up with the state change, then focuses the first candidate that is
 * still on the page.
 */
export async function refocusAfter(
  ...candidates: Array<() => HTMLElement | null | undefined>
): Promise<void> {
  await tick();
  for (const find of candidates) {
    const el = find();
    if (el?.isConnected) {
      el.focus();
      return;
    }
  }
}

const esc = (value: string): string =>
  typeof CSS !== 'undefined' ? CSS.escape(value) : value;

/** The element for a course's tile inside a bucket card, by a selector within it. */
export function placedTile(
  courseId: string,
  inner: string,
): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `.degree-card-list [data-course-id="${esc(courseId)}"] ${inner}`,
  );
}

/**
 * Where focus can go when a course's row is about to disappear: the same
 * control on the rows either side of it. Read before the state changes.
 */
export function neighbourControls(
  row: Element | null,
  selector: string,
): Array<() => HTMLElement | null> {
  const find = (el: Element | null | undefined) => () =>
    el?.matches(selector)
      ? (el as HTMLElement)
      : (el?.querySelector<HTMLElement>(selector) ?? null);
  return [find(row?.nextElementSibling), find(row?.previousElementSibling)];
}

/**
 * Arrow-key navigation for a role="menu": Up/Down (wrapping), Home and End move
 * focus between its menu items, and the first item takes focus when the menu
 * opens, as the menu pattern asks.
 */
export function menuKeys(node: HTMLElement) {
  const items = (): HTMLElement[] =>
    [...node.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(
      el => !(el as HTMLButtonElement).disabled,
    );

  function onKeydown(e: KeyboardEvent): void {
    const list = items();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % list.length;
    else if (e.key === 'ArrowUp') next = at <= 0 ? list.length - 1 : at - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    if (next === null) return;
    e.preventDefault();
    list[next].focus();
  }

  node.addEventListener('keydown', onKeydown);
  items()[0]?.focus();
  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
    },
  };
}
