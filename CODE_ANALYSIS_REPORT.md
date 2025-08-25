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

**Before (Conflicting Systems):**
```
StorageManager (direct localStorage) ←→ Data Corruption ←→
ProfileStateManager (transactional storage)
           ↓
    ThemeSelector
CourseSelectionService
```

**After (Unified System):**
```
                ProfileStateManager (Single Source of Truth)
                            ↓
                TransactionalStorageManager
                            ↓
                       localStorage
                            ↑
      ┌─────────────────────────────────────────────────────┐
      │                                                     │
 StorageService ←→ ThemeManager    CourseSelectionService
MainController
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

**StorageManager.ts** (Deprecated)
- Legacy persistence layer - marked for removal
- All functionality redirected to ProfileStateManager
- Maintains backward compatibility during transition period

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

**CourseManager.ts**
- Core business logic for course selection and management
- Tracks selected courses with section preferences
- Manages course metadata (credits, requirements, etc.)
- Provides event-driven notifications for UI updates

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
4. **Business Logic**: CourseManager coordinates course selection and validation
5. **Filtering**: Filter system narrows down available options based on user criteria
6. **Conflict Detection**: ConflictDetector validates schedule feasibility
7. **UI Updates**: Event-driven notifications update the user interface

## Next Sections

- Services Layer Architecture
- UI Components & Controllers  
- Utilities & Helper Functions
- Type System & Data Models