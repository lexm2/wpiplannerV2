# Workday Converter Restructure Specification

## Overview

This document specifies how to transform the Workday Planner Converter from its current **flat combined-section structure** to a new **hierarchical lecture-centered structure**.

**Goal**: Instead of creating combined sections like "L01/D01/X01", organize the data so each lecture contains lists of its compatible discussions and labs.

---

## Table of Contents

1. [Current vs. New Structure](#current-vs-new-structure)
2. [Data Model Changes](#data-model-changes)
3. [Algorithm Transformation](#algorithm-transformation)
4. [Compatibility Matrix Building](#compatibility-matrix-building)
5. [Edge Cases](#edge-cases)
6. [Implementation Steps](#implementation-steps)
7. [Testing Strategy](#testing-strategy)

---

## Current vs. New Structure

### Current Structure (Flat Combined Sections)

**Example Course**: CS 1101 with 2 lectures, 2 discussions, 2 labs

**Current Output**:
```json
{
  "id": "CS-1101",
  "number": "1101",
  "name": "Introduction to Program Design",
  "sections": [
    {
      "crn": 123456789,
      "number": "L01/D01/X01",
      "seats": 25,
      "periods": [
        { "type": "Lecture", "specific_section": "L01", "days": ["mon", "wed"], "start_time": "09:00" },
        { "type": "Discussion", "specific_section": "D01", "days": ["tue"], "start_time": "10:00" },
        { "type": "Lab", "specific_section": "X01", "days": ["thu"], "start_time": "14:00" }
      ]
    },
    {
      "crn": 123456790,
      "number": "L01/D01/X02",
      "seats": 25,
      "periods": [
        { "type": "Lecture", "specific_section": "L01", ... },
        { "type": "Discussion", "specific_section": "D01", ... },
        { "type": "Lab", "specific_section": "X02", "days": ["fri"], "start_time": "14:00" }
      ]
    },
    // ... more combinations (potentially 2 × 2 × 2 = 8 total)
  ]
}
```

**Problems with Current Structure**:
- ❌ Combinatorial explosion (L lectures × D discussions × B labs = many sections)
- ❌ Duplicate data (lecture periods repeated in every combination)
- ❌ Hard to answer "which discussions work with L01?"
- ❌ Frontend must parse combined section numbers
- ❌ Large JSON file size (redundant data)

### New Structure (Hierarchical Lecture-Centered)

**New Output**:
```json
{
  "id": "CS-1101",
  "number": "1101",
  "name": "Introduction to Program Design",
  "lectures": [
    {
      "section": {
        "crn": 123456,
        "number": "L01",
        "seats": 50,
        "seats_available": 25,
        "periods": [
          { "type": "Lecture", "days": ["mon", "wed"], "start_time": "09:00", "professor": "John Smith" }
        ]
      },
      "compatibleDiscussions": [
        {
          "crn": 123457,
          "number": "D01",
          "seats": 25,
          "periods": [
            { "type": "Discussion", "days": ["tue"], "start_time": "10:00", "professor": "TA Alice" }
          ]
        },
        {
          "crn": 123458,
          "number": "D02",
          "seats": 25,
          "periods": [
            { "type": "Discussion", "days": ["tue"], "start_time": "11:00", "professor": "TA Bob" }
          ]
        }
      ],
      "compatibleLabs": [
        {
          "crn": 123459,
          "number": "X01",
          "seats": 25,
          "periods": [
            { "type": "Lab", "days": ["thu"], "start_time": "14:00", "professor": "TA Charlie" }
          ]
        },
        {
          "crn": 123460,
          "number": "X02",
          "seats": 25,
          "periods": [
            { "type": "Lab", "days": ["fri"], "start_time": "14:00", "professor": "TA Dana" }
          ]
        }
      ]
    },
    {
      "section": {
        "crn": 234567,
        "number": "L02",
        "seats": 50,
        "periods": [
          { "type": "Lecture", "days": ["tue", "thu"], "start_time": "14:00", "professor": "Jane Doe" }
        ]
      },
      "compatibleDiscussions": [
        // Only discussions that don't conflict with L02's time
      ],
      "compatibleLabs": [
        // Only labs that don't conflict with L02's time
      ]
    }
  ],
  "standaloneLabs": [
    // For lab-only courses (e.g., some physics labs)
  ]
}
```

**Benefits of New Structure**:
- ✅ No combinatorial explosion
- ✅ Each section appears exactly once
- ✅ Easy to answer "which discussions work with this lecture?"
- ✅ Smaller JSON file (no redundancy)
- ✅ Frontend can build combinations on-demand
- ✅ Clear compatibility relationships

---

## Data Model Changes

### New Type Definitions

```typescript
// New top-level course structure
interface Course {
  id: string;
  number: string;
  name: string;
  description: string;
  min_credits: number;
  max_credits: number;
  lectures: LectureGroup[];      // NEW: Main structure
  standaloneLabs?: Section[];    // NEW: For lab-only courses
}

// NEW: Groups a lecture with its compatible components
interface LectureGroup {
  section: Section;                      // The lecture section
  compatibleDiscussions: Section[];      // Discussions that work with this lecture
  compatibleLabs: Section[];             // Labs that work with this lecture
}

// Existing Section type (unchanged)
interface Section {
  crn: number;
  number: string;
  seats: number;
  seats_available: number;
  actual_waitlist: number;
  max_waitlist: number;
  note: string | null;
  description: string;
  term: string;
  computedTerm: string;
  is_gps: boolean;
  is_interest_list: boolean;
  periods: Period[];
}
```

### Data Model Comparison

| Aspect | Current (Flat) | New (Hierarchical) |
|--------|----------------|-------------------|
| **Top-level** | `sections[]` | `lectures[]` + `standaloneLabs[]` |
| **Section count** | L × D × B combinations | L + D + B individual sections |
| **Duplication** | Lecture/discussion data repeated | Each section appears once |
| **Compatibility** | Implicit (all combos valid) | Explicit (only compatible listed) |
| **CRN** | Concatenated | Original |
| **Section number** | "L01/D01/X01" | "L01", "D01", "X01" (separate) |

---

## Algorithm Transformation

### Current Algorithm (Java Converter)

**Location**: `jsonIN.java:507-575`

```
1. Categorize sections by type:
   - lectures[] = all lecture sections
   - discussions[] = all discussion sections
   - labs[] = all lab sections

2. Nested loop combination:
   FOR each lecture in lectures:
     FOR each discussion in discussions:
       FOR each lab in labs:
         IF conflictChecker([lecture, discussion, lab]):
           combined = combiner([lecture, discussion, lab])
           course.sections.add(combined)

3. combiner() method:
   - Concatenates CRNs: 123 + 456 + 789 = 123456789
   - Concatenates numbers: "L01" + "/" + "D01" + "/" + "X01"
   - Merges all periods into single section
   - Takes minimum seats across components
```

### New Algorithm (Hierarchical)

```
1. Categorize sections by type (same):
   - lectures[] = all lecture sections
   - discussions[] = all discussion sections
   - labs[] = all lab sections

2. Build compatibility matrix for each lecture:
   FOR each lecture in lectures:
     lectureGroup = {
       section: lecture,
       compatibleDiscussions: [],
       compatibleLabs: []
     }

     FOR each discussion in discussions:
       IF isCompatible(lecture, discussion):
         lectureGroup.compatibleDiscussions.add(discussion)

     FOR each lab in labs:
       IF isCompatible(lecture, lab):
         lectureGroup.compatibleLabs.add(lab)

     course.lectures.add(lectureGroup)

3. Handle lab-only courses:
   IF lectures.isEmpty() AND !labs.isEmpty():
     course.standaloneLabs = labs

4. NO combiner needed - sections stay separate!
```

**Key Differences**:
- ✅ No nested 3-level loop
- ✅ No combiner method needed
- ✅ No CRN concatenation
- ✅ Separate compatibility checks (lecture-discussion, lecture-lab)
- ✅ Each section keeps original properties

---

## Compatibility Matrix Building

### Compatibility Check Function

Replace the `combiner()` method with a simpler `isCompatible()` check:

```typescript
function isCompatible(section1: Section, section2: Section): boolean {
  // 1. Check cluster constraints (GPS courses)
  if (!checkClusterCompatibility(section1, section2)) {
    return false;
  }

  // 2. Check time conflicts
  if (hasTimeConflict(section1, section2)) {
    return false;
  }

  return true;
}
```

### Cluster Compatibility Rules

**Current logic** (from `conflictChecker()` in `jsonIN.java:662-699`):

```
IF section is GPS:
  - ALL components MUST have same cluster ID
  - If any cluster is null → incompatible
  - If clusters don't match → incompatible

ELSE (non-GPS):
  - Sections without cluster → always compatible
  - Sections with cluster → must match
  - Can mix clustered + non-clustered
```

**New implementation**:

```typescript
function checkClusterCompatibility(section1: Section, section2: Section): boolean {
  const cluster1 = section1.note;  // Cluster ID
  const cluster2 = section2.note;

  // GPS courses: both must have same cluster
  if (section1.is_gps || section2.is_gps) {
    if (!cluster1 || !cluster2) return false;
    return cluster1 === cluster2;
  }

  // Non-GPS: if either has no cluster, compatible
  if (!cluster1 || !cluster2) return true;

  // Both have clusters: must match
  return cluster1 === cluster2;
}
```

### Time Conflict Detection

**Current logic** (from `periodConflictChecker()` in `jsonIN.java:722-746`):

```
1. Check if time ranges overlap:
   overlap = (period2.start < period1.end) AND (period2.end > period1.start)

2. If times overlap, check if they share any days:
   FOR each day (Monday through Friday):
     IF period1.hasDay(day) AND period2.hasDay(day):
       CONFLICT = true

3. Return: true if NO conflict, false if CONFLICT
```

**New implementation**:

```typescript
function hasTimeConflict(section1: Section, section2: Section): boolean {
  // Compare all period pairs
  for (const period1 of section1.periods) {
    for (const period2 of section2.periods) {
      if (periodsConflict(period1, period2)) {
        return true;  // Found a conflict
      }
    }
  }
  return false;  // No conflicts found
}

function periodsConflict(period1: Period, period2: Period): boolean {
  // Convert time strings to comparable format
  const start1 = parseTime(period1.start_time);  // "09:00" → 540 minutes
  const end1 = parseTime(period1.end_time);
  const start2 = parseTime(period2.start_time);
  const end2 = parseTime(period2.end_time);

  // Check time overlap
  const timeOverlap = (start2 < end1) && (end2 > start1);

  if (!timeOverlap) return false;

  // Check if they share any days
  const days1 = new Set(period1.days);
  const days2 = new Set(period2.days);

  for (const day of days1) {
    if (days2.has(day)) {
      return true;  // Conflict: same day + overlapping time
    }
  }

  return false;  // Times overlap but different days
}

function parseTime(timeStr: string): number {
  // "09:00" → 9 * 60 + 0 = 540 minutes since midnight
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}
```

---

## Edge Cases

### 1. Lab-Only Courses

**Example**: Physics lab courses with no lecture component

**Current behavior** (`jsonIN.java:528-531`):
```java
if(lectures.isEmpty() && !labs.isEmpty()) {
    for (section lab : labs) {
        newCourse.getSections().add(lab);
    }
}
```

**New behavior**:
```json
{
  "id": "PH-1110",
  "name": "Physics Laboratory I",
  "lectures": [],                    // Empty
  "standaloneLabs": [                // Labs go here
    {
      "crn": 123456,
      "number": "X01",
      "periods": [...]
    },
    {
      "crn": 123457,
      "number": "X02",
      "periods": [...]
    }
  ]
}
```

### 2. Lecture-Only Courses

**Example**: Seminar courses with no lab/discussion

**Current behavior** (`jsonIN.java:523-527`):
```java
if(!lectures.isEmpty() && labs.isEmpty() && discussions.isEmpty()) {
    for (section lecture : lectures) {
        newCourse.getSections().add(lecture);
    }
}
```

**New behavior**:
```json
{
  "lectures": [
    {
      "section": {
        "crn": 123456,
        "number": "A01",
        "periods": [...]
      },
      "compatibleDiscussions": [],   // Empty
      "compatibleLabs": []            // Empty
    }
  ]
}
```

### 3. GPS Courses (No Cluster)

**Example**: GPS course section without cluster assignment

**Current behavior** (`jsonIN.java:535-537`):
```java
if((lecture.isGPS() && lecture.getNote()==null) || lecture.isInterestList()) {
    newCourse.getSections().add(lecture);  // Don't combine
}
```

**New behavior**:
```json
{
  "lectures": [
    {
      "section": {
        "crn": 123456,
        "number": "GPS: Machine Learning",
        "is_gps": true,
        "note": null
      },
      "compatibleDiscussions": [],   // GPS without cluster: no compatible components
      "compatibleLabs": []
    }
  ]
}
```

**Reason**: GPS courses without clusters cannot be safely combined with other sections.

### 4. Interest List Sections

**Example**: Placeholder sections for courses under consideration

**Current behavior**: Treated like GPS without cluster (isolated)

**New behavior**:
```json
{
  "lectures": [
    {
      "section": {
        "crn": 999999,
        "number": "Interest List-A Term",
        "is_interest_list": true,
        "periods": []
      },
      "compatibleDiscussions": [],
      "compatibleLabs": []
    }
  ]
}
```

### 5. All Components Conflict

**Scenario**: Lecture L01 conflicts with ALL discussions and ALL labs

**Current behavior**: No sections generated for that lecture (omitted)

**New behavior**: Include lecture with empty compatibility arrays
```json
{
  "section": { "number": "L01", ... },
  "compatibleDiscussions": [],   // All conflict
  "compatibleLabs": []            // All conflict
}
```

**Rationale**: User can still see the lecture exists, even if it has no compatible components.

### 6. Cluster Constraint Filtering

**Scenario**:
- Lecture L01 (Cluster A)
- Discussion D01 (Cluster A)
- Discussion D02 (Cluster B)
- Lab X01 (Cluster A)
- Lab X02 (No cluster)

**New behavior**:
```json
{
  "section": { "number": "L01", "note": "Cluster-A" },
  "compatibleDiscussions": [
    { "number": "D01", "note": "Cluster-A" }   // ✅ Same cluster
    // D02 excluded (different cluster)
  ],
  "compatibleLabs": [
    { "number": "X01", "note": "Cluster-A" },  // ✅ Same cluster
    { "number": "X02", "note": null }          // ✅ No cluster (allowed)
  ]
}
```

### 7. Seminars and Other Types

**Example**: Seminar sections (not Lecture/Lab/Discussion)

**Current behavior** (`jsonIN.java:515-517`):
```java
else {
    newCourse.getSections().add(newSection);  // Add directly
}
```

**New behavior**: Add to lectures array with empty compatibility
```json
{
  "lectures": [
    {
      "section": {
        "number": "S01",
        "periods": [
          { "type": "Seminar", ... }
        ]
      },
      "compatibleDiscussions": [],
      "compatibleLabs": []
    }
  ]
}
```

**Alternative**: Create separate `seminars[]` array (requires frontend changes)

---

## Implementation Steps

### Phase 1: Update Type Definitions

1. **Define new interfaces**:
   - `LectureGroup` interface
   - Update `Course` interface to include `lectures[]` and `standaloneLabs[]`
   - Remove old `sections[]` field

2. **Update validators**:
   - Add validation for `LectureGroup` structure
   - Update course validator to expect new format

### Phase 2: Modify Core Conversion Logic

**File to modify**: Main conversion logic (equivalent of `jsonIN.java:507-575`)

1. **Keep categorization step** (lines 507-518):
   ```
   ✅ Keep: Separate sections into lectures[], discussions[], labs[]
   ```

2. **Replace combination logic** (lines 521-575):
   ```
   ❌ Remove: Nested loop creating combined sections
   ❌ Remove: combiner() method calls
   ✅ Add: Compatibility matrix building
   ```

3. **New logic structure**:
   ```
   STEP 1: Categorize sections (unchanged)

   STEP 2: Build lecture groups
   FOR each lecture:
     lectureGroup = {
       section: lecture,
       compatibleDiscussions: filterCompatible(lecture, discussions),
       compatibleLabs: filterCompatible(lecture, labs)
     }
     course.lectures.push(lectureGroup)

   STEP 3: Handle edge cases
   IF no lectures but has labs:
     course.standaloneLabs = labs
   IF no lectures and no labs:
     // Skip course or add error
   ```

### Phase 3: Implement Compatibility Functions

1. **Create `isCompatible(section1, section2)`**:
   - Port cluster logic from `conflictChecker()` (lines 662-699)
   - Port time conflict logic from `periodConflictChecker()` (lines 722-746)

2. **Create helper function**:
   ```typescript
   function filterCompatible(lecture: Section, components: Section[]): Section[] {
     return components.filter(component => isCompatible(lecture, component));
   }
   ```

### Phase 4: Remove Obsolete Code

**Code to delete**:
1. ❌ `combiner()` method (lines 588-657) - no longer needed
2. ❌ CRN concatenation logic
3. ❌ Section number concatenation logic ("L01/D01/X01")
4. ❌ Period merging logic

**Code to keep**:
1. ✅ `conflictChecker()` logic (lines 662-718) - adapt for pairwise checks
2. ✅ Cluster compatibility rules
3. ✅ Time conflict detection
4. ✅ GPS/Interest List handling

### Phase 5: Update Output Serialization

**File to modify**: Output writer (equivalent of `jsonOUT.java`)

**Current structure** (lines 44-97):
```java
for (section thisSection : thisCourse.getSections()) {
    JSONObject sectionObj = new JSONObject();
    sectionObj.put("crn", thisSection.getCrn());
    sectionObj.put("number", thisSection.getNumber());
    // ...
    sectionsArray.add(sectionObj);
}
courseObj.put("sections", sectionsArray);
```

**New structure**:
```typescript
const lecturesArray = [];

for (const lectureGroup of course.lectures) {
  const lectureObj = {
    section: serializeSection(lectureGroup.section),
    compatibleDiscussions: lectureGroup.compatibleDiscussions.map(serializeSection),
    compatibleLabs: lectureGroup.compatibleLabs.map(serializeSection)
  };
  lecturesArray.push(lectureObj);
}

courseObj.lectures = lecturesArray;

if (course.standaloneLabs && course.standaloneLabs.length > 0) {
  courseObj.standaloneLabs = course.standaloneLabs.map(serializeSection);
}
```

### Phase 6: Update Configuration

**File**: `planner.properties` or equivalent TypeScript config

**No changes needed** for:
- ✅ `FallYear`, `SpringYear` - still used
- ✅ `SpecialCourses`, `SpecialSections` - still used for GPS handling
- ✅ `SectionNumberAppendicies` - still used for parsing

### Phase 7: Testing & Validation

1. **Unit tests**:
   - Test `isCompatible()` with various cluster scenarios
   - Test time conflict detection with edge cases
   - Test lecture group building with different component counts

2. **Integration tests**:
   - Convert sample Workday data
   - Verify no sections lost
   - Verify compatibility logic is correct
   - Check output file size (should be smaller)

3. **Regression tests**:
   - Compare section counts (should match before filtering)
   - Verify all original valid combinations are still possible
   - Check that incompatible combinations are excluded

---

## Testing Strategy

### Test Cases

#### Test Case 1: Simple Course (1L, 1D, 1L)

**Input**:
- 1 lecture: L01 (Mon/Wed 9:00-9:50)
- 1 discussion: D01 (Tue 10:00-10:50)
- 1 lab: X01 (Thu 14:00-16:00)

**Expected Output**:
```json
{
  "lectures": [
    {
      "section": { "number": "L01", ... },
      "compatibleDiscussions": [{ "number": "D01", ... }],
      "compatibleLabs": [{ "number": "X01", ... }]
    }
  ]
}
```

**Verification**:
- ✅ 1 lecture group
- ✅ All components compatible (no conflicts)

#### Test Case 2: Time Conflict (2L, 2D)

**Input**:
- L01 (Mon/Wed 9:00-9:50)
- L02 (Mon/Wed 10:00-10:50)
- D01 (Mon 9:00-9:50) - conflicts with L01!
- D02 (Tue 10:00-10:50) - no conflicts

**Expected Output**:
```json
{
  "lectures": [
    {
      "section": { "number": "L01", ... },
      "compatibleDiscussions": [
        { "number": "D02" }  // D01 excluded (time conflict)
      ]
    },
    {
      "section": { "number": "L02", ... },
      "compatibleDiscussions": [
        { "number": "D01" },
        { "number": "D02" }
      ]
    }
  ]
}
```

#### Test Case 3: Cluster Constraint

**Input**:
- L01 (Cluster A)
- D01 (Cluster A)
- D02 (Cluster B)
- X01 (No cluster)

**Expected Output**:
```json
{
  "lectures": [
    {
      "section": { "number": "L01", "note": "Cluster-A" },
      "compatibleDiscussions": [
        { "number": "D01" }  // D02 excluded (wrong cluster)
      ],
      "compatibleLabs": [
        { "number": "X01" }  // No cluster OK
      ]
    }
  ]
}
```

#### Test Case 4: Lab-Only Course

**Input**:
- No lectures
- 3 lab sections: X01, X02, X03

**Expected Output**:
```json
{
  "lectures": [],
  "standaloneLabs": [
    { "number": "X01", ... },
    { "number": "X02", ... },
    { "number": "X03", ... }
  ]
}
```

#### Test Case 5: GPS Without Cluster

**Input**:
- GPS lecture (no cluster)
- Regular discussion D01
- Regular lab X01

**Expected Output**:
```json
{
  "lectures": [
    {
      "section": { "number": "GPS: AI", "is_gps": true, "note": null },
      "compatibleDiscussions": [],  // Cannot combine without cluster
      "compatibleLabs": []
    }
  ]
}
```

#### Test Case 6: Combinatorial Explosion Prevention

**Input**:
- 3 lectures: L01, L02, L03
- 3 discussions: D01, D02, D03
- 3 labs: X01, X02, X03
- All mutually compatible

**Old output**: 3 × 3 × 3 = **27 combined sections**

**New output**: 3 lecture groups with lists = **9 individual sections**

**Verification**:
- ✅ Much smaller output
- ✅ Same information content (all 27 combinations still possible)

### Validation Checklist

After conversion, verify:

1. **Section count preservation**:
   ```
   Total sections in output = unique lectures + unique discussions + unique labs
   ```

2. **No data loss**:
   - Every section from input appears in output exactly once
   - All CRNs are preserved (no concatenation)

3. **Compatibility accuracy**:
   - No time conflicts in compatible lists
   - Cluster constraints respected
   - GPS/Interest List rules followed

4. **File size**:
   - New file should be 30-50% smaller (less redundancy)

5. **Valid JSON structure**:
   - All lectures have required fields
   - All compatibility arrays are valid (even if empty)

---

## Migration Guide for Frontend

### Frontend Changes Required

The frontend must be updated to work with the new hierarchical structure:

#### 1. Section Selection Logic

**Old approach**:
```typescript
// User picks from pre-combined sections
const selectedSection = course.sections.find(s => s.number === "L01/D01/X01");
```

**New approach**:
```typescript
// User picks lecture, then discussion, then lab
const lecture = course.lectures.find(lg => lg.section.number === "L01");
const discussion = lecture.compatibleDiscussions.find(d => d.number === "D01");
const lab = lecture.compatibleLabs.find(l => l.number === "X01");

// Frontend builds the combination
const selectedCombination = {
  lecture: lecture.section,
  discussion: discussion,
  lab: lab
};
```

#### 2. Schedule Building

**Old approach**:
```typescript
// Add pre-combined section to schedule
schedule.add(combinedSection);  // Already has all periods merged
```

**New approach**:
```typescript
// Merge periods from individual components
const allPeriods = [
  ...lecture.section.periods,
  ...discussion.periods,
  ...lab.periods
];
schedule.add({ ...combination, periods: allPeriods });
```

#### 3. Enrollment Calculation

**Old approach**:
```typescript
// Combined section has minimum seats
const availableSeats = combinedSection.seats_available;
```

**New approach**:
```typescript
// Calculate minimum seats across components
const availableSeats = Math.min(
  lecture.section.seats_available,
  discussion.seats_available,
  lab.seats_available
);
```

#### 4. UI Display

**Recommended UI flow**:

```
1. User selects course
   ↓
2. Show available lectures
   ↓
3. User picks lecture L01
   ↓
4. Show compatible discussions for L01
   ↓
5. User picks discussion D01
   ↓
6. Show compatible labs for L01
   ↓
7. User picks lab X01
   ↓
8. Combination added to schedule
```

**Benefits**:
- User sees only valid options at each step
- Clear dependency chain (lecture → discussion → lab)
- No invalid combinations possible

---

## Performance Impact

### Current Performance

**File sizes** (from analysis):
- Input: 11.7 MB (Workday JSON)
- Output: 8.9 MB (Combined sections)

**Example calculation** (3L × 3D × 3L course):
- Sections in output: 27 combined sections
- Each combined section duplicates lecture/discussion data
- Redundancy factor: ~3-4x

### Expected Performance (New Structure)

**Example calculation** (same 3L × 3D × 3L course):
- Sections in output: 3 + 3 + 3 = 9 individual sections
- No duplication (each appears once)
- Redundancy factor: 1x

**Estimated file size**: 5-6 MB (40-50% reduction)

**Benefits**:
- ✅ Faster JSON parsing
- ✅ Lower memory usage
- ✅ Faster network transfer
- ✅ Easier to cache

---

## Summary

### Key Changes

| Aspect | Before | After |
|--------|--------|-------|
| **Structure** | Flat combined sections | Hierarchical lecture groups |
| **Section format** | "L01/D01/X01" | "L01", "D01", "X01" (separate) |
| **CRN** | Concatenated | Original |
| **Duplication** | High (combinations) | None (each section once) |
| **Compatibility** | Implicit | Explicit (pre-filtered lists) |
| **File size** | 8.9 MB | ~5-6 MB (estimated) |
| **Frontend logic** | Simple (pick from list) | Multi-step (pick lecture → discussion → lab) |

### Implementation Checklist

- [ ] Update type definitions (LectureGroup, Course)
- [ ] Modify categorization logic (keep as-is)
- [ ] Remove combiner method
- [ ] Implement isCompatible() function
- [ ] Implement filterCompatible() helper
- [ ] Build lecture groups with compatibility lists
- [ ] Handle lab-only courses (standaloneLabs)
- [ ] Update output serialization
- [ ] Remove obsolete code (combiner, CRN concat)
- [ ] Update tests for new structure
- [ ] Validate output file size reduction
- [ ] Update frontend to consume new structure
- [ ] Test all edge cases

---

**Document Version**: 1.0
**Date**: October 31, 2025
**Status**: Specification Complete - Ready for Implementation
