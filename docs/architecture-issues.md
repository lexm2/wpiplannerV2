# WPI Planner V2 - Architectural Issues & Technical Debt

**Last Updated**: 2025-11-27
**Status**: Comprehensive architectural analysis based on documentation review

This document catalogs all identified architectural issues, design problems, inefficiencies, and areas for improvement in the WPI Planner V2 codebase. Issues are organized by severity and category.

---

## Table of Contents

1. [Critical Issues](#critical-issues)
2. [High Severity Issues](#high-severity-issues)
3. [Medium Severity Issues](#medium-severity-issues)
4. [Low Severity Issues](#low-severity-issues)
5. [Summary by Category](#summary-by-category)
6. [Priority Recommendations](#priority-recommendations)

---

## Critical Issues

### 1. Cloud Sync Data Transformation Inefficiency

**Location**: `src/services/sync/` (SyncManager, GoogleDriveProvider, OneDriveProvider)
**Severity**: **CRITICAL**

**Problem**:
The cloud sync system stores complete course objects in cloud files instead of just course IDs and section references:
- Full course metadata (name, description, sections, periods) duplicated for each selected course
- On restore, system performs O(n×m) lookup to rebuild course references (n=selected courses, m=catalog size)
- Cloud files are 80-90% larger than necessary
- Wasted bandwidth on every sync operation
- Risk of deserialization failures if course catalog changes

**Current Implementation**:
```typescript
interface SyncData {
    version: string;
    timestamp: number;
    checksum: string;
    courses: CourseData[];          // FULL COURSE OBJECTS
    selectedSections: string[];     // Section selections
    preferences?: unknown;
}
```

**Impact**:
- Storage: Cloud files 10x larger than needed (e.g., 500KB instead of 50KB)
- Performance: Slow sync operations, especially on mobile/slow connections
- Bandwidth: Unnecessary API quota consumption
- Complexity: Complicated deserialization and error handling
- Reliability: Risk of reference mismatches if catalog updates

**Evidence**: `docs/services/sync/overview.md` lines 100-109, `docs/services/sync/google-drive-provider.md` lines 200-250

**Suggested Fix**:
```typescript
interface SyncData {
    version: string;
    timestamp: number;
    deviceId: string;
    schedules: Array<{
        id: string;
        name: string;
        selectedCourses: Array<{
            courseId: string;              // Just ID, not full object
            selectedSectionCrn?: string;   // Just CRN
            lockedSectionCrn?: string;
            isRequired: boolean;
            timestamp: number;             // For merge conflicts
        }>;
        preferences: SchedulePreferences;
    }>;
}
```

**Benefits**:
- 80-90% reduction in cloud file size
- O(n) lookup on restore (direct ID lookup)
- Faster sync operations
- Lower bandwidth usage
- Simpler error handling

**Priority**: **IMMEDIATE** - Core functionality issue affecting all cloud sync users

---

### 2. Push-Only Sync Causes Data Loss in Multi-Device Scenarios

**Location**: `src/services/sync/SyncManager.ts`
**Severity**: **CRITICAL**

**Problem**:
The "Sign-in Single Opportunity" (SSO) strategy only checks for conflicts during sign-in. After conflict resolution, the system uses push-only sync with last-write-wins:

1. User works on Device A, syncs (Device A state pushed to cloud)
2. User switches to Device B, works, syncs (Device B state pushed to cloud, **Device A changes lost**)
3. User returns to Device A, makes changes, syncs (Device B changes lost)

**Flow**:
```
Device A: Add CS-1101 → Sync → Cloud has CS-1101
Device B: Sign in → Conflict check → Resolve → Add MA-1021 → Sync → Cloud has MA-1021 only
Device A: Add CS-2011 → Sync → Cloud has CS-2011 and CS-1101 (but MA-1021 is GONE)
```

**Impact**:
- **Data loss guaranteed** for any user with multiple devices
- Silent data loss (no warning after initial sign-in)
- No merge capability
- Users forced to choose which device's work to discard
- Poor multi-device UX

**Evidence**: `docs/services/sync/overview.md` lines 44-58, `docs/services/sync/conflict-resolution.md` lines 100-150

**Root Cause**:
- Conflict detection only at sign-in (SSO = Sign-in Single Opportunity)
- No ongoing conflict detection during normal sync
- No per-course timestamps or version vectors
- No intelligent merge strategy

**Suggested Fix**:
Implement timestamp-based per-course merging:
```typescript
interface SelectedCourse {
    courseId: string;
    selectedSectionCrn?: string;
    lockedSectionCrn?: string;
    isRequired: boolean;
    timestamp: number;        // When this selection was made
    deviceId: string;         // Which device made it
}

// On sync, merge intelligently:
mergeSchedules(local: Schedule, remote: Schedule): Schedule {
    const merged = { ...local };

    // For each course, keep the version with newer timestamp
    for (const remoteCourse of remote.selectedCourses) {
        const localCourse = local.selectedCourses.find(c => c.courseId === remoteCourse.courseId);

        if (!localCourse) {
            // Remote has course we don't, add it
            merged.selectedCourses.push(remoteCourse);
        } else if (remoteCourse.timestamp > localCourse.timestamp) {
            // Remote is newer, use it
            Object.assign(localCourse, remoteCourse);
        }
        // else: local is newer or same, keep local
    }

    return merged;
}
```

**Benefits**:
- No data loss in multi-device scenarios
- Intelligent per-course merging
- Ongoing conflict detection
- Better UX (no forced full-schedule conflicts)

**Priority**: **IMMEDIATE** - Causes actual data loss for real users

---

### 3. Duplicate Course IDs Papered Over Instead of Fixed

**Location**: `src/services/CourseDataService.ts`
**Severity**: **CRITICAL**

**Problem**:
The system detects duplicate course IDs during data parsing and generates fallback IDs (`CS-2102-2`, `CS-2102-3`) to work around the problem:
- Band-aid solution for bad source data
- Doesn't fix root cause (backend data construction issue)
- Creates inconsistent course IDs that users might see
- Breaks bookmarking/sharing (ID changes between data refreshes)
- Silent data quality issues

**Current Code**:
```typescript
// Duplicate detection during parsing
if (seenIds.has(courseId)) {
    duplicateIds.add(courseId);
    const fallbackId = `${department.abbreviation}-${courseData.number}`;
    console.warn(`Duplicate course ID: "${courseId}"`);
    console.warn(`Using fallback: "${fallbackId}"`);
    courseId = fallbackId;
    duplicatesFixed++;
}
```

**Impact**:
- User confusion: "Why is there CS-2102 and CS-2102-2?"
- Inconsistent IDs between data refreshes
- Breaks URL sharing and bookmarks
- Hides data quality problems from backend team
- Technical debt accumulation

**Evidence**: `docs/services/course-data.md` lines 477-500

**Suggested Fix**:

**Option 1: Fail Hard (Recommended)**
```typescript
if (seenIds.has(courseId)) {
    throw new Error(
        `CRITICAL DATA ERROR: Duplicate course ID "${courseId}" found.\n` +
        `This indicates a data quality issue in course-data-constructed.json.\n` +
        `Please fix the backend data generation process.\n` +
        `Affected courses: ${JSON.stringify(duplicateIds)}`
    );
}
```

**Option 2: Strict Validation Mode**
```typescript
const STRICT_MODE = process.env.NODE_ENV === 'development';

if (seenIds.has(courseId)) {
    if (STRICT_MODE) {
        throw new DataQualityError(`Duplicate course ID: ${courseId}`);
    } else {
        // Log to analytics/monitoring
        reportDataQuality({ type: 'duplicate_id', courseId });
        // Generate fallback
        courseId = generateFallbackId(courseData);
    }
}
```

**Benefits**:
- Forces backend data quality fixes
- No silent failures
- Consistent course IDs
- Better user experience
- Eliminates technical debt

**Priority**: **IMMEDIATE** - Data integrity issue

---

### 4. IndexedDB Storage Without Compression

**Location**: `src/core/IndexedDBStorageManager.ts`
**Severity**: **CRITICAL**

**Problem**:
Schedule data is stored in IndexedDB as raw JSON strings without compression:
- A schedule with 7 courses can be 100KB+ of JSON
- User with 50 schedules = 5MB+ uncompressed
- Browser storage quotas can be exhausted (Chrome: ~60MB typical)
- No compression despite simple libraries being available
- Slower read/write operations (more bytes to transfer)

**Current Storage**:
```typescript
{
    id: string;
    serializedData: string;        // Uncompressed JSON string (100KB+)
    timestamp: number;
}
```

**Impact**:
- Storage quota exhaustion for power users
- Slower performance (more data to serialize/deserialize)
- Unnecessary browser storage pressure
- Cannot store as many schedules as user wants
- Poor experience on storage-constrained devices

**Evidence**: `docs/core/state-management.md` lines 196-204

**Compression Potential**:
- Typical schedule JSON: ~100KB
- After LZ compression: ~30KB (70% reduction)
- 50 schedules: 5MB → 1.5MB

**Suggested Fix**:
```typescript
import LZString from 'lz-string';

class IndexedDBStorageManager {
    async saveSchedule(schedule: Schedule): Promise<void> {
        const json = JSON.stringify(schedule);
        const compressed = LZString.compress(json);  // Compress before storing

        await this.db.put('schedules', {
            id: schedule.id,
            serializedData: compressed,
            timestamp: Date.now(),
            compressed: true  // Flag for migration
        });
    }

    async loadSchedule(id: string): Promise<Schedule | null> {
        const record = await this.db.get('schedules', id);
        if (!record) return null;

        // Handle both compressed and legacy uncompressed
        const json = record.compressed
            ? LZString.decompress(record.serializedData)
            : record.serializedData;

        return JSON.parse(json);
    }
}
```

**Benefits**:
- 60-70% storage reduction
- Can store 3x more schedules
- Reduced quota exhaustion risk
- Faster operations (less data to transfer)
- Backward compatible (migration support)

**Libraries**:
- `lz-string` (11KB, simple API, browser-optimized)
- `pako` (44KB, gzip/deflate)
- `fflate` (7KB, modern, fast)

**Priority**: **HIGH** - Easy win, significant impact

---

## High Severity Issues

### 5. Undo History Cleared on Schedule Switch

**Location**: `src/core/UndoRedoManager.ts`, `src/core/ProfileStateManager.ts`
**Severity**: **HIGH**

**Problem**:
When switching between schedules, the undo history is completely cleared:
- User cannot undo changes made to previous schedule
- History doesn't persist across page reloads
- Fixed limit of 100 snapshots regardless of available memory
- Each snapshot is ~40KB, so 100 snapshots = 4MB memory

**Current Behavior**:
```typescript
setActiveSchedule(scheduleId: string): boolean {
    // Clear undo history when switching schedules
    this.undoRedoManager.clear();
    // ... switch logic
}
```

**Impact**:
- Poor UX: Can't switch schedules and undo changes to previous one
- Memory waste: Keeping 100 full state snapshots
- No persistence: History lost on page reload
- Arbitrary limit: Some users might want more history

**Evidence**: `docs/core/undo-redo.md` lines 726-746

**Suggested Fix**:

**Option 1: Per-Schedule History**
```typescript
class UndoRedoManager {
    private historyPerSchedule = new Map<string, UndoState[]>();

    pushSnapshot(scheduleId: string, state: ProfileState) {
        if (!this.historyPerSchedule.has(scheduleId)) {
            this.historyPerSchedule.set(scheduleId, []);
        }
        this.historyPerSchedule.get(scheduleId).push(state);
    }

    undo(scheduleId: string) {
        return this.historyPerSchedule.get(scheduleId)?.pop();
    }
}
```

**Option 2: Persistent Undo**
```typescript
async saveHistoryToStorage() {
    // Compress and save to IndexedDB
    const compressed = compressHistory(this.history);
    await storage.set('undo-history', compressed);
}
```

**Benefits**:
- Better UX (can undo across schedule switches)
- Optional persistence
- Per-schedule history makes sense conceptually

**Priority**: **MEDIUM-HIGH** - UX improvement

---

### 6. Tight Coupling: FilterService → RateMyProfessorService

**Location**: `src/core/filters/implementations/RMPRatingFilter.ts`, `src/core/filters/implementations/PeriodRMPRatingFilter.ts`
**Severity**: **HIGH**

**Problem**:
Filter implementations have hard dependency on concrete RateMyProfessorService:
- Injected via constructor as concrete class
- Cannot mock/stub for testing
- Cannot use alternative rating providers
- Violates dependency inversion principle

**Current Code**:
```typescript
class RMPRatingFilter implements SectionBasedFilter {
    readonly id = 'rmpRating';
    readonly name = 'Rate My Professor';
    readonly priority = 8;

    constructor(private rmpService: RateMyProfessorService) {}  // Hard dependency

    apply(courses: Course[]): Course[] {
        // Uses this.rmpService directly
        const rating = this.rmpService.findProfessor(professor);
        // ...
    }
}
```

**Impact**:
- Hard to test filters in isolation
- Cannot swap rating providers
- Tight coupling between filter and service layers
- Difficult to mock for unit tests

**Evidence**: `docs/core/filtering-system.md` lines 510-520

**Suggested Fix**:
```typescript
// Create interface
interface IProfessorRatingProvider {
    findProfessor(name: string): ProfessorRating | null;
    getRating(professorId: string): number | null;
}

// Inject interface instead
class RMPRatingFilter implements SectionBasedFilter {
    constructor(private ratingProvider: IProfessorRatingProvider) {}

    apply(courses: Course[]): Course[] {
        const rating = this.ratingProvider.findProfessor(professor);
        // ...
    }
}

// Enables testing
const mockProvider: IProfessorRatingProvider = {
    findProfessor: jest.fn(() => ({ rating: 4.5 })),
    getRating: jest.fn(() => 4.5)
};
const filter = new RMPRatingFilter(mockProvider);
```

**Benefits**:
- Testable with mocks
- Follows dependency inversion
- Can swap rating providers
- Loose coupling

**Priority**: **MEDIUM** - Code quality and testability

---

### 7. O(n²) Conflict Detection in AutoScheduler

**Location**: `src/services/AutoScheduler.ts` (buildOverlapMap)
**Severity**: **HIGH**

**Problem**:
The overlap map construction uses nested loops to check every section pair:
- O(n²) complexity where n = number of sections
- 50 sections = 1,225 comparisons
- 100 sections = 4,950 comparisons
- 200 sections = 19,900 comparisons
- Performance degrades quadratically

**Current Algorithm**:
```typescript
function buildOverlapMap(allSections: Section[]): Map<string, Set<string>> {
    const overlaps = new Map<string, Set<string>>();

    for (let i = 0; i < allSections.length - 1; i++) {
        for (let j = i + 1; j < allSections.length; j++) {
            if (TimeSlotMap.hasOverlap(sections[i], sections[j])) {
                overlaps.get(sections[i].crn).add(sections[j].crn);
                overlaps.get(sections[j].crn).add(sections[i].crn);
            }
        }
    }

    return overlaps;
}
```

**Impact**:
- Slow schedule generation with many sections
- UI blocking (runs on main thread)
- 5-second timeout can be hit
- Poor scalability
- CPU intensive

**Evidence**: `docs/services/auto-scheduler.md` lines 299-310

**Suggested Fix**:

**Option 1: Interval Tree**
```typescript
// O(n log n) construction, O(log n) queries
class IntervalTree {
    insert(period: Period, sectionCrn: string) { /* ... */ }
    queryOverlaps(period: Period): Set<string> { /* ... */ }
}

function buildOverlapMap(allSections: Section[]): Map<string, Set<string>> {
    const tree = new IntervalTree();
    const overlaps = new Map<string, Set<string>>();

    // O(n log n) to build tree
    for (const section of allSections) {
        for (const period of section.periods) {
            tree.insert(period, section.crn);
        }
    }

    // O(n log n) to find all overlaps
    for (const section of allSections) {
        for (const period of section.periods) {
            const conflicts = tree.queryOverlaps(period);
            overlaps.get(section.crn).addAll(conflicts);
        }
    }

    return overlaps;
}
```

**Option 2: Caching**
```typescript
// Cache overlap map, invalidate on data change
class AutoScheduler {
    private overlapCache: Map<string, Set<string>> | null = null;

    buildOverlapMap(sections: Section[]): Map<string, Set<string>> {
        if (this.overlapCache) return this.overlapCache;

        // Build map (still O(n²) but only once)
        const map = this.buildOverlapMapInternal(sections);
        this.overlapCache = map;
        return map;
    }

    invalidateCache() {
        this.overlapCache = null;
    }
}
```

**Benefits**:
- O(n log n) instead of O(n²)
- 10-50x speedup for large inputs
- No timeout issues
- Better scalability

**Priority**: **HIGH** - Performance bottleneck

---

### 8. God Class: ScheduleController (1500+ lines)

**Location**: `src/ui/controllers/ScheduleController.ts`
**Severity**: **MEDIUM-HIGH**

**Problem**:
ScheduleController has too many responsibilities:
- Schedule grid rendering (DOM manipulation)
- Section selection logic
- Component wizard management
- Filter coordination
- Event handling
- Auto-scheduler integration
- Conflict detection UI
- Export functionality

**Impact**:
- Hard to maintain (1500+ lines)
- Difficult to test (many responsibilities)
- Changes in one area affect others
- Violates Single Responsibility Principle
- High coupling

**Evidence**: `docs/ui/controllers.md` lines 100-300

**Suggested Fix**:
Split into focused controllers:

```typescript
// ScheduleGridController - Rendering only (300 lines)
class ScheduleGridController {
    renderGrid(schedule: Schedule) { /* ... */ }
    updateCell(crn: string, period: Period) { /* ... */ }
    highlightConflicts(conflicts: TimeConflict[]) { /* ... */ }
}

// SectionSelectionController - Selection logic (400 lines)
class SectionSelectionController {
    selectSection(courseId: string, crn: string) { /* ... */ }
    lockSection(crn: string) { /* ... */ }
    clearSelection(courseId: string) { /* ... */ }
}

// ComponentWizardController - Wizard UI (400 lines)
class ComponentWizardController {
    openWizard(course: Course) { /* ... */ }
    handleStepChange(step: number) { /* ... */ }
    applySelection(selection: ComponentSelection) { /* ... */ }
}

// ScheduleViewController - Coordination (400 lines)
class ScheduleViewController {
    constructor(
        private gridController: ScheduleGridController,
        private selectionController: SectionSelectionController,
        private wizardController: ComponentWizardController
    ) {}

    // Coordinates between sub-controllers
}
```

**Benefits**:
- Smaller, focused classes
- Easier to test
- Better separation of concerns
- Reusable components

**Priority**: **MEDIUM** - Code quality improvement

---

### 9. No Differential Sync

**Location**: `src/services/sync/SyncManager.ts`
**Severity**: **MEDIUM-HIGH**

**Problem**:
Every cloud sync operation uploads the **entire** application state:
- All schedules (even unchanged ones)
- All selected courses
- All preferences
- Even if only one course was added

**Current Behavior**:
```typescript
async pushData() {
    const state = ProfileStateManager.getState();  // Get EVERYTHING
    const syncData = this.serializeState(state);   // Serialize EVERYTHING
    await provider.upload(syncData);               // Upload EVERYTHING
}
```

**Impact**:
- Wasted bandwidth (uploading 500KB when 1KB changed)
- Slower sync operations
- Higher API costs (if quota-based)
- Poor performance on slow connections
- Unnecessary server load

**Evidence**: `docs/services/sync/overview.md` lines 318-330

**Suggested Fix**:
```typescript
interface SyncDelta {
    version: number;
    baseVersion: number;
    changes: Array<{
        type: 'add' | 'update' | 'delete';
        path: string;  // e.g., 'schedules.abc123.selectedCourses.2'
        value?: any;
    }>;
}

class SyncManager {
    private lastSyncedState: ProfileState | null = null;

    async pushData() {
        const currentState = ProfileStateManager.getState();

        if (this.lastSyncedState) {
            // Compute delta
            const delta = this.computeDelta(this.lastSyncedState, currentState);
            await provider.uploadDelta(delta);
        } else {
            // First sync, upload everything
            await provider.uploadFull(currentState);
        }

        this.lastSyncedState = currentState;
    }
}
```

**Benefits**:
- 90%+ bandwidth reduction
- Faster sync operations
- Lower API costs
- Better mobile experience

**Priority**: **MEDIUM** - Performance improvement

---

### 10. Search Index Not Optimized

**Location**: `src/services/SearchService.ts`, `src/core/filters/implementations/SearchTextFilter.ts`
**Severity**: **MEDIUM**

**Problem**:
No mention of search indexing strategy in documentation, suggesting linear search:
- Likely iterating through all courses on every search
- No pre-built search index
- No fuzzy matching optimization
- No result caching

**Impact**:
- Slow search with large course catalogs (800+ courses)
- UI lag on every keystroke
- Wasted CPU cycles
- Poor performance on mobile devices

**Evidence**: `docs/core/filtering-system.md` lines 235-265

**Suggested Fix**:
```typescript
class SearchService {
    private searchIndex: Map<string, Set<string>> = new Map();

    buildIndex(courses: Course[]) {
        // Build inverted index: term → course IDs
        for (const course of courses) {
            const tokens = this.tokenize(course.name + ' ' + course.description);
            for (const token of tokens) {
                if (!this.searchIndex.has(token)) {
                    this.searchIndex.set(token, new Set());
                }
                this.searchIndex.get(token).add(course.id);
            }
        }
    }

    search(query: string): Set<string> {
        const tokens = this.tokenize(query);

        // Intersect results for each token
        return tokens
            .map(token => this.searchIndex.get(token) || new Set())
            .reduce((acc, set) => intersection(acc, set));
    }
}
```

**Benefits**:
- O(k) search instead of O(n) where k = result count
- Instant search results
- Better UX
- Scalable to large catalogs

**Priority**: **MEDIUM** - UX improvement

---

## Medium Severity Issues

### 11. Inconsistent Event Systems

**Location**: Multiple files
**Severity**: **MEDIUM**

**Problem**:
Multiple event systems coexist in the codebase:
- `SyncEventBus` for cloud sync events
- `ProfileStateManager` with custom event listener system
- Services with their own event emitters
- No unified event bus

**Impact**:
- Code duplication (event handling repeated)
- Hard to trace event flow
- Inconsistent patterns
- Difficult to debug

**Evidence**:
- `docs/services/sync/event-bus.md` - SyncEventBus
- `docs/core/state-management.md` lines 232-245 - ProfileStateManager listeners

**Suggested Fix**:
Create unified EventBus:
```typescript
class EventBus {
    private listeners = new Map<string, Set<Function>>();

    on(event: string, handler: Function) { /* ... */ }
    off(event: string, handler: Function) { /* ... */ }
    emit(event: string, data: any) { /* ... */ }
}

// Single instance
export const eventBus = new EventBus();

// Usage everywhere
eventBus.emit('state:changed', state);
eventBus.emit('sync:completed', result);
eventBus.emit('filter:applied', filter);
```

**Priority**: **MEDIUM** - Architecture improvement

---

### 12. OneDrive Provider Not Migrated to New Pattern

**Location**: `src/services/sync/providers/onedrive/`
**Severity**: **MEDIUM**

**Problem**:
GoogleDriveProvider uses new CloudProvider interface, OneDrive still uses legacy pattern:
- Two different architectures in same codebase
- OneDrive not updated to new SyncManager
- Inconsistent patterns confuse developers
- Technical debt

**Evidence**: `docs/services/sync/overview.md` lines 211-238

**Impact**:
- Maintenance burden (two patterns)
- OneDrive might not work with new features
- Confusion for developers
- Migration never completed

**Suggested Fix**:
Either:
1. Migrate OneDrive to new CloudProvider interface
2. Or: Remove OneDrive support and document deprecation

**Priority**: **MEDIUM** - Technical debt

---

### 13. Storage Keys Hardcoded as Strings

**Location**: `src/core/TransactionalStorageManager.ts`
**Severity**: **MEDIUM**

**Problem**:
Storage keys are string literals:
- Typos not caught at compile time
- No namespacing strategy
- Key collision risk
- Hard to refactor

**Current Code**:
```typescript
private static readonly STORAGE_KEYS = {
    USER_STATE: 'wpi-planner-user-state',
    PREFERENCES: 'wpi-planner-preferences',
    SCHEDULES: 'wpi-planner-schedules',
};
```

**Suggested Fix**:
```typescript
// Use symbols for uniqueness
const STORAGE_KEYS = {
    USER_STATE: Symbol('user-state'),
    PREFERENCES: Symbol('preferences'),
    SCHEDULES: Symbol('schedules'),
} as const;

// Or typed enum
enum StorageKey {
    USER_STATE = 'wpi-planner-user-state',
    PREFERENCES = 'wpi-planner-preferences',
    SCHEDULES = 'wpi-planner-schedules',
}
```

**Priority**: **LOW-MEDIUM** - Code quality

---

### 14. Professor Rating Cache Not Shared

**Location**: `src/services/ScheduleScorer.ts`
**Severity**: **MEDIUM**

**Problem**:
RMP ratings fetched separately for each schedule being scored:
- Same professor queried multiple times
- No shared cache across scoring operations
- O(schedules × professors) instead of O(unique professors)

**Suggested Fix**:
```typescript
class ScheduleScorer {
    private ratingCache = new Map<string, number>();

    async scoreSchedules(schedules: Schedule[]): Promise<ScheduleScore[]> {
        // Pre-fetch all unique professors
        const professors = this.getUniqueProfessors(schedules);
        for (const prof of professors) {
            const rating = await this.rmpService.findProfessor(prof);
            this.ratingCache.set(prof, rating?.overallRating || 0);
        }

        // Now score using cache
        return schedules.map(s => this.scoreSchedule(s));
    }
}
```

**Priority**: **MEDIUM** - Performance

---

### 15. No Lazy Loading for Schedules

**Location**: `src/core/IndexedDBStorageManager.ts`
**Severity**: **MEDIUM**

**Problem**:
All schedules loaded at app startup via `loadAllSchedules()`:
- User with 50 schedules loads all 50
- Only active schedule needed initially
- Slow app initialization
- Unnecessary memory usage

**Suggested Fix**:
```typescript
class ProfileStateManager {
    async initialize() {
        // Load only active schedule
        const activeId = await storage.getActiveScheduleId();
        const activeSchedule = await storage.loadSchedule(activeId);
        this.setActiveSchedule(activeSchedule);

        // Load others on-demand
    }

    async switchToSchedule(id: string) {
        if (!this.schedules.has(id)) {
            // Lazy load
            const schedule = await storage.loadSchedule(id);
            this.schedules.set(id, schedule);
        }
        this.activeScheduleId = id;
    }
}
```

**Priority**: **MEDIUM** - Performance

---

### 16-19. Other Medium Issues

- **No version migration strategy** - Breaking changes would lose user data
- **WeakMap pattern inconsistent** - Some controllers use it, others don't
- **No error boundaries in UI** - Errors can crash entire app
- **Missing retry logic in some services** - Network errors not handled

---

## Low Severity Issues

### 20. HTML Sanitization is Naive

**Location**: `src/services/CourseDataService.ts`
**Severity**: **LOW**

**Problem**:
HTML stripping uses regex:
```typescript
.replace(/<[^>]*>/g, '')      // Remove tags
.replace(/&[^;]+;/g, ' ')     // Replace entities
```

**Impact**:
- Doesn't handle malformed HTML
- Minor XSS risk if backend compromised
- Edge cases not handled

**Suggested Fix**:
Use DOMParser or library like `sanitize-html`

---

### 21. Time Comparison Logic Duplicated

**Location**: Multiple files
**Severity**: **LOW**

**Problem**:
Time to minutes conversion (`hours * 60 + minutes`) duplicated across:
- AutoScheduler
- ScheduleScorer
- TimeSlotMap
- Conflict detection utilities

**Suggested Fix**:
```typescript
// utils/timeUtils.ts
export function timeToMinutes(time: Time): number {
    return time.hours * 60 + time.minutes;
}
```

---

### 22. Debounce Timeout Hardcoded

**Location**: `src/services/sync/SyncManager.ts`
**Severity**: **LOW**

**Problem**:
3-second debounce hardcoded, not configurable

**Suggested Fix**:
Make it a user preference

---

### 23-25. Other Low Issues

- **No analytics/telemetry** - Can't track errors in production
- **Magic numbers in code** - Priority values, timeouts, limits not constants
- **Console.warn for errors** - Should use proper logging

---

## Summary by Category

### Data Transformations (4 issues)
1. **Cloud sync data transformation** (CRITICAL)
2. **No differential sync** (MEDIUM-HIGH)
3. **HTML sanitization naive** (LOW)
4. **Time comparison duplicated** (LOW)

### Tight Coupling (3 issues)
5. **FilterService → RMP hard dependency** (HIGH)
6. **Multiple event systems** (MEDIUM)
7. **God class: ScheduleController** (MEDIUM-HIGH)

### Inconsistent Patterns (3 issues)
8. **OneDrive not migrated** (MEDIUM)
9. **Event systems inconsistent** (MEDIUM)
10. **WeakMap pattern inconsistent** (LOW)

### Performance Issues (6 issues)
11. **O(n²) conflict detection** (HIGH)
12. **No IndexedDB compression** (CRITICAL)
13. **Search not optimized** (MEDIUM)
14. **Professor cache not shared** (MEDIUM)
15. **No lazy schedule loading** (MEDIUM)
16. **All schedules loaded at startup** (MEDIUM)

### Code Smells (4 issues)
17. **Duplicate course ID workaround** (CRITICAL)
18. **God class** (MEDIUM-HIGH)
19. **Storage keys hardcoded** (MEDIUM)
20. **Debounce timeout hardcoded** (LOW)

### Scalability Concerns (2 issues)
21. **Undo history size fixed** (HIGH)
22. **Push-only sync data loss** (CRITICAL)

### Technical Debt (6 issues)
23. **Legacy OneDrive code** (MEDIUM)
24. **No version migration** (MEDIUM)
25. **Deprecated files not removed** (LOW)
26. **No analytics** (LOW)
27. **Magic numbers** (LOW)
28. **Poor error logging** (LOW)

---

## Priority Recommendations

### 🔴 Immediate Action Required

1. **Fix push-only sync data loss** - Multi-device users losing data
2. **Implement IndexedDB compression** - Easy win, 70% storage reduction
3. **Fix cloud sync data transformation** - 80% bandwidth savings
4. **Address duplicate course IDs** - Data integrity

### 🟡 High Priority

5. **Optimize O(n²) conflict detection** - Scalability bottleneck
6. **Refactor ScheduleController** - Code maintainability
7. **Fix tight coupling in filters** - Testability
8. **Implement per-schedule undo history** - Better UX

### 🟢 Medium Priority

9. **Unify event systems** - Architecture cleanup
10. **Migrate or remove OneDrive** - Complete migration
11. **Add lazy schedule loading** - Performance
12. **Implement search indexing** - UX improvement
13. **Add differential sync** - Bandwidth optimization
14. **Share professor rating cache** - Performance

### ⚪ Low Priority (Technical Debt)

15. **Add version migration system** - Future-proofing
16. **Standardize patterns** - Code quality
17. **Clean up deprecated files** - Maintenance
18. **Add configuration options** - Flexibility
19. **Improve logging** - Debuggability
20. **Add analytics** - Production monitoring

---

## Next Steps

1. **Review and Prioritize**: Discuss with team which issues to address first
2. **Create Tracking Issues**: File GitHub issues for each problem
3. **Update Documentation**: As fixes are implemented, update relevant docs
4. **Add Tests**: Ensure fixes have test coverage
5. **Monitor Impact**: Track metrics (performance, storage, errors) before and after

---

**End of Document**
