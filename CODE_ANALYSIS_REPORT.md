# WPI Course Planner V2 - Architecture Documentation

## Overview

WPI Course Planner V2 is a TypeScript-based web application that helps students plan their academic schedules by fetching live course data from WPI's database and providing an interactive drag-and-drop interface for course selection and scheduling.

## Architecture Layers

The application follows a layered architecture with clear separation of concerns:

- **Core**: Business logic and data models
- **Services**: External integrations and high-level coordination  
- **UI**: User interface components and controllers
- **Utils**: Shared utility functions and helpers

## Core Module (`src/core/`)

The core module contains the fundamental business logic and data management components that form the backbone of the application.

### Data Management & Persistence

The application has undergone a major storage architecture refactor to eliminate data corruption and provide a unified persistence layer.

#### Key Architectural Changes

**Current Unified Architecture:**
```
                ProfileStateManager (Single Source of Truth)
                            ↓
                TransactionalStorageManager
                            ↓
                       localStorage
                            ↑
      ┌─────────────────────────────────────────────────────┐
      │                                                     │
 StorageService ←→ ThemeManager    CourseSelectionService    MainController
      ↑
 ThemeSelector
```

#### Storage Components

**ProfileStateManager.ts** 
- **Single source of truth** for all application data
- Manages user profiles, preferences, and application state
- Coordinates all storage operations through unified API
- Prevents data corruption through centralized control

**TransactionalStorageManager.ts**
- Low-level localStorage operations with transaction support
- Handles serialization/deserialization of complex data types
- Provides atomic operations for data consistency
- Foundation layer that ProfileStateManager builds upon


**ProfileMigrationService.ts**
- Handles migration between different storage formats
- Ensures data compatibility during application updates
- Safely transitions users from old to new storage systems

#### Benefits Achieved
- **Eliminated data corruption** from competing storage systems
- **Single source of truth** for all persistence operations
- **Consistent state management** across all components
- **Atomic transactions** prevent partial data updates
- **Centralized control** over storage access patterns

### Course & Schedule Management


**ConflictDetector.ts**
- Analyzes time conflicts between course sections
- Validates schedule combinations for feasibility
- Provides conflict resolution suggestions
- Used by schedule generation and filtering systems

### Data Validation & Quality

**DataValidator.ts**
- Validates course data integrity and format
- Ensures data consistency across the application
- Handles edge cases in WPI course data

**RetryManager.ts**
- Provides retry logic for network operations
- Implements exponential backoff strategies
- Handles transient failures gracefully

### Filtering System (`src/core/filters/`)

The filtering system provides a flexible, composable architecture for filtering courses and sections based on various criteria:

**Filter Types:**
- **Course-level filters**: DepartmentFilter, CreditRangeFilter, SearchTextFilter
- **Section-level filters**: AvailabilityFilter, PeriodConflictFilter, PeriodDaysFilter  
- **Schedule filters**: ConflictDetector integration, RequiredStatusFilter
- **UI filters**: CourseSelectionFilter (selected vs unselected courses)

**FilterState.ts**
- Manages the current state of all active filters
- Provides centralized filter coordination
- Handles filter combinations and logic

**Key Design Principles:**
- Each filter is self-contained and testable
- Filters can be combined using logical operators (AND/OR)
- Consistent interface across all filter types
- Performance-optimized for large course datasets

## Data Flow Overview

1. **Data Ingestion**: Course data fetched from WPI's APIs via services layer
2. **Processing**: Raw data validated and transformed by core utilities  
3. **Storage**: Processed data persisted using ProfileStateManager
4. **Business Logic**: ProfileStateManager coordinates course selection and validation
5. **Filtering**: Filter system narrows down available options based on user criteria
6. **Conflict Detection**: ConflictDetector validates schedule feasibility
7. **UI Updates**: Event-driven notifications update the user interface

## Services Layer (`src/services/`)

The services layer provides high-level business logic coordination and external integrations. Services orchestrate interactions between core components and provide clean APIs for the UI layer.

### Data & External Integration Services

**courseDataService.ts**
- **Purpose**: Fetches and parses WPI course data from external JSON files
- **Connections**: Used by MainController for initial data loading
- **Key Features**: JSON parsing, data transformation, error handling
- **Data Flow**: External JSON → Parse/Transform → ScheduleDB → Application

**StorageService.ts** 
- **Purpose**: Unified singleton interface to ProfileStateManager
- **Connections**: Used by ThemeManager and other components needing storage
- **Key Features**: Singleton pattern, implements ThemeStorage interface
- **Architecture Role**: Bridge between UI components and core storage system

### Course & Schedule Management Services

**CourseSelectionService.ts**
- **Purpose**: High-level API for course selection and management
- **Core Dependencies**: ProfileStateManager, DataValidator, RetryManager
- **UI Connections**: Used by MainController, CourseController, ScheduleController
- **Key Features**: Event-driven updates, validation, persistence, import/export
- **Events**: course_added, course_removed, section_changed, selection_cleared

**ScheduleManagementService.ts**
- **Purpose**: Manages multiple schedules and schedule operations
- **Dependencies**: CourseSelectionService, ProfileStateManager, DataValidator
- **UI Connections**: ScheduleController, ScheduleSelector component
- **Key Features**: Schedule CRUD operations, activation, event notifications
- **Events**: schedule_created, schedule_deleted, schedule_updated, schedule_activated

### Search & Filtering Services

**searchService.ts**
- **Purpose**: Full-text search across courses, professors, and course content
- **Key Features**: Search indexing, ranking algorithms, caching
- **Performance**: Pre-built indexes for fast search on large datasets
- **Used By**: FilterService, SearchTextFilter, UI search components

**FilterService.ts**
- **Purpose**: Coordinating service for the filtering system
- **Dependencies**: SearchService, FilterState (core)
- **Connections**: Used by ScheduleFilterService and FilterModalController
- **Key Features**: Filter registration, state management, event coordination
- **Architecture**: Bridge between core filter system and UI controllers

**ScheduleFilterService.ts**
- **Purpose**: Specialized filtering for schedule generation and conflict detection
- **Dependencies**: FilterService, SearchService, ConflictDetector
- **Filter Types**: PeriodConflictFilter, PeriodDaysFilter, PeriodTypeFilter
- **Used By**: ScheduleController for generating valid schedules

**DepartmentSyncService.ts**
- **Purpose**: Synchronizes department selection between UI components
- **Connections**: FilterService ↔ DepartmentController ↔ FilterModalController
- **Key Features**: Prevents circular updates, maintains UI consistency
- **Architecture Role**: Coordination layer preventing tight coupling between UI components

### UI Support Services

**ModalService.ts**
- **Purpose**: Centralized modal management and z-index coordination
- **Key Features**: Modal lifecycle, z-index stacking, animation coordination
- **Used By**: Various modal controllers throughout the UI layer
- **Benefits**: Prevents modal conflicts, consistent behavior

### Service Interconnection Patterns

```
Data Flow:
courseDataService → SearchService → FilterService → UI Controllers
                 → CourseSelectionService → ScheduleManagementService

Storage Flow:
UI Components → Services → StorageService → ProfileStateManager → localStorage

Event Flow:
Core Changes → Service Events → UI Updates
UI Actions → Service Coordination → Core Updates
```

### Key Architectural Benefits

- **Separation of Concerns**: Services handle coordination, core handles business logic
- **Event-Driven Architecture**: Services provide clean event interfaces for UI updates
- **Dependency Injection**: Services can be mocked/replaced for testing
- **Single Responsibility**: Each service has a focused purpose
- **Loose Coupling**: UI components interact through service APIs, not directly with core

## Next Sections

- UI Components & Controllers  
- Utilities & Helper Functions
- Type System & Data Models