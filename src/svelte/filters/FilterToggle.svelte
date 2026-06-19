<script lang="ts">
  // Shared checkbox toggle row used across the filter sections — the
  // `filter-toggle-label` / checkbox / slider / text markup that was copy-pasted
  // in Bookmarks and Availability (×3).
  let { label, checked, onchange }: {
    label: string;
    checked: boolean;
    onchange: (checked: boolean) => void;
  } = $props();
</script>

<label class="filter-toggle-label">
  <input
    type="checkbox"
    class="filter-toggle"
    {checked}
    onchange={(e) => onchange(e.currentTarget.checked)}
  />
  <span class="filter-toggle-slider"></span>
  <span class="filter-toggle-text">{label}</span>
</label>
