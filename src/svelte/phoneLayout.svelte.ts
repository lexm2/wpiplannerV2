import { MediaQuery } from 'svelte/reactivity';

/**
 * The phone layout, for markup that differs there and not just its styling.
 * The same 560px as every phone rule in the CSS, so the two never disagree.
 */
export const phoneLayout = new MediaQuery('(max-width: 560px)');
