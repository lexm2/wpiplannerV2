/**
 * Scroll handling for the schedule sidebar while a panel (the component-selection
 * wizard) is open.
 *
 * The panel is absolutely positioned at top:0 inside this scroll container, so
 * the scroll must be reset to the top before the overflow lock applies —
 * otherwise, if the sidebar was scrolled down, the panel renders above the
 * visible area and the lock leaves no way to scroll up to it. The previous
 * position is restored on close.
 *
 * Lives as an action on the owning element (App.svelte) rather than as an
 * $effect inside the wizard, which used to reach across components via
 * document.getElementById. The `wizard-active` class itself is now a plain
 * `class:` directive; this action only owns the scroll behaviour, which a class
 * directive cannot express.
 */
export function wizardScrollLock(node: HTMLElement, isOpen: boolean) {
    let prevScrollTop = 0;

    function apply(open: boolean): void {
        if (open) {
            prevScrollTop = node.scrollTop;
            node.scrollTop = 0;
        } else {
            node.scrollTop = prevScrollTop;
        }
    }

    let current = isOpen;
    if (current) apply(true);

    return {
        update(next: boolean) {
            if (next !== current) {
                current = next;
                apply(next);
            }
        },
        destroy() {
            if (current) apply(false);
        },
    };
}
