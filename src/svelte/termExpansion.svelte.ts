import { tick } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

/**
 * Course-list term-expansion FLIP animation — extracted from CourseList.svelte so
 * the component stays render-only. This is the runes-native port of the old
 * MainController FLIP height animation + diagonal badge cascade.
 *
 * `expandedTerm` (courseId -> 'A'|'B'|'C'|'D') is the reactive source the list
 * template reads; `toggleTerm` mutates it (running the collapse fade first), and
 * the `termFlip` action animates the `.course-item` height when it changes.
 * CourseList is the only consumer, so a module-level singleton store is fine.
 */

// courseId -> expanded term letter ('A'|'B'|'C'|'D').
export const expandedTerm = new SvelteMap<string, string>();

// courseId -> .course-item height captured at click time, before the DOM swaps.
// The FLIP needs the *pre-swap* height; an action's update() runs post-swap.
const pendingStartHeight = new Map<string, number>();

const BADGE_STEP_MS = 30; // per-step delay of the diagonal crumb cascade

// Svelte transitions don't auto-respect prefers-reduced-motion; snapshot at load.
const reduceMotion = typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ~2ms per pixel of height delta, clamped to [200, 500]ms — ports the old
// MainController.getHeightAnimDuration so longer expansions take a bit longer.
function heightAnimDuration(from: number, to: number): number {
    return Math.min(500, Math.max(200, Math.abs(to - from) * 2)) / 1000;
}

// Group badges into their wrapped visual rows by offsetTop (flex-wrap lays them
// out in rows); within a row they keep DOM order. Used for the diagonal cascade.
function groupBadgeRows(badges: HTMLElement[]): HTMLElement[][] {
    const rowMap = new Map<number, HTMLElement[]>();
    for (const b of badges) {
        const top = b.offsetTop;
        if (!rowMap.has(top)) rowMap.set(top, []);
        rowMap.get(top)!.push(b);
    }
    return Array.from(rowMap.keys()).sort((a, b) => a - b).map(k => rowMap.get(k)!);
}

// Lock a row at its current height + clip overflow synchronously, before the
// rune mutation triggers the {#if} swap. This stops the new content from
// painting at full size for one frame (the flash) — it renders clipped inside
// the locked height until termFlip animates the height to its new value.
function lockForFlip(item: HTMLElement, courseId: string): void {
    const h = item.getBoundingClientRect().height;
    item.style.height = `${h}px`;
    item.style.overflow = 'hidden';
    item.style.willChange = 'height';
    pendingStartHeight.set(courseId, h);
}

export function toggleTerm(e: MouseEvent, courseId: string, term: string, available: boolean): void {
    if (!available) return;
    const item = (e.currentTarget as HTMLElement | null)?.closest('.course-item') as HTMLElement | null;
    const container = item?.querySelector('.term-sections-container') as HTMLElement | null;
    const collapsing = expandedTerm.get(courseId) === term;

    // Collapsing with motion: play the open animation in reverse — fade the
    // section badges out diagonally from the bottom-right up to the top-left,
    // THEN collapse the row. The {#if} swap removes the badges from the DOM the
    // instant the rune flips, so the fade must run here, before that mutation.
    if (collapsing && item && container && !reduceMotion) {
        const rows = groupBadgeRows(
            Array.from(container.querySelectorAll('.section-badge')) as HTMLElement[]
        );
        let maxStep = 0;
        rows.forEach((row, ri) => row.forEach((_, ci) => { maxStep = Math.max(maxStep, ri + ci); }));
        rows.forEach((row, ri) => {
            row.forEach((b, ci) => {
                b.style.transition = 'opacity 0.15s ease';
                // Reverse the diagonal: highest (rowIndex + colIndex) fades first.
                window.setTimeout(() => { b.style.opacity = '0'; }, (maxStep - (ri + ci)) * BADGE_STEP_MS);
            });
        });
        // Once the crumbs have faded out, lock the height and flip to collapsed.
        window.setTimeout(() => {
            lockForFlip(item, courseId);
            expandedTerm.delete(courseId);
        }, maxStep * BADGE_STEP_MS + 150);
        return;
    }

    if (item) lockForFlip(item, courseId);
    if (collapsing) expandedTerm.delete(courseId);
    else expandedTerm.set(courseId, term);
}

// Port of the old MainController FLIP height animation. Driven by the
// `expandedTerm` rune: when a course's expanded term changes, Svelte swaps the
// {#if expanded} content, then this action animates the .course-item height
// from its old value to its new one (overflow clipped during the tween) and
// fades the section badges ("crumbs") in one-by-one. Badges start at opacity:0
// in CSS so they can never flash their finished state before the animation.
export function termFlip(item: HTMLElement, term: string | undefined) {
    let current = term;
    let cancel: (() => void) | null = null;

    function run(startH: number): void {
        cancel?.();

        // The row is already locked at startH with overflow:hidden (set in the
        // click handler, before the swap painted). Measure the new content's full
        // height while it's at auto — also the moment to read each badge's wrapped
        // row position — then snap back to startH before adding the transition.
        item.style.willChange = 'height';
        item.style.overflow = 'hidden';
        item.style.height = 'auto';
        const targetH = item.getBoundingClientRect().height;

        // Group section badges into visual rows. The stagger delay is diagonal —
        // (rowIndex + colIndex) * step — so each row starts one step after the
        // previous instead of waiting for it to finish. A single row is just
        // 0,1,2,…; many rows cascade as a wavefront without taking years.
        const rows = groupBadgeRows(
            Array.from(item.querySelectorAll('.term-sections-container .section-badge')) as HTMLElement[]
        );

        item.style.height = `${startH}px`;
        void item.offsetHeight; // commit start height before adding the transition
        const dur = reduceMotion ? 0 : heightAnimDuration(startH, targetH);
        item.style.transition = `height ${dur}s ease`;

        // Prime the crumbs (inline transition; CSS already holds them at opacity 0)
        // and compute the longest delay so cleanup waits for the whole cascade.
        let maxDelay = 0;
        if (!reduceMotion) {
            rows.forEach((row, rowIndex) => {
                row.forEach((b, colIndex) => {
                    b.style.transition = 'opacity 0.15s ease';
                    maxDelay = Math.max(maxDelay, (rowIndex + colIndex) * BADGE_STEP_MS);
                });
            });
        }

        const timers: ReturnType<typeof setTimeout>[] = [];
        requestAnimationFrame(() => {
            item.style.height = `${targetH}px`;
            if (!reduceMotion) {
                rows.forEach((row, rowIndex) => {
                    row.forEach((b, colIndex) => {
                        timers.push(setTimeout(() => {
                            b.style.opacity = '1';
                        }, (rowIndex + colIndex) * BADGE_STEP_MS));
                    });
                });
            }
        });

        const finish = (): void => {
            for (const t of timers) clearTimeout(t);
            item.style.height = '';
            item.style.transition = '';
            item.style.overflow = '';
            item.style.willChange = '';
            cancel = null;
        };

        const total = Math.max(dur * 1000, maxDelay + 200) + 100;
        const timer = setTimeout(finish, total);
        cancel = () => { clearTimeout(timer); finish(); };
    }

    return {
        update(next: string | undefined): void {
            if (next === current) return;
            current = next;
            // Start height was captured at click (pre-swap); fall back to live height.
            const courseId = item.dataset.courseId;
            const startH = (courseId != null ? pendingStartHeight.get(courseId) : undefined)
                ?? item.getBoundingClientRect().height;
            if (courseId != null) pendingStartHeight.delete(courseId);
            // Wait for the {#if} swap to land, then animate to the new height.
            tick().then(() => run(startH));
        },
        destroy(): void {
            cancel?.();
        },
    };
}
