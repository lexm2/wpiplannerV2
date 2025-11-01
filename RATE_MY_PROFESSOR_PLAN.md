# Rate My Professor Data Collection Plan for WPI

## Research Summary

### Key Findings
- **WPI School ID**: 1220 (from https://www.ratemyprofessors.com/school/1220)
- **API Type**: Rate My Professors uses a GraphQL API (no official public documentation)
- **Available Libraries**:
  - JavaScript/TypeScript: `@mtucourses/rate-my-professors` (npm)
  - Python: `RateMyProfessorAPI` (PyPI)
- **Data Available**: Professor name, department, average rating, difficulty, number of ratings, "would take again" percentage

### Legal Considerations
- Rate My Professors does not provide official public API documentation
- The site uses GraphQL endpoints that are publicly accessible
- Multiple open-source libraries exist for accessing this data
- Use reasonable rate limiting to avoid overwhelming the service
- This is for educational/informational purposes

---

## Plan Options

### **Option 1: TypeScript/JavaScript with Official-ish GraphQL Wrapper** ⭐ **RECOMMENDED**

#### Why This is Best
- Native integration with existing TypeScript codebase
- Well-maintained library (`@mtucourses/rate-my-professors`) with TypeScript types
- Direct GraphQL API access (faster, more reliable than scraping)
- Easy to run in GitHub Actions with Node.js
- No browser automation overhead
- Better maintainability and less likely to break

#### Implementation Steps
1. Install `@mtucourses/rate-my-professors` npm package
2. Create a TypeScript script (`scripts/fetchRateMyProfessor.ts`)
3. Search for WPI school (ID: 1220)
4. Fetch all professors for WPI
5. Extract and format data into JSON
6. Set up GitHub Action to run script on schedule
7. Commit JSON file back to repository

#### Data Structure
```json
{
  "lastUpdated": "2025-11-01T00:00:00Z",
  "school": {
    "id": "1220",
    "name": "Worcester Polytechnic Institute"
  },
  "professors": [
    {
      "id": "VGVhY2hlci0xMjM0NTY=",
      "firstName": "John",
      "lastName": "Doe",
      "department": "Computer Science",
      "avgRating": 4.5,
      "avgDifficulty": 3.2,
      "numRatings": 45,
      "wouldTakeAgainPercent": 85.5
    }
  ]
}
```

#### GitHub Action Configuration
```yaml
name: Update Rate My Professor Data
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday at midnight
  workflow_dispatch:  # Allow manual trigger

jobs:
  update-rmp-data:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npm run fetch-rmp-data
      - name: Commit changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/rateMyProfessor.json
          git diff --staged --quiet || git commit -m "Update Rate My Professor data"
          git push
```

#### Pros
- ✅ Fast and efficient
- ✅ TypeScript support with type safety
- ✅ Easy to maintain
- ✅ Lightweight (no browser needed)
- ✅ Well-documented library
- ✅ Less prone to breaking changes

#### Cons
- ⚠️ Depends on third-party library maintenance
- ⚠️ Limited to aggregate data (no individual reviews)

#### Estimated Setup Time
1-2 hours

---

### **Option 2: Python with RateMyProfessorAPI**

#### Why Consider This
- Simple Python implementation
- Good for teams more comfortable with Python
- Established library with active usage

#### Implementation Steps
1. Create Python script with RateMyProfessorAPI
2. Use `get_school_by_name("Worcester Polytechnic Institute")`
3. Iterate through professors at WPI
4. Export to JSON
5. Set up GitHub Action with Python environment

#### GitHub Action Configuration
```yaml
name: Update Rate My Professor Data
on:
  schedule:
    - cron: '0 0 * * 0'
  workflow_dispatch:

jobs:
  update-rmp-data:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install RateMyProfessorAPI
      - run: python scripts/fetch_rmp_data.py
      - name: Commit changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/rateMyProfessor.json
          git diff --staged --quiet || git commit -m "Update Rate My Professor data"
          git push
```

#### Pros
- ✅ Simple Python syntax
- ✅ Established library
- ✅ Easy error handling

#### Cons
- ⚠️ Introduces Python dependency to Node.js project
- ⚠️ Less integration with existing codebase
- ⚠️ Library maintenance uncertain (Apache 2.0 license)

#### Estimated Setup Time
2-3 hours

---

### **Option 3: Direct GraphQL API Calls**

#### Why Consider This
- No third-party library dependencies
- Full control over API requests
- Can be implemented in TypeScript directly

#### Implementation Steps
1. Reverse engineer GraphQL queries from Rate My Professors
2. Create TypeScript functions to make GraphQL requests
3. Implement search and data fetching logic
4. Handle pagination if necessary
5. Export to JSON

#### Sample GraphQL Query Structure
Based on the libraries, likely queries include:
- School search query
- Teacher search by school ID
- Teacher details by teacher ID

#### Pros
- ✅ No external dependencies
- ✅ Full control and customization
- ✅ Native TypeScript integration

#### Cons
- ⚠️ Requires reverse engineering GraphQL schema
- ⚠️ More maintenance burden
- ⚠️ May break if API changes
- ⚠️ More initial development time

#### Estimated Setup Time
4-6 hours

---

### **Option 4: Web Scraping with Playwright/Puppeteer**

#### Why Consider This
- Can capture any data visible on the site
- Not dependent on API structure

#### Implementation Steps
1. Use Playwright to navigate to WPI Rate My Professor page
2. Extract professor listings
3. Visit each professor page for details
4. Parse HTML and extract data
5. Export to JSON

#### Pros
- ✅ Can get data not available via API
- ✅ Visual verification possible

#### Cons
- ⚠️ Slow (must load pages, wait for JavaScript)
- ⚠️ Fragile (breaks when HTML structure changes)
- ⚠️ Resource intensive
- ⚠️ More complex error handling
- ⚠️ May require anti-bot measures handling
- ⚠️ Higher risk of being blocked

#### Estimated Setup Time
6-8 hours

---

## **Final Recommendation: Option 1**

**Use `@mtucourses/rate-my-professors` npm package with TypeScript**

### Rationale
1. **Best fit for existing codebase**: Already using TypeScript/Node.js
2. **Reliability**: GraphQL API more stable than HTML scraping
3. **Performance**: Fast, no browser overhead
4. **Maintainability**: Clean code, well-typed
5. **Community support**: Active library with TypeScript definitions
6. **Efficiency**: GitHub Actions will run quickly

### Implementation Priority
1. Create data fetching script
2. Test locally with WPI school ID (1220)
3. Validate JSON output format
4. Set up GitHub Action workflow
5. Test workflow with manual trigger
6. Enable scheduled runs

### Success Criteria
- ✅ JSON file generated with all WPI professors
- ✅ Data includes: name, department, ratings, difficulty, number of ratings
- ✅ GitHub Action runs successfully on schedule
- ✅ Data automatically commits to repository
- ✅ Script handles errors gracefully
- ✅ Rate limiting respected (avoid overwhelming the service)

### Future Enhancements
- Add professor photo URLs if needed
- Include department filtering
- Add data validation and quality checks
- Create TypeScript types for the JSON structure
- Add notifications on failures
- Implement incremental updates (only changed professors)
- Add data analytics/trending over time

---

## Implementation Status

✅ **COMPLETED** - November 1, 2025

### What Was Implemented

**Option 1 (Modified)**: Direct GraphQL queries instead of npm package
- The `@mtucourses/rate-my-professors` package had a broken school search API
- Implemented direct GraphQL queries to Rate My Professors API
- Uses alphabet search strategy (a-z) to find all professors
- Successfully fetches 908 WPI professors with full data

### Files Created

1. ✅ `scripts/rateMyProfessor/fetchRateMyProfessor.ts` - Main fetching script
2. ✅ `scripts/rateMyProfessor/types.ts` - TypeScript type definitions
3. ✅ `scripts/rateMyProfessor/README.md` - Complete documentation
4. ✅ `.github/workflows/update-rmp-data.yml` - Automated GitHub Action
5. ✅ `public/rateMyProfessor.json` - Generated data file (908 professors)

### Test Results

```
Total professors: 908
Professors with ratings: 774 (85%)
Average rating: 3.05/5.0
Average difficulty: 2.56/5.0
Execution time: ~135 seconds
```

### Usage

```bash
# Manual run
npm run fetch-rmp-data

# Automated: GitHub Action runs quarterly
# - September 1st (A term)
# - November 1st (B term)
# - February 1st (C term)
# - March 25th (D term)
```

## Next Steps

1. ✅ **Completed**: All implementation tasks finished
2. **Optional**: Monitor GitHub Action runs quarterly
3. **Optional**: Integrate professor ratings into WPI Planner UI
4. **Ongoing**: Monitor for Rate My Professors API changes

## Questions to Consider

1. How often should the data be updated? (Suggested: Weekly)
2. Should we store historical data or just current snapshot?
3. Do we need individual review text or just aggregate ratings?
4. Should failed runs send notifications?
5. What's the fallback if Rate My Professor API changes?
