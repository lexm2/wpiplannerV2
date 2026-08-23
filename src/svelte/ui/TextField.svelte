<script lang="ts">
  import type { Snippet } from 'svelte';
  import Field from './Field.svelte';

  // Shared text field for the modals, the search bar and the filter panel.
  // Field supplies the label / hint / message scaffold; everything from
  // `.field-shell` inward is owned here. Styles: styles/components/input.css.
  let {
    value = $bindable(''),
    label,
    id,
    type = 'text',
    placeholder,
    hint,
    error,
    required = false,
    disabled = false,
    multiline = false,
    panel = false,
    min,
    max,
    step,
    inputmode,
    ariaLabel,
    autofocus = false,
    fieldClass,
    trailing,
    oninput,
    onchange,
    onkeydown,
    onblur,
    onfocus,
    onclick,
  }: {
    value?: string;
    /** Visible label. Omit for an unlabelled field and pass `ariaLabel` instead. */
    label?: string;
    /** Lands on the control itself, never a wrapper — tutorial steps target `#id`. */
    id?: string;
    type?: 'text' | 'number' | 'date' | 'time' | 'search';
    placeholder?: string;
    /** Non-error help text, rendered below the control. */
    hint?: string;
    /** Error message. Truthy renders the message and marks the control invalid. */
    error?: string;
    /** Renders the asterisk and sets `aria-required`. Not the native attribute — the app validates on submit. */
    required?: boolean;
    disabled?: boolean;
    /** Render a `<textarea>` instead of an `<input>`. */
    multiline?: boolean;
    /** Filter-panel recipe: flush on the section ground instead of recessed. */
    panel?: boolean;
    min?: number;
    max?: number;
    step?: number;
    /** Which on-screen keyboard to raise on touch devices. */
    inputmode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
    ariaLabel?: string;
    /** Literal attribute, not an action — `trapFocus` resolves `[autofocus]`. */
    autofocus?: boolean;
    /** Extra class(es) on the outer `.field`, for layout at the call site. */
    fieldClass?: string;
    /** Buttons or icons rendered inside the shell, after the control. */
    trailing?: Snippet;
    oninput?: (event: Event) => void;
    onchange?: (event: Event) => void;
    onkeydown?: (event: KeyboardEvent) => void;
    onblur?: (event: FocusEvent) => void;
    onfocus?: (event: FocusEvent) => void;
    onclick?: (event: MouseEvent) => void;
  } = $props();

  // `bind:value` can't be used on an <input> with a dynamic `type`, so write-back
  // is manual. One-way callers (the filters) pass `value={x}` and read
  // e.currentTarget.value themselves — for them this assignment doesn't propagate.
  function handleInput(event: Event): void {
    value = (event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
    oninput?.(event);
  }
</script>

<Field {label} controlId={id} {hint} {error} {required} {disabled} {panel} {fieldClass}>
  {#snippet children({ describedBy })}
    <div class={['field-shell', { 'field-shell--multiline': multiline }]}>
      {#if multiline}
        <!-- svelte-ignore a11y_autofocus (callers opt in deliberately; trapFocus resolves [autofocus]) -->
        <textarea
          class="field-control field-control--multiline"
          {id}
          {value}
          {placeholder}
          {disabled}
          {autofocus}
          {inputmode}
          aria-label={ariaLabel}
          aria-required={required ? 'true' : undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          oninput={handleInput}
          {onchange}
          {onkeydown}
          {onblur}
          {onfocus}
          {onclick}
        ></textarea>
      {:else}
        <!-- svelte-ignore a11y_autofocus (callers opt in deliberately; trapFocus resolves [autofocus]) -->
        <input
          class="field-control"
          {type}
          {id}
          {value}
          {placeholder}
          {disabled}
          {autofocus}
          {min}
          {max}
          {step}
          {inputmode}
          aria-label={ariaLabel}
          aria-required={required ? 'true' : undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          oninput={handleInput}
          {onchange}
          {onkeydown}
          {onblur}
          {onfocus}
          {onclick}
        />
      {/if}

      {#if trailing}
        <span class="field-affix">{@render trailing()}</span>
      {/if}
    </div>
  {/snippet}
</Field>
