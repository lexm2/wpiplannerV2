<script lang="ts">
  import type { Snippet } from 'svelte';
  import ResizeHandle from './ResizeHandle.svelte';
  import type { PanelWidthConfig } from './panelWidths';

  /**
   * A resizable side panel: the shell every one of them needs, plus its handle.
   *
   * The shell exists to hold two invariants that are easy to get wrong
   * separately. ResizeHandle is absolutely positioned and measures its
   * parentElement, so the panel must be `position: relative` AND must not be
   * the scrolling element - otherwise the handle scrolls away with the content
   * and reports the wrong width. Content therefore scrolls in a child, never
   * here.
   *
   * Layout of the contents stays with the caller: one panel is a plain column,
   * another a two-row grid, another a header/content/footer stack. Only the
   * shell and the handle are shared. The panel's WIDTH also stays with the
   * caller, because it comes from a grid template on some pages and from the
   * panel's own `width` on others - both read the same `config.cssVar`.
   */
  interface Props {
    /** Drives the handle: which custom property to write, bounds, persistence. */
    config: PanelWidthConfig;
    /** Edge the handle sits on - the side facing the page's content. */
    edge: 'left' | 'right';
    /** Accessible label for the resize separator. */
    resizeLabel: string;
    /** Accessible label for the panel region itself. */
    label?: string;
    /** The page's own class, for its layout and width rules. */
    class?: string;
    children: Snippet;
    /** Anything else lands on the <aside> - notably the stable `data-*` hooks
     * that tests and tutorial steps address the panel by, since `class` is a
     * hashed CSS-module name and cannot be selected on. */
    [key: string]: unknown;
  }

  let {
    config,
    edge,
    resizeLabel,
    label,
    class: className = '',
    children,
    ...rest
  }: Props = $props();
</script>

<aside
  class="side-panel side-panel-{edge} {className}"
  aria-label={label}
  {...rest}
>
  {@render children()}
  <ResizeHandle {config} {edge} label={resizeLabel} />
</aside>
