<script lang="ts">
  import type { Snippet } from 'svelte';

  // Shared text field for the modals and the filter panel — the label / control
  // / error markup that five separate stylesheets each used to reimplement
  // (.form-input, .filter-search, .filter-range-input input,
  // .schedule-name-input, .wake-up-time-input). Styles live in
  // styles/components/input.css.
  //
  // The course search bar is deliberately NOT on this component; it keeps its
  // own .search-input recipe in main-content.css.
  let {
    value = $bindable(''),
    label,
    id,
    type = 'text',
    placeholder,
    error,
    required = false,
    disabled = false,
    multiline = false,
    panel = false,
    min,
    max,
    step,
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
    /** Error message. Truthy renders the message and marks the control invalid. */
    error?: string;
    /** Renders the asterisk and sets `aria-required`. The app validates on submit, so the native `required` attribute is deliberately not set. */
    required?: boolean;
    disabled?: boolean;
    /** Render a `<textarea>` instead of an `<input>`. */
    multiline?: boolean;
    /** Filter-panel recipe: flush on the section ground instead of recessed. */
    panel?: boolean;
    min?: number;
    max?: number;
    step?: number;
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

  // `bind:value` can't be used on an <input> whose `type` is dynamic, so the
  // write-back is manual. This also serves the one-way callers (the filters),
  // which pass `value={x}` and read `e.currentTarget.value` in their own
  // handler — for them the local assignment simply doesn't propagate up.
  function handleInput(event: Event): void {
    value = (event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
    oninput?.(event);
  }

  // aria-describedby needs a stable target, so the message is only wired up
  // when the caller gave the control an id.
  const messageId = $derived(id && error ? `${id}-error` : undefined);
</script>

<div
  class={[
    'field',
    fieldClass,
    { 'field--error': !!error, 'field--disabled': disabled, 'field--panel': panel },
  ]}
>
  {#if label}
    <label class="field-label" for={id}>
      {label}{#if required}<span class="field-required">*</span>{/if}
    </label>
  {/if}

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
        aria-label={ariaLabel}
        aria-required={required ? 'true' : undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={messageId}
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
        aria-label={ariaLabel}
        aria-required={required ? 'true' : undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={messageId}
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

  {#if error}
    <span class="field-message" id={messageId}>{error}</span>
  {/if}
</div>
