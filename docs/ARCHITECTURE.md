# WPI Planner V2 Architecture

This document describes how all files in the codebase work together.

## Table of Contents

- [Project Overview](#project-overview)
- [Directory Structure](#directory-structure)
- [Entry Points](#entry-points)
- [Core Layer](#core-layer)
- [Services Layer](#services-layer)
- [UI Layer](#ui-layer)
- [Types](#types)
- [Configuration & Assets](#configuration--assets)
- [Data Flow](#data-flow)

---

## Project Overview

WPI Planner V2 is a course planning application for WPI students that allows browsing courses, building schedules, detecting conflicts, and local data persistence.

**Tech Stack:**
- TypeScript 5.0
- Vite (build tool)
- Bun (runtime & testing)
- Vanilla DOM (no framework)
- IndexedDB + localStorage (persistence)

**Architecture Pattern:** Layered architecture with Core -> Services -> UI

---

## Directory Structure

```
src/
├── main.ts                 # Application entry point
├── core/                   # Core business logic
│   ├── filtering/          # Filter pipeline system
│   ├── operations/         # Batch & retry operations
│   ├── scheduling/         # Conflict detection
│   ├── state/              # Application state management
│   ├── storage/            # Persistence layer
│   └── validation/         # Data validation
├── services/               # Application services
│   ├── calendar/           # Calendar integration (Google Calendar, etc.)
│   ├── data/               # Course data loading
│   ├── external/           # Third-party integrations
│   ├── filtering/          # High-level filtering
│   ├── scheduling/         # Schedule generation
│   ├── selection/          # Course/schedule selection
│   └── ui/                 # UI services
├── ui/                     # User interface
│   ├── controllers/        # View controllers
│   ├── components/         # Reusable UI components
│   ├── sidebar/            # Sidebar panel system
│   └── utils/              # UI utilities
├── types/                  # TypeScript type definitions
├── config/                 # Configuration files
├── themes/                 # Theme definitions
├── styles/                 # CSS stylesheets
├── assets/                 # Static assets
└── utils/                  # Shared utilities
```

---

## Entry Points

### [src/main.ts](../src/main.ts)

Application bootstrapper that initializes the entire application.

**Responsibilities:**
- Imports global styles
- Creates [MainController](../src/ui/controllers/MainController.ts) instance
- Exposes `mainController` to window for development/testing

**Connects to:**
- [MainController](../src/ui/controllers/MainController.ts) - Main orchestrator

### [index.html](../index.html)

HTML entry point with `<div id="app">` root element.

---

## Core Layer

The core layer contains fundamental algorithms, data structures, and state management.

### Storage (`src/core/storage/`)

#### [TransactionalStorageManager.ts](../src/core/storage/TransactionalStorageManager.ts)

Hybrid storage manager combining IndexedDB and localStorage with transaction support.

**Responsibilities:**
- IndexedDB for schedules (large data, async)
- localStorage for preferences, theme, active schedule ID
- Atomic transactions with backup/rollback
- Data export/import with compression

**Key Methods:**
- `executeTransaction()` - Wraps operations with rollback capability
- `saveSchedule()` / `loadAllSchedules()` - IndexedDB operations
- `savePreferences()` / `loadPreferences()` - localStorage operations
- `exportData()` / `importData()` - Full state export/import

**Connects to:**
- [ProfileStateManager](../src/core/state/ProfileStateManager.ts) - Uses for persistence
- [IndexedDBStorageManager](../src/core/storage/IndexedDBStorageManager.ts) - Low-level IndexedDB

#### [IndexedDBStorageManager.ts](../src/core/storage/IndexedDBStorageManager.ts)

Low-level IndexedDB operations wrapper.

**Responsibilities:**
- Database initialization and versioning
- Object store management (schedules, preferences)
- Async read/write operations
- LZ-String compression support

**Connects to:**
- [TransactionalStorageManager](../src/core/storage/TransactionalStorageManager.ts) - Used by

---

### State (`src/core/state/`)

#### [ProfileStateManager.ts](../src/core/state/ProfileStateManager.ts)

**Singleton** - Single source of truth for application state.

**Responsibilities:**
- Manages schedules, selected courses, active schedule, preferences
- Event-driven updates via StateChangeListener pattern
- Persists to storage on changes
- Handles before-unload to prevent data loss

**Key State:**
- `activeScheduleId` - Current schedule being edited
- `schedules[]` - All user schedules
- `selectedCourses[]` - Courses in active schedule
- `preferences` - User settings
- `hasUnsavedChanges` - Dirty flag

**Events Emitted:**
- `schedule_changed` - Schedule created/updated/deleted
- `courses_changed` - Course selected/removed/section changed
- `active_schedule_changed` - Active schedule switched
- `preferences_changed` - Settings updated
- `save_state_changed` - Save state toggled

**Connects to:**
- [TransactionalStorageManager](../src/core/storage/TransactionalStorageManager.ts) - Persistence backend
- [UndoRedoManager](../src/core/state/UndoRedoManager.ts) - History management
- [CourseSelectionService](../src/services/selection/CourseSelectionService.ts) - Consumes state
- [ScheduleManagementService](../src/services/selection/ScheduleManagementService.ts) - Consumes state

#### [UndoRedoManager.ts](../src/core/state/UndoRedoManager.ts)

Manages undo/redo history with state snapshots.

**Responsibilities:**
- Maintains 100-item history stack
- Captures snapshots: activeScheduleId, schedules, preferences
- Triggers state restoration on undo/redo

**Connects to:**
- [ProfileStateManager](../src/core/state/ProfileStateManager.ts) - Source of snapshots

#### [UIStateBuffer.ts](../src/core/state/UIStateBuffer.ts)

Manages pending UI operations and sync conflicts.

**Responsibilities:**
- Stores temporary UI state during async operations
- Provides conflict resolution helpers
- Buffers pending changes

**Connects to:**
- [ProfileStateManager](../src/core/state/ProfileStateManager.ts) - Coordinates state

---

### Filtering (`src/core/filtering/`)

#### [SectionFilterPipeline.ts](../src/core/filtering/SectionFilterPipeline.ts)

Coordinates all filter implementations in priority order.

**Responsibilities:**
- Flattens Course hierarchy to FilterableSection[]
- Applies filters in priority order
- Reconstructs hierarchical Course structure from filtered sections

**Connects to:**
- [FilterState](../src/core/filtering/FilterState.ts) - Active filter criteria
- All filters in [filters/](../src/core/filtering/filters/) directory
- [CourseFilterService](../src/services/filtering/CourseFilterService.ts) - Used by

#### [FilterState.ts](../src/core/filtering/FilterState.ts)

Maintains active filter criteria with event-driven updates.

**Responsibilities:**
- Stores active filter configurations
- Supports add/update/remove filter operations
- Emits events on filter changes

**Connects to:**
- [SectionFilterPipeline](../src/core/filtering/SectionFilterPipeline.ts) - Provides criteria to
- [FilterModalController](../src/ui/controllers/FilterModalController.ts) - UI updates state

#### Filter Implementations (`src/core/filtering/filters/`)

| Filter | Purpose |
|--------|---------|
| [AvailabilityFilter.ts](../src/core/filtering/filters/AvailabilityFilter.ts) | Filter by seat availability |
| [DepartmentFilter.ts](../src/core/filtering/filters/DepartmentFilter.ts) | Filter by department |
| [TermFilter.ts](../src/core/filtering/filters/TermFilter.ts) | Filter by academic term |
| [GraduateLevelFilter.ts](../src/core/filtering/filters/GraduateLevelFilter.ts) | Filter graduate vs undergrad |
| [CreditRangeFilter.ts](../src/core/filtering/filters/CreditRangeFilter.ts) | Filter by credit hours |
| [SearchTextFilter.ts](../src/core/filtering/filters/SearchTextFilter.ts) | Full-text course search |
| [PeriodDaysFilter.ts](../src/core/filtering/filters/PeriodDaysFilter.ts) | Filter by days of week |
| [PeriodTypeFilter.ts](../src/core/filtering/filters/PeriodTypeFilter.ts) | Filter by class type (lecture/lab) |
| [PeriodProfessorFilter.ts](../src/core/filtering/filters/PeriodProfessorFilter.ts) | Filter by professor |
| [PeriodTermFilter.ts](../src/core/filtering/filters/PeriodTermFilter.ts) | Filter periods by term |
| [PeriodRMPRatingFilter.ts](../src/core/filtering/filters/PeriodRMPRatingFilter.ts) | Filter by professor rating |
| [PeriodAvailabilityFilter.ts](../src/core/filtering/filters/PeriodAvailabilityFilter.ts) | Filter by period availability |
| [PeriodConflictFilter.ts](../src/core/filtering/filters/PeriodConflictFilter.ts) | Filter conflicting periods |
| [ScheduleSearchTextFilter.ts](../src/core/filtering/filters/ScheduleSearchTextFilter.ts) | Search within schedules |
| [SectionCodeFilter.ts](../src/core/filtering/filters/SectionCodeFilter.ts) | Filter by section code |
| [SectionStatusFilter.ts](../src/core/filtering/filters/SectionStatusFilter.ts) | Filter by section status |
| [RequiredStatusFilter.ts](../src/core/filtering/filters/RequiredStatusFilter.ts) | Filter required courses |
| [ProfessorFilter.ts](../src/core/filtering/filters/ProfessorFilter.ts) | Filter by specific professor |
| [RMPRatingFilter.ts](../src/core/filtering/filters/RMPRatingFilter.ts) | Filter by RMP score |

All filters connect to [SectionFilterPipeline](../src/core/filtering/SectionFilterPipeline.ts).

#### [FilterPriorityQueue.ts](../src/core/filtering/FilterPriorityQueue.ts)

Orders filter execution by priority for optimal performance.

---

### Scheduling (`src/core/scheduling/`)

#### [ConflictEngine.ts](../src/core/scheduling/ConflictEngine.ts)

Unified conflict detection using slot-based indexing.

**Responsibilities:**
- O(1) overlap detection using TimeSlotMap
- 5-minute slot granularity, 7 AM - 10 PM range
- LRU cache for conflict results (max 1000 entries)
- Detects conflicts by CRN and computed term

**Key Methods:**
- `detectConflicts()` - Find all conflicts in a schedule
- `isValidSchedule()` - Check if schedule has no conflicts
- `hasOverlap()` - Check if two sections overlap
- `getAllOverlappingSections()` - Get all overlapping sections

**Connects to:**
- [ScheduleController](../src/ui/controllers/ScheduleController.ts) - Uses for validation
- [AutoScheduler](../src/services/scheduling/AutoScheduler.ts) - Uses for generation

#### [BitMaskEngine.ts](../src/core/scheduling/BitMaskEngine.ts)

Bitmask-based scheduling optimization for fast schedule generation.

**Responsibilities:**
- Represents time slots as bit patterns
- Fast bitwise operations for overlap detection
- Supports blocked time ranges

**Connects to:**
- [AutoScheduler](../src/services/scheduling/AutoScheduler.ts) - Uses for schedule generation

---

### Validation (`src/core/validation/`)

#### [DataValidator.ts](../src/core/validation/DataValidator.ts)

Type guards and validation rules for data integrity.

**Responsibilities:**
- Section and course validation
- SelectedCourse repair utilities
- Computed term validation
- Type guard functions

**Connects to:**
- [CourseSelectionService](../src/services/selection/CourseSelectionService.ts) - Validates selections
- [CourseDataService](../src/services/data/courseDataService.ts) - Validates loaded data

---

## Services Layer

The services layer provides high-level business logic and external integrations.

### Data (`src/services/data/`)

#### [courseDataService.ts](../src/services/data/courseDataService.ts)

Fetches and parses the course catalog.

**Responsibilities:**
- Fetches `course-data-constructed.json`
- JSON parsing with duplicate ID detection
- Strict validation in development mode
- Constructs hierarchical course structure

**Events Emitted:**
- `data-loaded` - Course data successfully loaded
- `data-error` - Error loading data

**Connects to:**
- [MainController](../src/ui/controllers/MainController.ts) - Initializes on startup
- [DataValidator](../src/core/validation/DataValidator.ts) - Validates loaded data
- [CourseController](../src/ui/controllers/CourseController.ts) - Provides course data

---

### Selection (`src/services/selection/`)

#### [CourseSelectionService.ts](../src/services/selection/CourseSelectionService.ts)

Public API for course selection/deselection.

**Responsibilities:**
- Select/deselect courses within active schedule
- Manage section selections
- Health checks and data repair
- Emit selection change events

**Key Methods:**
- `selectCourse()` / `unselectCourse()`
- `setSelectedSection()`
- `lockSection()` / `unlockSection()`
- `performHealthCheck()`

**Events Emitted:**
- `course_added`, `course_removed`
- `section_changed`
- `selection_cleared`

**Connects to:**
- [ProfileStateManager](../src/core/state/ProfileStateManager.ts) - State storage
- [DataValidator](../src/core/validation/DataValidator.ts) - Validates selections
- [CourseController](../src/ui/controllers/CourseController.ts) - UI integration

#### [ScheduleManagementService.ts](../src/services/selection/ScheduleManagementService.ts)

CRUD operations for multiple schedules.

**Responsibilities:**
- Create, update, delete schedules
- Activate/switch schedules
- ICS export (calendar format)
- Retry logic for storage operations

**Key Methods:**
- `createSchedule()` / `deleteSchedule()`
- `updateSchedule()` / `activateSchedule()`
- `exportToICS()`

**Events Emitted:**
- `schedule_created`, `schedule_deleted`
- `schedule_updated`, `schedule_activated`

**Connects to:**
- [ProfileStateManager](../src/core/state/ProfileStateManager.ts) - State storage
- [CourseSelectionService](../src/services/selection/CourseSelectionService.ts) - Coordinates selections
- [ScheduleController](../src/ui/controllers/ScheduleController.ts) - UI integration

#### [StorageService.ts](../src/services/selection/StorageService.ts)

Facade coordinating persistent data management.

**Responsibilities:**
- Bridges ProfileStateManager and storage
- Theme persistence (implements ThemeStorage interface)
- Preferences and schedule persistence
- Active schedule management

**Connects to:**
- [ProfileStateManager](../src/core/state/ProfileStateManager.ts) - State access
- [TransactionalStorageManager](../src/core/storage/TransactionalStorageManager.ts) - Persistence
- [ThemeManager](../src/themes/) - Theme storage

---

### Filtering (`src/services/filtering/`)

#### [CourseFilterService.ts](../src/services/filtering/CourseFilterService.ts)

Orchestrates course filtering operations.

**Responsibilities:**
- Wraps SectionFilterPipeline
- Filter registration and state management
- Priority-based filter execution
- Event-driven state with persistence

**Key Methods:**
- `addFilter()` / `removeFilter()`
- `applyFilters()`
- `getActiveFilters()`

**Connects to:**
- [SectionFilterPipeline](../src/core/filtering/SectionFilterPipeline.ts) - Filter execution
- [FilterState](../src/core/filtering/FilterState.ts) - Filter criteria
- [FilterModalController](../src/ui/controllers/FilterModalController.ts) - UI integration

#### [ScheduleFilterService.ts](../src/services/filtering/ScheduleFilterService.ts)

Filters generated schedules by criteria.

**Responsibilities:**
- Filter generated schedule combinations
- Apply user preferences (time ranges, days)
- Integrate professor ratings

**Connects to:**
- [RateMyProfessorService](../src/services/external/RateMyProfessorService.ts) - Rating data
- [ScheduleController](../src/ui/controllers/ScheduleController.ts) - UI integration

#### [searchService.ts](../src/services/filtering/searchService.ts)

Full-text search across courses and sections.

**Responsibilities:**
- Fuzzy matching capabilities
- Scored search results
- Search across course names, codes, professors

**Connects to:**
- [CourseController](../src/ui/controllers/CourseController.ts) - Search UI

---

### Scheduling (`src/services/scheduling/`)

#### [AutoScheduler.ts](../src/services/scheduling/AutoScheduler.ts)

Automatic schedule generation using bitmask optimization.

**Responsibilities:**
- Generate all valid schedule combinations
- Apply blocked time constraints
- Optimize for user preferences
- Use bitmask engine for performance

**Connects to:**
- [BitMaskEngine](../src/core/scheduling/BitMaskEngine.ts) - Scheduling algorithm
- [ConflictEngine](../src/core/scheduling/ConflictEngine.ts) - Conflict validation
- [ScheduleController](../src/ui/controllers/ScheduleController.ts) - UI integration

#### [ScheduleScorer.ts](../src/services/scheduling/ScheduleScorer.ts)

Scores schedules based on user preferences.

**Responsibilities:**
- Score schedules by criteria (gaps, days, times)
- Rank generated schedules
- Support custom scoring weights

**Connects to:**
- [AutoScheduler](../src/services/scheduling/AutoScheduler.ts) - Scoring integration

---

### External (`src/services/external/`)

#### [RateMyProfessorService.ts](../src/services/external/RateMyProfessorService.ts)

Fetches and caches professor ratings.

**Responsibilities:**
- Fetch ratings from `rateMyProfessor.json`
- Cache ratings for performance
- Provide professor lookup

**Connects to:**
- [ScheduleFilterService](../src/services/filtering/ScheduleFilterService.ts) - Rating filters
- [SectionInfoModalController](../src/ui/controllers/SectionInfoModalController.ts) - Display ratings

---


### UI Services (`src/services/ui/`)

#### [ModalService.ts](../src/services/ui/ModalService.ts)

**Singleton** - Modal presentation and event handling.

**Responsibilities:**
- Show/hide modals
- Button interaction handling
- Modal lifecycle management

**Connects to:**
- All modal components in [ui/components/](../src/ui/components/)

---

## UI Layer

The UI layer handles DOM interaction and user interface.

### Controllers (`src/ui/controllers/`)

#### [MainController.ts](../src/ui/controllers/MainController.ts)

Application orchestrator - initializes and wires all services.

**Responsibilities:**
- Dependency injection for all services
- Service coordination
- Event setup between services

**Initialization Order:**
1. ProfileStateManager (singleton)
2. StorageService → loadFromStorage()
3. ThemeManager
4. CourseDataService
5. CourseSelectionService + ScheduleManagementService
6. All UI controllers

**Connects to:**
- All services and controllers (orchestrator)

#### [ScheduleController.ts](../src/ui/controllers/ScheduleController.ts)

Schedule display and management UI.

**Responsibilities:**
- Render schedule grid
- Handle schedule interactions (drag, select)
- Manage schedule switching
- Display conflicts

**Connects to:**
- [ScheduleManagementService](../src/services/selection/ScheduleManagementService.ts) - Schedule operations
- [ConflictEngine](../src/core/scheduling/ConflictEngine.ts) - Conflict detection
- [AutoScheduler](../src/services/scheduling/AutoScheduler.ts) - Schedule generation

#### [CourseController.ts](../src/ui/controllers/CourseController.ts)

Course listing and interaction.

**Responsibilities:**
- Render course list
- Handle course selection
- Display course details
- Search integration

**Connects to:**
- [CourseDataService](../src/services/data/courseDataService.ts) - Course data
- [CourseSelectionService](../src/services/selection/CourseSelectionService.ts) - Selection
- [CourseFilterService](../src/services/filtering/CourseFilterService.ts) - Filtering

#### [DepartmentController.ts](../src/ui/controllers/DepartmentController.ts)

Department selection sidebar.

**Responsibilities:**
- Render department list
- Handle department selection
- Update course display on selection

**Connects to:**
- [CourseController](../src/ui/controllers/CourseController.ts) - Triggers course filtering
- [CourseDataService](../src/services/data/courseDataService.ts) - Department data

#### [FilterModalController.ts](../src/ui/controllers/FilterModalController.ts)

Filter UI and event handling.

**Responsibilities:**
- Render filter options
- Handle filter selection
- Apply filter changes

**Connects to:**
- [CourseFilterService](../src/services/filtering/CourseFilterService.ts) - Filter state
- [FilterState](../src/core/filtering/FilterState.ts) - Filter criteria

#### [ScheduleFilterModalController.ts](../src/ui/controllers/ScheduleFilterModalController.ts)

Schedule-specific filter UI.

**Connects to:**
- [ScheduleFilterService](../src/services/filtering/ScheduleFilterService.ts) - Schedule filtering

#### [InfoModalController.ts](../src/ui/controllers/InfoModalController.ts)

Generic information modal logic.

#### [SectionInfoModalController.ts](../src/ui/controllers/SectionInfoModalController.ts)

Section details display.

**Connects to:**
- [RateMyProfessorService](../src/services/external/RateMyProfessorService.ts) - Professor ratings

#### [UIStateManager.ts](../src/ui/controllers/UIStateManager.ts)

Transient UI state management.

**Responsibilities:**
- Track UI-only state (expansions, selections)
- Not persisted to storage

#### [TimestampManager.ts](../src/ui/controllers/TimestampManager.ts)

Timestamp tracking and display for course data updates.

---

### Components (`src/ui/components/`)

#### [BaseModal.ts](../src/ui/components/BaseModal.ts)

Base class for all modals.

**Used by:** All modal components

#### [ThemeSelector.ts](../src/ui/components/ThemeSelector.ts)

Theme switching UI.

**Connects to:**
- [ThemeManager](../src/themes/) - Theme state
- [StorageService](../src/services/selection/StorageService.ts) - Theme persistence

#### [SchedulePickerModal.ts](../src/ui/components/SchedulePickerModal.ts)

Multi-schedule selection dialog.

**Connects to:**
- [ScheduleManagementService](../src/services/selection/ScheduleManagementService.ts) - Schedule list

#### [CourseConflictModal.ts](../src/ui/components/CourseConflictModal.ts)

Course-specific conflict display.

**Connects to:**
- [ConflictEngine](../src/core/scheduling/ConflictEngine.ts) - Conflict data

#### [ComponentSelectionWizard.ts](../src/ui/components/ComponentSelectionWizard.ts)

Multi-step selection wizard for complex selections.

#### [DualRangeSlider.ts](../src/ui/components/DualRangeSlider.ts)

Time range selection component.

**Used by:** Filter modals for time selection

#### [ResizablePanel.ts](../src/ui/components/ResizablePanel.ts)

Drag-to-resize functionality for layout panels.

**Responsibilities:**
- Handle mouse/touch drag events on resize handles
- Update CSS custom properties for panel widths
- Enforce min/max width constraints
- Show visual feedback during drag (cursor, indicator line)

**Key Methods:**
- `resetWidths()` - Reset all panels to default widths
- `destroy()` - Clean up event listeners

**Configuration per panel:**
- `handleSelector` - CSS selector for the resize handle element
- `targetProperty` - CSS custom property to update (e.g., `--panel-sidebar-width`)
- `minWidth` / `maxWidth` - Width constraints in pixels
- `direction` - Whether dragging right increases (`left`) or decreases (`right`) width

**Used by:** [MainController](../src/ui/controllers/MainController.ts) - Initialized on startup

#### [SharedFilterComponents.ts](../src/ui/components/SharedFilterComponents.ts)

Reusable filter UI components.

**Used by:** [FilterModalController](../src/ui/controllers/FilterModalController.ts), [ScheduleFilterModalController](../src/ui/controllers/ScheduleFilterModalController.ts)

#### [SharedFilterSetup.ts](../src/ui/components/SharedFilterSetup.ts)

Filter setup helpers.


### Sidebar (`src/ui/sidebar/`)

Reusable sidebar panel system for overlay content.

#### [BaseSidebarPanel.ts](../src/ui/sidebar/BaseSidebarPanel.ts)

Abstract base class for sidebar overlay panels with animation support.

**Responsibilities:**
- Panel lifecycle (open, close, destroy)
- Slide/fade animations with configurable duration
- Escape key handling
- Animated list rendering with stagger effects
- DOM query helpers for subclasses

**Key Methods:**
- `open()` / `close()` - Panel lifecycle with animation
- `isOpen()` - Check panel state
- `rerender()` - Update content without closing
- `renderAnimatedList()` - Render items with stagger animation

**Abstract Methods (subclass must implement):**
- `panelId` - Unique identifier
- `panelClass` - CSS class for container
- `renderContent()` - HTML content
- `attachEventListeners()` - Event setup

**Optional Hooks:**
- `onOpen()` / `onClose()` - Lifecycle callbacks
- `getListItems()` / `getListGroups()` - Animated list data
- `attachItemListeners()` - Per-item event handlers

**Connects to:**
- [ComponentSelectionWizard](../src/ui/components/ComponentSelectionWizard.ts) - Implementation

#### [types.ts](../src/ui/sidebar/types.ts)

Type definitions for the sidebar panel system.

**Key Types:**
- `SidebarPanel` - Panel interface
- `SidebarPanelOptions` - Configuration options
- `PanelAnimationType` - Animation modes (fade, slide-left, slide-right)
- `SidebarListItem` / `SidebarListGroup` - Animated list types

---

### Utils (`src/ui/utils/`)

UI utility functions for rendering and time handling.

---

## Types

### [ApplicationState.ts](../src/types/ApplicationState.ts)

Container for multiple schedules with version/timestamp.

**Key Methods:**
- `toMinimalFormat()` / `fromMinimalFormat()` - Minimal format for local export/import
- `upsertSchedule()` / `removeSchedule()` - Immutable updates
- `getActiveSchedule()` - Query methods

**Used by:** [ProfileStateManager](../src/core/state/ProfileStateManager.ts)

### [ScheduleState.ts](../src/types/ScheduleState.ts)

Single schedule with selectedCourses and generatedSchedules.

**Key Properties:**
- `id` / `name` - Schedule identification
- `selectedCourses` - Courses added to this schedule
- `generatedSchedules` - Auto-generated schedule combinations
- `localEvents` - Locally-stored calendar events

**Key Methods:**
- `with()` - Immutable updates
- `fromLegacySchedule()` / `toLegacySchedule()` - Migration helpers

**Used by:** [ApplicationState](../src/types/ApplicationState.ts)

### [filters.ts](../src/types/filters.ts)

Filter type definitions and interfaces.

**Used by:** All filter implementations

### [schedule.ts](../src/types/schedule.ts)

Schedule-related types (Course, Section, Period, etc.).

**Used by:** Throughout codebase

### [types.ts](../src/types/types.ts)

Miscellaneous shared types.

### [ui.ts](../src/types/ui.ts)

UI-specific type definitions.

### [filterableUnit.ts](../src/types/filterableUnit.ts)

Filterable unit types for the filter pipeline.

### [modal.ts](../src/types/modal.ts)

Modal-related type definitions.

---

## Configuration & Assets

### Config (`src/config/`)

Configuration files for the application.

### Themes (`src/themes/`)

Theme system with JSON definitions.

**Subdirectories:**
- `definitions/` - Theme color definitions
- `styles/` - Theme-specific CSS

**Connects to:** [ThemeSelector](../src/ui/components/ThemeSelector.ts), [StorageService](../src/services/selection/StorageService.ts)

### Assets (`src/assets/`)

Static assets including icons and SVGs.

### Styles (`src/styles/`)

Global CSS and component-specific styles.

---

## Data Flow

### Course Selection Flow

```
User selects course
    ↓
CourseController → CourseSelectionService.selectCourse()
    ↓
ProfileStateManager.withStateUpdate()
    ↓
State updated + emitEvent('courses_changed')
    ↓
TransactionalStorageManager.save()
```

### Data Loading Flow

```
main.ts → MainController
    ↓
MainController.initialize()
    ↓
ProfileStateManager.loadFromStorage()
    ↓
CourseDataService.loadCourseData()
    ↓
CourseSelectionService.initialize() + health check
    ↓
UI Controllers render with loaded data
```

### Filter Application Flow

```
User sets filter criteria
    ↓
FilterModalController → CourseFilterService.addFilter()
    ↓
FilterState updated
    ↓
SectionFilterPipeline.applyFilters()
    ↓
Flatten → Filter → Reconstruct
    ↓
CourseController receives filtered courses
    ↓
UI updates
```


## Key Architectural Patterns

| Pattern | Implementation |
|---------|----------------|
| **Singleton** | ProfileStateManager, ModalService |
| **Observer/Pub-Sub** | StateChangeListener, SelectionChangeListener |
| **Pipeline** | SectionFilterPipeline |
| **Facade** | StorageService, MainController |
| **Strategy** | Filter implementations, CalendarProvider interface |
| **Transaction** | TransactionalStorageManager |
| **Template Method** | BaseSidebarPanel (abstract base with hooks) |

---

*Generated for WPI Planner V2*
