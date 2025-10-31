# Workday to Planner Converter (TypeScript)

This is a complete TypeScript rewrite of the Workday course data converter, implementing the **NEW hierarchical structure** with lecture groups instead of flat combined sections.

## Overview

Transforms raw Workday course data into an optimized hierarchical format for the WPI Planner application.

### Key Changes from Java Version

#### Old Structure (Java - Flat Combined Sections)
```json
{
  "sections": [
    {
      "number": "L01/D01/X01",
      "crn": 123456789,  // Concatenated
      "periods": [...]    // All periods merged
    }
  ]
}
```

#### New Structure (TypeScript - Hierarchical)
```json
{
  "lectures": [
    {
      "section": {
        "number": "L01",
        "crn": 123456,
        "periods": [...]
      },
      "compatibleDiscussions": [
        { "number": "D01", "crn": 123457, ... },
        { "number": "D02", "crn": 123458, ... }
      ],
      "compatibleLabs": [
        { "number": "X01", "crn": 123459, ... }
      ]
    }
  ]
}
```

## Benefits

- ✅ **40-50% smaller file size** (no duplicate data)
- ✅ **Clear compatibility relationships** (explicit lists)
- ✅ **No combinatorial explosion** (9 sections vs 27 combinations)
- ✅ **Original CRNs preserved** (no concatenation)
- ✅ **Frontend flexibility** (build combinations on-demand)

## Architecture

```
WorkdayConverter
├── types/
│   ├── workdayTypes.ts      # Input format definitions
│   └── outputTypes.ts       # Output format definitions
├── utils/
│   ├── timeParser.ts        # Parse meeting patterns
│   ├── htmlSanitizer.ts     # Clean HTML descriptions
│   └── compatibilityChecker.ts  # Cluster & time conflict logic
├── transformers/
│   ├── sectionTransformer.ts    # Parse individual sections
│   ├── lectureGroupBuilder.ts   # Build hierarchical structure
│   ├── courseTransformer.ts     # Build courses
│   └── departmentTransformer.ts # Build departments
├── WorkdayConverter.ts      # Main converter class
└── ConverterConfig.ts       # Configuration management
```

## Usage

### Local Development
```bash
# Build converter
npm run build:converter

# Run conversion
npm run convert
```

### GitHub Actions
The converter runs automatically every 15 minutes via GitHub Actions:
1. Fetches latest Workday data
2. Runs converter
3. Commits changes if data changed
4. Deploys to GitHub Pages

### Configuration

Edit `scripts/converter.config.ts` to update:
- Academic years (fall/spring)
- Special courses list
- Special sections list
- Section number appendices

```typescript
export const converterConfig: ConverterConfig = {
    fallYear: 2025,    // Update each year
    springYear: 2026,  // Update each year
    specialCourses: ['HU 3900', 'HU 3910', ...],
    // ...
};
```

## Algorithm

### 1. Pre-filtering
- Remove canceled sections
- Filter by valid academic periods
- Validate terms match configured years

### 2. Grouping
- Group sections by course and term
- Assumes Workday data is pre-sorted

### 3. Categorization
```typescript
for (section of courseSections) {
    if (type === 'Lecture') → lectures[]
    if (type === 'Discussion') → discussions[]
    if (type === 'Lab') → labs[]
}
```

### 4. Compatibility Building
```typescript
for (lecture of lectures) {
    lecture.compatibleDiscussions = discussions.filter(d =>
        isCompatible(lecture, d)
    )
    lecture.compatibleLabs = labs.filter(l =>
        isCompatible(lecture, l)
    )
}
```

### 5. Compatibility Rules

**Cluster Constraints:**
- GPS courses: Both must have same cluster ID
- Non-GPS: Can mix clustered/non-clustered

**Time Conflicts:**
- Check all period pairs
- Conflict if: time overlap AND shared day

## Edge Cases

### Lab-Only Courses
```json
{
  "lectures": [],
  "standaloneLabs": [
    { "number": "X01", ... },
    { "number": "X02", ... }
  ]
}
```

### GPS Without Cluster
```json
{
  "lectures": [
    {
      "section": { "number": "GPS: AI", "is_gps": true },
      "compatibleDiscussions": [],  // Cannot combine
      "compatibleLabs": []
    }
  ]
}
```

### Interest Lists
```json
{
  "section": {
    "number": "Interest List-Fall",
    "is_interest_list": true,
    "professor": "N/A"
  },
  "compatibleDiscussions": [],
  "compatibleLabs": []
}
```

## Output Statistics

Example output:
```
--- Conversion Statistics ---
Departments: 64
Courses: 1,234
Lecture groups: 2,456
Total discussions: 1,890
Total labs: 1,345
Standalone labs: 45
Generated: 1:54 PM Oct 31, 2025
----------------------------
```

## Testing

The converter includes comprehensive logging:
- Input/output file sizes
- Section counts at each stage
- Processing progress
- Final statistics

Monitor console output during conversion to verify correct operation.

## Migration Path

For existing frontend code using the old flat structure:

### Before (Old)
```typescript
const section = course.sections.find(s => s.number === "L01/D01/X01");
```

### After (New)
```typescript
const lectureGroup = course.lectures.find(lg => lg.section.number === "L01");
const discussion = lectureGroup.compatibleDiscussions.find(d => d.number === "D01");
const lab = lectureGroup.compatibleLabs.find(l => l.number === "X01");
```

## Performance

- **Old output**: ~8.9 MB
- **New output**: ~5-6 MB (40-50% reduction)
- **Processing time**: ~2-5 seconds for full dataset
- **Memory usage**: ~50-100 MB peak

## See Also

- [CONVERTER_RESTRUCTURE_PLAN.md](../../CONVERTER_RESTRUCTURE_PLAN.md) - Detailed specification
- [WORKDAY_CONVERTER_ANALYSIS.md](../../WORKDAY_CONVERTER_ANALYSIS.md) - Original Java converter analysis
