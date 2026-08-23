<script lang="ts">
  import type { Snippet } from 'svelte';

  // The label / hint / message scaffold shared by TextField and by non-text
  // controls (the Add Event groups, the RMP slider groups, the colour swatch).
  // Styles live in styles/components/input.css.
  //
  // Renders NO wrapper beyond `.field` — local-event-modal.module.css:19 and
  // modal.css:987 both reach it with a direct-child combinator.

  interface FieldParts {
    /** hint id then error id, whichever exist — for the control's aria-describedby. */
    describedBy?: string;
  }

  let {
    label,
    controlId,
    group = false,
    hint,
    error,
    required = false,
    disabled = false,
    panel = false,
    fieldClass,
    children,
  }: {
    /** Visible label. In `group` mode this is the group's only accessible name. */
    label?: string;
    /** The control's id: the label's `for`, and the base for the generated
     *  `-label`/`-hint`/`-error` ids. Omit and `$props.id()` supplies one. */
    controlId?: string;
    /** Children are a set of controls, not one focusable control: the label
     *  becomes a `<span id>` and `.field` carries role="group" + aria-labelledby. */
    group?: boolean;
    /** Non-error help text, below the control. Stays visible while an error shows. */
    hint?: string;
    /** Error message. Truthy renders `.field-message` and sets `field--error`. */
    error?: string;
    /** Renders the asterisk. Not the native attribute — the app validates on submit. */
    required?: boolean;
    disabled?: boolean;
    /** Filter-panel recipe: flush on the section ground instead of recessed. */
    panel?: boolean;
    /** Extra class(es) on the outer `.field`, for layout at the call site. */
    fieldClass?: string;
    children: Snippet<[FieldParts]>;
  } = $props();

  const uid = $props.id();
  const base = $derived(controlId ?? uid);
  const labelId = $derived(label ? `${base}-label` : undefined);
  const hintId = $derived(hint ? `${base}-hint` : undefined);
  const messageId = $derived(error ? `${base}-error` : undefined);
  // Hint before message — aria-describedby is announced in list order.
  const describedBy = $derived([hintId, messageId].filter(Boolean).join(' ') || undefined);
</script>

<div
  class={[
    'field',
    fieldClass,
    { 'field--error': !!error, 'field--disabled': disabled, 'field--panel': panel },
  ]}
  role={group ? 'group' : undefined}
  aria-labelledby={group ? labelId : undefined}
  aria-describedby={group ? describedBy : undefined}
>
  {#if label}
    {#if group}
      <!-- Named by a descendant span, not a <label> — the children aren't one
           labelable control. No aria-invalid/aria-required: ARIA `group`
           supports neither, and emitting them trips axe's aria-allowed-attr. -->
      <span class="field-label" id={labelId}>
        {label}{#if required}<span class="field-required">*</span>{/if}
      </span>
    {:else}
      <label class="field-label" for={controlId} id={labelId}>
        {label}{#if required}<span class="field-required">*</span>{/if}
      </label>
    {/if}
  {/if}

  {@render children({ describedBy: group ? undefined : describedBy })}

  {#if hint}<span class="field-hint" id={hintId}>{hint}</span>{/if}

  {#if error}<span class="field-message" id={messageId}>{error}</span>{/if}
</div>
