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

### ⬜ Remaining controllers (rough order, lowest-risk first)
- ScheduleController: 12B sidebar (SelectedCourseItem), 12C+D grids (TermGrid), 12E CalendarEventProvider + delete controller. MainController shell (Phase 13: App.svelte root, LAST).
- Deferred component callbacks (`DualRangeSlider.onChange`, `ComponentSelectionWizard.onSelectionChange`) become Svelte props/events as their hosts convert.
