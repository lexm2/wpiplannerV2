<script lang="ts">
  import { fly } from 'svelte/transition';
  import { tick } from 'svelte';
  import styles from '../styles/components/theme-selector.module.css';
  import { dur } from './transitions';
  import { clickOutside } from './clickOutside';
  import { ThemeManager } from '../themes/ThemeManager';
  import { uiState } from '../services/ui/uiState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { menuKeys, focusMenuItem, openingKey } from './menuKeys';

  // The saved-theme load happens during bootstrap; this component only renders +
  // drives selection off the ThemeManager singleton and the currentThemeId rune.
  const tm = ThemeManager.getInstance();
  const themes = tm.getAvailableThemes();

  let open = $state(false);
  let trigger = $state<HTMLButtonElement | null>(null);
  let optionsEl = $state<HTMLElement | null>(null);
  // `uiState.currentThemeId` is a rune bumped by ThemeManager.setTheme - so the
  // active option + current-name text recompute on any theme change, including
  // the gear menu's theme choices, which call themeManager.setTheme directly.
  const currentId = $derived(uiState.currentThemeId);
  const currentName = $derived(
    themes.find(t => t.id === currentId)?.name ?? '',
  );

  function selectTheme(id: string): void {
    tm.setTheme(id);
    open = false;
    // The option is about to go; keep the keyboard user's place.
    trigger?.focus();
  }

  // Opens with focus on the current theme when the trigger was operated by
  // keyboard (a click from Enter or Space has detail 0); a mouse click leaves
  // focus where it is.
  async function openOptions(
    focus: 'first' | 'last' | 'current' | null,
  ): Promise<void> {
    open = true;
    if (!focus) return;
    await tick();
    if (focus === 'current') {
      optionsEl?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    } else focusMenuItem(optionsEl, focus);
  }

  function onTriggerKeydown(e: KeyboardEvent): void {
    const which = openingKey(e);
    if (!which) return;
    e.preventDefault();
    if (open) focusMenuItem(optionsEl, which);
    else void openOptions(which);
  }

  function onKeydown(e: KeyboardEvent): void {
    // Only while open, so Escape still reaches modals and the wizard otherwise.
    if (!open || e.key !== 'Escape') return;
    e.preventDefault();
    open = false;
    trigger?.focus();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!--
  Global classes (.theme-dropdown/.theme-options/.dropdown-arrow) live in
  theme-selector-base.css and are written as plain strings. The dynamic state
  classes (.open/.theme-option/.active/...) come from the CSS *module*, so
  they're hashed and must be pulled from the imported `styles` object - meaning
  the `class:` directive (which needs a literal key) can't express them. We use
  the object form of the `class` attribute instead.
-->
<button
  type="button"
  class={['theme-dropdown', { [styles['open']]: open }]}
  id="theme-dropdown"
  bind:this={trigger}
  aria-label="Theme: {currentName}"
  aria-haspopup="menu"
  aria-expanded={open}
  aria-controls={open ? 'theme-options' : undefined}
  onkeydown={onTriggerKeydown}
  onclick={e => {
    if (open) open = false;
    else void openOptions(e.detail === 0 ? 'current' : null);
  }}
>
  <span id="current-theme-name">{currentName}</span>
  <span class="dropdown-arrow" id="theme-dropdown-arrow"
    >{@html getInlineSVG('CHEVRON_DOWN', 'dropdown-arrow-icon')}</span
  >
</button>
{#if open}
  <div
    class="theme-options"
    id="theme-options"
    role="menu"
    aria-label="Theme"
    bind:this={optionsEl}
    transition:fly={{ y: -8, duration: dur(200) }}
    use:clickOutside={{ onOutside: () => (open = false), ignore: trigger }}
    use:menuKeys={{ trigger, onClose: () => (open = false) }}
  >
    {#each themes as t (t.id)}
      <button
        type="button"
        class={[
          styles['theme-option'],
          { [styles['active']]: t.id === currentId },
        ]}
        data-theme-id={t.id}
        role="menuitemradio"
        aria-checked={t.id === currentId}
        onclick={() => selectTheme(t.id)}
      >
        <span class={styles['theme-option-name']}>{t.name}</span>
        <span class={styles['theme-option-check']} aria-hidden="true"
          >{@html getInlineSVG('CHECK')}</span
        >
        <span class={styles['theme-option-description']}>{t.description}</span>
      </button>
    {/each}
  </div>
{/if}
