<script lang="ts">
  import { fly } from 'svelte/transition';
  import styles from '../styles/components/theme-selector.module.css';
  import { dur } from './transitions';
  import { ThemeManager } from '../themes/ThemeManager';
  import { uiState } from '../services/ui/uiState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';

  // The saved-theme load happens during bootstrap; this component only renders +
  // drives selection off the ThemeManager singleton and the currentThemeId rune.
  const tm = ThemeManager.getInstance();
  const themes = tm.getAvailableThemes();

  let open = $state(false);
  // `uiState.currentThemeId` is a rune bumped by ThemeManager.setTheme — so the
  // active option + current-name text recompute on any theme change, including
  // the settings-menu "Toggle Theme" which calls themeManager.setTheme directly.
  const currentId = $derived(uiState.currentThemeId);
  const currentName = $derived(
    themes.find(t => t.id === currentId)?.name ?? ''
  );

  function toggle(e: MouseEvent): void {
    e.stopPropagation();
    open = !open;
  }

  function selectTheme(id: string): void {
    tm.setTheme(id); // bumps the rune → display updates reactively
    open = false;
  }
</script>

<svelte:window onclick={() => (open = false)} />

<!--
  Global classes (.theme-dropdown/.theme-options/.dropdown-arrow) live in
  theme-selector-base.css and are written as plain strings. The dynamic state
  classes (.open/.theme-option/.active/...) come from the CSS *module*, so
  they're hashed and must be pulled from the imported `styles` object — meaning
  the `class:` directive (which needs a literal key) can't express them. We use
  the object form of the `class` attribute instead.
-->
<button
  type="button"
  class={["theme-dropdown", { [styles['open']]: open }]}
  id="theme-dropdown"
  aria-haspopup="true"
  aria-expanded={open}
  onclick={toggle}
>
  <span id="current-theme-name">{currentName}</span>
  <span class="dropdown-arrow" id="theme-dropdown-arrow">{@html getInlineSVG('CHEVRON_DOWN', 'dropdown-arrow-icon')}</span>
</button>
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (container only stops propagation; its children are real buttons) -->
{#if open}
<div
  class="theme-options"
  id="theme-options"
  transition:fly={{ y: -8, duration: dur(200) }}
  onclick={(e) => e.stopPropagation()}
>
  {#each themes as t (t.id)}
    <button
      type="button"
      class={[styles['theme-option'], { [styles['active']]: t.id === currentId }]}
      data-theme-id={t.id}
      onclick={() => selectTheme(t.id)}
    >
      <span class={styles['theme-option-name']}>{t.name}</span>
      <span class={styles['theme-option-description']}>{t.description}</span>
    </button>
  {/each}
</div>
{/if}
