# WPI Planner V2 - Code Analysis Report

## Architecture Best Practices Framework

### Core Business Logic Layer Principles
1. **Single Responsibility Principle** - Each class should have one clear purpose
2. **Observer Pattern** - Event-driven architecture for loose coupling
3. **Data Encapsulation** - Private methods and controlled public API
4. **Error Handling** - Graceful degradation with try-catch blocks
5. **Type Safety** - Strong TypeScript typing throughout
6. **Immutability** - Avoid direct state mutations where possible
7. **Separation of Concerns** - Clear boundaries between data, business logic, and persistence

---

## Core Directory Analysis (`src/core/`)

### 1. CourseManager.ts

#### ✅ **Best Practices Followed:**
- **Observer Pattern Implementation**: Clean listener system with `Set<(courses: SelectedCourse[]) => void>`
- **Type Safety**: Strong TypeScript typing with proper interfaces
- **Data Encapsulation**: Private `selectedCourses` Map and `listeners` Set
- **Single Responsibility**: Focused solely on course selection management
- **Event-Driven Architecture**: Proper `notifyListeners()` after state changes
- **Immutable Public API**: Returns copies via `Array.from()` instead of direct references

#### ⚠️ **Areas for Optimization:**
1. **Array Operations Performance**: Lines 31-46 use `indexOf()` and `splice()` which are O(n) operations
   ```typescript
   // Current inefficient approach
   if (!selectedCourse.preferredSections.includes(sectionNumber)) {
       selectedCourse.preferredSections.push(sectionNumber);
   }
   const deniedIndex = selectedCourse.deniedSections.indexOf(sectionNumber);
   ```
   **Recommendation**: Use `Set<string>` instead of `string[]` for O(1) operations

2. **Redundant Method**: `getSelectedCoursesWithSections()` (line 98) is identical to `getSelectedCourses()`
   **Recommendation**: Remove or add distinct functionality

3. **Missing Validation**: No validation for courseId existence in several methods
   **Recommendation**: Add null checks and error handling

#### 🔧 **Suggested Improvements:**
```typescript
// Optimize section preferences with Sets
private preferredSections: Set<string> = new Set();
private deniedSections: Set<string> = new Set();

// Add validation helper
private validateCourseExists(courseId: string): boolean {
    if (!this.selectedCourses.has(courseId)) {
        console.warn(`Course ${courseId} not found in selected courses`);
        return false;
    }
    return true;
}
```

---

### 2. ConflictDetector.ts

#### ✅ **Best Practices Followed:**
- **Pure Functions**: All methods are side-effect free
- **Clear Algorithm Logic**: Well-structured conflict detection with nested loops
- **Type Safety**: Proper use of TypeScript types and interfaces
- **Single Responsibility**: Focused on conflict detection only
- **Immutable Operations**: Doesn't modify input data

#### ⚠️ **Areas for Optimization:**
1. **Nested Loop Complexity**: O(n²) time complexity for section comparison (lines 8-13)
   ```typescript
   for (let i = 0; i < sections.length; i++) {
       for (let j = i + 1; j < sections.length; j++) {
           // Could be optimized for large datasets
       }
   }
   ```
   **Impact**: Acceptable for typical course loads (5-8 courses), but could be improved

2. **Redundant Set Iteration**: `getSharedDays()` method (lines 49-57) could use Set intersection
   ```typescript
   // Current approach
   for (const day of days1) {
       if (days2.has(day)) {
           shared.push(day);
       }
   }
   ```
   **Recommendation**: Use modern Set operations

3. **Missing Caching**: No memoization for repeated conflict checks
   **Recommendation**: Cache results for identical section pairs

#### 🔧 **Suggested Improvements:**
```typescript
// Optimize shared days calculation
private getSharedDays(days1: Set<DayOfWeek>, days2: Set<DayOfWeek>): string[] {
    return Array.from(new Set([...days1].filter(day => days2.has(day))));
}

// Add result caching
private conflictCache = new Map<string, TimeConflict[]>();

private getCacheKey(section1: Section, section2: Section): string {
    return `${section1.crn}-${section2.crn}`;
}
```

---

### 3. StorageManager.ts

#### ✅ **Best Practices Followed:**
- **Static Configuration**: Centralized `STORAGE_KEYS` constant (lines 4-10)
- **Error Handling**: Comprehensive try-catch blocks throughout
- **Data Serialization**: Custom Set serialization/deserialization (lines 166-216)
- **Single Responsibility**: Focused on persistence layer only
- **Export/Import Functionality**: Complete data backup/restore system
- **Type Safety**: Strong TypeScript typing with return type annotations

#### ⚠️ **Areas for Optimization:**
1. **Repeated Error Handling**: Identical try-catch blocks in every method
   ```typescript
   try {
       // operation
   } catch (error) {
       console.warn('Failed to ...:', error);
       return null; // or default
   }
   ```
   **Recommendation**: Extract to decorator or higher-order function

2. **Deep Cloning Performance**: Recursive serialization (lines 166-190) could be expensive for large objects
   **Recommendation**: Consider using `structuredClone()` or libraries like Lodash

3. **No Data Versioning**: Import/export has basic version field but no migration logic
   **Recommendation**: Add schema migration system

4. **Missing Batch Operations**: No batch save/load for multiple schedules
   **Recommendation**: Add bulk operations to reduce localStorage calls

#### 🔧 **Suggested Improvements:**
```typescript
// Extract error handling
private handleStorageOperation<T>(
    operation: () => T,
    errorMessage: string,
    fallback: T
): T {
    try {
        return operation();
    } catch (error) {
        console.warn(`${errorMessage}:`, error);
        return fallback;
    }
}

// Add data versioning
private migrateData(data: any, fromVersion: string, toVersion: string): any {
    // Migration logic based on version differences
    return data;
}

// Optimize serialization with modern API
private serializeData(obj: any): string {
    return JSON.stringify(obj, (key, value) => {
        if (value instanceof Set) {
            return { __type: 'Set', value: [...value] };
        }
        return value;
    });
}
```

---

## Overall Core Architecture Assessment

### 🎯 **Architecture Strengths:**
1. **Clean Separation of Concerns**: Each class has a distinct responsibility
2. **Event-Driven Design**: Proper observer pattern implementation
3. **Type Safety**: Comprehensive TypeScript usage
4. **Error Resilience**: Graceful error handling throughout
5. **Data Persistence**: Robust storage layer with Set support

### 🚀 **Optimization Opportunities:**
1. **Performance**: Array operations could use Sets, conflict detection could be optimized
2. **Code Reuse**: Repeated patterns could be extracted to utilities
3. **Caching**: Add memoization for expensive operations
4. **Validation**: More comprehensive input validation
5. **Batch Operations**: Reduce localStorage I/O with bulk operations

### 📊 **Code Quality Score: 8.5/10**
- **Maintainability**: High - Clear structure and good separation
- **Performance**: Good - Some optimization opportunities exist
- **Reliability**: High - Comprehensive error handling
- **Testability**: High - Pure functions and clear interfaces
- **Scalability**: Good - Architecture supports growth

---

## Services Directory Analysis (`src/services/`)

### Service Layer Principles
1. **Facade Pattern** - High-level interfaces over complex subsystems
2. **Data Transformation** - Convert external data to internal models
3. **Caching Strategy** - Minimize network requests and improve performance
4. **Error Boundaries** - Graceful handling of external service failures
5. **Dependency Injection** - Loose coupling between services and core logic
6. **Single Purpose Services** - Each service handles one domain area
7. **Async/Await Patterns** - Modern JavaScript async handling

### 1. courseDataService.ts

#### ✅ **Best Practices Followed:**
- **Single Responsibility**: Dedicated to WPI course data fetching and parsing
- **Static Configuration**: Centralized constants for URLs and cache settings
- **Error Handling**: Comprehensive try-catch with meaningful error messages
- **Data Transformation**: Complex JSON parsing with proper type conversion
- **Regex Parsing**: Sophisticated pattern matching for course data extraction
- **Caching Strategy**: localStorage with expiry mechanism (1 hour)

#### ⚠️ **Areas for Optimization:**
1. **Unused Cache Methods**: Cache implementation exists but isn't used in `loadCourseData()` (lines 237-276)
   ```typescript
   async loadCourseData(): Promise<ScheduleDB> {
       // Always fetches fresh data, ignoring cache
       const freshData = await this.fetchFreshData();
   ```
   **Recommendation**: Implement cache-first strategy with fallback

2. **Duplicate Day Parsing**: Two similar methods `parseDaysFromPattern()` and `parseDays()` (lines 172-235)
   **Recommendation**: Consolidate into single method

3. **Large Method**: `processJSONEntry()` method is 74 lines long (lines 74-148)
   **Recommendation**: Extract smaller specialized methods

4. **Memory Usage**: Stores entire dataset in memory without pagination
   **Recommendation**: Consider lazy loading for large datasets

5. **Search Performance**: Linear search through all courses (lines 282-305)
   **Recommendation**: Implement indexing or use search library

#### 🔧 **Suggested Improvements:**
```typescript
// Implement cache-first strategy
async loadCourseData(): Promise<ScheduleDB> {
    if (!this.isCacheExpired()) {
        const cached = this.getCachedData();
        if (cached) return cached;
    }
    
    const fresh = await this.fetchFreshData();
    this.cacheData(fresh);
    return fresh;
}

// Extract course parsing logic
private createCourseFromEntry(entry: any, department: Department): Course {
    // Course creation logic extracted here
}

private createSectionFromEntry(entry: any): Section {
    // Section creation logic extracted here
}
```

---

### 2. CourseSelectionService.ts

#### ✅ **Best Practices Followed:**
- **Facade Pattern**: Clean high-level API over CourseManager complexity
- **Dependency Injection**: Proper service composition in constructor
- **Automatic Persistence**: All state changes automatically saved
- **Event Propagation**: Properly delegates listener management
- **Single Source of Truth**: CourseManager as authoritative source
- **Export/Import**: Data portability functionality

#### ⚠️ **Areas for Optimization:**
1. **Redundant Persistence Calls**: Multiple methods call `persistSelections()` after already setting up auto-persistence
   ```typescript
   this.selectCourse(course, isRequired);
   this.persistSelections(); // Redundant - already handled by listener
   ```
   **Recommendation**: Remove explicit persistence calls

2. **Inconsistent Method Naming**: Uses both `getSelectedCoursesWithSections()` and `getSelectedCourses()`
   **Recommendation**: Standardize method names

3. **Missing Validation**: No input validation for course objects or IDs
   **Recommendation**: Add parameter validation

4. **Tight Coupling**: Direct instantiation of dependencies instead of injection
   ```typescript
   this.courseManager = new CourseManager();
   this.storageManager = new StorageManager();
   ```
   **Recommendation**: Use dependency injection for better testability

#### 🔧 **Suggested Improvements:**
```typescript
// Add dependency injection
constructor(courseManager?: CourseManager, storageManager?: StorageManager) {
    this.courseManager = courseManager || new CourseManager();
    this.storageManager = storageManager || new StorageManager();
    // ...
}

// Add input validation
selectCourse(course: Course, isRequired: boolean = false): void {
    if (!course || !course.id) {
        throw new Error('Invalid course object provided');
    }
    this.courseManager.addCourse(course, isRequired);
    // Remove redundant persistSelections() call
}
```

---

### 3. DataRefreshService.ts

#### ✅ **Best Practices Followed:**
- **UI Service Pattern**: Handles both data logic and UI updates
- **Cooldown Mechanism**: Prevents API abuse with 15-minute throttling
- **Event-Driven**: Custom events for application-wide notifications
- **User Feedback**: Loading states and success/error messages
- **Graceful Degradation**: Fallback timestamp when server data unavailable

#### ⚠️ **Areas for Optimization:**
1. **Mixed Responsibilities**: Combines data fetching with UI manipulation
   ```typescript
   // Service handles DOM elements directly
   private timestampElement: HTMLElement | null = null;
   private refreshButton: HTMLButtonElement | null = null;
   ```
   **Recommendation**: Separate data service from UI controller

2. **Hardcoded DOM IDs**: Tightly coupled to specific HTML structure
   **Recommendation**: Pass element references or use event-driven approach

3. **Simulated Refresh**: Current implementation doesn't actually refresh data (line 109-114)
   **Recommendation**: Implement real data refresh mechanism

4. **No Error Recovery**: Failed requests don't retry or offer alternatives
   **Recommendation**: Add retry logic and fallback strategies

5. **Polling Timer**: Uses setInterval without cleanup (line 24-26)
   **Recommendation**: Implement proper cleanup on destruction

#### 🔧 **Suggested Improvements:**
```typescript
// Separate data and UI concerns
export class DataRefreshService {
    // Data-only methods
    async refreshData(): Promise<boolean> { ... }
    canRefresh(): boolean { ... }
    getLastRefreshTime(): number { ... }
}

export class RefreshUIController {
    constructor(private dataService: DataRefreshService) { ... }
    // UI-only methods
    updateButton(): void { ... }
    showFeedback(): void { ... }
}

// Add cleanup
private intervalId: number | null = null;

destroy(): void {
    if (this.intervalId) {
        clearInterval(this.intervalId);
    }
}
```

---

### 4. searchService.ts

#### ✅ **Best Practices Followed:**
- **Pure Functions**: Search methods don't modify input data
- **Relevance Scoring**: Sophisticated ranking algorithm (lines 134-159)
- **Filter Composition**: Multiple filter types can be combined
- **Performance Optimization**: Uses Set for professor/building collections
- **Type Safety**: Strong TypeScript typing throughout
- **Separation of Concerns**: Pure search logic without UI dependencies

#### ⚠️ **Areas for Optimization:**
1. **Linear Search Performance**: O(n) filtering for every search operation
   ```typescript
   return courses.filter(course => { ... }); // No indexing
   ```
   **Recommendation**: Implement search indexing (Lunr.js, Fuse.js)

2. **Repeated Data Processing**: Recalculates professor/building lists on every call
   ```typescript
   getAvailableProfessors(): string[] {
       // Loops through all courses every time
   }
   ```
   **Recommendation**: Cache computed results

3. **Complex Filter Logic**: Nested loops in time slot filtering (lines 76-87)
   **Recommendation**: Pre-compute time slot mappings

4. **Memory Duplication**: Stores courses in both departments and flat array
   **Recommendation**: Use references instead of duplicating data

5. **Missing Fuzzy Search**: Exact string matching only
   **Recommendation**: Add fuzzy matching for better user experience

#### 🔧 **Suggested Improvements:**
```typescript
// Add search indexing
private searchIndex: Map<string, Course[]> = new Map();
private professorCache: string[] | null = null;

private buildSearchIndex(): void {
    this.courses.forEach(course => {
        const keywords = this.extractKeywords(course);
        keywords.forEach(keyword => {
            if (!this.searchIndex.has(keyword)) {
                this.searchIndex.set(keyword, []);
            }
            this.searchIndex.get(keyword)!.push(course);
        });
    });
}

// Cache expensive computations
getAvailableProfessors(): string[] {
    if (this.professorCache) return this.professorCache;
    
    // Compute once and cache
    this.professorCache = this.computeProfessors();
    return this.professorCache;
}
```

---

## Services Layer Assessment

### 🎯 **Architecture Strengths:**
1. **Clear Service Boundaries**: Each service has distinct responsibilities
2. **Data Transformation**: Excellent JSON parsing and type conversion
3. **Error Resilience**: Comprehensive error handling across services
4. **Caching Strategy**: localStorage integration for performance
5. **Event-Driven Design**: Custom events for loose coupling

### 🚀 **Optimization Opportunities:**
1. **Performance**: Search indexing, caching, and reduced linear operations
2. **Separation of Concerns**: DataRefreshService mixes UI and data logic
3. **Dependency Injection**: Better testability through constructor injection
4. **Memory Management**: Reduce data duplication and add cleanup methods
5. **Error Recovery**: Retry mechanisms and fallback strategies

### 📊 **Code Quality Score: 7.5/10**
- **Maintainability**: Good - Clear service boundaries but some mixed concerns
- **Performance**: Moderate - Linear operations and uncached computations
- **Reliability**: High - Excellent error handling and graceful degradation
- **Testability**: Moderate - Tight coupling in some services
- **Scalability**: Good - Well-structured for feature expansion

---

## Types Directory Analysis (`src/types/`)

### Type Definition Principles
1. **Interface-First Design** - Prefer interfaces over classes for data structures
2. **Separation of Concerns** - Domain-specific type files for better organization
3. **Composition over Inheritance** - Build complex types from simple building blocks
4. **Immutable Data Modeling** - Types that encourage immutable operations
5. **Strict Typing** - No `any` types, comprehensive property definitions
6. **Enum Usage** - Strong typing for constants and limited value sets
7. **Generic Constraints** - Flexible yet type-safe generic implementations

### 1. types.ts (Core Domain Types)

#### ✅ **Best Practices Followed:**
- **Clear Domain Modeling**: Well-defined interfaces for Course, Department, Section, Period
- **Enum Usage**: `DayOfWeek` enum for type-safe day representation
- **Composition Design**: Course contains Department and Section[] - good relationship modeling
- **Required vs Optional**: Proper use of optional properties (`note?`, `professorEmail?`)
- **Set Usage**: `Set<DayOfWeek>` for efficient day collections in Period interface
- **Type Exports**: All types properly exported for module consumption

#### ⚠️ **Areas for Optimization:**
1. **Circular Reference Pattern**: Course → Department → Course[] creates potential circular dependency
   ```typescript
   Course { department: Department }
   Department { courses: Course[] }
   ```
   **Recommendation**: Consider using department ID reference instead

2. **Duplicated Properties**: `seats`, `seatsAvailable`, `actualWaitlist`, `maxWaitlist` appear in both Period and Section
   ```typescript
   // In both Section and Period interfaces
   seats: number;
   seatsAvailable: number;
   actualWaitlist: number;
   maxWaitlist: number;
   ```
   **Recommendation**: Extract to shared `EnrollmentInfo` interface

3. **Missing Validation Types**: No constraints on number ranges (credits, seats, etc.)
   **Recommendation**: Add branded types or validation interfaces

4. **String Type Overuse**: Many properties use `string` without constraints
   ```typescript
   type: string;  // Could be 'Lecture' | 'Lab' | 'Recitation'
   term: string;  // Could be specific format
   ```
   **Recommendation**: Use union types for known values

#### 🔧 **Suggested Improvements:**
```typescript
// Extract shared enrollment info
interface EnrollmentInfo {
    seats: number;
    seatsAvailable: number;
    actualWaitlist: number;
    maxWaitlist: number;
}

// Add branded types for validation
type CourseId = string & { readonly brand: unique symbol };
type CRN = number & { readonly brand: unique symbol };

// Use union types for known values
type InstructionalType = 'Lecture' | 'Lab' | 'Recitation' | 'Studio' | 'Seminar';
type Term = `${number}-${number}` | 'Summer' | 'Fall' | 'Spring';

// Avoid circular reference
interface Department {
    abbreviation: string;
    name: string;
    courseCount: number; // Instead of courses: Course[]
}
```

---

### 2. schedule.ts (Schedule-Specific Types)

#### ✅ **Best Practices Followed:**
- **Clear Separation**: Schedule domain separated from core course types  
- **Composition Pattern**: SelectedCourse extends Course with selection metadata
- **Preference Modeling**: Comprehensive SchedulePreferences interface
- **Conflict Tracking**: Detailed TimeConflict interface with description
- **State Management**: Well-structured UserScheduleState for persistence

#### ⚠️ **Areas for Optimization:**
1. **Inconsistent Time Representation**: Different time formats across interfaces
   ```typescript
   // In SchedulePreferences
   startTime: { hours: number; minutes: number };
   
   // In types.ts Time interface  
   interface Time {
       hours: number;
       minutes: number;
       displayTime: string;
   }
   ```
   **Recommendation**: Use consistent Time interface

2. **Limited Conflict Types**: Only one ConflictType enum value
   ```typescript
   export enum ConflictType {
       TIME_OVERLAP = 'time_overlap'  // Only one type defined
   }
   ```
   **Recommendation**: Add more conflict types (prerequisite, capacity, etc.)

3. **String Array Preferences**: Section preferences use string arrays instead of Sets
   ```typescript
   preferredSections: string[];  // Could be Set<string> for O(1) lookups
   deniedSections: string[];
   ```
   **Recommendation**: Use Set<string> for better performance

4. **Missing Validation**: No constraints on schedule preferences (max daily hours, etc.)
   **Recommendation**: Add validation interfaces or branded types

#### 🔧 **Suggested Improvements:**
```typescript
// Consistent time interface usage
import { Time } from './types';

interface SchedulePreferences {
    preferredTimeRange: {
        startTime: Time;
        endTime: Time;
    };
    // ... rest of interface
}

// Enhanced conflict types
export enum ConflictType {
    TIME_OVERLAP = 'time_overlap',
    PREREQUISITE_MISSING = 'prerequisite_missing',
    CAPACITY_EXCEEDED = 'capacity_exceeded',
    WAITLIST_FULL = 'waitlist_full'
}

// Use Sets for better performance
interface SelectedCourse {
    course: Course;
    selectedSection: string | null;
    preferredSections: Set<string>;
    deniedSections: Set<string>;
    isRequired: boolean;
}
```

---

### 3. ui.ts (UI-Specific Types)

#### ✅ **Best Practices Followed:**
- **UI Separation**: Clear separation of UI concerns from domain logic
- **Component Props**: Proper interface definition for component configuration
- **State Management**: Well-structured ViewState and DragDropState interfaces
- **Grid Modeling**: Detailed ScheduleGridCell interface for calendar display
- **Filter Composition**: Comprehensive SearchFilter interface

#### ⚠️ **Areas for Optimization:**
1. **Time Format Inconsistency**: Same issue as schedule.ts with time representation
   ```typescript
   interface TimeSlot {
       startTime: { hours: number; minutes: number };  // Inline type
       endTime: { hours: number; minutes: number };
   }
   ```
   **Recommendation**: Import and use Time interface

2. **Any Type Usage**: DragDropState uses `any` type
   ```typescript
   interface DragDropState {
       draggedItem: any;  // Should be typed
   }
   ```
   **Recommendation**: Create specific drag item type or use generics

3. **String Type Overuse**: Many properties could use union types
   ```typescript
   currentView: 'search' | 'schedule' | 'planner';  // Good example
   dropZone: string | null;  // Could be union type
   ```
   **Recommendation**: Define specific drop zone types

4. **Missing Generic Support**: Fixed interfaces without flexibility
   **Recommendation**: Add generic interfaces where appropriate

#### 🔧 **Suggested Improvements:**
```typescript
// Import consistent types
import { Time } from './types';

interface TimeSlot {
    startTime: Time;
    endTime: Time;
    days: string[];
}

// Type drag items properly
type DragItem = {
    type: 'course' | 'section';
    id: string;
    data: Course | Section;
};

interface DragDropState<T = DragItem> {
    isDragging: boolean;
    draggedItem: T | null;
    dropZone: 'schedule' | 'trash' | 'sidebar' | null;
}

// Add generic grid cell
interface ScheduleGridCell<TCourse = Course> {
    timeSlot: GridTimeSlot;
    day: string;
    course?: {
        id: string;
        name: string;
        section: string;
        color: string;
    };
    isConflict: boolean;
}
```

---

## Types Architecture Assessment

### 🎯 **Architecture Strengths:**
1. **Logical Organization**: Clear separation between domain, schedule, and UI types
2. **Interface-First Design**: Comprehensive interface definitions throughout
3. **Composition Patterns**: Good use of composition over inheritance
4. **Optional Properties**: Proper use of optional vs required properties
5. **Export Consistency**: All types properly exported for consumption

### 🚀 **Optimization Opportunities:**
1. **Type Consistency**: Standardize time representations across all interfaces
2. **Performance**: Replace string arrays with Sets where appropriate
3. **Type Safety**: Eliminate `any` types and add union types for strings
4. **Validation**: Add branded types and constraints for data validation
5. **Circular Dependencies**: Resolve circular reference patterns

### 📊 **Code Quality Score: 8.0/10**
- **Maintainability**: High - Well-organized and clearly structured
- **Type Safety**: Good - Comprehensive typing with some `any` usage
- **Consistency**: Moderate - Some inconsistent patterns across files
- **Extensibility**: High - Good interface design for future expansion
- **Performance**: Good - Efficient data structures with room for improvement

---

## UI Directory Analysis (`src/ui/` and `src/utils/`)

### UI Architecture Principles
1. **Component Encapsulation** - Self-contained UI components with clear boundaries
2. **Event-Driven Architecture** - DOM event handling with proper delegation
3. **Service Integration** - Clean integration between UI and business logic
4. **State Management** - Consistent UI state tracking and updates
5. **Accessibility** - Keyboard navigation and screen reader support
6. **Responsive Design** - Mobile-first and cross-device compatibility
7. **DOM Manipulation Safety** - Null checks and error handling for DOM operations

### 1. MainController.ts (Primary UI Controller)

#### ✅ **Best Practices Followed:**
- **Single Responsibility**: Central coordination of all UI interactions
- **Service Composition**: Proper integration of CourseDataService, ThemeSelector, DataRefreshService, CourseSelectionService
- **Event Delegation**: Efficient single event listener with delegation pattern (lines 164-207)
- **State Management**: Consistent tracking of `currentView`, `currentPage`, `selectedDepartment`, `selectedCourse`
- **Dynamic Content**: Proper innerHTML generation with template literals for performance
- **Header Height Syncing**: Advanced CSS custom properties and ResizeObserver integration
- **Error Handling**: Try-catch blocks for data loading with user-friendly error messages

#### ⚠️ **Areas for Optimization:**
1. **Large Class Size**: 739 lines - violates single responsibility at method level
   **Recommendation**: Extract specialized controllers (CourseDisplayController, NavigationController, etc.)

2. **Mixed Concerns**: UI manipulation mixed with business logic
   ```typescript
   // UI manipulation in business method
   private selectDepartment(deptId: string): void {
       const department = this.allDepartments.find(d => d.abbreviation === deptId);
       this.displayCourses(department.courses);  // UI update
       const contentHeader = document.querySelector('.content-header h2');
       if (contentHeader) contentHeader.textContent = `${department.name} Courses`;
   }
   ```
   **Recommendation**: Separate data operations from UI updates

3. **Direct DOM Manipulation**: Extensive use of `document.querySelector` throughout
   **Recommendation**: Implement DOM element caching or abstraction layer

4. **Hard-coded HTML Generation**: Large HTML string concatenation (lines 284-315)
   ```typescript
   html += `
       <div class="course-item ${isSelected ? 'selected' : ''}" data-course-id="${course.id}">
           // 20+ lines of HTML
       </div>
   `;
   ```
   **Recommendation**: Extract to template functions or use template literals

5. **Missing Cleanup**: No cleanup method for event listeners and observers
   **Recommendation**: Add destroy method for proper resource cleanup

#### 🔧 **Suggested Improvements:**
```typescript
// Extract specialized controllers
class CourseDisplayController {
    displayCoursesList(courses: Course[]): void { ... }
    displayCoursesGrid(courses: Course[]): void { ... }
}

class NavigationController {
    switchToPage(page: 'planner' | 'schedule'): void { ... }
    updateNavigationState(): void { ... }
}

// Add template abstraction
class CourseTemplates {
    static courseListItem(course: Course, isSelected: boolean): string { ... }
    static courseGridCard(course: Course, isSelected: boolean): string { ... }
}

// Add cleanup capability
class MainController {
    private resizeObserver?: ResizeObserver;
    
    destroy(): void {
        this.resizeObserver?.disconnect();
        // Clean up other resources
    }
}
```

---

### 2. ThemeSelector.ts (Theme Management Component)

#### ✅ **Best Practices Followed:**
- **Encapsulation**: Self-contained theme switching functionality
- **Singleton Pattern Integration**: Proper use of ThemeManager.getInstance()
- **Event Handling**: Clean dropdown toggle with outside-click detection
- **State Management**: Consistent `isOpen` state tracking
- **DOM Safety**: Null checks before DOM operations
- **Dynamic Rendering**: Template-based option generation
- **Storage Integration**: Automatic theme preference persistence

#### ⚠️ **Areas for Optimization:**
1. **Multiple DOM Queries**: Repeated element lookups without caching
   ```typescript
   // Elements looked up multiple times
   const scheduleButton = document.getElementById('schedule-btn');
   ```
   **Recommendation**: Cache DOM elements in constructor

2. **Direct Service Instantiation**: Tight coupling through `new StorageManager()`
   ```typescript
   constructor() {
       this.themeManager = ThemeManager.getInstance();
       this.storageManager = new StorageManager();  // Should be injected
   }
   ```
   **Recommendation**: Use dependency injection

3. **HTML String Generation**: Template literals for option rendering
   **Recommendation**: Consider using DocumentFragment for better performance

4. **Missing Keyboard Support**: No keyboard navigation for dropdown
   **Recommendation**: Add arrow key navigation and Enter/Escape handling

5. **No Error Handling**: Theme loading failures not handled gracefully
   **Recommendation**: Add fallback theme handling

#### 🔧 **Suggested Improvements:**
```typescript
class ThemeSelector {
    constructor(
        private themeManager = ThemeManager.getInstance(),
        private storageManager = new StorageManager()
    ) { ... }
    
    // Add keyboard support
    private setupKeyboardNavigation(): void {
        this.dropdownElement?.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowDown': this.navigateOptions(1); break;
                case 'ArrowUp': this.navigateOptions(-1); break;
                case 'Enter': this.selectCurrentOption(); break;
                case 'Escape': this.closeDropdown(); break;
            }
        });
    }
    
    // Use DocumentFragment for performance
    private renderThemeOptions(): void {
        const fragment = document.createDocumentFragment();
        availableThemes.forEach(theme => {
            const option = this.createThemeOption(theme);
            fragment.appendChild(option);
        });
        this.optionsElement?.replaceChildren(fragment);
    }
}
```

---

### 3. dateUtils.ts (Date/Time Utilities)

#### ✅ **Best Practices Followed:**
- **Static Utility Class**: Pure functions without state
- **Academic Calendar Logic**: WPI-specific semester calculations
- **Time Parsing**: Robust 12/24 hour time conversion
- **Input Validation**: Null checks and regex validation
- **Type Safety**: Strong return type definitions

#### ⚠️ **Areas for Optimization:**
1. **Hard-coded Date Logic**: Academic year logic may not handle edge cases
   ```typescript
   // May not handle all academic calendar variations
   return currentMonth >= 7 ? currentYear : currentYear - 1;
   ```
   **Recommendation**: Make configurable or use external calendar data

2. **Missing Timezone Support**: No timezone handling for different locales
   **Recommendation**: Add timezone awareness

3. **Limited Error Handling**: parseTime returns null but doesn't log errors
   **Recommendation**: Add error logging or throw descriptive errors

4. **Performance**: Creates new Date objects repeatedly
   **Recommendation**: Cache common date calculations

#### 🔧 **Suggested Improvements:**
```typescript
class DateUtils {
    private static academicYearConfig = {
        startMonth: 7,  // August (0-indexed)
        fallStart: { month: 8, day: 1 },
        springStart: { month: 0, day: 1 },
        // ... configurable calendar
    };
    
    // Add timezone support
    static formatTimeWithTimezone(hours: number, minutes: number, timezone = 'America/New_York'): string {
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date.toLocaleTimeString('en-US', { 
            timeZone: timezone,
            hour12: true 
        });
    }
}
```

---

### 4. validators.ts (Data Validation Utilities)

#### ✅ **Best Practices Followed:**
- **Type Guards**: Comprehensive use of TypeScript type predicates
- **Validation Composition**: Complex validators built from simple ones
- **Sanitization**: HTML stripping and input cleaning
- **Regex Validation**: Pattern matching for IDs and formats
- **Error Handling**: Try-catch blocks in sanitization methods

#### ⚠️ **Areas for Optimization:**
1. **Recursive Validation**: Deep object validation without cycle detection
   ```typescript
   // Could cause infinite loops with circular references
   course.sections.every((s: any) => this.isValidSection(s))
   ```
   **Recommendation**: Add cycle detection or limit recursion depth

2. **Performance**: Validates entire objects even for small changes
   **Recommendation**: Add incremental validation

3. **Limited Regex Patterns**: Course ID pattern may not cover all departments
   ```typescript
   // May not handle all WPI department codes
   return /^[A-Z]{2,4}-\d{4}$/.test(courseId);
   ```
   **Recommendation**: Make patterns configurable

4. **No Validation Context**: Errors provide no context about what failed
   **Recommendation**: Return validation result objects with details

#### 🔧 **Suggested Improvements:**
```typescript
interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

class Validators {
    private static visitedObjects = new WeakSet();
    
    static validateCourse(course: any, context = new Set()): ValidationResult {
        if (context.has(course)) {
            return { isValid: false, errors: ['Circular reference detected'], warnings: [] };
        }
        context.add(course);
        
        const result = { isValid: true, errors: [], warnings: [] };
        
        if (!course.id || !this.validateCourseId(course.id)) {
            result.errors.push(`Invalid course ID: ${course.id}`);
            result.isValid = false;
        }
        
        return result;
    }
}
```

---

## UI Architecture Assessment

### 🎯 **Architecture Strengths:**
1. **Service Integration**: Clean separation between UI controllers and business services
2. **Event-Driven Design**: Proper DOM event delegation and custom event handling
3. **State Management**: Consistent state tracking across components
4. **Utility Organization**: Well-structured utility classes for common operations
5. **Type Safety**: Comprehensive TypeScript validation and type guards

### 🚀 **Optimization Opportunities:**
1. **Component Extraction**: MainController is too large and needs decomposition
2. **Dependency Injection**: Replace direct instantiation with injection patterns
3. **Template Abstraction**: Move HTML generation to dedicated template functions
4. **Performance**: Add DOM element caching and reduce repeated queries
5. **Accessibility**: Add keyboard navigation and ARIA attributes

### 📊 **Code Quality Score: 7.0/10**
- **Maintainability**: Moderate - Large controller class but good utility organization
- **Performance**: Good - Efficient event delegation but room for DOM optimization
- **Accessibility**: Low - Missing keyboard navigation and ARIA support
- **Testability**: Moderate - Tight coupling in some areas
- **Scalability**: Good - Clear patterns for expansion

---

## Overall Architecture Integration Summary

### Cross-Layer Architecture Assessment

#### 🎯 **System-Wide Strengths:**
1. **Layered Architecture**: Clear separation between core, services, UI, and utilities
2. **Type Safety**: Comprehensive TypeScript usage throughout all layers
3. **Service Composition**: Good dependency relationships and loose coupling
4. **Event-Driven Design**: Consistent event patterns across UI and service layers
5. **Error Resilience**: Comprehensive error handling with graceful degradation

#### 🚀 **System-Wide Improvement Opportunities:**
1. **Dependency Injection**: Implement DI container for better testability
2. **Component Architecture**: Extract UI components for better maintainability  
3. **Performance Optimization**: Add caching, indexing, and reduce linear operations
4. **Accessibility Enhancement**: Comprehensive ARIA support and keyboard navigation
5. **Testing Infrastructure**: Add comprehensive test coverage for all layers

#### 📊 **Overall System Quality Score: 7.7/10**
- **Architecture Design**: High - Well-structured layers with clear responsibilities
- **Code Quality**: Good - Consistent patterns with optimization opportunities  
- **Performance**: Moderate - Good algorithms but room for caching and optimization
- **Maintainability**: Good - Clear organization but some large classes need extraction
- **Scalability**: High - Architecture supports growth and feature expansion

---

## Styles Directory Analysis (`src/styles/` and `src/themes/`)

### CSS Architecture Principles
1. **Component-Based Organization** - Modular CSS files for specific UI components
2. **CSS Custom Properties** - Centralized theming with CSS variables
3. **Mobile-First Responsive Design** - Progressive enhancement for larger screens
4. **Semantic Class Naming** - Clear, descriptive class names following BEM-like patterns
5. **Design System Consistency** - Unified spacing, colors, and typography scales
6. **Performance Optimization** - Efficient CSS with minimal redundancy
7. **Accessibility Support** - Focus states, contrast, and screen reader considerations

### 1. CSS Architecture Structure

#### ✅ **Best Practices Followed:**
- **Modular Organization**: Clear separation by component (buttons.css, course-list.css, header.css)
- **Import Order**: Logical CSS import sequence (reset → theme → layout → components → responsive)
- **CSS Custom Properties**: Comprehensive variable system for theming and consistency
- **Component Encapsulation**: Each component has its own CSS file with clear boundaries
- **Responsive Design**: Mobile-first approach with logical breakpoints
- **Theme System Integration**: Proper CSS variable usage throughout all components

#### ⚠️ **Areas for Optimization:**
1. **CSS Variable Duplication**: Some color values repeated across components
   ```css
   /* In multiple files */
   color: var(--color-text-secondary);
   background: var(--color-surface);
   ```
   **Issue**: While using variables is good, some complex combinations could be abstracted

2. **Selector Specificity**: Some overly specific selectors
   ```css
   .theme-high-contrast .course-item:hover,
   .theme-high-contrast .btn:hover,
   .theme-high-contrast .section-badge:hover {
       border-width: 3px;
   }
   ```
   **Recommendation**: Use CSS utility classes or data attributes

3. **Responsive Breakpoint Inconsistency**: Different breakpoints across files
   ```css
   /* course-list.css */
   @media (max-width: 768px) { ... }
   @media (min-width: 1200px) { ... }
   
   /* responsive.css */  
   @media (max-width: 1024px) { ... }
   @media (max-width: 768px) { ... }
   ```
   **Recommendation**: Centralize breakpoint constants

4. **Grid System Duplication**: Similar grid patterns in multiple components
   **Recommendation**: Extract reusable grid utilities

#### 🔧 **Suggested Improvements:**
```css
/* Add breakpoint constants */
:root {
  --breakpoint-mobile: 768px;
  --breakpoint-tablet: 1024px;
  --breakpoint-desktop: 1200px;
}

/* Extract common grid patterns */
.grid-auto-fit-320 {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--spacing-base-unit);
}

/* Utility classes for common patterns */
.border-interactive {
  border: 1px solid var(--color-border);
  transition: var(--effect-transition);
}

.border-interactive:hover {
  border-color: var(--color-primary);
}
```

---

### 2. Component-Specific Analysis

#### **buttons.css** - Button Component Styles
**✅ Strengths:**
- Clear button state variations (primary, secondary, active)
- Consistent hover/focus states
- Proper use of CSS variables

**⚠️ Issues:**
- Limited button sizes (only one size defined)
- No disabled state styling for all button types

#### **course-list.css** - Course Display Components  
**✅ Strengths:**
- Comprehensive list and grid view implementations
- Responsive grid with auto-fit columns
- Consistent hover states and selection feedback
- Well-organized section badge styles

**⚠️ Issues:**
- Large file (225 lines) could be split into list/grid components
- Some duplicate hover state definitions
- Hard-coded magic numbers in grid sizing

#### **theme-selector.css** - Dropdown Theme Selector
**✅ Strengths:**
- Clean dropdown implementation with proper z-index
- Smooth arrow rotation animation
- Good keyboard accessibility support prep
- Proper positioning and overflow handling

**⚠️ Issues:**
- No keyboard navigation styles implemented
- Could use more semantic focus indicators

#### **schedule-page.css** - Schedule Interface Layout
**✅ Strengths:**
- Clean grid-based layout for terms
- Proper overflow handling for scrollable areas
- Consistent spacing and alignment
- Good empty state styling

**⚠️ Issues:**
- Hard-coded grid dimensions (2x2) not configurable
- Limited responsiveness for smaller screens
- No drag-and-drop styling preparation

#### **responsive.css** - Mobile/Tablet Adaptations
**✅ Strengths:**
- Mobile-first approach
- Logical collapse of sidebar/panels on mobile
- Proper flex direction changes

**⚠️ Issues:**
- Limited breakpoints (only 768px and 1024px)
- No intermediate tablet-portrait handling
- Could be more granular for different screen sizes

---

### 3. Theme System Analysis

#### **base.css** - CSS Custom Properties Foundation
**✅ Strengths:**
- Comprehensive color palette with semantic naming
- Typography system with fallback fonts
- Spacing scale with consistent base unit
- Effect variables for transitions and shadows
- Proper CSS custom property organization

**⚠️ Issues:**
- Some color values could have better semantic names
- Missing dark mode color scheme definitions
- No typography scale variations (font sizes)

#### **theme-overrides.css** - Theme-Specific Customizations
**✅ Strengths:**
- Clean theme-specific override system
- High contrast accessibility enhancements
- Proper cascade without !important usage

**⚠️ Issues:**
- Limited theme variations implemented
- Could benefit from more theme-specific customizations
- Missing theme transition animations

---

### 4. CSS Performance & Best Practices

#### ✅ **Performance Strengths:**
- **Efficient Selectors**: Mostly class-based selectors with good specificity
- **CSS Variables**: Centralized theming reduces redundancy
- **Minimal Nesting**: Flat selector hierarchy for better performance
- **Import Organization**: Logical CSS load order for cascade efficiency

#### ⚠️ **Performance Issues:**
1. **Universal Selector Usage**: `* { transition: var(--effect-transition); }` affects all elements
   **Impact**: Could cause performance issues with large DOM trees
   **Recommendation**: Apply transitions selectively

2. **Shadow DOM Considerations**: No component isolation patterns
   **Recommendation**: Consider CSS-in-JS or CSS modules for larger applications

3. **Critical CSS**: No separation of above-fold vs below-fold styles
   **Recommendation**: Extract critical CSS for faster initial render

---

## CSS Architecture Assessment

### 🎯 **Architecture Strengths:**
1. **Modular Organization**: Excellent component-based file structure
2. **Theme System**: Robust CSS custom property implementation
3. **Responsive Design**: Mobile-first approach with logical breakpoints
4. **Semantic Naming**: Clear, descriptive class naming conventions
5. **Maintainable Structure**: Easy to understand and modify component styles

### 🚀 **Optimization Opportunities:**
1. **Utility Classes**: Add common utility classes for spacing, colors, and layouts
2. **Breakpoint Standardization**: Centralize responsive breakpoints
3. **Performance**: Optimize universal selector usage and critical CSS
4. **Theme Expansion**: Add more comprehensive theme variations
5. **Component Splitting**: Break down large CSS files into smaller, focused modules

### 📊 **CSS Quality Score: 8.5/10**
- **Organization**: High - Excellent modular structure and clear separation
- **Maintainability**: High - Easy to understand and modify
- **Performance**: Good - Efficient selectors with minor optimization opportunities
- **Accessibility**: Good - Basic focus states with room for enhancement
- **Scalability**: High - Architecture supports growth and new themes

### **Final Architecture Assessment**

The CSS architecture demonstrates **excellent organizational patterns** with a well-structured component-based approach, comprehensive theming system, and mobile-first responsive design. The use of CSS custom properties provides a solid foundation for maintainable and scalable styling.

**Key Architectural Achievements:**
- ✅ **Modular Component Structure**: Clear separation of concerns
- ✅ **Comprehensive Theme System**: Flexible CSS custom properties
- ✅ **Responsive Design**: Mobile-first with logical breakpoints  
- ✅ **Performance Optimization**: Efficient selectors and minimal redundancy
- ✅ **Maintainable Codebase**: Easy to understand and extend

The styles architecture successfully supports the application's functionality while maintaining clean, maintainable, and performant CSS code that follows modern best practices.
