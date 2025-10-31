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
- **Used By**: CourseFilterService, SearchTextFilter, UI search components

**CourseFilterService.ts**
- **Purpose**: Coordinating service for the filtering system
- **Dependencies**: SearchService, FilterState (core)
- **Connections**: Used by ScheduleFilterService and FilterModalController
- **Key Features**: Filter registration, state management, event coordination
- **Architecture**: Bridge between core filter system and UI controllers

**ScheduleFilterService.ts**
- **Purpose**: Specialized filtering for schedule generation and conflict detection
- **Dependencies**: CourseFilterService, SearchService, ConflictDetector
- **Filter Types**: PeriodConflictFilter, PeriodDaysFilter, PeriodTypeFilter
- **Used By**: ScheduleController for generating valid schedules

**DepartmentSyncService.ts**
- **Purpose**: Synchronizes department selection between UI components
- **Connections**: CourseFilterService ↔ DepartmentController ↔ FilterModalController
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
courseDataService → SearchService → CourseFilterService → UI Controllers
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

## UI Layer (`src/ui/`)

The UI layer implements the Model-View-Controller (MVC) pattern with specialized controllers managing different aspects of the user interface, reusable components, and performance-optimized utilities.

### Core Controllers (`src/ui/controllers/`)

**MainController.ts** - Application Orchestrator
- **Purpose**: Central coordinator for the entire application
- **Dependencies**: All major services (CourseSelectionService, ScheduleManagementService, etc.)
- **Responsibilities**: 
  - Application initialization and service coordination
  - Integration of all sub-controllers (Department, Course, Schedule)
  - Theme management integration via ThemeSelector
  - Search coordination with debouncing and operation management
- **Architecture Role**: Single entry point that wires together all application components

**CourseController.ts** - Course Display & Selection
- **Purpose**: Manages course listing, filtering, and selection UI
- **Key Features**: 
  - Progressive rendering for large course datasets (ProgressiveRenderer)
  - Performance monitoring and metrics collection
  - Pagination with dynamic page sizing
  - WeakMap-based element-to-course mapping for memory efficiency
- **Service Integration**: CourseSelectionService, CourseFilterService
- **Performance**: Optimized for datasets of 1000+ courses

**ScheduleController.ts** - Schedule Visualization & Management  
- **Purpose**: Renders schedule grids and manages schedule interactions
- **Dependencies**: ScheduleManagementService, ScheduleFilterService, ConflictDetector
- **Key Features**:
  - Schedule conflict visualization and resolution
  - Section selection and schedule generation
  - Modal integration for detailed section information
  - State preservation for UI consistency
- **Integration**: Works closely with ScheduleFilterModalController

**DepartmentController.ts** - Department Navigation
- **Purpose**: Manages department selection and categorization
- **Features**: Department filtering, category-based organization
- **Synchronization**: Integrates with DepartmentSyncService to maintain consistency

### Modal Controllers

**FilterModalController.ts** - Advanced Filtering Interface  
- **Purpose**: Provides comprehensive filtering UI for course discovery
- **Integration**: CourseFilterService, SearchService coordination
- **Features**: Multi-criteria filtering, real-time filter application

**ScheduleFilterModalController.ts** - Schedule-Specific Filtering
- **Purpose**: Specialized filtering for schedule generation
- **Focus**: Time conflicts, availability, schedule constraints

**SectionInfoModalController.ts** - Detailed Course Information
- **Purpose**: Displays comprehensive course and section details
- **Features**: Section comparison, enrollment information, scheduling details

**InfoModalController.ts** - General Information Modals
- **Purpose**: Handles help, about, and informational content

### Reusable Components (`src/ui/components/`)

**ThemeSelector.ts**
- **Purpose**: Theme switching interface with persistence
- **Integration**: ThemeManager, StorageService
- **Features**: Dropdown UI, theme preview, automatic theme persistence

**ScheduleSelector.ts** 
- **Purpose**: Schedule management interface
- **Integration**: ScheduleManagementService
- **Features**: Schedule switching, creation, deletion

### UI Management & State

**UIStateManager.ts**
- **Purpose**: Manages global UI state (view modes, page navigation)
- **State Management**: Current view (list/grid), current page (planner/schedule)
- **Features**: Button state synchronization, page transitions

**TimestampManager.ts**
- **Purpose**: Manages data freshness indicators and update timestamps
- **Features**: Real-time timestamp updates, data refresh coordination

### Performance & Rendering (`src/ui/utils/`)

**ProgressiveRenderer.ts**
- **Purpose**: High-performance rendering for large datasets
- **Features**: 
  - Batch rendering with configurable batch sizes
  - Frame-rate aware rendering (60 FPS targeting)
  - Cancellation support for interrupted operations
  - Performance metrics integration
  - Memory-efficient virtualization options
- **Use Cases**: Course list rendering, search results, large schedule displays

**timeUtils.ts**
- **Purpose**: Time-related UI utilities and formatting
- **Features**: Time formatting, grid positioning, schedule visualization helpers

### UI Architecture Patterns

#### Controller Coordination Pattern
```
MainController (Orchestrator)
    ├── DepartmentController ←→ DepartmentSyncService ←→ CourseFilterService  
    ├── CourseController ←→ CourseFilterService ←→ SearchService
    ├── ScheduleController ←→ ScheduleFilterService ←→ ConflictDetector
    └── Modal Controllers ←→ ModalService (z-index management)
```

#### Service Integration Pattern
```
UI Controllers → Services → Core Business Logic
    ↓              ↓            ↓
  DOM Updates ← Events ← State Changes
```

#### Performance Optimization Strategy
- **Progressive Rendering**: Large datasets rendered in batches
- **WeakMap Usage**: Memory-efficient element-to-data mapping  
- **Debounced Operations**: Search and filter operations optimized
- **Cancellation Tokens**: Prevent outdated operations from completing
- **Performance Metrics**: Real-time monitoring of rendering performance

### Key UI Architectural Benefits

- **Separation of Concerns**: Each controller has specific responsibilities
- **Performance-First**: Optimized for large WPI course datasets (8MB+)
- **Event-Driven**: Reactive UI that responds to service layer events
- **Memory Efficient**: WeakMaps and cancellation prevent memory leaks
- **Accessibility**: Consistent modal management and keyboard navigation
- **Testability**: Controllers can be unit tested with mocked services

## Utilities & Helper Functions (`src/utils/`)

The utilities layer provides cross-cutting concerns and specialized helper functions that are used throughout the application. These utilities focus on performance, data validation, and domain-specific operations.

### Performance & Monitoring Utilities

**PerformanceMetrics.ts**
- **Purpose**: Real-time performance monitoring and metrics collection
- **Key Features**:
  - Operation timing with start/end tracking
  - Performance reports with averages, min/max durations
  - Specialized filtering/rendering performance metrics
  - Configurable metrics retention (default: last 100 operations)
- **Used By**: CourseController, ProgressiveRenderer, CourseFilterService
- **Benefits**: Performance bottleneck identification, optimization validation

**RequestCancellation.ts**
- **Purpose**: Cooperative cancellation system for long-running operations
- **Components**:
  - `CancellationToken`: Represents a cancellable operation state
  - `CancellationError`: Specialized error for cancelled operations  
  - `CancellationTokenSource`: Factory for creating cancellation tokens
  - `OperationManager`: High-level debouncing and operation coordination
- **Used By**: ProgressiveRenderer, search operations, data loading
- **Pattern**: Prevents outdated operations from completing and wasting resources

### Data Validation & Quality

**validators.ts**
- **Purpose**: Comprehensive type-safe validation for all data structures
- **Validation Coverage**:
  - Course, Section, Period, Department validation
  - Schedule and SelectedCourse validation  
  - SchedulePreferences validation
  - Nested object validation with full type checking
- **Used By**: CourseSelectionService, data loading, import/export operations
- **Benefits**: Runtime type safety, data integrity assurance, graceful error handling

### Domain-Specific Utilities

**dateUtils.ts**
- **Purpose**: Academic calendar and date operations
- **Key Features**:
  - Academic year calculation (starts in August)
  - Semester determination based on current date
  - Academic date range calculations
  - WPI-specific academic calendar logic
- **Used By**: Course filtering, schedule planning, data organization
- **Domain Knowledge**: Encapsulates WPI's academic calendar specifics

**departmentUtils.ts** 
- **Purpose**: Department organization and categorization
- **Key Features**:
  - Department-to-category mapping (Science, Engineering, Business, etc.)
  - Category-based department filtering
  - WPI-specific department abbreviations
- **Data**: Comprehensive mapping of 40+ WPI departments to logical categories
- **Used By**: DepartmentController, search filtering, UI organization

**termUtils.ts** (Legacy Support)
- **Purpose**: Academic term extraction and formatting 
- **Status**: Marked deprecated but kept for testing and legacy support
- **Functions**: `extractTermLetter()`, `formatTermName()`, `isValidTermLetter()`
- **Usage**: Primarily in tests and Java converter integration

### Utility Architecture Patterns

#### Cross-Cutting Concerns Pattern
```
Performance Monitoring:
Any Operation → PerformanceMetrics → Metrics Collection → Optimization Insights

Cancellation Pattern:  
User Action → CancellationTokenSource → CancellationToken → Operation Cancellation

Validation Pipeline:
Data Input → Validators → Type-Safe Data → Application Processing
```

#### Domain Knowledge Encapsulation
```
WPI-Specific Logic:
Academic Calendar → dateUtils → Standard Date Operations
Department Structure → departmentUtils → UI Organization  
Term System → termUtils → Legacy/Test Support
```

### Integration with Application Layers

**Core Layer Integration:**
- Validators ensure data integrity for ProfileStateManager
- Performance metrics monitor ConflictDetector operations
- Date utilities support academic term processing

**Services Layer Integration:**  
- Cancellation tokens prevent resource waste in SearchService
- Performance metrics track CourseSelectionService operations
- Validators ensure data quality in all service operations

**UI Layer Integration:**
- Performance metrics optimize ProgressiveRenderer batch sizes
- Cancellation tokens prevent outdated UI updates
- Department utilities organize DepartmentController displays

### Key Utility Benefits

- **Performance Optimization**: Real-time metrics enable continuous performance improvement
- **Resource Management**: Cancellation system prevents wasted computation
- **Data Integrity**: Comprehensive validation ensures application stability
- **Domain Expertise**: WPI-specific logic centralized and maintainable
- **Cross-Layer Support**: Utilities serve all application layers consistently
- **Testing Support**: Validation and metrics enable robust testing strategies

## Type System & Data Models (`src/types/`)

The type system provides comprehensive TypeScript interfaces that define the application's data structures and contracts. These types ensure type safety, enable IDE support, and serve as documentation for the data models throughout the application.

### Core Data Models (`types.ts`)

#### Academic Data Structure

**Course Interface**
- **Purpose**: Represents a WPI course with all associated metadata
- **Key Properties**: id, number, name, description, department, sections[], credits
- **Relationships**: Contains Department reference, array of Section objects
- **Usage**: Central data structure used throughout filtering, selection, and display

**Department Interface**  
- **Purpose**: Represents academic departments (CS, ECE, ME, etc.)
- **Key Properties**: abbreviation, name, courses[]
- **Relationships**: Bidirectional relationship with Course objects
- **Usage**: Used for department-based organization and filtering

**Section Interface**
- **Purpose**: Represents course section with enrollment and scheduling data
- **Key Properties**: crn, number, seats, availability, periods[], term, computedTerm
- **Relationships**: Contains array of Period objects for scheduling
- **Features**: Enrollment tracking, waitlist management, academic term computation

**Period Interface**
- **Purpose**: Represents individual class periods (lectures, labs, discussions)
- **Key Properties**: type, professor, times, location, days, enrollment limits
- **Relationships**: Belongs to Section, references Time and DayOfWeek
- **Usage**: Core building block for schedule conflict detection and time display

#### Time & Scheduling Models

**Time Interface**
- **Properties**: hours, minutes, displayTime (optional)
- **Usage**: Standardized time representation for schedule calculations

**DayOfWeek Enum**
- **Values**: MONDAY through SUNDAY
- **Usage**: Type-safe day representation in Sets for period scheduling

**ScheduleDB Interface**
- **Purpose**: Root data structure containing all course data
- **Properties**: departments[], metadata
- **Usage**: Top-level container loaded from WPI course data

### Schedule Management Models (`schedule.ts`)

**SelectedCourse Interface**
- **Purpose**: Tracks user's course selections with section preferences
- **Key Properties**: course, selectedSection, selectedSectionNumber, isRequired
- **Dual Section Storage**: Full Section object + string for compatibility
- **Usage**: Core model for persistent course selection state

**Schedule Interface**  
- **Purpose**: Represents saved schedule configurations
- **Properties**: id, name, selectedCourses[], generatedSchedules[]
- **Usage**: Multiple schedule management and saved configurations

**ScheduleCombination Interface**
- **Purpose**: Generated valid schedule combinations
- **Properties**: id, sections[], conflicts[], isValid
- **Usage**: Output of schedule generation algorithms

**TimeConflict Interface**
- **Purpose**: Represents detected time conflicts between sections
- **Properties**: section1, section2, conflictType, description
- **Usage**: Conflict detection and resolution guidance

**SchedulePreferences Interface**
- **Purpose**: User preferences for schedule generation
- **Properties**: preferredTimeRange, preferredDays, avoidBackToBackClasses, theme
- **Usage**: Constraints and preferences for schedule algorithms

### Filter System Types (`filters.ts`)

**CourseFilter Interface**
- **Purpose**: Contract for all filter implementations  
- **Methods**: apply(), isValidCriteria(), getDisplayValue()
- **Pattern**: Strategy pattern for pluggable filtering system
- **Usage**: Base interface for all 15+ filter implementations

**FilterCriteria Interface**
- **Purpose**: Generic criteria storage for any filter type
- **Pattern**: Dictionary pattern with filterId → criteria mapping
- **Usage**: State management for active filter combinations

**ActiveFilter Interface**
- **Purpose**: Runtime representation of applied filters
- **Properties**: id, name, criteria, displayValue
- **Usage**: UI display and filter state management

**FilterChangeEvent Interface**
- **Purpose**: Event system for filter state changes
- **Types**: add, remove, clear, update events  
- **Usage**: Event-driven UI updates when filters change

#### Specific Filter Criteria Types
- **DepartmentFilterCriteria**: Department selection arrays
- **AvailabilityFilterCriteria**: Availability-only boolean flags
- **CreditRangeFilterCriteria**: Min/max credit constraints
- **TimeSlotFilterCriteria**: Time-based filtering parameters

### UI-Specific Types (`ui.ts`)

**SearchFilter Interface**
- **Purpose**: UI-specific search constraints
- **Properties**: departments[], timeSlots[], professors[], creditRange
- **Usage**: Search interface and form validation

**CourseDisplayProps Interface**
- **Purpose**: UI display configuration options
- **Properties**: showDescription, showSections, showEnrollment, highlightConflicts
- **Usage**: Customizable course display modes

**ScheduleGridCell Interface**
- **Purpose**: Schedule grid visualization data
- **Properties**: timeSlot, day, course (optional), isConflict
- **Usage**: Schedule grid rendering and conflict visualization

**DragDropState Interface**
- **Purpose**: Drag-and-drop operation state management
- **Usage**: Interactive schedule building features

### Theme System Types (`themes/types.ts`)

**ThemeDefinition Interface**
- **Purpose**: Complete theme configuration specification
- **Properties**: name, id, description, colors, typography, spacing, effects
- **Usage**: Theme system configuration and CSS variable generation

**ThemeColors Interface**
- **Purpose**: Comprehensive color palette definition
- **Properties**: 20+ semantic color tokens (primary, background, text, etc.)
- **Usage**: CSS custom property generation and consistency

**ThemeChangeEvent Interface**
- **Purpose**: Theme system change notifications
- **Properties**: oldTheme, newTheme, themeDefinition
- **Usage**: Event-driven theme updates across components

### Type System Architecture Patterns

#### Domain-Driven Design
```
Academic Domain:
Course ←→ Department ←→ Section ←→ Period ←→ Time/DayOfWeek

User Domain:  
SelectedCourse ←→ Schedule ←→ SchedulePreferences ←→ ScheduleCombination

System Domain:
Filter Interfaces ←→ UI Types ←→ Theme Definitions
```

#### Type Safety Strategy
- **Strict TypeScript**: All data structures fully typed
- **Interface Contracts**: Clear API boundaries between layers  
- **Enum Usage**: Type-safe constants (DayOfWeek, ConflictType)
- **Generic Constraints**: Flexible but safe filter system
- **Runtime Validation**: Validators.ts provides runtime type checking

#### Relationship Modeling
- **Compositional**: Course contains Sections, Sections contain Periods
- **Bidirectional**: Course ←→ Department references
- **Temporal**: Schedule captures point-in-time selections
- **Behavioral**: Filter interfaces define system behavior

### Key Type System Benefits

- **IDE Support**: Full IntelliSense and error detection
- **Refactoring Safety**: Type-safe refactoring across large codebase  
- **API Documentation**: Interfaces serve as living documentation
- **Runtime Safety**: Combined with validators for full type checking
- **Cross-Layer Consistency**: Same types used from data loading to UI display
- **Extensibility**: Interface-based design enables easy feature additions

## Architecture Summary

WPI Course Planner V2 demonstrates a sophisticated layered architecture optimized for handling large datasets (8MB+ course data) while maintaining performance and user experience:

- **Core Layer**: Unified storage system with conflict detection and filtering
- **Services Layer**: Event-driven coordination and external integrations  
- **UI Layer**: Performance-optimized controllers with progressive rendering
- **Utilities Layer**: Cross-cutting concerns and WPI domain expertise
- **Type System**: Comprehensive type safety and clear data contracts

The architecture successfully balances complexity management, performance optimization, and maintainability for a production academic planning system.