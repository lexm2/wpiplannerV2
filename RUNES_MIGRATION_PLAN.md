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

## PHASE 10 — CourseController → 3 sibling components  ✅ DONE (10A + 10B + 10C)
10C done: `CourseDescription.svelte` mounted into `#course-description`, props `{ courseDataService }`; reacts to `courseListState.selectedCourse`. `courseListState` now stores the `Course` OBJECT (`selectedCourse = $state.raw`) with a `get selectedCourseId()` getter (getter-through-$state.raw IS reactive — CourseList's `class:active` highlight verified still tracking). Both CourseList + SelectedCoursesPanel now ONLY set the rune (the `onSelectCourse` vanilla bridge prop is deleted from both). Ported displayCourseDescription/renderComponentTabs/populatePanel/renderSectionCard faithfully to declarative Svelte: tabs = `$derived` filtered list (lectures/discussions/labs/interest-lists, order preserved); active tab = local `$state` reset to first tab on course change via an `$effect` keyed on `course?.id` (writes activeTab inside `untrack`); panels render directly (no lazy `data-loaded`). `CATEGORY_DESCRIPTIONS` moved into the component. **DELETED: `CourseController.ts` + `ProgressiveRenderer.ts` + both index exports + MainController's `courseController` field/ctor/setFilterService/setAllDepartments calls.** Repo-wide grep for CourseController/ProgressiveRenderer/showCourseDescription/onSelectCourse is clean (only historical comments remain). Playwright-verified: list-click + panel-click both drive description, multi-tab switch (AE-2320 Lectures/Labs → "Available Labs (3)"), active-tab resets to first on course change, list `.active` highlight tracks selection, section cards intact, empty-state, 0 console errors. NOTE (cleanup for a later pass): MainController still has write-only dead members `previousSelectedCoursesCount` + `getAllCourses` + an unused `scheduleManagementService` (LSP hints, tsc clean — not blocking).
INCREMENTAL: CourseController.ts stays alive until 10C (still owns the description panel + `selectCourse`/`getCourseFromElement`/`showCourseDescription`). 10A done: `CourseList.svelte` + `courseListState.svelte.ts` (shared `selectedCourseId` rune). Clicking a course sets the rune AND calls `onSelectCourse(course)` → vanilla `CourseController.showCourseDescription` (bridge until 10C). Deleted the ~250-line term-expansion FLIP animation + list click branches + `displayCoursesWithCancellation`/`handleLoadMoreClick`; trimmed `refreshCurrentView` to schedule-only. LESSON (10A): `transition:slide` runs an intro on EVERY item's term container at mount (100+ items) → `NaNpx` height-keyframe console warnings (Playwright caught 52). Dropped slide → instant toggle (spec allowed it). A polished expand animation would need CSS, not JS slide. Cross-reactivity verified: select in list ↔ selected-panel both update via `appState.selectedById`.
10B done: `SelectedCoursesPanel.svelte` mounted into `.selected-courses-section` (cleared first). Renders whole section (header expander + list), preserves ids `selected-courses-header`/`-list`/`selected-count`/`-chevron`. `$derived` sorted copy of `appState.selectedCourses` (never mutate `$state.raw`); expander state in `localStorage('selectedCoursesExpanded')`. Item click → set `courseListState.selectedCourseId` + `onSelectCourse` bridge. Remove btn calls `e.stopPropagation()` (so the GLOBAL delegated `.course-remove-btn` handler — KEPT for the still-vanilla SCHEDULE sidebar — doesn't double-fire) then `unselectCourse`. Deleted from CourseController: `displaySelectedCourses`/`addSelectedCourseToSidebar`/`removeSelectedCourseFromSidebar`/`initializeSelectedCoursesExpander` (~172 lines). MainController: deleted the `.selected-course-item` click branch + the add/remove sidebar loops in `refreshSelectionUI` + `displaySelectedCourses()` calls; `syncCourseSelectionUI()` kept as a now-empty no-op (still called by setupTutorial). Playwright-verified: reactive add (sorted), item-click drives description, remove (no double-fire), empty-state, expander+localStorage persist, schedule sidebar untouched, 0 console errors.
Original notes:
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
