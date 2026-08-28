<script lang="ts">
  import styles from '../styles/components/right-panel.module.css';
  import { rateMyProfessorService } from '../services/external/RateMyProfessorService';
  import { getInlineSVG } from '../utils/iconPaths';
  import { courseListState } from './courseListState.svelte';
  import { untrack } from 'svelte';
  import type { CourseDataService } from '../services/data/courseDataService';
  import type { Course, Section } from '../types/types';

  let {
    courseDataService,
  }: {
    courseDataService: CourseDataService;
  } = $props();

  const CATEGORY_DESCRIPTIONS: Record<1 | 2 | 3, string> = {
    1: 'Cat. I courses cover core material of interest to large numbers of students and are offered at least once a year.',
    2: 'Cat. II courses are offered at least every other year.',
    3: 'Cat. III courses are offered at the discretion of the department or program.',
  };

  const course = $derived(courseListState.selectedCourse);

  const credits = $derived(
    course
      ? course.minCredits === course.maxCredits
        ? `${course.minCredits} credits`
        : `${course.minCredits}-${course.maxCredits} credits`
      : '',
  );
  const yearLabel = $derived(
    course?.academicYear
      ? `${course.academicYear}-${course.academicYear + 1}`
      : '',
  );

  const isHierarchical = $derived(
    course ? courseDataService.isHierarchicalCourse(course) : false,
  );
  const isLabOnly = $derived(
    course ? courseDataService.isLabOnlyCourse(course) : false,
  );

  // The course's lecture groups, computed once per course change and reused by
  // every tab-visibility derived + sectionsForTab below.
  const lectures = $derived(
    course ? courseDataService.getLecturesForCourse(course) : [],
  );

  const showLectures = $derived(isHierarchical);
  const showDiscussions = $derived(
    isHierarchical && lectures.some(lg => lg.compatibleDiscussions.length > 0),
  );
  const showLabs = $derived(
    course
      ? isHierarchical
        ? lectures.some(lg => lg.compatibleLabs.length > 0)
        : isLabOnly
      : false,
  );
  const showInterestLists = $derived(
    isHierarchical && lectures.some(lg => lg.section.isInterestList),
  );

  const showTabs = $derived(isHierarchical || isLabOnly);

  interface TabDef {
    id: string;
    label: string;
  }
  const tabs = $derived.by<TabDef[]>(() => {
    const all: { id: string; label: string; show: boolean }[] = [
      { id: 'lectures', label: 'Lectures', show: showLectures },
      { id: 'discussions', label: 'Discussions', show: showDiscussions },
      {
        id: 'labs',
        label: isLabOnly ? 'Lab Sections' : 'Labs',
        show: showLabs,
      },
      {
        id: 'interest-lists',
        label: 'Interest Lists',
        show: showInterestLists,
      },
    ];
    return all.filter(t => t.show).map(({ id, label }) => ({ id, label }));
  });

  // Active tab resets to the first visible tab whenever the course changes.
  let activeTab = $state('lectures');
  $effect(() => {
    course?.id; // track course change
    untrack(() => {
      activeTab = tabs[0]?.id ?? 'lectures';
    });
  });

  interface SectionGroup {
    heading: string;
    type: string;
    sections: Section[];
  }

  function sectionsForTab(c: Course, tabId: string): SectionGroup {
    if (tabId === 'lectures') {
      const lectureGroups = lectures.filter(lg => !lg.section.isInterestList);
      return {
        heading: `Available Lectures (${lectureGroups.length})`,
        type: 'Lecture',
        sections: lectureGroups.map(lg => lg.section),
      };
    }
    if (tabId === 'discussions') {
      const discussions = lectures.flatMap(lg => lg.compatibleDiscussions);
      return {
        heading: `Available Discussions (${discussions.length})`,
        type: 'Discussion',
        sections: discussions,
      };
    }
    if (tabId === 'labs') {
      if (courseDataService.isLabOnlyCourse(c)) {
        const labs = courseDataService.getStandaloneLabs(c);
        return {
          heading: `Available Lab Sections (${labs.length})`,
          type: 'Lab',
          sections: labs,
        };
      }
      const labs = lectures.flatMap(lg => lg.compatibleLabs);
      return {
        heading: `Available Labs (${labs.length})`,
        type: 'Lab',
        sections: labs,
      };
    }
    if (tabId === 'interest-lists') {
      const interestLists = lectures.filter(lg => lg.section.isInterestList);
      return {
        heading: `Interest Lists (${interestLists.length})`,
        type: 'Interest List',
        sections: interestLists.map(lg => lg.section),
      };
    }
    return { heading: '', type: '', sections: [] };
  }

  const activeGroup = $derived(
    course ? sectionsForTab(course, activeTab) : null,
  );

  function isAsyncSection(section: Section): boolean {
    const period = section.periods[0];
    return !!(
      period?.isAsync ||
      (period &&
        period.startTime.hours === 12 &&
        period.startTime.minutes === 0 &&
        period.endTime.hours === 12 &&
        period.endTime.minutes === 0)
    );
  }
  function sectionDays(section: Section): string {
    const period = section.periods[0];
    return period ? Array.from(period.days).join(', ').toUpperCase() : 'TBA';
  }
  function sectionTime(section: Section): string {
    const period = section.periods[0];
    return period
      ? `${period.startTime.displayTime} - ${period.endTime.displayTime}`
      : 'TBA';
  }
  function sectionLocation(section: Section): string {
    return section.periods[0]?.location || 'TBA';
  }
  function sectionProfessor(section: Section): string {
    return section.periods[0]?.professor || 'Not Assigned';
  }
  function professorRmpUrl(section: Section): string | null {
    const professor = sectionProfessor(section);
    return professor !== 'Not Assigned'
      ? rateMyProfessorService.getProfessorRMPUrl(professor)
      : null;
  }
</script>

{#if !course}
  <div class="empty-state">Select a course to view description</div>
{:else}
  <div class={styles['course-info']}>
    <div class={styles['course-desc-title']}>{course.name}</div>
    <div class={styles['course-code']}>
      {course.departmentAbbr}{course.number} ({credits})
    </div>
    <div class={styles['course-meta']}>
      {#if yearLabel}<div class={styles['course-year']}>{yearLabel}</div>{/if}
      {#if course.category != null}
        <div class={styles['course-category']}>
          Cat {course.category}
          <div class={styles['course-category-tooltip']}>
            {CATEGORY_DESCRIPTIONS[course.category]}
          </div>
        </div>
      {/if}
    </div>
  </div>
  <div class={styles['course-description-text']}>{course.description}</div>

  {#if showTabs}
    <div class={styles['course-components-section']}>
      <div class={styles['component-tabs']}>
        {#each tabs as tab (tab.id)}
          <button
            class={[
              styles['component-tab'],
              { [styles['active']]: activeTab === tab.id },
            ]}
            data-tab={tab.id}
            onclick={() => (activeTab = tab.id)}>{tab.label}</button
          >
        {/each}
      </div>
      <div class={styles['component-tab-content']}>
        {#if activeGroup}
          <div
            class={[styles['tab-panel'], styles['active']]}
            data-panel={activeTab}
          >
            <h3>{activeGroup.heading}</h3>
            <div class={styles['sections-list']}>
              {#each activeGroup.sections as section (section.crn)}
                {@const interest = section.isInterestList}
                {@const async = isAsyncSection(section)}
                {@const rmpUrl = professorRmpUrl(section)}
                <div class={styles['section-list-item']}>
                  <div class={styles['section-header']}>
                    <span class={styles['section-number']}
                      >{section.number}</span
                    >
                    {#if !interest}<span class={styles['section-type']}
                        >{activeGroup.type}</span
                      >{/if}
                    <span class={styles['section-crn']}>CRN: {section.crn}</span
                    >
                  </div>
                  <div class={styles['section-details']}>
                    {#if interest}
                      <!-- interest lists have no time/location -->
                    {:else if async}
                      <div class="section-card-async-badge">
                        {@html getInlineSVG('CLOCK', 'async-icon')}
                        Asynchronous
                      </div>
                    {:else}
                      <div class={styles['section-time']}>
                        <strong>{sectionDays(section)}</strong>
                        {sectionTime(section)}
                      </div>
                      <div class={styles['section-location']}>
                        {sectionLocation(section)}
                      </div>
                    {/if}
                    {#if !interest}
                      <div class={styles['section-professor']}>
                        {#if rmpUrl}
                          <a
                            href={rmpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="professor-link"
                            >{sectionProfessor(section)}</a
                          >
                        {:else}
                          {sectionProfessor(section)}
                        {/if}
                      </div>
                    {/if}
                    <div class={styles['section-seats']}>
                      Seats: {section.seatsAvailable}/{section.seats} available
                      {#if section.actualWaitlist > 0}(Waitlist: {section.actualWaitlist}/{section.maxWaitlist}){/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/if}
