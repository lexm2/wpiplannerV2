# Academic Progress Parser - Implementation Plan

## Goal

Parse WPI's `View_My_Academic_Progress.xlsx` export into a structured, major-agnostic data model that captures all degree requirements, their completion status, and applied courses.

---

## 1. Raw xlsx Structure

The export is a single sheet with 7 columns:

| Col | Header | Description |
|-----|--------|-------------|
| A | Requirement | Full requirement name (repeats for each course applied) |
| B | Status | `Satisfied`, `In Progress`, `Not Satisfied` |
| C | Remaining | e.g. `Minimum 3 Credit(s)`, `Minimum 1 Course(s)`, `Minimum Combination Required`, or `None` |
| D | Satisfied With / Registrations Used | Full course string including transfer/in-progress tags |
| E | Academic Period | e.g. `2025 Fall A Term`, `2026 Spring C Term`, or `None` for transfers |
| F | Credits | Numeric string (e.g. `3`, `0.75`) |
| G | Grade | Letter grade, `P`, `L` (transfer), or `None` (in progress) |

Key observations:
- Rows 1-2 are headers
- A requirement with multiple applied courses appears as multiple rows with the same column A value
- A requirement with no applied courses appears as a single row with columns D-G all `None`
- Course strings in column D contain embedded metadata: `(Transfer Credit)` suffix and `(In Progress)` suffix

---

## 2. Data Model

### 2.1 Course

```python
@dataclass
class Course:
    code: str           # "CS 3013"
    number: int         # 3013
    department: str     # "CS"
    title: str          # "Operating Systems"
    credits: float      # 3.0
    grade: str | None   # "A", "B", "P", "L", None
    is_transfer: bool
    is_in_progress: bool
    academic_period: AcademicPeriod | None  # None for transfers
```

### 2.2 AcademicPeriod

```python
@dataclass
class AcademicPeriod:
    year: int           # 2025, 2026
    season: str         # "Fall", "Spring"
    term: str | None    # "A", "B", "C", "D", "E", or None for semester-long (e.g. WPE)
    raw: str            # "2025 Fall A Term" - preserve original
```

### 2.3 Requirement

```python
@dataclass
class Requirement:
    raw_name: str                   # Full string from column A
    category: RequirementCategory   # Parsed category (see 2.4)
    scope: str                      # "WPI" or major name e.g. "Computer Science"
    name: str                       # Short name e.g. "Systems Requirement"
    status: Status                  # SATISFIED, IN_PROGRESS, NOT_SATISFIED
    credits_required: float | None  # Parsed from requirement name or remaining
    credits_remaining: float | None # Parsed from column C
    courses_remaining: int | None   # Parsed from column C when unit is Course(s)
    applied_courses: list[Course]
```

### 2.4 RequirementCategory

```python
class RequirementCategory(Enum):
    TOTAL_CREDITS = "total_credits"
    RESIDENCY = "residency"
    MQP = "mqp"
    MQP_COMPLETION = "mqp_completion"
    IQP = "iqp"
    IQP_COMPLETION = "iqp_completion"
    HUA = "hua"
    HUA_COMPLETION = "hua_completion"
    SOCIAL_SCIENCE = "social_science"
    PHYSICAL_EDUCATION = "physical_education"
    MAJOR_SPECIFIC = "major_specific"
    FREE_ELECTIVES = "free_electives"
    UNUSED = "unused"
```

### 2.5 StudentRecord

```python
@dataclass
class StudentRecord:
    major: str                      # Parsed from requirement names
    degree: str                     # "BS", "BA", etc.
    requirements: list[Requirement]
    all_courses: list[Course]       # Deduplicated across all requirements
```

---

## 3. Parsing Pipeline

### 3.1 Step 1: Read raw rows

```
Input:  xlsx file path
Output: list[tuple] — raw row data, skipping header rows 1-2
```

- Use `openpyxl` to read the active sheet
- Skip rows where all values are `None`
- Skip the first 2 rows (headers)

### 3.2 Step 2: Group rows by requirement

The same requirement name repeats across consecutive rows (one per applied course). Group them.

```
Input:  list[tuple]
Output: dict[str, RawRequirement]
        where RawRequirement = {status, remaining, rows: list[tuple]}
```

Logic:
- Track `current_requirement` name
- When column A changes, start a new group
- Append each row's course data (cols D-G) to the current group
- Rows where column D is `None` represent requirements with no applied courses

Edge case: The same requirement name should NOT appear in two non-contiguous blocks. If it does, merge them.

### 3.3 Step 3: Parse course strings (column D)

The course string format is: `{CODE} - {TITLE}[ (Transfer Credit)][ (In Progress)]`

```
Input:  "CS 3041 - Human-Computer Interaction (In Progress)"
Output: Course(code="CS 3041", department="CS", number=3041,
              title="Human-Computer Interaction",
              is_transfer=False, is_in_progress=True, ...)
```

Parsing rules:
1. Strip `(In Progress)` suffix → set `is_in_progress = True`
2. Strip `(Transfer Credit)` suffix → set `is_transfer = True`
3. Split on ` - ` (space-dash-space) to get `code` and `title`
4. Split `code` on space to get `department` and `number`
5. Handle edge case: transfer course codes may be generic (e.g. `CS 1000 - COMPUTER SCIENCE ELECTIVE`) — `number` parse still works
6. Handle edge case: some codes have letters in the number portion (e.g. `CS 210X`) — store number as string fallback or parse digits only

Regex pattern:
```
^(?P<dept>[A-Z]+)\s+(?P<num>\w+)\s+-\s+(?P<title>.+?)(?:\s+\(Transfer Credit\))?(?:\s+\(In Progress\))?$
```

### 3.4 Step 4: Parse academic period (column E)

Format: `{YEAR} {SEASON} {TERM} Term` or `{YEAR} {SEASON} Semester`

```
Input:  "2025 Fall A Term"
Output: AcademicPeriod(year=2025, season="Fall", term="A")

Input:  "2025 Fall Semester"
Output: AcademicPeriod(year=2025, season="Fall", term=None)

Input:  None
Output: None  (transfer credit)
```

Regex pattern:
```
^(?P<year>\d{4})\s+(?P<season>Fall|Spring)\s+(?:(?P<term>[A-E])\s+Term|Semester)$
```

### 3.5 Step 5: Parse remaining (column C)

Format varies:
- `Minimum 71.25 Credit(s)` → credits_remaining=71.25
- `Minimum 1 Course(s)` → courses_remaining=1
- `Minimum Combination Required` → both None (complex/composite requirement)
- `None` → requirement is satisfied

Regex pattern:
```
^Minimum\s+(?P<value>[\d.]+)\s+(?P<unit>Credit|Course)\(s\)$
```

### 3.6 Step 6: Parse requirement name (column A)

Extract scope, short name, credit target, and category.

Format: `{SCOPE} {NAME} - Undergraduate[ - {CREDITS} Credits]`

Examples:
```
"WPI Total Credits Required - Undergraduate - 135 Credits"
→ scope="WPI", name="Total Credits Required", credits_required=135

"Computer Science - Systems Requirement - Undergraduate - 3 Credits"
→ scope="Computer Science", name="Systems Requirement", credits_required=3

"Computer Science Free Electives Requirement - Undergraduate - 9 Credits"
→ scope="Computer Science", name="Free Electives Requirement", credits_required=9
```

Parsing approach:
1. Split on ` - Undergraduate` to separate the prefix from the suffix
2. Suffix may contain ` - {N} Credits` or ` - {N} or {M} Credits` or nothing
3. Prefix contains scope + name. Scope is determined by known WPI-wide requirement prefixes vs. major-specific ones

Category classification — match against known patterns:
```python
CATEGORY_PATTERNS = {
    "Total Credits Required": TOTAL_CREDITS,
    "Residency Requirement": RESIDENCY,
    "Major Qualifying Project Completion": MQP_COMPLETION,
    "Major Qualifying Project": MQP,
    "Interactive Qualifying Project Completion": IQP_COMPLETION,
    "Interactive Qualifying Project": IQP,
    "Humanities and Arts Completion": HUA_COMPLETION,
    "Humanities and Arts": HUA,
    "Social Science": SOCIAL_SCIENCE,
    "Physical Education": PHYSICAL_EDUCATION,
    "Free Electives": FREE_ELECTIVES,
    "Unused Courses": UNUSED,
}
```

Anything not matching these patterns → `MAJOR_SPECIFIC`. This is the key to universality: major-specific requirements are stored with their full name intact, no interpretation needed.

### 3.7 Step 7: Deduplicate courses

The same course appears under multiple requirements (e.g. CS 1102 appears under both "Total Credits" and "Residency" and "CS Core"). Build a master course list:

```
Input:  all requirements with their applied courses
Output: deduplicated list[Course], keyed by (code, academic_period)
```

- Use `(department, number, period_raw)` as dedup key
- Courses under different requirements should reference the same Course object
- Build a `course → set[requirement_name]` reverse mapping for cross-referencing

---

## 4. Derived Computations

These are computed from the parsed data, not stored in the xlsx directly.

### 4.1 Credit Totals

```python
total_earned = sum(c.credits for c in all_courses if not c.is_in_progress)
total_in_progress = sum(c.credits for c in all_courses if c.is_in_progress)
total_transfer = sum(c.credits for c in all_courses if c.is_transfer)
total_wpi = total_earned - total_transfer
```

### 4.2 Term Schedule

Group courses by `AcademicPeriod` to reconstruct term-by-term history:

```python
schedule: dict[AcademicPeriod, list[Course]]
```

Sort key for periods: `(year, 0 if Fall else 1, term_letter_ord)`

### 4.3 Academic Year Calculation

Derive which "year" (1-4) a term falls in. Requires knowing the student's start year.

```python
# Infer start year from earliest non-transfer course
start_year = min(c.academic_period.year for c in all_courses if not c.is_transfer and c.academic_period)

def get_academic_year(period: AcademicPeriod) -> int:
    if period.season == "Fall":
        return period.year - start_year + 1
    else:  # Spring
        return period.year - start_year
```

### 4.4 Requirement Completion Percentage

```python
def completion_pct(req: Requirement) -> float:
    if req.status == SATISFIED:
        return 1.0
    if req.credits_required and req.credits_required > 0:
        earned = sum(c.credits for c in req.applied_courses)
        return earned / req.credits_required
    return 0.0
```

---

## 5. Serialization / Storage

### 5.1 JSON Output Schema

```json
{
  "major": "Computer Science",
  "degree": "BS",
  "start_year": 2025,
  "export_date": "2026-03-28",
  "credits": {
    "total_earned": 54.75,
    "total_in_progress": 9.0,
    "total_transfer": 27.0,
    "total_required": 135.0
  },
  "courses": [
    {
      "code": "CS 3013",
      "department": "CS",
      "number": "3013",
      "title": "Operating Systems",
      "credits": 3.0,
      "grade": "A",
      "is_transfer": false,
      "is_in_progress": false,
      "period": {
        "year": 2026,
        "season": "Spring",
        "term": "C",
        "raw": "2026 Spring C Term"
      },
      "satisfies": [
        "WPI Total Credits Required",
        "WPI Residency Requirement",
        "Computer Science - Systems Requirement"
      ]
    }
  ],
  "requirements": [
    {
      "raw_name": "Computer Science - Systems Requirement - Undergraduate - 3 Credits",
      "category": "major_specific",
      "scope": "Computer Science",
      "name": "Systems Requirement",
      "status": "satisfied",
      "credits_required": 3.0,
      "credits_remaining": null,
      "applied_courses": ["CS 3013"]
    }
  ],
  "schedule": {
    "year_1": {
      "fall_a": ["CS 1102", "MA 1024", "MA 2621"],
      "fall_b": ["CS 2103", "AR 1111", "MA 2071"],
      "spring_c": ["CS 2303", "CS 3013", "ME 1800"],
      "spring_d": ["PH 1120", "ECE 2010", "CS 3041"]
    }
  }
}
```

### 5.2 File Storage

```
output/
  student_record.json       # Full parsed data
  courses.csv               # Flat course list for spreadsheet use
  requirements_summary.csv  # One row per requirement
```

---

## 6. Edge Cases to Handle

| Case | Example | Handling |
|------|---------|----------|
| Semester-long courses | `WPE 1601` with period `2025 Fall Semester` | `term = None`, place in both A and B on schedule |
| Generic transfer codes | `CS 1000 - COMPUTER SCIENCE ELECTIVE` | Parse normally, flag as generic via all-caps title |
| Credits as string | Column F sometimes returns `"3"` not `3` | Cast to `float()` |
| No credit amount in req name | `"WPI Major Qualifying Project Completion of Degree Requirement"` | `credits_required = None` |
| Combination requirements | Remaining = `"Minimum Combination Required"` | `credits_remaining = None`, `courses_remaining = None` |
| Course in multiple requirements | CS 1102 in Total Credits + Residency + CS Core | Dedup by key, store `satisfies` list |
| Missing grade (in progress) | Column G = `None` | `grade = None`, `is_in_progress = True` |
| Variable credit requirements | `"9 or 12 Credits"` in MQP | Parse as range or take lower bound |
| Unused courses row | Always `Not Satisfied`, `Minimum 200 Credit(s)` | Skip or store as metadata, not a real requirement |
