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

### 3. courseDataService (NOT in original 5)
- **System:** `src/services/data/courseDataService.ts` — `listeners: Map<type, Set>`, `on()`/`off()`/`emit()`, `CourseDataEvent`/`CourseDataEventType`/`CourseDataEventListener` types.
- **Consumers:** `AppBootstrap.ts:73` `on('data-loaded')`, `AppBootstrap.ts:103` `on('data-refreshed')`.
- **Plan:** borderline — these are one-shot async load-completion signals, not continuous state. Convert to a rune signal (`loadGeneration`/`loadedDepartments` in appState) that AppBootstrap `watch`es, OR leave as direct async callbacks. **Decision needed** (see open questions).

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

## OPEN QUESTIONS
- **courseDataService:** convert load events to a rune signal, or leave as one-shot async callbacks? (They fire once per data load, not continuously.)
- **UIStateManager / ThemeManager:** in scope now, or original-5 only? (Recommend: yes — they're the same anti-pattern.)
