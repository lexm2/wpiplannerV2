# WorkdayToPlannerConverter Java Code Analysis

## Overview

The WorkdayToPlannerConverter is a Java application that transforms WPI's raw JSON course data into a structured XML format suitable for course planning applications. This document provides a comprehensive analysis of every aspect of the Java codebase and its data flow.

## Architecture Overview

The system follows a pipeline architecture:
```
Raw JSON → Parsing → Filtering → Section Construction → Combination → XML Output
```

Key components:
- **jsonIN.java**: Main processing logic and section construction
- **SchedXMLParser.java**: XML output generation
- **Data Models**: Course, Section, Period representations

## Core Data Structures

### Course Structure
```java
class Course {
    String courseTitle;           // "CS-2102 Object-Oriented Design Concepts"
    String subject;              // "CS" 
    String courseNumber;         // "2102"
    String courseName;           // "Object-Oriented Design Concepts"
    String courseDescription;    // HTML-formatted description
    String credits;              // "3.0" or "3.0-4.0" for variable credit
    List<Section> sections;      // All sections for this course
}
```

### Section Structure
```java
class Section {
    int crn;                     // Course Registration Number (unique)
    String sectionNumber;        // "A01", "A01/AD03", "IL" (Interest List)
    String term;                 // "Fall A 2025", "Spring C 2026"
    int totalSeats;
    int availableSeats;
    int actualWaitlist;
    int maxWaitlist;
    String note;                 // Optional section notes
    List<Period> periods;        // Time blocks for this section
    boolean isGPS;               // Global Perspective course flag
    boolean isInterestList;      // Interest List section flag
}
```

### Period Structure
```java
class Period {
    String type;                 // "Lecture", "Lab", "Discussion", "Recitation"
    String professor;            // Instructor name
    String startTime;            // "9:00 AM"
    String endTime;              // "10:00 AM"
    String location;             // "Salisbury Labs 104"
    String building;             // "Salisbury Labs"
    String room;                 // "104"
    Set<String> days;            // {"mon", "wed", "fri"}
    int seats;                   // Period-specific enrollment
    int seatsAvailable;
    int actualWaitlist;
    int maxWaitlist;
    String specificSection;      // Which sub-section this period belongs to
}
```

## Data Flow Analysis

### Phase 1: Raw Data Ingestion

**Input Format**: WPI's JSON contains `Report_Entry` array with entries like:
```json
{
  "CRN": "12345",
  "Course_Title": "CS-2102 Object-Oriented Design Concepts",
  "Subject": "CS",
  "Course_Number": "2102",
  "Course_Section": "CS-2102-A01",
  "Instructional_Format": "Lecture",
  "Academic_Period_Offering_Period": "Fall A 2025",
  "Section_Details": "Jane Smith | MWF 9:00-10:00 | Salisbury Labs 104",
  "Enrolled_Capacity": "25/30",
  "Waitlist_Capacity": "2/5",
  "Course_Description": "This course introduces...",
  "Credits": "3.0"
}
```

**Key Insight**: Each JSON entry represents a single **period** within a section, not a complete section. A section with lecture + lab will have 2+ separate JSON entries.

### Phase 2: Data Filtering and Validation

**Filtering Rules** (from `jsonIN.java`):

1. **Canceled Sections**: Remove entries containing "Canceled: Preliminary"
2. **Academic Periods**: Only include:
   - Fall A, Fall B (Fall semester terms)
   - Spring C, Spring D (Spring semester terms)
   - Full semester courses
3. **Interest List Filtering**: For "Interest List" sections, only include Lectures (skip Labs/Discussions)

**GPS Course Handling**:
- GPS courses have special section identifiers like "CS-2102-GPS A01"
- GPS sections must be grouped by cluster (A, B, C, etc.)
- Only compatible cluster sections can be combined

### Phase 3: Course Grouping and Aggregation

**Grouping Logic**:
```java
// Group entries by course + term combination
Map<String, List<Entry>> courseGroups = entries.stream()
    .collect(Collectors.groupingBy(entry -> 
        entry.getCourseTitle().split(" ")[0] + "_" + entry.getAcademicPeriod()));
```

**Course Construction**:
1. Extract course metadata from first entry in group
2. Parse credit values (handle ranges like "3.0-4.0")
3. Clean HTML from course descriptions
4. Create course object with empty sections list

### Phase 4: Section Construction (Critical Phase)

This is the most complex part of the system. The Java code processes sections in multiple steps:

#### Step 4a: Instructional Format Separation

**Purpose**: Group entries by their instructional type
```java
Map<String, List<Entry>> formatGroups = courseEntries.stream()
    .collect(Collectors.groupingBy(Entry::getInstructionalFormat));

// Normalize format names
formatGroups.put("Lab", formatGroups.remove("Laboratory"));
```

**Result**: Separate groups for "Lecture", "Lab", "Discussion", "Recitation", etc.

#### Step 4b: Individual Section Creation

For each instructional format group, create individual sections:

```java
for (Entry entry : formatGroup) {
    Section section = new Section();
    section.crn = Integer.parseInt(entry.getCrn());
    section.sectionNumber = extractSectionNumber(entry.getCourseSection());
    section.term = entry.getAcademicPeriod();
    
    // Parse enrollment data
    String[] enrolledParts = entry.getEnrolledCapacity().split("/");
    section.totalSeats = Integer.parseInt(enrolledParts[1]);
    section.availableSeats = Integer.parseInt(enrolledParts[1]) - Integer.parseInt(enrolledParts[0]);
    
    // Parse section details into periods
    section.periods = parseSectionDetails(entry.getSectionDetails(), section.sectionNumber);
}
```

**Section Number Extraction Logic**:
- Standard: "CS-2102-A01" → "A01"
- GPS: "CS-2102-GPS A01" → "A01" 
- Interest List: "CS-2102-Interest List" → "IL"

#### Step 4c: Section Details Parsing

**Input**: `"Jane Smith | MWF 9:00-10:00 | Salisbury Labs 104"`

**Parsing Logic**:
1. Split by "|" delimiter
2. Extract professor name (first part)
3. Parse days and times (second part)
4. Extract location information (third part)

**Day Parsing**:
```java
Map<Character, String> dayMapping = Map.of(
    'M', "mon", 'T', "tue", 'W', "wed", 
    'R', "thu", 'F', "fri", 'S', "sat"
);
```

**Time Parsing**:
```java
// Handle formats: "9:00-10:00", "9:00 AM-10:00 AM"
Pattern timePattern = Pattern.compile("(\\d{1,2}:\\d{2}(?:\\s*[AP]M)?)\\s*-\\s*(\\d{1,2}:\\d{2}(?:\\s*[AP]M)?)");
```

### Phase 5: Section Combination (Most Complex Phase)

**Problem**: Individual sections need to be combined into unified course sections that students can register for.

**Example**: A course with lecture + lab creates two individual sections:
- Section "A01" (Lecture): MWF 9:00-10:00
- Section "AL01" (Lab): T 2:00-4:00

**Goal**: Combine into unified section "A01/AL01" containing both periods.

#### Combination Algorithm

**Step 1: Categorize Sections by Type**
```java
List<Section> lectures = sections.stream()
    .filter(s -> s.periods.stream().anyMatch(p -> p.type.equals("Lecture")))
    .collect(Collectors.toList());

List<Section> discussions = sections.stream()
    .filter(s -> s.periods.stream().anyMatch(p -> p.type.equals("Discussion")))
    .collect(Collectors.toList());

List<Section> labs = sections.stream()
    .filter(s -> s.periods.stream().anyMatch(p -> p.type.equals("Lab")))
    .collect(Collectors.toList());
```

**Step 2: Apply Combination Rules**

The Java code implements sophisticated combination logic:

1. **Lecture Only**: Keep lectures as separate sections
2. **Lecture + Discussion**: Find compatible lecture-discussion pairs
3. **Lecture + Lab**: Find compatible lecture-lab pairs  
4. **Lecture + Discussion + Lab**: Find compatible triplets
5. **Others**: Pass through seminars, studios directly

**Compatibility Check**:
```java
private boolean areCompatible(List<Section> sections) {
    // Check GPS cluster compatibility
    if (hasGPSSections(sections)) {
        if (!sameCluster(sections)) return false;
    }
    
    // Check time conflicts
    return !hasTimeConflicts(sections);
}
```

**GPS Cluster Logic**:
- GPS sections have cluster identifiers: "A01" (cluster A), "B02" (cluster B)
- Only sections from the same cluster can be combined
- Extract cluster from first character of section number

**Time Conflict Detection**:
```java
private boolean hasTimeConflicts(List<Section> sections) {
    List<Period> allPeriods = sections.stream()
        .flatMap(s -> s.periods.stream())
        .collect(Collectors.toList());
    
    for (int i = 0; i < allPeriods.size(); i++) {
        for (int j = i + 1; j < allPeriods.size(); j++) {
            if (periodsConflict(allPeriods.get(i), allPeriods.get(j))) {
                return true;
            }
        }
    }
    return false;
}

private boolean periodsConflict(Period p1, Period p2) {
    // Check day overlap
    if (Collections.disjoint(p1.days, p2.days)) return false;
    
    // Check time overlap
    LocalTime start1 = parseTime(p1.startTime);
    LocalTime end1 = parseTime(p1.endTime);
    LocalTime start2 = parseTime(p2.startTime);
    LocalTime end2 = parseTime(p2.endTime);
    
    // No conflict if: end1 <= start2 OR end2 <= start1
    return !(end1.compareTo(start2) <= 0 || end2.compareTo(start1) <= 0);
}
```

**Step 3: Section Combination Process**

For compatible sections, create combined section:

```java
private Section combineMultipleSections(List<Section> sections) {
    Section combined = new Section();
    
    // Concatenate CRNs
    String crnString = sections.stream()
        .map(s -> String.valueOf(s.crn))
        .collect(Collectors.joining());
    combined.crn = Integer.parseInt(crnString);
    
    // Combine section numbers with "/"
    combined.sectionNumber = sections.stream()
        .map(s -> s.sectionNumber)
        .collect(Collectors.joining("/"));
    
    // Take minimum enrollment (most restrictive)
    combined.totalSeats = sections.stream().mapToInt(s -> s.totalSeats).min().orElse(0);
    combined.availableSeats = sections.stream().mapToInt(s -> s.availableSeats).min().orElse(0);
    
    // Sum waitlists
    combined.actualWaitlist = sections.stream().mapToInt(s -> s.actualWaitlist).sum();
    combined.maxWaitlist = sections.stream().mapToInt(s -> s.maxWaitlist).sum();
    
    // Combine all periods
    combined.periods = sections.stream()
        .flatMap(s -> s.periods.stream())
        .collect(Collectors.toList());
    
    return combined;
}
```

### Phase 6: XML Output Generation

**SchedXMLParser.java** converts the processed data to XML format:

```xml
<scheddb>
    <course id="CS-2102" name="Object-Oriented Design Concepts" credits="3.0">
        <description>This course introduces students to...</description>
        <sections>
            <section crn="12345678" number="A01/AL01" seats="25" available="20">
                <periods>
                    <period type="Lecture" prof="Jane Smith" 
                            start="09:00" end="10:00" location="SL 104"
                            days="mon,wed,fri"/>
                    <period type="Lab" prof="Bob Wilson" 
                            start="14:00" end="16:00" location="AK 219"
                            days="tue"/>
                </periods>
            </section>
        </sections>
    </course>
</scheddb>
```

## Special Cases and Edge Cases

### Interest List Sections
- Represent courses with uncertain enrollment
- Only lecture periods are processed (labs/discussions ignored)
- Section number becomes "IL"
- Special handling in combination logic

### GPS Courses
- Global Perspective courses with cluster requirements
- Students must take all sections from same cluster
- Cluster validation prevents invalid combinations
- Section numbers like "A01", "B01" indicate clusters

### Variable Credit Courses
- Credits field may contain ranges: "3.0-4.0"
- Parsed into min/max credit values
- Affects degree planning calculations

### Multi-Period Sections
- Single section may have multiple meeting times
- Example: Lecture MWF + Recitation R
- Section details contain multiple entries separated by semicolons

### Empty/Missing Data
- Graceful handling of missing section details
- Default values for unparseable enrollment data
- Skip entries with critical missing information

## Performance Characteristics

### Time Complexity
- **Parsing**: O(n) where n = number of JSON entries
- **Grouping**: O(n log n) due to sorting/grouping operations
- **Combination**: O(s²) where s = sections per course (due to compatibility checking)
- **Overall**: O(n log n + c*s²) where c = number of courses

### Memory Usage
- Raw JSON data loaded entirely into memory
- Intermediate data structures for processing
- Final XML structure before output
- Peak memory usage ~3x raw data size

### Scalability Limits
- Single-threaded processing
- In-memory processing limits dataset size
- XML generation is memory-intensive
- Suitable for WPI's dataset size (~50MB JSON)

## Data Quality and Validation

### Input Validation
- JSON structure validation
- Required field presence checks
- Data type validation (numeric fields)
- Format validation (CRN, course codes)

### Output Validation
- XML schema compliance
- Section combination consistency
- Time conflict detection
- Enrollment data integrity

### Error Handling
- Malformed JSON entries skipped with warnings
- Invalid time formats use default values
- Missing data filled with reasonable defaults
- Processing continues despite individual entry failures

## Comparison with WPI's Current System

### Advantages of Java Approach
1. **Accurate Section Combination**: Properly combines related sections
2. **Time Conflict Detection**: Prevents invalid schedule combinations
3. **GPS Cluster Validation**: Enforces academic requirements
4. **Robust Data Parsing**: Handles edge cases gracefully
5. **Structured Output**: Clean XML format for processing

### Limitations
1. **Single-Threaded**: No parallel processing
2. **Memory-Intensive**: Loads all data into memory
3. **XML Output**: Legacy format, JSON would be more modern
4. **Java Dependency**: Requires JVM for execution
5. **Manual Execution**: No automated pipeline integration

## Implementation Notes for Python Port

### Critical Features to Preserve
1. **Exact Section Combination Logic**: The compatibility checking and combination rules
2. **GPS Cluster Handling**: Cluster-based section grouping
3. **Time Conflict Detection**: Accurate period overlap detection
4. **Interest List Processing**: Special handling for uncertain courses
5. **Enrollment Data Parsing**: "25/30" format parsing

### Potential Improvements in Python
1. **Pandas Integration**: Efficient data manipulation
2. **JSON Output**: Modern format instead of XML  
3. **Parallel Processing**: Multi-core utilization
4. **Pipeline Integration**: GitHub Actions compatibility
5. **Better Error Reporting**: Detailed validation feedback

### Testing Strategy
1. **Unit Tests**: Individual method testing
2. **Integration Tests**: Full pipeline testing
3. **Comparison Tests**: Java vs Python output validation
4. **Performance Tests**: Processing time benchmarks
5. **Data Quality Tests**: Output validation against known good data

## Conclusion

The Java WorkdayToPlannerConverter represents a sophisticated data processing pipeline that transforms WPI's raw course data into a structured format suitable for academic planning. The key innovation is the section combination logic, which intelligently groups related course components (lectures, labs, discussions) into unified sections that students can register for.

The most complex aspect is the compatibility checking algorithm, which must consider both time conflicts and GPS cluster requirements. This ensures that combined sections represent valid course enrollment options that satisfy all academic constraints.

Any port to Python must preserve these critical algorithms while potentially improving performance and maintainability through modern data processing libraries and pipeline integration.