# Runes Migration Tracker (temporary — delete when migration completes)

Goal: every custom listener/event system replaced by Svelte 5 runes reactivity.
No parallel systems — each step DELETES a custom system and rewires consumers onto
`appState.svelte.ts` runes (read directly in components, or via `watch`/`subscribe`
from `src/svelte/reactivity.svelte.ts` in not-yet-componentized vanilla code).

Legend: ✅ done · 🔄 in progress · ⬜ todo · ⏭️ deferred (becomes Svelte component prop)

---

## ✅ ALREADY ON RUNES (done in Phases 0–3)

| What | File | Notes |
|---|---|---|
| Central rune store | `src/core/state/appState.svelte.ts` | `$state.raw` collections + `$derived` selectors. Single source of truth. |
| Reactivity bridge | `src/svelte/reactivity.svelte.ts` | `subscribe(run)` / `watch(deps, run)`. Temporary scaffolding. |
| FilterState (#4) | `src/core/filtering/FilterState.ts` | Uses `SvelteMap` from `svelte/reactivity`. Event system deleted. |
| ProfileStateManager (#1) | `src/core/state/ProfileStateManager.ts` | Reads/writes `appState`; listener/eventQueue deleted. |
| CourseSelectionService (#2) | `src/services/selection/CourseSelectionService.ts` | `SelectionChangeEvent` system deleted; thin layer over PSM. |
| ScheduleManagementService (#3) | `src/services/selection/ScheduleManagementService.ts` | `ScheduleChangeEvent` system deleted. |

**Consumers already rewired onto the bridge** (`watch(...)`):
`DepartmentController`, `MainController` (selectedById + activationGeneration),
`ScheduleController`, `CourseColorService`, `AutoScheduleOrchestrator`,
`SchedulePickerModal`, `ComponentSelectionWizard` (filter), `setupTutorial`.

---

## ⬜ REMAINING CUSTOM EVENT SYSTEMS — convert to runes

### 1. ✅ UndoRedoManager (#5 — the last of the original 5) — DONE
- **Was:** `listeners: Set<()=>void>`, `onChange()`, `notifyListeners()`; re-exposed by `ProfileStateManager.onUndoRedoChange()`.
- **Now:** `appState.undoRedoGeneration` rune, bumped by `UndoRedoManager.notifyListeners()` (kept the private method, replaced its body). `MainController` `watch(() => appState.undoRedoGeneration, ...)` re-reads `canUndo()`/`canRedo()`. Deleted `listeners`/`onChange` + `ProfileStateManager.onUndoRedoChange`.

### 2. ✅ UIStateManager (NOT in original 5) — DONE
- **Was:** `listeners: Set<UIStateListener>`, `subscribe()`, `notify()`, `UIStateListener` type; plain `this.state` object.
- **Now:** reactive state moved to `src/services/ui/uiState.svelte.ts` (`$state` page/view, `$state.raw` openModals/wizard). UIStateManager keeps DOM-effect logic + imperative setters over the rune store; `getState`/`getSnapshot` build from it. `MainController.setupPageNavigationListener` uses `watch(() => uiState.currentPage, ...)` with a local `prevPage` to reproduce the old prevState diff. Deleted `subscribe`/`notify`/`listeners`/`UIStateListener`.

### 3. ✅ courseDataService (NOT in original 5) — DONE
- **Was:** `listeners: Map<type, Set>`, `on()`/`off()`/`emit()`, `CourseDataEvent`/`CourseDataEventType`/`CourseDataEventListener` types (whole `data/types.ts`).
- **Now:** rune signal in appState — `loadedDepartments` ($state.raw payload) + `dataLoadGeneration` / `dataRefreshGeneration` ($state). `loadCourseData`/`notifyDataRefreshed` set the payload and bump the matching generation. `AppBootstrap.setupCourseDataSubscriptions` `watch`es each generation. Deleted the listener Map + on/off/emit, `data/types.ts`, and the `data/index.ts` re-export. (Ordering verified: subscriptions registered in MainController ctor before async `init()` calls `loadCourseData`.)
- Decision (user): **rune signal**, for consistency with the no-custom-event-systems philosophy.

### 4. ✅ ThemeManager (NOT in original 5) — DONE
- **Was:** `listeners: Set<ThemeChangeListener>`, `onThemeChange`/`offThemeChange`/`notifyListeners`, `ThemeChangeEvent`/`ThemeChangeListener` types. Zero consumers — dead code.
- **Now:** deleted outright (listener field, notify call in `setTheme`, the three methods, both types in `themes/types.ts`, and the `themes/index.ts` re-exports). No rune added — nothing reads it.

---

## ⏭️ DEFERRED — component callback props (not global state; convert when componentized)

These are normal parent→child callbacks, not custom global event buses. They become
Svelte component props/events when their host becomes a `.svelte` component.

- `DualRangeSlider.ts` — `options.onChange(min, max)`
- `ComponentSelectionWizard.ts` — `onSelectionChange(selections)`
- DOM `addEventListener` calls throughout — these stay; they're real browser events.

---

## STATUS: all four remaining custom event systems migrated ✅
Every hand-rolled listener/event system is now deleted. The only remaining
reactivity mechanism is Svelte 5 runes (`appState` / `uiState`) + the temporary
`watch`/`subscribe` bridge for not-yet-componentized vanilla code.

Resolved questions:
- **courseDataService:** rune signal (user choice — consistency over one-shot-callback pragmatism).
- **UIStateManager / ThemeManager:** in scope — same anti-pattern, both done.

## COMPONENT CONVERSION (in progress)

Converting vanilla controllers to `.svelte` components. Each conversion deletes
its `watch(...)` bridge call + imperative render code. When the last bridge
consumer is gone, delete `src/svelte/reactivity.svelte.ts` and this file.

### ✅ DepartmentController → `src/svelte/DepartmentSidebar.svelte` — DONE
- First real Svelte component mounted in the production app (`mount()` in MainController ctor, target `#department-list`).
- Component reads `appState.loadedDepartments` + reactive filter state (`filterService.getActiveFilters()` over a SvelteMap) directly — no props beyond `filterService`. List, active highlighting, and counts all `$derived`; category collapse is local `SvelteSet` state; clicks call `filterService` directly.
- Deleted: `DepartmentController.ts`, its `index.ts` export, MainController's department-item click delegation + `displayDepartments`/`setAllDepartments`/`getDepartmentById`/`handleDepartmentClick('all')` wiring, and `UIStateManager.showLoadingState` (component shows its own empty-state loading).
- Note: old `multi-select-active` class was applied to `#department-list` (class `department-categories`) but CSS only matches `.department-list.multi-select-active` → never had effect → omitted. `.sidebar-header h2` doesn't exist → that branch was dead → omitted.
- Verified at runtime (Playwright): renders all categories/counts, click filters course list + toggles active, deselect→All, category collapse toggles `aria-expanded`/`expanded`; 0 console errors. `bun run build` clean (a11y warnings suppressed via comma-separated `svelte-ignore`).

### ✅ Modal layer → declarative ModalLayer (Phase 11, all sub-units A–G) — DONE
- Every modal is now a `.svelte` component rendered by the single `src/svelte/modals/ModalLayer.svelte`, gated by `uiState.openModals` (the rune is the sole modal registry). Shell = `Modal.svelte`; payloads = `modalState.svelte.ts`.
- **11G teardown:** deleted the entire vanilla modal framework — `BaseModal.ts`, `ModalService.ts`, `ModalQueue.ts`, `services.modalService` (field + construction + `ProfileStateManager`/`ScheduleController`/`MainController` wiring). `UIStateManager.closeAllModals()` replaces `ModalService.hideAllModals()` in the tutorial dispatch. Trimmed `types/modal.ts` to just `SectionData`. The full tutorial (all 4 sub-tutorials, all modal types, Back/Next snapshot restore) re-ran clean under Playwright with 0 console errors.

### ✅ Auto-schedule footer → `src/svelte/AutoScheduleControls.svelte` (Phase 12A) — DONE
- Footer Auto-Schedule button + prev/restart/next nav + progress bar, mounted into `.schedule-sidebar-content-footer`. Reactive on `appState.autoScheduleGeneration` (new rune the `AutoScheduleOrchestrator` bumps on every result-set transition) — replaces `ScheduleController.setupAutoScheduleButton()`/`updateAutoScheduleButtonUI()` and the orchestrator's `onStateChange` single-callback. `#auto-schedule-btn` id preserved for the tutorial. Nav re-applies via the orchestrator then re-renders the (still-vanilla) grid through an `onAfterNavigate` prop.

### ✅ Schedule sidebar → `ScheduleSidebar.svelte` + `SelectedCourseItem.svelte` + `CalendarEventsButton.svelte` (Phase 12B) — DONE
- The schedule-page sidebar's selected-courses list (term grouping, per-course header with selected-components/incomplete-warning/credits + clear-sections/remove) is now reactive on `appState.selectedCourses`, mounted into a `display:contents` child wrapper of `#schedule-sidebar-content` so the still-vanilla `ComponentSelectionWizard` panel survives as a sibling. Grid→sidebar hover highlight moved to a `scheduleSidebarState.hoveredCourseId` rune. Deleted ScheduleController's `displayScheduleSelectedCourses` + all the sidebar HTML builders + `sidebarCourseItems` map + `getCourseFromElement`, and MainController's global click delegation for these items. `getIncompleteSelectionInfo` stays on ScheduleController (passed as a prop).

### ✅ Schedule grids → `src/svelte/schedule/ScheduleGrids.svelte` + `TermGrid.svelte` (Phase 12C+D) — DONE
- The 4 term grids are now declarative, reactive on `appState.selectedCourses` + the wizard preview rune + `appState.activeSchedule.localEvents` + `appState.colorGeneration`. Replaced ScheduleController's imperative innerHTML renderer + per-cell occupancy/cache + term-focus document listeners + all 13 `renderScheduleGrids()` call sites. Geometry switched to an **absolute-overlay** model (pure `scheduleGeometry.ts`: `top/height` over the 8AM–8PM body in a `position:absolute; inset:0` `.block-layer`), with **side-by-side column packing** so overlapping classes/events stay visible (1/N width) instead of stacking, and per-pair conflict overlays. Preview via `schedulePreviewState.svelte.ts` (vanilla wizard writes, grid + `showSectionInfoModal` read). New runes: `appState.colorGeneration` (recolor) + `appState.scheduleGenerating` (generating overlay). Dropped MainController's `onAfterNavigate` (navigate updates `selectedCourses` → grid reacts).

### ✅ CalendarEventProvider → standalone `src/services/scheduling/calendarEventProvider.ts` (Phase 12E.1) — DONE
- The auto-scheduler's calendar-event provider is now a standalone object reading `appState.activeSchedule?.localEvents` directly instead of `ScheduleController.currentSchedule`. Ported `getAllLocalEventBlockedTimes`/`getLocalEventCount` verbatim (visible-only, skip ONE_TIME, expand `days × terms`, exact `${id}-${term}-${day}` ids) and wired it into `MainController` (`setCalendarEventProvider(calendarEventProvider)`). Removed `implements CalendarEventProvider` + the three provider methods (incl. `getAllCalendarBlockedTimes`) from ScheduleController, plus the confirmed-dead `handleSectionSelection`/`updateSectionButtonStates`. The orchestrator's own `getAllCalendarBlockedTimes`/`getLocalEventCount` delegators (used by FilterModalController) now route through the standalone provider. Verified the grid still renders calendar-event blocks reactively from the same rune.

### ✅ Clear-all-sections button → `src/svelte/ClearAllSectionsButton.svelte` (Phase 12E.2) — DONE
- The schedule sidebar's clear-all button is now a declarative component mounted into a `#clear-all-sections-slot` (`display:contents`) in `.schedule-filter-controls`, mirroring the CalendarEventsButton/FilterButtons/ViewToggle pattern. Renders its own `<button id="clear-all-sections-btn">` (same id/classes/title/aria-label + eraser icon), reads `courseSelectionService` as a prop, and keeps behavior identical: empty → "No courses selected."; courses-but-no-sections → "No sections selected to clear."; otherwise confirm → `clearAllComponents()` (the reactive sidebar/grid re-render off `appState.selectedCourses`). Deleted `setupClearAllSectionsButton`/`handleClearAllSections` from ScheduleController + its now-unused `getInlineSVG` import; replaced MainController's `setupClearAllSectionsButton()` call with a `mount()`. Verified all three paths + 0 console errors via Playwright.

### ✅ Local-event CRUD → standalone `src/services/scheduling/localEventService.ts` (Phase 12E.3) — DONE
- Add/delete of local calendar events now lives in a standalone `localEventService` that reads `appState.activeSchedule` directly and persists immutably via `profileStateManager.updateSchedule(id, { localEvents }, 'calendar-event-exclusion')` — so the `$derived` activeSchedule re-derives and the reactive grid drops/adds blocks on its own. Needs ProfileStateManager (not a singleton) + UIStateManager, injected once via `localEventService.init(...)` from MainController. Rewired the CalendarEventsButton `onClick` → `openAddModal()` and the grid's `onOpenDeleteEvent` → `openDeleteModal(eventId)`. **Deleted** from ScheduleController: `openCalendarEventsPanel`/`openAddLocalEventModal`/`openDeleteLocalEventModal`/`addLocalEvent`/`deleteLocalEvent`, the `currentSchedule` + `onScheduleUpdate` fields, `loadExternalEvents`, `setScheduleUpdateCallback`, and the now-unused `Schedule`/`LocalCalendarEvent` imports — plus both dead `loadExternalEvents()` call sites + the `setScheduleUpdateCallback` wiring in MainController. Playwright-verified end-to-end: Add Event modal (recurring, M/W) persists to `appState.activeSchedule.localEvents`, renders 8 grid blocks + `getLocalEventCount`=1 / `getAllCalendarBlockedTimes`=8; deleting via grid block → confirm modal removes it (grid 8→0); 0 console errors.

### ✅ Section-info modal (+ color get/set) → standalone `src/services/scheduling/sectionInfoService.ts` (Phase 12E.4) — DONE
- The grid section-block click now routes to a standalone `sectionInfoService.show(courseId, sectionNumber)`, which resolves the section from either the wizard preview rune (`schedulePreviewState`) or the saved selection (`CourseSelectionService`), then opens the declarative section-info modal (`modalState.sectionInfo` + `modalOpened('section-info')`). Color get/set route straight through `CourseColorService` — this absorbed ScheduleController's private `getCourseColor`/`setCourseColor` delegators, which had no other callers (`ScheduleGrids.svelte` already used `colorService.getCourseColor` directly). Injected `init(courseSelectionService, colorService, uiStateManager)` from MainController; rewired the grid's `onOpenSectionInfo` → `sectionInfoService.show(...)`. **Deleted** from ScheduleController: `showSectionInfoModal`, `getCourseColor`, `setCourseColor` (the `colorService` field stays — still used by the auto-schedule intro `getColor`). Playwright-verified: clicking a section block opens the modal with correct professor/section/CRN/credits/color/meeting-times; changing the color input patches `appState.selectedCourses` `customColor` so the grid re-colors; 0 console errors.

### ✅ Schedule filter button → declarative `src/svelte/ScheduleFilterButton.svelte` (Phase 12E.5) — DONE
- The schedule-page filter button is now a Svelte component mirroring the planner `#filter-btn`: it renders its own `<button id="schedule-filter-btn" class="btn btn-secondary filter-btn">` (FILTER_FILLED icon) and derives `class:active` + title from the reactive filter store — `(filterService.getActiveFilters(), filterService.hasNonDefaultFilters(appState.activeSchedule?.year))` + `getFilterCount()` — with `onFilter` → `openFilterModal()`. Mounted into a `#schedule-filter-slot` (`display:contents`). **Deleted** the whole imperative refresh chain it replaced: the icon-insert + click wiring, BOTH `updateScheduleFilterButtonState` copies (MainController's `hasNonDefaultFilters(activeYear)` + ScheduleController's `isEmpty()`), `ScheduleController.applyFiltersAndRefresh`, the `watch` in `ScheduleController.setFilterService` (+ its `watch` import), MainController's filter `watch`, and the `setTimeout(100)` initializer. `MainController.refreshCurrentView` is now a no-op (its sole job was that button refresh) — kept temporarily so its callers stay intact for a later view-refresh teardown. Playwright-verified: button renders in the slot, click opens the FilterModal, adding/removing a non-default filter flips `active`/title reactively (no watch); 0 console errors.

### ✅ Auto-schedule orchestration → standalone `src/services/scheduling/autoScheduleService.ts` (Phase 12E.6) — DONE
- The auto-schedule intro → filter → generate sequence now lives in a standalone `autoScheduleService`: it drives the declarative modals via `modalState` + continuation callbacks (intro `onNext` → filter modal `onGenerate` → `doGenerateSchedules`), generates via `AutoScheduleOrchestrator`, and surfaces the generating overlay through the `appState.scheduleGenerating` rune. Injected `init(courseSelectionService, filterService, colorService, orchestrator, uiStateManager)` from MainController (none are module singletons). Rewired the grid mount `onOpenAutoSchedule` and MainController's 6 wrapper methods (still called by the tutorial state machine) to delegate to the service. **Deleted** from ScheduleController: all 8 auto-schedule methods + the now-dead `colorService`/`autoScheduleOrchestrator` fields & constructor params (the ctor is now just `courseSelectionService`) + the now-unused `appState`/`modalState`/`WeeklyTimeSlot`/`AutoScheduleOrchestrator`/`CourseColorService` imports; updated the `new ScheduleController(...)` call. The controller now owns only the wizard methods + `getIncompleteSelectionInfo`/`hasValidTimeSlot`. Playwright-verified the full flow through the service (intro → Next → filter → Generate applied lectures + closed the modal); 0 console errors.

### ✅ Component-selection wizard → standalone `src/services/scheduling/componentWizardService.ts` + ScheduleController DELETED (Phase 12E.7) — DONE
- The wizard launcher now lives in a standalone `componentWizardService`: it drives the `wizardState` store (WizardHost renders the panel) + the `schedulePreviewState` rune and persists committed selections via `CourseSelectionService` (`openComponentWizard`/`jumpWizardToStep`/`closeComponentWizard` + the `onWizardComplete`/`onWizardSelectionChange`/`onWizardHoverPreview` callbacks + `getIncompleteSelectionInfo`/`hasValidTimeSlot`, moved verbatim). Injected `init(courseSelectionService, courseDataService, filterService, uiStateManager)` from MainController; all 7 caller sites (grid mount `getIncompleteInfo`/`onOpenWizard`; MainController `closeWizard`/`openWizardForCourse`/`jumpWizardToStep`/`handleSwipeRight`/`switchToPageView`) delegate to the service. With the wizard relocated the controller had nothing left but the redundant `setConflictDetector`/`setFilterService` wiring — and `filterService.setConflictDetector()` is already called in `AppBootstrap.initializeServices` (idempotent registration), so it was dropped. **`src/ui/controllers/ScheduleController.ts` and its `index.ts` export are deleted**; MainController lost the `scheduleController` field + construction + 4 setter calls. Playwright-verified through the service (wizard opens, A01 selection reactively renders 4 MTRF preview blocks, Finish persists null→A01); the panel-not-closing-on-synthetic-click was confirmed pre-existing (git-stash A/B vs the parent commit — identical) and not a regression; 0 console errors. **The vanilla ScheduleController is fully gone.**

### ⬜ Remaining work
- View-refresh teardown: remove `MainController.refreshCurrentView` (a no-op since 12E.5) + its callers (ViewToggle.onSelect / onDataRefreshed / refreshUI / initializeDefaultDepartmentView), cascading into ViewToggle's `onSelect` prop. MainController shell (Phase 13: App.svelte root, LAST).
- Deferred component callbacks (`DualRangeSlider.onChange`, `ComponentSelectionWizard.onSelectionChange`) become Svelte props/events as their hosts convert.
