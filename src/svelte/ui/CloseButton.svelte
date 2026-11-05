<script lang="ts">
  import { getInlineSVG } from '../../utils/iconPaths';

  // The close button of every window, drawer and panel header. Its look lives
  // here (styles/components/buttons.css), so a host only says where it sits.
  let {
    onclick,
    label = 'Close',
    class: className,
  }: {
    onclick: () => void;
    /** Says what closes, where a plain "Close" could mean several things. */
    label?: string;
    /** The host's placement, never its look. */
    class?: string;
  } = $props();
</script>

<button
  type="button"
  class={['close-button', className]}
  aria-label={label}
  onclick={() => onclick()}
>
  {@html getInlineSVG('X', 'close-button-icon')}
</button>
