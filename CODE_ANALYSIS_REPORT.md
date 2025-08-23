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

## Next Steps
1. Examine `ui/controllers/` for proper service integration  
2. Analyze `utils/` for shared functionality patterns
3. Review overall architecture integration patterns
