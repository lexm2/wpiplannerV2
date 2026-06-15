# Component Conversion — Master Plan (temporary; delete when migration completes)

Consolidated from four meticulous planning passes (CourseController, ScheduleController,
Modals, App-shell controls). Each unit below = one agent-written implementation +
Playwright verification + commit. Lowest-risk first. Established pattern: `DepartmentSidebar.svelte`
(reads `appState`/`uiState` runes + services directly; reuses global CSS; `mount()` into the
existing host element after clearing it).

## Cross-cutting decisions (locked)
- **New small runes to add as needed** (consistent with "no listener systems"):
  - `uiState.currentThemeId` — written by `ThemeManager.setTheme`; ThemeSelector + settings-menu read it (ThemeManager is otherwise not reactive).
  - `selectedCourseId` channel (in `uiState` or `courseListState.svelte.ts`) — CourseList sets, CourseDescription reads.
  - `appState.autoScheduleTermPrefs` (already referenced by tutorial) — AutoScheduleIntro reads.
  - schedule **preview** rune (`schedulePreview.svelte.ts`) — vanilla wizard writes, Svelte TermGrid reads (bridge until wizard converts).
  - optional `appState.autoScheduleGeneration` — orchestrator bumps; AutoScheduleControls reads (defer to that sub-phase).
- **Modals**: ONE declarative `ModalLayer.svelte` gated by the existing `uiState.openModals` rune (NOT imperative on-demand mount). Collapses `ModalService.modals` + `openModals` into one source of truth and simplifies tutorial reconstruction. `Modal.svelte` shell absorbs BaseModal/ModalService show/hide/animation.
- **App.svelte shell is LAST** — only after course list, schedule page, and modals are components. It collapses `index.html` to `<div id="app">` + `mount(App)` and absorbs `UIStateManager.applyPageEffects/applyViewEffects`.
- Preserve element **ids/selectors** the tutorial + SchedulePicker depend on: `#planner-tab #schedule-tab #filter-btn #schedule-picker-btn #undo-btn #redo-btn`, `[data-course-id]`, `.course-select-btn`.

---

## PHASE 9 — App-shell controls (header) — ✅ DONE (all 6, each Playwright-verified + committed)
9A UndoRedoButtons · 9B ViewToggle · 9C PageTabs · 9D ThemeSelector (+`uiState.currentThemeId` rune) · 9E FilterButtons · 9F SearchBar.
LESSON (9F): a filter-sync `$effect` that reads the local input `$state` to compare MUST wrap the read/assign in `untrack(...)` — otherwise every keystroke re-runs the effect and resets the input to the not-yet-debounced filter value (Playwright caught this; same untrack lesson as the `watch` bridge). Settings mobile menu still vanilla → folds into App.svelte (Phase 13).
Original per-unit notes:
Each is tiny and independently committable. Mount into existing hosts.
- **9A `UndoRedoButtons.svelte`** — host `.undo-redo-controls`. `$derived`(read `appState.undoRedoGeneration` then `psm.canUndo()/canRedo()`). Delete MainController 701-717, 736-742, `updateUndoRedoButtons` 1235-1246. Keep keydown or move to `<svelte:window>`.
- **9B `ViewToggle.svelte`** — host `#view-list`/`#view-grid` (wrap). `$derived(uiState.currentView)`; `class:` bindings replace `UIStateManager.applyViewEffects` (delete it).
- **9C `PageTabs.svelte`** — host `.nav-tabs-pill`. `$derived(uiState.currentPage)`; `onSwitch` callback keeps render side-effects. Trim tab `.active` out of `applyPageEffects` (keep page display toggle for now). Delete dead `mobile-menu-btn` lookups.
- **9D `ThemeSelector.svelte`** — host `.theme-selector`. Import `theme-selector.module.css`. Drive from new `uiState.currentThemeId` rune (fixes settings-menu-toggle desync + init timing). Delete `ThemeSelector.ts`.
- **9E `FilterButtons.svelte`** — filter/bookmark/clear (+schedule-filter deferred). `$derived` off `filterService.getActiveFilters()` (SvelteMap). Delete `updateFilterButtonState/updateClearFiltersButtonState/updateBookmarkFilterButtonState/updateScheduleFilterButtonState` + setTimeout init 160-164.
- **9F `SearchBar.svelte`** — host `.search-input-wrapper`. Keep `DebouncedOperation`. `$effect` syncs input from `searchText` filter (replaces `syncSearchInputFromFilters`). professorMode local `$state`.
- (Settings mobile menu → defer, fold into App.svelte.)

## PHASE 10 — CourseController → 3 sibling components
- **10A `CourseList.svelte`** — host `#course-container`. `$derived` filtered+sorted+paginated list (relocate `refreshCurrentView`'s course computation). Term-badge expand = per-course local state + Svelte `transition` (DELETE the ~250-line FLIP animation in MainController). Keep `data-course-id`/`.course-select-btn`. Keep `displayCount` pagination.
- **10B `SelectedCoursesPanel.svelte`** — host `.selected-courses-section`. `$derived` sorted `appState.selectedCourses`; expander state in localStorage. `.course-remove-btn` uses `stopPropagation` (schedule sidebar still uses the MainController delegated handler).
- **10C `CourseDescription.svelte`** — host `#course-description`. Reads shared `selectedCourseId`; tabs lazy via `$derived`.
- Delete `CourseController.ts` + `ProgressiveRenderer.ts` + index export + all MainController dept/course render wiring. Trim (don't delete) `refreshCurrentView` to keep filter-button/search side-effects.

## PHASE 11 — Modals → declarative layer
Batches, simplest-first, each committable. `Modal.svelte` + `ModalLayer.svelte` + `modalState.svelte.ts`; mount ModalLayer once (new `#modal-root`).
- **11A** MobileNotice (establishes shell + layer + mount host).
- **11B** leaf confirm/info: DeleteLocalEvent, Changelog, Tutorials, SectionInfo; delete dead `InfoModalController`.
- **11C** LocalEvent.
- **11D** AutoScheduleIntro + delete `ModalQueue` (intro→filter becomes state sequencing).
- **11E** SchedulePicker (delete its internal `watch` bridges; reads runes directly).
- **11F** FilterModal (+`auto-schedule-filter` as `mode` prop) — biggest; depends on DualRangeSlider/SharedFilter*.
- **11G** teardown: delete `BaseModal`, `ModalService`, `ModalQueue`, `services.modalService`; rewrite tutorial dispatch to set `uiState.openModals`/`modalState`. Re-run full tutorial.

## PHASE 12 — ScheduleController (biggest) → decomposed, grid last
Sub-phases, each committable. Mount into existing schedule-page hosts.
- **12A** `AutoScheduleControls.svelte` (footer) — leaf; progress bar/spinner preserved.
- **12B** `ScheduleSidebar.svelte` + `SelectedCourseItem.svelte` + calendar-events button. **Mount into a CHILD wrapper of `#schedule-sidebar-content`** so the vanilla wizard panel (`.sidebar-panel--component-wizard`) injected there is not destroyed.
- **12C+D** `ScheduleGrids.svelte` + `TermGrid.svelte` (term focus animation + the grid). Conflict matrix as one memoized `$derived`; preserve sub-hour block geometry + `isFirstSlot` gating; preview via shared rune; color reactivity (verify CourseColorService is rune-backed, else add `colorGeneration`). Generating-overlay via `out:` transition.
- **12E** reassign `CalendarEventProvider` to a standalone object reading `appState.activeSchedule.localEvents`; delete `ScheduleController.ts` + index export; remove redundant filter watches.

## PHASE 13 — `App.svelte` root shell (LAST)
Collapse `index.html` to `<div id="app">` + `mount(App)`. Absorb page/view DOM effects → `{#if}`/`class:`. Retire `UIStateManager` DOM-effect role. Convert settings mobile menu here. Then delete `RUNES_MIGRATION*.md` + `reactivity.svelte.ts` once the last `watch`/`subscribe` bridge consumer is gone.

---

## Per-unit loop (every unit)
1. (planning already done above; agent re-reads the relevant source + `DepartmentSidebar.svelte`)
2. Agent writes the component(s) + rewires MainController/etc. + deletes vanilla code.
3. `bunx tsc --noEmit` (no new errors) + `bun run build` (clean) + `bun run test`.
4. Playwright: dev server on `http://localhost:3000/wpiplannerV2/`, drive the feature, confirm behavior + 0 console errors.
5. Commit. Update this plan + `RUNES_MIGRATION.md`.
