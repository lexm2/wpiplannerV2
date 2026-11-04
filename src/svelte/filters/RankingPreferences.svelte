<script lang="ts">
  import FilterSection from './FilterSection.svelte';
  import { appState } from '../../core/state/appState.svelte';
  import { autoScheduleService } from '../../services/scheduling/autoScheduleService';
  import {
    DEFAULT_RANKING_PREFERENCES,
    IMPORTANCE_LEVELS,
    normalizeRankingPreferences,
    type Importance,
    type RankingPreferences,
  } from '../../services/scheduling/rankingPreferences';
  import { TimeUtils } from '../../utils/timeUtils';
  import { DayOfWeek } from '../../types/types';
  import styles from '../../styles/components/ranking-preferences.module.css';

  const prefs = $derived(
    normalizeRankingPreferences(appState.preferences.autoSchedule),
  );

  const isDefault = $derived(
    JSON.stringify(prefs) === JSON.stringify(DEFAULT_RANKING_PREFERENCES),
  );

  // Every write is the full normalized object as plain data: preferences are
  // $state.raw and persisted, so nothing reactive may reach them.
  function save(next: RankingPreferences): void {
    autoScheduleService.setRankingPreferences(
      normalizeRankingPreferences(next),
    );
  }

  function reset(): void {
    save(DEFAULT_RANKING_PREFERENCES);
  }

  const IMPORTANCE_LABEL: Record<Importance, string> = {
    off: 'Off',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
  };

  type Criterion = keyof RankingPreferences;
  type Day = RankingPreferences['freeDays']['days'][number];

  const ROWS: { key: Criterion; label: string }[] = [
    { key: 'earlyClasses', label: 'Early classes' },
    { key: 'lateClasses', label: 'Late classes' },
    { key: 'gaps', label: 'Gaps between classes' },
    { key: 'lunch', label: 'Lunch' },
    { key: 'fewerDays', label: 'Have classes on fewer days' },
    { key: 'freeDays', label: 'Free days' },
    {
      key: 'termBalance',
      label: 'Balance courses across terms (about 3 per term)',
    },
    { key: 'openSeats', label: 'Prefer sections with open seats' },
    {
      key: 'instructorRating',
      label: 'Prefer higher-rated professors (Rate My Professor)',
    },
  ];

  function setImportance(key: Criterion, importance: Importance): void {
    save({ ...prefs, [key]: { ...prefs[key], importance } });
  }

  // "HH:MM" every half hour, 7:00 AM to 10:00 PM.
  const TIMES: { value: string; label: string }[] = Array.from(
    { length: 31 },
    (_, i) => {
      const minutes = 7 * 60 + i * 30;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return {
        value: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
        label: TimeUtils.formatTime({ hours, minutes: mins, displayTime: '' }),
      };
    },
  );

  const MIN_GAPS = [
    { value: 0, label: 'No minimum' },
    ...[10, 15, 20, 30, 45, 60].map(m => ({ value: m, label: `${m} min` })),
  ];
  const MAX_GAPS = [
    { value: 0, label: 'As little as possible (0)' },
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
    { value: 45, label: '45 min' },
    { value: 60, label: '1 hr' },
    { value: 90, label: '1.5 hr' },
    { value: 120, label: '2 hr' },
    { value: 180, label: '3 hr' },
  ];
  const LUNCH_MINUTES = [15, 30, 45, 60, 90, 120].map(m => ({
    value: m,
    label: `${m} min`,
  }));

  const DAYS: { value: Day; label: string }[] = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
  ].map(d => ({ value: d, label: TimeUtils.getDayAbbr(d) }));

  /** The options, plus the current value when it is off-grid (e.g. set via the API). */
  function withCurrent<T extends string | number>(
    options: { value: T; label: string }[],
    current: T,
    format: (v: T) => string,
  ): { value: T; label: string }[] {
    return options.some(o => o.value === current)
      ? options
      : [...options, { value: current, label: format(current) }].sort((a, b) =>
          a.value < b.value ? -1 : 1,
        );
  }

  const asMinutes = (hhmm: string): number =>
    Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  const asClock = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  const earlyTimes = $derived(
    withCurrent(TIMES, prefs.earlyClasses.before, v => v),
  );
  const lateTimes = $derived(
    withCurrent(TIMES, prefs.lateClasses.after, v => v),
  );
  const lunchFromTimes = $derived(
    withCurrent(TIMES, prefs.lunch.from, v => v).filter(
      t => t.value < prefs.lunch.to,
    ),
  );
  const lunchToTimes = $derived(
    withCurrent(TIMES, prefs.lunch.to, v => v).filter(
      t => t.value > prefs.lunch.from,
    ),
  );
  const minGaps = $derived(
    withCurrent(MIN_GAPS, prefs.gaps.min, v => `${v} min`),
  );
  const maxGaps = $derived(
    withCurrent(MAX_GAPS, prefs.gaps.max, v => `${v} min`).filter(
      o => o.value >= prefs.gaps.min,
    ),
  );

  function setLunchFrom(from: string): void {
    // Keep the window non-empty: push `to` half an hour past a later start.
    const to =
      prefs.lunch.to > from ? prefs.lunch.to : asClock(asMinutes(from) + 30);
    save({ ...prefs, lunch: { ...prefs.lunch, from, to } });
  }

  function setMinGap(min: number): void {
    // Raising the minimum above the maximum raises the maximum with it.
    const max = Math.max(prefs.gaps.max, min);
    save({ ...prefs, gaps: { ...prefs.gaps, min, max } });
  }

  function toggleDay(day: Day): void {
    const days = DAYS.map(d => d.value).filter(d =>
      d === day
        ? !prefs.freeDays.days.includes(d)
        : prefs.freeDays.days.includes(d),
    );
    save({ ...prefs, freeDays: { ...prefs.freeDays, days } });
  }
</script>

{#snippet timeSelect(
  label: string,
  value: string,
  options: { value: string; label: string }[],
  onchange: (v: string) => void,
)}
  <select
    class={styles.select}
    aria-label={label}
    {value}
    onchange={e => onchange(e.currentTarget.value)}
  >
    {#each options as o (o.value)}
      <option value={o.value} selected={o.value === value}>{o.label}</option>
    {/each}
  </select>
{/snippet}

{#snippet numberSelect(
  label: string,
  value: number,
  options: { value: number; label: string }[],
  onchange: (v: number) => void,
)}
  <select
    class={styles.select}
    aria-label={label}
    {value}
    onchange={e => onchange(Number(e.currentTarget.value))}
  >
    {#each options as o (o.value)}
      <option value={o.value} selected={o.value === value}>{o.label}</option>
    {/each}
  </select>
{/snippet}

<FilterSection title="Schedule Preferences">
  {#snippet actions()}
    {#if !isDefault}
      <button class="filter-clear-btn" onclick={reset}>Reset</button>
    {/if}
  {/snippet}

  <p class="filter-hint {styles.hint}">
    These decide which schedules come first. They never rule one out; the
    filters below do that.
  </p>

  <div class={styles.rows}>
    {#each ROWS as row (row.key)}
      {@const importance = prefs[row.key].importance}
      <div class={styles.row} data-ranking={row.key}>
        <span class={styles.label} id="ranking-label-{row.key}"
          >{row.label}</span
        >
        <div
          class={styles.segments}
          role="radiogroup"
          aria-labelledby="ranking-label-{row.key}"
        >
          {#each IMPORTANCE_LEVELS as level (level)}
            <label class={styles.segment}>
              <input
                type="radio"
                class={styles.radio}
                name="ranking-{row.key}"
                value={level}
                checked={importance === level}
                onchange={() => setImportance(row.key, level)}
              />
              <span class={styles.segmentText}>{IMPORTANCE_LABEL[level]}</span>
            </label>
          {/each}
        </div>

        {#if row.key === 'earlyClasses'}
          <div
            class="{styles.params} {importance === 'off' ? styles.muted : ''}"
          >
            Avoid classes before
            {@render timeSelect(
              'Early classes: time',
              prefs.earlyClasses.before,
              earlyTimes,
              before =>
                save({
                  ...prefs,
                  earlyClasses: { ...prefs.earlyClasses, before },
                }),
            )}
          </div>
        {:else if row.key === 'lateClasses'}
          <div
            class="{styles.params} {importance === 'off' ? styles.muted : ''}"
          >
            Avoid classes after
            {@render timeSelect(
              'Late classes: time',
              prefs.lateClasses.after,
              lateTimes,
              after =>
                save({
                  ...prefs,
                  lateClasses: { ...prefs.lateClasses, after },
                }),
            )}
          </div>
        {:else if row.key === 'gaps'}
          <div
            class="{styles.params} {importance === 'off' ? styles.muted : ''}"
          >
            Time between classes: at least
            {@render numberSelect(
              'Gaps: minimum time between classes',
              prefs.gaps.min,
              minGaps,
              setMinGap,
            )}
            and at most
            {@render numberSelect(
              'Gaps: maximum time between classes',
              prefs.gaps.max,
              maxGaps,
              max => save({ ...prefs, gaps: { ...prefs.gaps, max } }),
            )}
          </div>
        {:else if row.key === 'lunch'}
          <div
            class="{styles.params} {importance === 'off' ? styles.muted : ''}"
          >
            Lunch break of
            {@render numberSelect(
              'Lunch: length',
              prefs.lunch.minutes,
              withCurrent(LUNCH_MINUTES, prefs.lunch.minutes, v => `${v} min`),
              minutes => save({ ...prefs, lunch: { ...prefs.lunch, minutes } }),
            )}
            between
            {@render timeSelect(
              'Lunch: window start',
              prefs.lunch.from,
              lunchFromTimes,
              setLunchFrom,
            )}
            and
            {@render timeSelect(
              'Lunch: window end',
              prefs.lunch.to,
              lunchToTimes,
              to => save({ ...prefs, lunch: { ...prefs.lunch, to } }),
            )}
          </div>
        {:else if row.key === 'freeDays'}
          <div
            class="{styles.params} {importance === 'off' ? styles.muted : ''}"
          >
            Keep these days free:
            <span
              class={styles.days}
              role="group"
              aria-label="Days to keep free"
            >
              {#each DAYS as day (day.value)}
                <label class={styles.day}>
                  <input
                    type="checkbox"
                    class={styles.radio}
                    checked={prefs.freeDays.days.includes(day.value)}
                    onchange={() => toggleDay(day.value)}
                  />
                  <span class={styles.segmentText}>{day.label}</span>
                </label>
              {/each}
            </span>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</FilterSection>
