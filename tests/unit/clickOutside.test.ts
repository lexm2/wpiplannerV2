/**
 * The shared outside-click action every dropdown closes through. The case that
 * motivated it: a menu inside a modal never closed, because the dialog stops
 * click propagation and the menu listened for bubbling clicks on the window.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { clickOutside } from '../../src/svelte/clickOutside';

const click = (el: Element) =>
  el.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true }),
  );

function el(parent: Element = document.body): HTMLElement {
  return parent.appendChild(document.createElement('div'));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('clickOutside', () => {
  it('fires on a click outside the node', () => {
    const node = el();
    const outside = el();
    const onOutside = vi.fn();
    const action = clickOutside(node, { onOutside });

    click(outside);
    expect(onOutside).toHaveBeenCalledOnce();
    action.destroy();
  });

  it('ignores clicks on the node and its descendants', () => {
    const node = el();
    const child = el(node);
    const onOutside = vi.fn();
    const action = clickOutside(node, { onOutside });

    click(node);
    click(child);
    expect(onOutside).not.toHaveBeenCalled();
    action.destroy();
  });

  it('ignores clicks on the ignore element and its descendants', () => {
    const node = el();
    const toggle = el();
    const icon = el(toggle);
    const onOutside = vi.fn();
    const action = clickOutside(node, { onOutside, ignore: toggle });

    click(toggle);
    click(icon);
    expect(onOutside).not.toHaveBeenCalled();
    action.destroy();
  });

  it('fires even when an ancestor of the target stops propagation', () => {
    const node = el();
    const dialog = el();
    const title = el(dialog);
    dialog.addEventListener('click', e => e.stopPropagation());
    dialog.addEventListener('click', e => e.stopPropagation(), true);
    const onOutside = vi.fn();
    const action = clickOutside(node, { onOutside });

    click(title);
    expect(onOutside).toHaveBeenCalledOnce();
    action.destroy();
  });

  it("runs before the target's own handler", () => {
    const node = el();
    const other = el();
    const order: string[] = [];
    other.addEventListener('click', () => order.push('target'));
    const action = clickOutside(node, {
      onOutside: () => order.push('outside'),
    });

    click(other);
    expect(order).toEqual(['outside', 'target']);
    action.destroy();
  });

  it('listens only while enabled', () => {
    const node = el();
    const outside = el();
    const onOutside = vi.fn();
    const action = clickOutside(node, { onOutside, enabled: false });

    click(outside);
    expect(onOutside).not.toHaveBeenCalled();

    action.update({ onOutside, enabled: true });
    click(outside);
    expect(onOutside).toHaveBeenCalledOnce();

    action.update({ onOutside, enabled: false });
    click(outside);
    expect(onOutside).toHaveBeenCalledOnce();
    action.destroy();
  });

  it('picks up a new callback and ignore element on update', () => {
    const node = el();
    const toggle = el();
    const first = vi.fn();
    const second = vi.fn();
    const action = clickOutside(node, { onOutside: first });

    action.update({ onOutside: second, ignore: toggle });
    click(toggle);
    expect(second).not.toHaveBeenCalled();
    click(document.body);
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    action.destroy();
  });

  it('stops listening once destroyed', () => {
    const node = el();
    const outside = el();
    const onOutside = vi.fn();
    clickOutside(node, { onOutside }).destroy();

    click(outside);
    expect(onOutside).not.toHaveBeenCalled();
  });
});
