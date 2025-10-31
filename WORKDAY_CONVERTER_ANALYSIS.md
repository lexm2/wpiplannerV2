# Workday Planner Converter - Technical Analysis

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Data Model](#data-model)
4. [Configuration System](#configuration-system)
5. [Input Data Format](#input-data-format)
6. [Processing Pipeline](#processing-pipeline)
7. [Section Combination Algorithm](#section-combination-algorithm)
8. [Output Format](#output-format)
9. [Key Features](#key-features)
10. [Edge Cases & Special Handling](#edge-cases--special-handling)

---

## Overview

### Purpose
The **Workday Planner Converter** is a Java-based data transformation tool that serves as a critical bridge between WPI's Workday course management system and the WPI Planner web application. It ingests raw course schedule data from Workday and transforms it into a structured, optimized format that the planner application can consume efficiently.

### Core Functionality
- **Reads**: `course-data.json` (raw Workday feed)
- **Produces**: `course-data-constructed.json` (optimized planner format)
- **Transforms**: Flat course section data → Hierarchical department/course/section structure
- **Combines**: Related course components (lectures + labs + discussions)
- **Filters**: Invalid, canceled, and irrelevant course sections

### Technology Stack
- **Language**: Java
- **JSON Library**: org.json.simple (JSONParser, JSONObject, JSONArray)
- **Build System**: Eclipse project structure
- **I/O**: File-based (reads from `../public/course-data.json`, writes to `../public/course-data-constructed.json`)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Workday System                            │
│                  (External Data Source)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  course-data.json    │
            │  (Raw Workday Feed)  │
            └──────────┬───────────┘
                       │
                       ▼
        ┌──────────────────────────────────┐
        │      Converter.main()            │
        │  (Entry Point - Orchestrator)    │
        └──────────────┬───────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
  ┌─────────────┐           ┌──────────────┐
  │   jsonIN    │           │   Schedb     │
  │ (Reader &   │────────▶  │  (Data       │
  │  Processor) │           │   Model)     │
  └─────────────┘           └──────┬───────┘
                                   │
                                   ▼
                            ┌──────────────┐
                            │   jsonOUT    │
                            │  (Writer)    │
                            └──────┬───────┘
                                   │
                                   ▼
                 ┌──────────────────────────────────┐
                 │ course-data-constructed.json     │
                 │    (Optimized Planner Format)    │
                 └──────────────────────────────────┘
                                   │
                                   ▼
                         ┌──────────────────┐
                         │   WPI Planner    │
                         │  (Frontend App)  │
                         └──────────────────┘
```

### Component Overview

| Component | File | Responsibility |
|-----------|------|----------------|
| **Converter** | `Converter.java` | Main entry point; orchestrates the conversion process |
| **jsonIN** | `jsonIN.java` | Reads raw JSON, applies business logic, filters, transforms |
| **jsonOUT** | `jsonOUT.java` | Serializes processed data model to optimized JSON output |
| **Schedb** | `Schedb.java` | Root data container; holds all departments and metadata |
| **dept** | `dept.java` | Represents an academic department with courses |
| **course** | `course.java` | Represents a course with sections |
| **section** | `section.java` | Represents a course section with periods |
| **period** | `period.java` | Represents a specific meeting time (lecture/lab/discussion) |

---

## Data Model

### Class Hierarchy

```
Schedb (Root)
│
├── generated: String (timestamp)
├── minutesPerBlock: int (30)
└── departments: ArrayList<dept>
         │
         └── dept
              │
              ├── abbrev: String (e.g., "CS")
              ├── name: String (e.g., "Computer Science")
              └── courses: ArrayList<course>
                       │
                       └── course
                            │
                            ├── number: String (e.g., "1101")
                            ├── name: String (e.g., "Introduction to Program Design")
                            ├── courseDesc: String (HTML cleaned)
                            ├── minCredits: double
                            ├── maxCredits: double
                            └── sections: ArrayList<section>
                                     │
                                     └── section
                                          │
                                          ├── crn: long (Course Reference Number)
                                          ├── number: String (e.g., "A01" or "DL08/DD08/DX10")
                                          ├── seats: int
                                          ├── availableseats: long
                                          ├── maxWaitlist: int
                                          ├── actualWaitlist: long
                                          ├── term: String (e.g., "202201")
                                          ├── partOfTerm: String (e.g., "A Term, B Term")
                                          ├── computedTerm: String (e.g., "A", "B", "C", "D")
                                          ├── note: String (cluster ID, nullable)
                                          ├── description: String (section-specific)
                                          ├── isGPS: boolean
                                          ├── isInterestList: boolean
                                          └── periods: ArrayList<period>
                                                   │
                                                   └── period
                                                        │
                                                        ├── type: String ("Lecture", "Lab", "Discussion")
                                                        ├── professor: String
                                                        ├── monday/tuesday/wednesday/thursday/friday: boolean
                                                        ├── starts: Date
                                                        ├── ends: Date
                                                        ├── building: String
                                                        ├── room: String
                                                        ├── seats/availableseats: int/long
                                                        ├── maxWaitlist/actualWaitlist: int/long
                                                        └── specificSection: String
```

### Data Model Classes

#### 1. **Schedb** (Schedule Database Root)
**Location**: `Schedb.java:7-126`

```java
public class Schedb {
    private ArrayList<dept> departments;
    private String generated;           // Timestamp: "1:54 PM Oct 31, 2025"
    private int minutesPerBlock;        // Fixed at 30
}
```

**Initialization**:
- Pre-populates **64 departments** (AB, ACC, AE, AR, ARCH, ... WPE)
- Each department initialized with abbreviation and full name
- Generated timestamp set to current date/time
- Used as the central data container passed through the pipeline

#### 2. **dept** (Department)
**Location**: `dept.java:1-54`

```java
public class dept {
    private ArrayList<course> courses;
    private String abbrev;              // e.g., "CS"
    private String name;                // e.g., "Computer Science"
}
```

**Key Features**:
- Overrides `equals()` to compare by abbreviation only
- Supports dummy constructor `dept(String abbrev)` for lookup operations
- Used with `ArrayList.indexOf()` for efficient department matching

#### 3. **course** (Course)
**Location**: `course.java:1-80`

```java
public class course {
    private ArrayList<section> sections;
    private String number;              // e.g., "1101"
    private String name;                // e.g., "Intro to Program Design"
    private String courseDesc;          // HTML-sanitized description
    private double minCredits;
    private double maxCredits;
}
```

**Key Features**:
- Overrides `equals()` to compare by course number
- Credits stored as doubles to support variable credit courses
- Description sanitized to remove HTML tags and decode entities

#### 4. **section** (Course Section)
**Location**: `section.java:1-187`

```java
public class section {
    private ArrayList<period> periods;
    private long crn;                   // Unique identifier
    private String number;              // "A01" or combined "DL08/DD08/DX10"
    private int seats;
    private long availableseats;
    private int maxWaitlist;
    private long actualWaitlist;
    private String term;                // "202201"
    private String partOfTerm;          // "A Term, B Term"
    private String computedTerm;        // "A", "B", "C", or "D"
    private String note;                // Cluster ID (nullable)
    private boolean isGPS;
    private boolean isInterestList;
    private String description;
}
```

**Key Method**: `extractTermLetter(String sectionNumber)`
- Uses regex pattern `^([ABCD])` to extract term from section number
- Examples:
  - "A01" → "A"
  - "B02" → "B"
  - "DL08/DD08/DX10" → "D"
- Fallback: "A" if no match

#### 5. **period** (Meeting Time)
**Location**: `period.java:1-189`

```java
public class period {
    private String type;                // "Lecture", "Lab", "Discussion"
    private String professor;
    private boolean monday, tuesday, wednesday, thursday, friday;
    private Date starts;                // Parsed time (e.g., 9:00 AM)
    private Date ends;                  // Parsed time (e.g., 9:50 AM)
    private String building;            // Usually empty
    private String room;                // Full location string
    private int seats;
    private long availableseats;
    private int maxWaitlist;
    private long actualWaitlist;
    private String specificSection;     // Which section this period belongs to
}
```

**Key Features**:
- Day of week stored as 5 separate booleans
- Times stored as Java `Date` objects (time portion only)
- Professor email hardcoded to "look@it.up"
- Supports missing meeting patterns (defaults to 12:00 PM - 12:00 PM)

---

## Configuration System

### planner.properties
**Location**: `planner.properties`

The converter is configured via a Java properties file that defines academic year boundaries and special handling rules.

```properties
# Academic Period Configuration
FallYear=2025                    # Fall term year (A, B terms)
SpringYear=2026                  # Spring term year (C, D terms)

# UI Configuration
ShowOldLink=false                # Display link to previous year's schedule

# Special Courses (full section name displayed)
SpecialCourses=HU 3900,HU 3910,ID 2050,WPE 1099,WPE 1699

# Special Sections (identified by substrings)
SpecialSections=GPS:,- ST:,- ST: -,- SP:,- AT:,- Topics In,History:,In Psychological Science:

# Section Number Appendices (for parsing)
SectionNumberAppendicies=-Quiz,-Multipurpose,-Y,-ACL
```

### Configuration Usage

#### 1. **Academic Period Validation** (`jsonIN.java:84-97`)
```java
public boolean isValidAcademicPeriod(String period, String section, String type) {
    // Valid periods:
    // - {FallYear} Fall A Term
    // - {FallYear} Fall B Term
    // - {SpringYear} Spring C Term
    // - {SpringYear} Spring D Term
    // - {FallYear} Fall Semester
    // - {SpringYear} Spring Semester

    // EXCEPTION: Interest List sections with non-Lecture types are excluded
}
```

**Example**: If `FallYear=2025`, only "2025 Fall A Term" and "2025 Fall B Term" are valid fall periods.

#### 2. **Special Course Detection** (`jsonIN.java:100-112`)

```java
// Checks if course is in SpecialCourses list
public boolean checkSpecialCourse(String subject, String number) {
    String courseSubjectAndNumber = subject + " " + number;
    return Arrays.stream(specialCourses).anyMatch(courseSubjectAndNumber::contains);
}

// Checks if section name contains any SpecialSections substring
public boolean checkSpecialSection(String sectionNameFull) {
    return Arrays.stream(specialSections).anyMatch(sectionNameFull::contains);
}
```

**Impact**: Special courses/sections:
- Display full section name (not truncated to section number)
- Use `Course_Description` instead of `Course_Section_Description`
- Set `isGPS` flag to true
- Prevent automatic combination with other sections unless in same cluster

#### 3. **Section Number Parsing** (`jsonIN.java:110-112`)

```java
public boolean checkSectionNumberAppendicies(String sectionNameFull) {
    return Arrays.stream(sectionNumberAppendicies).anyMatch(sectionNameFull::contains);
}
```

**Example**:
- Input: "AB 1531-A01-Quiz"
- Detected appendix: "-Quiz"
- Parsed section: "A01" (truncated before second dash)

---

## Input Data Format

### Workday JSON Structure

**File**: `course-data.json` (11.7 MB, ~3000+ course sections)

```json
{
  "Report_Entry": [
    {
      "Academic_Level": "Undergraduate",
      "Academic_Units": "Humanities and Arts Department",
      "Academic_Year": "2025 - 2026 Academic Year",
      "Course_Description": "<p>Cat. I</p><p>This course introduces...</p>",
      "Course_Section": "AB 1531-A01 - Elementary Arabic I",
      "Course_Section_Description": "<p>Cat. IAn intensive course...</p>",
      "Course_Section_End_Date": "2025-10-10",
      "Course_Section_Owner": "Humanities and Arts Department",
      "Course_Section_Start_Date": "2025-08-21",
      "Course_Tags": "Degree Attribute :: Humanities and Arts; Offering Pattern :: Category I",
      "Course_Title": "AB 1531 - Elementary Arabic I",
      "Credits": "3",
      "Delivery_Mode": "In-Person",
      "Enrolled_Capacity": "26/25",
      "Instructional_Format": "Lecture",
      "Instructors": "Mohammed El Hamzaoui",
      "Locations": "Fuller Labs 311",
      "Meeting_Day_Patterns": "M-T-R-F",
      "Meeting_Patterns": "M-T-R-F | 9:00 AM - 9:50 AM",
      "Offering_Period": "2025 Fall A Term",
      "Section_Details": "Fuller Labs 311 | M-T-R-F | 9:00 AM - 9:50 AM",
      "Section_Status": "Open",
      "Starting_Academic_Period_Type": "A Term",
      "Subject": "Arabic",
      "Waitlist_Waitlist_Capacity": "0/9",
      "cour_sec_def_referenceID": "COURSE_SECTION_DEFINITION-3-334531",
      "CF_LRV_Cluster_Ref_ID": ""
    },
    ...
  ]
}
```

### Key Fields

| Field | Purpose | Example |
|-------|---------|---------|
| `Course_Section` | Full section identifier | "CS 1101-A01 - Intro to Program Design" |
| `Course_Title` | Course identifier without section | "CS 1101 - Intro to Program Design" |
| `Course_Description` | General course description (HTML) | `<p>This course introduces...</p>` |
| `Course_Section_Description` | Section-specific description (HTML) | `<p>Lab section meets...</p>` |
| `Offering_Period` | Full period with year | "2025 Fall A Term" |
| `Starting_Academic_Period_Type` | Term only | "A Term", "Fall", "Spring" |
| `Instructional_Format` | Component type | "Lecture", "Laboratory", "Discussion" |
| `Section_Details` | Pipe-separated meeting info | "Fuller Labs 311 \| M-T-R-F \| 9:00 AM - 9:50 AM" |
| `Enrolled_Capacity` | Enrollment/capacity | "26/25" |
| `Waitlist_Waitlist_Capacity` | Waitlist actual/max | "0/9" |
| `Section_Status` | Registration status | "Open", "Waitlist", "Canceled: Preliminary" |
| `cour_sec_def_referenceID` | Unique section ID | "COURSE_SECTION_DEFINITION-3-334531" |
| `CF_LRV_Cluster_Ref_ID` | Cluster identifier (optional) | "CLUSTER-123" or "" |

### Section_Details Format

**Pattern**: `{location} | {days} | {time}`

**Multiple Meetings**: Separated by semicolons
```
"Fuller Labs 311 | M-T-R-F | 9:00 AM - 9:50 AM; Unity Hall 520 | W | 2:00 PM - 2:50 PM"
```

**Days Encoding**:
- M = Monday
- T = Tuesday
- W = Wednesday
- R = Thursday (R for "thuRsday")
- F = Friday

**Missing Data Cases**:
- No location: Uses "Unknown"
- No meeting pattern: Defaults to 12:00 PM - 12:00 PM

---

## Processing Pipeline

### Main Flow (`Converter.java:5-21`)

```java
public static void main(String[] args) {
    Schedb schedb = new Schedb();          // 1. Initialize data model
    jsonIN jsonIn = new jsonIN();          // 2. Create input processor
    jsonIn.readJSON(schedb);               // 3. Read and process input
    jsonOUT jsonOut = new jsonOUT();       // 4. Create output serializer
    jsonOut.exportJSON(schedb);            // 5. Write output
}
```

### Detailed Processing Steps

#### Phase 1: Initialization (`jsonIN.java:35-56`)

```java
public void readJSON(Schedb schedb) {
    JSONParser jsonParser = new JSONParser();

    // Read from ../public/course-data.json
    BufferedReader reader = new BufferedReader(
        new InputStreamReader(new FileInputStream("../public/course-data.json"), "UTF-8")
    );

    Object obj = jsonParser.parse(reader);
    JSONObject reportEntry = (JSONObject) obj;
    JSONArray courseList = (JSONArray) reportEntry.get("Report_Entry");

    readProperties();                       // Load planner.properties
    processJSON(courseList, schedb);        // Main processing
}
```

#### Phase 2: Pre-filtering (`jsonIN.java:116-123`)

```java
// Remove all "Canceled: Preliminary" sections
for (int i = courseList.size() - 1; i >= 0; i--) {
    JSONObject currSection = (JSONObject) courseList.get(i);
    String sectionStatus = (String) currSection.get("Section_Status");
    if(sectionStatus.equals("Canceled: Preliminary")) {
        courseList.remove(i);
    }
}
```

**Why reverse iteration?** Removing items while iterating forward causes index shifts and skipped elements.

#### Phase 3: Main Processing Loop (`jsonIN.java:125-583`)

**High-level algorithm**:

```
index = 0
while index < courseList.size():
    currSection = courseList[index]

    // Skip invalid sections
    if not isValidAcademicPeriod(currSection):
        index++
        continue

    // On first valid section, write academic year to yearHeader.txt
    if not yearFound:
        writeYearHeader(currSection["Academic_Year"])
        yearFound = true

    // Group all sections of same course in same term
    allSectionsThisCourseTerm = [currSection]
    findOthersAddition = 1

    while index + findOthersAddition < courseList.size():
        nextSection = courseList[index + findOthersAddition]

        if sameCourseSameTermAs(nextSection, currSection):
            allSectionsThisCourseTerm.add(nextSection)
            findOthersAddition++
        else:
            break

    // Process this group
    processCourseTermGroup(allSectionsThisCourseTerm, schedb)

    index += findOthersAddition
```

**Key insight**: The input data is pre-sorted by course and term, allowing efficient grouping.

#### Phase 4: Course/Section Creation (`jsonIN.java:208-273`)

**For each course group**:

1. **Find or create department** (`jsonIN.java:208-225`)
```java
String currSecDept = currSectionCourseSection.substring(0, currSectionCourseSection.indexOf(" "));
dept dummyDept = new dept(currSecDept);
int subjectIndexInDepartments = departments.indexOf(dummyDept);

dept department = null;
try {
    department = departments.get(subjectIndexInDepartments);
} catch(Exception e) {
    // Unknown department → assign to "OT" (Other)
    dept dummyOther = new dept("OT");
    int indexOther = departments.indexOf(dummyOther);
    department = departments.get(indexOther);
}
```

2. **Extract course metadata** (`jsonIN.java:228-267`)
```java
// Parse: "CS 1101-A01 - Intro" → number = "1101", name = "Intro"
String courseNum = currSectionCourseSubjNum.substring(
    currSectionCourseSubjNum.indexOf(" ") + 1,
    currSectionCourseSubjNum.length()
);

String courseTitleFull = (String) currSection.get("Course_Title");
String courseName = courseTitleFull.substring(
    courseTitleFull.indexOf("-") + 2,
    courseTitleFull.length()
);

// Special courses use Course_Description, others use Course_Section_Description
boolean isSTCourse = checkSpecialCourse(department.getAbbrev(), courseNum)
                  || checkSpecialSection(currSectionCourseSection);

String courseDescRaw = isSTCourse
    ? (String) currSection.get("Course_Description")
    : (String) currSection.get("Course_Section_Description");

// Sanitize HTML
String courseDesc = courseDescRaw
    .replaceAll("\\<[^>]*>", " ")       // Remove tags
    .replace("&amp;", "&")
    .replace("&#39;", "'")
    .replace("&#43;", "+")
    .replace("&#34;", "\"");

double courseCredits = Double.parseDouble((String)currSection.get("Credits"));

course newCourse = new course(courseNum, courseName, courseDesc, courseCredits);
```

3. **Find or create course in department** (`jsonIN.java:269-273`)
```java
if(department.getCourses().contains(newCourse)) {
    // Course already exists, get existing reference
    newCourse = department.getCourses().get(department.getCourses().indexOf(newCourse));
} else {
    department.getCourses().add(newCourse);
}
```

#### Phase 5: Section/Period Creation (`jsonIN.java:276-519`)

**For each section in the course term group**:

1. **Parse section number** (`jsonIN.java:286-356`)
```java
String thisCourseSectionFull = (String) thisSection.get("Course_Section");
String thisSectionNum;

// Check for special appendices (e.g., "-Quiz")
if(checkSectionNumberAppendicies(thisCourseSectionFull)) {
    // Extract: "CS 1101-A01-Quiz" → "A01"
    thisSectionNum = thisCourseSectionFull.substring(
        thisCourseSectionFull.indexOf("-") + 1,
        thisCourseSectionFull.indexOf("-", thisCourseSectionFull.indexOf("-") + 6) - 1
    );
}
// Check if special section (GPS, Special Topics)
else if(checkSpecialSection(thisCourseSectionFull) || checkSpecialCourse(currSecDept, courseNum)) {
    // Keep full name: "GPS: Data Science" or "ST: Machine Learning"
    thisSectionNum = thisCourseSectionFull.substring(thisCourseSectionFull.indexOf("-") + 1);
    isGPSorST = true;
}
// Check if interest list
else if(thisCourseSectionFull.contains("Interest List")) {
    thisSectionNum = "Interest List-" + term;
    thisProfessor = "N/A";
    isInterestList = true;
}
// Standard section
else {
    // Extract: "CS 1101-A01 - Intro" → "A01"
    thisSectionNum = thisCourseSectionFull.substring(
        thisCourseSectionFull.indexOf("-") + 1,
        thisCourseSectionFull.indexOf("-", thisCourseSectionFull.indexOf("-") + 1) - 1
    );
}

// Remove parenthetical suffixes: "A01 (Honors)" → "A01"
if(thisSectionNum.contains("(")) {
    thisSectionNum = thisSectionNum.substring(0, thisSectionNum.indexOf("(") - 1);
}
```

2. **Extract enrollment data** (`jsonIN.java:358-367`)
```java
String enrolledCapacityString = (String) thisSection.get("Enrolled_Capacity");
int enrolled = Integer.parseInt(enrolledCapacityString.substring(0, enrolledCapacityString.indexOf("/")));
int capacity = Integer.parseInt(enrolledCapacityString.substring(enrolledCapacityString.indexOf("/") + 1));
int availableSeats = capacity - enrolled;

String WaitlistCapacityString = (String) thisSection.get("Waitlist_Waitlist_Capacity");
int waitlistActual = Integer.parseInt(WaitlistCapacityString.substring(0, WaitlistCapacityString.indexOf("/")));
int waitlistTotal = Integer.parseInt(WaitlistCapacityString.substring(WaitlistCapacityString.indexOf("/") + 1));
```

3. **Extract CRN** (`jsonIN.java:382-384`)
```java
// "COURSE_SECTION_DEFINITION-3-334531" → 334531
String crnString = (String) thisSection.get("cour_sec_def_referenceID");
long crn = Long.parseLong(crnString.substring(28, 34));
```

4. **Create section with cluster info** (`jsonIN.java:386-400`)
```java
section newSection;
if(isInterestList) {
    newSection = new section(crn, thisSectionNum, capacity, availableSeats,
                            waitlistTotal, waitlistActual, "202201", termActual,
                            "IntList", secCourseDesc);
}
else if(thisSection.get("CF_LRV_Cluster_Ref_ID") == null ||
        thisSection.get("CF_LRV_Cluster_Ref_ID").equals("")) {
    // No cluster
    newSection = new section(crn, thisSectionNum, capacity, availableSeats,
                            waitlistTotal, waitlistActual, "202201", termActual,
                            secCourseDesc);
} else {
    // Has cluster
    String clusterID = (String) thisSection.get("CF_LRV_Cluster_Ref_ID");
    newSection = new section(crn, thisSectionNum, capacity, availableSeats,
                            waitlistTotal, waitlistActual, "202201", termActual,
                            clusterID, secCourseDesc);
}

newSection.setGPS(isGPSorST);
newSection.setInterestList(isInterestList);
```

5. **Parse meeting times and create periods** (`jsonIN.java:422-503`)
```java
String allPeriodsString = (String) thisSection.get("Section_Details");
if (allPeriodsString == null || allPeriodsString.equals("")) {
    allPeriodsString = "Unknown|";
}

// Split multiple meeting times: "Location1 | Days1 | Time1; Location2 | Days2 | Time2"
String[] allPeriods = allPeriodsString.split(";");

for (String period : allPeriods) {
    String[] periodDetails = period.split("\\|");  // [location, days, time]

    // Handle missing location
    if(periodDetails.length == 2) {
        periodDetails = new String[]{"Unknown", periodDetails[0], periodDetails[1]};
    }

    String thisLocation = periodDetails[0];

    // Parse days (if available)
    boolean monday = false, tuesday = false, wednesday = false, thursday = false, friday = false;
    if(periodDetails.length > 1) {
        String days = periodDetails[1];
        if (days.contains("M")) monday = true;
        if (days.contains("T")) tuesday = true;
        if (days.contains("W")) wednesday = true;
        if (days.contains("R")) thursday = true;
        if (days.contains("F")) friday = true;
    }

    // Parse times (if available)
    Date startTime, endTime;
    if(periodDetails.length > 1) {
        // "9:00 AM - 9:50 AM" → starts = 9:00 AM, ends = 9:50 AM
        String startTimeString = periodDetails[2].substring(1, periodDetails[2].indexOf("-") - 1);
        startTime = new SimpleDateFormat("hh:mm aa").parse(startTimeString);

        String endTimeString = periodDetails[2].substring(periodDetails[2].indexOf("-") + 2);
        endTime = new SimpleDateFormat("hh:mm aa").parse(endTimeString);
    } else {
        // Default: 12:00 PM - 12:00 PM
        startTime = new SimpleDateFormat("hh:mm aa").parse("12:00 PM");
        endTime = new SimpleDateFormat("hh:mm aa").parse("12:00 PM");
    }

    period newPeriod = new period(plannerType, thisProfessor, monday, tuesday, wednesday,
                                  thursday, friday, startTime, endTime, thisLocation,
                                  capacity, availableSeats, waitlistTotal, waitlistActual,
                                  thisSectionNum);
    newSection.getPeriods().add(newPeriod);
}
```

6. **Categorize sections by type** (`jsonIN.java:507-518`)
```java
String plannerType = workdayType.equals("Laboratory") ? "Lab" : workdayType;

if(plannerType.equals("Lecture")) {
    lectures.add(newSection);
}
else if(plannerType.equals("Discussion")) {
    discussions.add(newSection);
}
else if(plannerType.equals("Lab")) {
    labs.add(newSection);
} else {
    // Other types (Seminar, etc.) added directly without combination
    newCourse.getSections().add(newSection);
}
```

---

## Section Combination Algorithm

### Overview

One of the most sophisticated features of the converter is **automatic section combination**. Many WPI courses require students to enroll in multiple components (e.g., a lecture + a lab). The converter intelligently combines compatible sections into single entries.

### Combination Rules

**Sections can be combined if**:
1. They belong to the same course
2. They are in the same term
3. Their meeting times don't conflict
4. They satisfy cluster requirements (if any)

### Algorithm (`jsonIN.java:521-575`)

```java
// After processing all sections of a course term group, combine them

if(!lectures.isEmpty() && labs.isEmpty() && discussions.isEmpty()) {
    // Case 1: Only lectures → Add all individually
    for (section lecture : lectures) {
        newCourse.getSections().add(lecture);
    }
}
else if(lectures.isEmpty() && !labs.isEmpty()) {
    // Case 2: Only labs (some courses like labs-only) → Add all individually
    for (section lab : labs) {
        newCourse.getSections().add(lab);
    }
}
else {
    // Case 3: Mix of lecture/lab/discussion → Combine compatible sections
    for (section lecture : lectures) {
        // Exception: GPS sections without clusters, or Interest Lists → Don't combine
        if((lecture.isGPS() && lecture.getNote()==null) || lecture.isInterestList()) {
            newCourse.getSections().add(lecture);
        }
        else {
            if(!discussions.isEmpty()) {
                // Lectures + Discussions (+ possibly Labs)
                for (section discussion : discussions) {
                    if(!labs.isEmpty()) {
                        // Lectures + Discussions + Labs
                        for (section lab : labs) {
                            ArrayList<section> sections = new ArrayList<>();
                            sections.add(lecture);
                            sections.add(discussion);
                            sections.add(lab);

                            if(conflictChecker(sections)) {
                                section combined = combiner(sections);
                                newCourse.getSections().add(combined);
                            }
                        }
                    } else {
                        // Lectures + Discussions only
                        ArrayList<section> sections = new ArrayList<>();
                        sections.add(lecture);
                        sections.add(discussion);

                        if(conflictChecker(sections)) {
                            section combined = combiner(sections);
                            newCourse.getSections().add(combined);
                        }
                    }
                }
            } else {
                // Lectures + Labs only
                for (section lab : labs) {
                    ArrayList<section> sections = new ArrayList<>();
                    sections.add(lecture);
                    sections.add(lab);

                    if(conflictChecker(sections)) {
                        section combined = combiner(sections);
                        newCourse.getSections().add(combined);
                    }
                }
            }
        }
    }
}
```

### Conflict Checker (`jsonIN.java:659-718`)

**Purpose**: Determines if sections can be combined without conflicts

**Algorithm**:

```java
public boolean conflictChecker(ArrayList<section> sections) {
    // PART 1: Check cluster compatibility
    boolean goodCluster = true;
    String cluster = "";
    boolean isGPS = sections.get(0).isGPS();

    if(isGPS) {
        // GPS courses: ALL sections MUST be in the same cluster
        if(sections.get(0).getNote() != null) {
            cluster = sections.get(0).getNote();
        }
        for(int i = 1; i < sections.size(); i++) {
            String thisCluster = sections.get(i).getNote();
            if(thisCluster == null || !thisCluster.equals(cluster)) {
                goodCluster = false;
            }
        }
    } else {
        // Non-GPS courses: Sections with clusters must match, but null clusters OK
        for (section section : sections) {
            if (section.getNote() != null) {
                if(cluster.isEmpty()) {
                    cluster = section.getNote();
                } else {
                    if(!(cluster.equals(section.getNote()))) {
                        goodCluster = false;
                    }
                }
            }
        }
    }

    // PART 2: Check time conflicts
    boolean goodTimes = true;

    if (sections.size() == 2) {
        period period1 = sections.get(0).getPeriods().get(0);
        period period2 = sections.get(1).getPeriods().get(0);
        goodTimes = periodConflictChecker(period1, period2);
    } else if(sections.size() == 3) {
        period period1 = sections.get(0).getPeriods().get(0);
        period period2 = sections.get(1).getPeriods().get(0);
        period period3 = sections.get(2).getPeriods().get(0);

        // Check all pairs
        goodTimes = periodConflictChecker(period1, period2) &&
                    periodConflictChecker(period1, period3) &&
                    periodConflictChecker(period2, period3);
    }

    return goodCluster && goodTimes;
}
```

### Period Conflict Checker (`jsonIN.java:720-746`)

**Purpose**: Checks if two periods have overlapping meeting times

**Algorithm**:

```java
public boolean periodConflictChecker(period period1, period period2) {
    boolean result = true;

    // Check if times overlap
    boolean timeOverlap = period2.getStarts().compareTo(period1.getEnds()) < 0 &&
                         period2.getEnds().compareTo(period1.getStarts()) > 0;

    // If times overlap, check if they share any days
    if(timeOverlap) {
        if(period1.isMonday() && period2.isMonday()) result = false;
        if(period1.isTuesday() && period2.isTuesday()) result = false;
        if(period1.isWednesday() && period2.isWednesday()) result = false;
        if(period1.isThursday() && period2.isThursday()) result = false;
        if(period1.isFriday() && period2.isFriday()) result = false;
    }

    return result;  // true = no conflict, false = conflict
}
```

**Example**:
- Period 1: Mon/Wed 9:00-10:00
- Period 2: Mon/Fri 9:30-10:30
- Time overlap? Yes (9:30-10:00)
- Shared days? Yes (Monday)
- **Result**: Conflict (return false)

### Combiner (`jsonIN.java:588-657`)

**Purpose**: Merges multiple sections into a single combined section

**Algorithm**:

```java
public section combiner(ArrayList<section> sections) {
    // 1. Generate combined CRN by concatenating all CRNs
    String crnString = "";
    for (int i = 0; i < sections.size(); i++) {
        crnString = crnString + Long.toString(sections.get(i).getCrn());
    }
    long crn = Long.parseLong(crnString);

    // 2. Build combined section number: "L01/D01/X01"
    String number = "";
    for(int i = 0; i < sections.size() - 1; i++) {
        section section = sections.get(i);

        // For GPS sections (except last), truncate to base number
        String secNumber = "";
        if(section.isGPS()) {
            secNumber = section.getNumber().substring(0, section.getNumber().indexOf("-") - 1);
        } else {
            secNumber = section.getNumber();
        }

        number = number + secNumber + "/";
    }
    number = number + sections.get(sections.size()-1).getNumber();  // Last one with full name

    // 3. Take minimum seats across all components (bottleneck)
    int seats = 10000;
    for (section section: sections) {
        if(section.getSeats() < seats) {
            seats = section.getSeats();
        }
    }

    long availableSeats = 10000;
    for (section section: sections) {
        if(section.getAvailableseats() < availableSeats) {
            availableSeats = section.getAvailableseats();
        }
    }

    int maxWaitlist = 10000;
    for (section section: sections) {
        if(section.getMaxWaitlist() < maxWaitlist) {
            maxWaitlist = section.getMaxWaitlist();
        }
    }

    long actualWaitlist = 10000;
    for (section section: sections) {
        if(section.getActualWaitlist() < actualWaitlist) {
            actualWaitlist = section.getActualWaitlist();
        }
    }

    String term = sections.get(0).getTerm();
    String partOfTerm = sections.get(0).getPartOfTerm();
    String description = sections.get(0).getDescription();

    // 4. Create combined section
    section result = new section(crn, number, seats, availableSeats, maxWaitlist,
                                actualWaitlist, term, partOfTerm, description);

    // 5. Add all periods from all sections
    for (section section : sections) {
        ArrayList<period> thisSectionPeriods = section.getPeriods();
        for (period period : thisSectionPeriods) {
            result.getPeriods().add(period);
        }
    }

    return result;
}
```

**Example**:
- Input: [Lecture A01 (CRN: 12345), Lab X01 (CRN: 67890)]
- Output: Combined section
  - CRN: 1234567890
  - Number: "A01/X01"
  - Seats: min(lecture seats, lab seats)
  - Periods: [lecture period, lab period]

---

## Output Format

### Planner JSON Structure

**File**: `course-data-constructed.json` (8.9 MB)

```json
{
  "generated": "1:54 PM Oct 31, 2025",
  "departments": [
    {
      "abbreviation": "CS",
      "name": "Computer Science",
      "courses": [
        {
          "id": "CS-1101",
          "number": "1101",
          "name": "Introduction to Program Design",
          "description": "This course introduces students...",
          "min_credits": 3.0,
          "max_credits": 3.0,
          "sections": [
            {
              "crn": 334531,
              "number": "A01",
              "seats": 25,
              "seats_available": 12,
              "actual_waitlist": 0,
              "max_waitlist": 9,
              "note": null,
              "description": "Section-specific description...",
              "term": "202201",
              "computedTerm": "A",
              "is_gps": false,
              "is_interest_list": false,
              "periods": [
                {
                  "type": "Lecture",
                  "professor": "John Smith",
                  "start_time": "09:00",
                  "end_time": "09:50",
                  "location": "Fuller Labs 311 ",
                  "building": "",
                  "room": "Fuller Labs 311 ",
                  "seats": 25,
                  "seats_available": 12,
                  "actual_waitlist": 0,
                  "max_waitlist": 9,
                  "specific_section": "A01",
                  "days": ["mon", "tue", "thu", "fri"]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Serialization Process (`jsonOUT.java:16-120`)

```java
public void exportJSON(Schedb schedb) {
    JSONObject root = new JSONObject();
    JSONArray departmentsArray = new JSONArray();

    root.put("generated", schedb.getGenerated());

    // Iterate through departments
    for (dept department : schedb.getDepartments()) {
        JSONObject deptObj = new JSONObject();
        deptObj.put("abbreviation", department.getAbbrev());
        deptObj.put("name", department.getName());

        JSONArray coursesArray = new JSONArray();

        // Iterate through courses
        for (course thisCourse : department.getCourses()) {
            JSONObject courseObj = new JSONObject();
            courseObj.put("id", department.getAbbrev() + "-" + thisCourse.getNumber());
            courseObj.put("number", thisCourse.getNumber());
            courseObj.put("name", thisCourse.getName());
            courseObj.put("description", thisCourse.getCourseDesc());
            courseObj.put("min_credits", thisCourse.getMinCredits());
            courseObj.put("max_credits", thisCourse.getMaxCredits());

            JSONArray sectionsArray = new JSONArray();

            // Iterate through sections
            for (section thisSection : thisCourse.getSections()) {
                JSONObject sectionObj = new JSONObject();
                sectionObj.put("crn", thisSection.getCrn());
                sectionObj.put("number", thisSection.getNumber());
                sectionObj.put("seats", thisSection.getSeats());
                sectionObj.put("seats_available", thisSection.getAvailableseats());
                sectionObj.put("actual_waitlist", thisSection.getActualWaitlist());
                sectionObj.put("max_waitlist", thisSection.getMaxWaitlist());
                sectionObj.put("note", thisSection.getNote());
                sectionObj.put("description", thisSection.getDescription());
                sectionObj.put("term", thisSection.getTerm());
                sectionObj.put("computedTerm", thisSection.getComputedTerm());
                sectionObj.put("is_gps", false);
                sectionObj.put("is_interest_list", false);

                JSONArray periodsArray = new JSONArray();

                // Iterate through periods
                for (period thisPeriod : thisSection.getPeriods()) {
                    JSONObject periodObj = new JSONObject();
                    periodObj.put("type", thisPeriod.getType());
                    periodObj.put("professor", thisPeriod.getProfessor());

                    // Convert Date to HH:mm format
                    DateFormat timeFormat = new SimpleDateFormat("HH:mm");
                    periodObj.put("start_time", timeFormat.format(thisPeriod.getStarts()));
                    periodObj.put("end_time", timeFormat.format(thisPeriod.getEnds()));

                    periodObj.put("location", thisPeriod.getBuilding() + " " + thisPeriod.getRoom());
                    periodObj.put("building", thisPeriod.getBuilding());
                    periodObj.put("room", thisPeriod.getRoom());
                    periodObj.put("seats", thisPeriod.getSeats());
                    periodObj.put("seats_available", thisPeriod.getAvailableseats());
                    periodObj.put("actual_waitlist", thisPeriod.getActualWaitlist());
                    periodObj.put("max_waitlist", thisPeriod.getMaxWaitlist());
                    periodObj.put("specific_section", thisPeriod.getSpecificSection());

                    // Convert boolean days to array
                    JSONArray daysArray = new JSONArray();
                    if(thisPeriod.isMonday()) daysArray.add("mon");
                    if(thisPeriod.isTuesday()) daysArray.add("tue");
                    if(thisPeriod.isWednesday()) daysArray.add("wed");
                    if(thisPeriod.isThursday()) daysArray.add("thu");
                    if(thisPeriod.isFriday()) daysArray.add("fri");

                    periodObj.put("days", daysArray);
                    periodsArray.add(periodObj);
                }

                sectionObj.put("periods", periodsArray);
                sectionsArray.add(sectionObj);
            }

            courseObj.put("sections", sectionsArray);
            coursesArray.add(courseObj);
        }

        deptObj.put("courses", coursesArray);
        departmentsArray.add(deptObj);
    }

    root.put("departments", departmentsArray);

    // Write to file
    try (FileWriter file = new FileWriter("../public/course-data-constructed.json")) {
        file.write(root.toJSONString());
        file.flush();
    }
}
```

### Key Transformations

| Input (Workday) | Output (Planner) | Transformation |
|----------------|------------------|----------------|
| `Course_Section`: "CS 1101-A01" | `number`: "A01" | Extract section number after first dash |
| `Section_Details`: "Fuller 311 \| M-T-R-F \| 9:00 AM" | `days`: ["mon","tue","thu","fri"] | Parse day codes, expand to full names |
| `Section_Details`: "9:00 AM - 9:50 AM" | `start_time`: "09:00", `end_time`: "09:50" | Parse times, format as 24-hour |
| `cour_sec_def_referenceID`: "COURSE_SECTION_DEFINITION-3-334531" | `crn`: 334531 | Extract last 6 digits |
| `Instructional_Format`: "Laboratory" | `type`: "Lab" | Normalize to "Lab" |
| `Enrolled_Capacity`: "26/25" | `seats`: 25, `seats_available`: -1 | Parse and calculate |
| Multiple sections | Combined CRN | Concatenate CRNs: 12345 + 67890 = 1234567890 |

---

## Key Features

### 1. HTML Sanitization (`jsonIN.java:256-263`)

**Problem**: Workday descriptions contain HTML markup
```html
<p>This course introduces <b>programming</b> concepts...</p>
<p>&amp; covers data structures &amp; algorithms</p>
```

**Solution**: Strip tags and decode entities
```java
String courseDesc = courseDescRaw
    .replaceAll("\\<[^>]*>", " ")       // Remove all HTML tags
    .replace("&amp;", "&")              // Decode &
    .replace("&#39;", "'")              // Decode '
    .replace("&#43;", "+")              // Decode +
    .replace("&#34;", "\"");            // Decode "
```

**Result**: Clean text suitable for display

### 2. Term Letter Extraction (`section.java:170-184`)

**Problem**: Different section number formats encode term information
- "A01" → A Term
- "B02" → B Term
- "DL08/DD08/DX10" → D Term (combined section)

**Solution**: Regex-based extraction
```java
public static String extractTermLetter(String sectionNumber) {
    Pattern pattern = Pattern.compile("^([ABCD])", Pattern.CASE_INSENSITIVE);
    Matcher matcher = pattern.matcher(sectionNumber);

    if (matcher.find()) {
        return matcher.group(1).toUpperCase();
    }

    return "A"; // fallback
}
```

**Output field**: `computedTerm` (used by frontend for filtering)

### 3. Academic Year Header (`jsonIN.java:155-168`)

**Purpose**: Write academic year info to separate file for frontend

**File**: `yearHeader.txt`
```
2025 - 2026 Academic Year
false
```

**Usage**:
- Line 1: Academic year string (displayed in UI)
- Line 2: Show old link flag (boolean)

### 4. Department Fallback (`jsonIN.java:221-225`)

**Problem**: Some courses have unknown/invalid department codes

**Solution**: Assign to "OT" (Other) department
```java
try {
    department = departments.get(subjectIndexInDepartments);
} catch(Exception e) {
    dept dummyOther = new dept("OT");
    int indexOther = departments.indexOf(dummyOther);
    department = departments.get(indexOther);
}
```

**Result**: No courses are lost due to invalid department codes

### 5. Cluster-Based Section Grouping

**Purpose**: Some courses require students to enroll in pre-matched sections

**Example**: A lab-based course might have:
- Lecture L01 (Cluster A)
- Lecture L02 (Cluster B)
- Lab X01 (Cluster A)
- Lab X02 (Cluster B)

**Constraint**: Students in L01 must take X01, students in L02 must take X02

**Implementation**:
- Workday provides `CF_LRV_Cluster_Ref_ID` field
- Stored in `section.note`
- `conflictChecker()` enforces cluster compatibility
- Prevents invalid combinations like L01/X02

### 6. GPS Course Handling

**GPS** = Graduate Project Sponsorship (special course type at WPI)

**Characteristics**:
- Section names include topic: "GPS: Machine Learning"
- Cannot be combined across topics
- Must preserve full section name (not truncated)
- Use `Course_Description` instead of `Course_Section_Description`

**Implementation**:
```java
if(checkSpecialSection(thisCourseSectionFull) || checkSpecialCourse(currSecDept, courseNum)) {
    thisSectionNum = thisCourseSectionFull.substring(thisCourseSectionFull.indexOf("-") + 1);
    isGPSorST = true;
}
newSection.setGPS(isGPSorST);

// During combination
if((lecture.isGPS() && lecture.getNote()==null) || lecture.isInterestList()) {
    newCourse.getSections().add(lecture);  // Don't combine
}
```

### 7. Interest List Sections

**Purpose**: Placeholder sections for courses under consideration

**Characteristics**:
- Named "Interest List-{Term}"
- Professor: "N/A"
- No enrollment limits
- Never combined with other sections

**Implementation**:
```java
if(thisCourseSectionFull.contains("Interest List")) {
    thisSectionNum = "Interest List-" + term;
    thisProfessor = "N/A";
    isInterestList = true;
}
newSection.setInterestList(isInterestList);

// Special cluster identifier
section newSection = new section(..., "IntList", ...);
```

### 8. Semester Course Handling

**Problem**: Some courses run full semester (not 7-week term)

**Input**: `Starting_Academic_Period_Type`: "Fall" or "Spring"

**Transformation** (`jsonIN.java:319-327`):
```java
String term = (String) thisSection.get("Starting_Academic_Period_Type");
String termActual;
if(term.equals("Fall")) {
    termActual = "A Term, B Term";
} else if(term.equals("Spring")) {
    termActual = "C Term, D Term";
} else {
    termActual = term;  // "A Term", "B Term", etc.
}
```

**Result**: Frontend can display "Full Fall Semester" courses appropriately

---

## Edge Cases & Special Handling

### 1. Missing Meeting Patterns

**Scenario**: Some sections have location but no meeting times
```json
"Section_Details": "Fuller Labs 311"
```

**Handling** (`jsonIN.java:433-438`):
```java
if(periodDetails.length == 2) {
    String[] periodDetailsNew = new String[3];
    periodDetailsNew[2] = periodDetails[1];
    periodDetailsNew[1] = periodDetails[0];
    periodDetailsNew[0] = "Unknown";
    periodDetails = periodDetailsNew;
}
```

**Result**: Creates period with "Unknown" location and empty meeting pattern

### 2. No Section Details At All

**Scenario**: Section has no `Section_Details` field
```json
"Section_Details": null
```

**Handling** (`jsonIN.java:424-428`):
```java
String allPeriodsString = (String) thisSection.get("Section_Details");
if (allPeriodsString == null || allPeriodsString.equals("")) {
    allPeriodsString = "Unknown|";
}
```

**Result**: Creates default period with no meeting times (12:00 PM - 12:00 PM)

### 3. Over-Enrollment

**Scenario**: More students enrolled than capacity
```json
"Enrolled_Capacity": "26/25"
```

**Calculation**:
```java
int availableSeats = capacity - enrolled;  // 25 - 26 = -1
```

**Result**: Negative available seats (correctly indicates over-enrollment)

### 4. Multiple Meeting Locations

**Scenario**: Section meets in different rooms on different days
```json
"Section_Details": "Fuller Labs 311 | M-T-F | 9:00 AM - 9:50 AM; Unity Hall 520 | W | 9:00 AM - 9:50 AM"
```

**Handling** (`jsonIN.java:429`):
```java
String[] allPeriods = allPeriodsString.split(";");
for (String period : allPeriods) {
    // Create separate period for each meeting pattern
}
```

**Result**: Section has 2 periods with different locations

### 5. Section Number Suffixes

**Scenario**: Section numbers with parenthetical qualifiers
```json
"Course_Section": "CS 1101-A01 (Honors) - Intro"
```

**Handling** (`jsonIN.java:354-356`):
```java
if(thisSectionNum.contains("(")) {
    thisSectionNum = thisSectionNum.substring(0, thisSectionNum.indexOf("(") - 1);
}
```

**Result**: "A01" (suffix removed)

### 6. Unassigned Instructors

**Scenario**: Section has no instructor assigned yet
```json
"Instructors": ""
```

**Handling** (`jsonIN.java:308-316`):
```java
String thisProfessor = "";
if(thisSection.get("Instructors") == null) {
    thisProfessor = "Not Assigned";
} else if(thisSection.get("Instructors").equals("")) {
    thisProfessor = "Not Assigned";
} else {
    thisProfessor = (String) thisSection.get("Instructors");
}
```

**Result**: "Not Assigned" displayed instead of blank

### 7. CRN Collision Handling

**Problem**: Combined sections generate CRN by concatenation
- Lecture CRN: 12345
- Lab CRN: 67890
- Combined CRN: 1234567890

**Potential issue**: Very large numbers (exceeds long range if >19 digits)

**Current status**: No explicit handling (assumes Workday CRNs are 6 digits)

**Risk**: Low (WPI CRNs are consistently 6 digits)

### 8. Missing Course Name

**Scenario**: Course title doesn't follow expected format
```json
"Course_Title": "CS 1101"  // No dash and name
```

**Handling** (`jsonIN.java:233-237`):
```java
try {
    courseName = courseTitleFull.substring(courseTitleFull.indexOf("-") + 2, courseTitleFull.length());
} catch (Exception e) {
    courseName = currSectionCourseSection.substring(currSectionCourseSection.indexOf("- ") + 2);
}
```

**Result**: Falls back to extracting from `Course_Section`

### 9. Null Section Description

**Scenario**: No description available
```json
"Course_Section_Description": null
```

**Handling** (`jsonIN.java:257-265`):
```java
String courseDesc;
if(courseDescRaw != null) {
    courseDesc = courseDescRaw.replaceAll("\\<[^>]*>", " ");
    // ... sanitization
} else {
    courseDesc = courseDescRaw;  // Stays null
}
```

**Result**: `null` description (frontend must handle)

### 10. Special Section Number Formats

**Scenario**: Unusual section identifiers
- "AB 1531-A01-Quiz" → Has appendix
- "HU 3900-GPS: Data Science" → Special topic
- "CS 1101-Interest List" → Interest list

**Handling**: Multiple conditional checks (`jsonIN.java:331-352`)
1. Check for appendices first
2. Check for special sections (GPS, ST)
3. Check for interest lists
4. Default to standard parsing

**Result**: Correct section number extraction for all formats

---

## Performance Considerations

### File Size Comparison
- **Input**: 11.7 MB (`course-data.json`)
- **Output**: 8.9 MB (`course-data-constructed.json`)
- **Reduction**: 24% smaller

**Why smaller?**
1. Removes canceled sections
2. Removes invalid/out-of-scope periods
3. Removes redundant fields (dates, tags, delivery mode)
4. Combines related sections (fewer total entries)

### Time Complexity
- **Input parsing**: O(n) where n = number of section entries (~3000)
- **Department lookup**: O(1) average (ArrayList.indexOf with equals override)
- **Course lookup**: O(m) where m = courses per department (~10-50)
- **Section combination**: O(l × d × b) where:
  - l = lectures per course term
  - d = discussions per course term
  - b = labs per course term
  - Worst case: O(n³) but typically small (1-5 of each)

**Total**: O(n) + O(n × m) + O(n × combos) ≈ **O(n²)** worst case, **O(n)** typical

### Memory Usage
- **Peak**: ~3000 section objects + ~500 course objects + 64 department objects
- **Estimated**: 50-100 MB RAM (dominated by string descriptions)

---

## Summary

The **Workday Planner Converter** is a robust data transformation pipeline that:

1. **Ingests** raw Workday course data (flat JSON format)
2. **Filters** invalid, canceled, and out-of-scope sections
3. **Structures** data into a hierarchical department → course → section model
4. **Enriches** data with computed fields (term letters, combined CRNs)
5. **Combines** related course components (lectures + labs + discussions)
6. **Validates** combinations using cluster and time conflict rules
7. **Sanitizes** HTML descriptions and handles missing data gracefully
8. **Exports** optimized JSON for efficient frontend consumption

**Key Innovations**:
- Smart section combination algorithm (reduces enrollment friction)
- Cluster-aware compatibility checking (enforces WPI requirements)
- Configurable special course handling (GPS, Special Topics, Interest Lists)
- Robust edge case handling (missing data, over-enrollment, unusual formats)

**Integration Point**: Output file (`course-data-constructed.json`) is consumed by the WPI Planner frontend application for interactive schedule building.

---

## Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `Converter.java` | 24 | Main entry point |
| `jsonIN.java` | 749 | Input parser and processor (core logic) |
| `jsonOUT.java` | 121 | Output serializer |
| `Schedb.java` | 127 | Root data model container |
| `dept.java` | 54 | Department data model |
| `course.java` | 80 | Course data model |
| `section.java` | 187 | Section data model with term extraction |
| `period.java` | 189 | Meeting time data model |
| `planner.properties` | 22 | Configuration file |

**Total**: ~1,553 lines of Java code

---

**Document Version**: 1.0
**Last Updated**: October 31, 2025
**Author**: Claude Code Analysis
**Repository**: wpiplannerV2
