<script lang="ts">
  import Modal from './Modal.svelte';
  import changelogMarkdown from '../../../CHANGELOG.md?raw';

  let { onRequestClose }: { onRequestClose: () => void } = $props();

  interface ChangelogSection {
    title: string;
    items: string[];
  }

  interface ChangelogEntry {
    date: string;
    sections: ChangelogSection[];
  }

  function parseMarkdown(markdown: string): ChangelogEntry[] {
    const entries: ChangelogEntry[] = [];
    const lines = markdown.split('\n');

    let currentEntry: ChangelogEntry | null = null;
    let currentSection: ChangelogSection | null = null;

    for (const line of lines) {
      const dateMatch = line.match(/^## \[([^\]]+)\]/);
      if (dateMatch) {
        if (currentEntry) {
          entries.push(currentEntry);
        }
        currentEntry = { date: dateMatch[1], sections: [] };
        currentSection = null;
        continue;
      }

      const sectionMatch = line.match(/^### (.+)/);
      if (sectionMatch && currentEntry) {
        currentSection = { title: sectionMatch[1], items: [] };
        currentEntry.sections.push(currentSection);
        continue;
      }

      const itemMatch = line.match(/^- (.+)/);
      if (itemMatch && currentEntry) {
        if (!currentSection) {
          currentSection = { title: '', items: [] };
          currentEntry.sections.push(currentSection);
        }
        currentSection.items.push(itemMatch[1]);
      }
    }

    if (currentEntry) {
      entries.push(currentEntry);
    }

    return entries;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  const changelogData = parseMarkdown(changelogMarkdown);
</script>

<Modal typeId="changelog" title="What's New" showHeader {onRequestClose}>
  {#snippet children(close)}
    <div class="modal-body changelog-modal-body">
      {#if changelogData.length === 0}
        <p class="changelog-empty">No changes to display</p>
      {:else}
        {#each changelogData as entry (entry.date)}
          <div class="changelog-entry">
            <h3 class="changelog-date">{formatDate(entry.date)}</h3>
            {#each entry.sections as section, i (i)}
              <div class="changelog-section">
                {#if section.title}
                  <h4 class="changelog-section-title">{section.title}</h4>
                {/if}
                <ul class="changelog-list">
                  {#each section.items as item, i (i)}
                    <li class="changelog-item">{item}</li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>
        {/each}
      {/if}
    </div>
    <div class="modal-footer">
      <button class="modal-btn btn-primary" onclick={close}>Got it</button>
    </div>
  {/snippet}
</Modal>
