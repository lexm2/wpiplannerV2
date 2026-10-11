# Rate My Professor Data Fetcher for WPI

This script fetches Rate My Professor data for all professors at Worcester Polytechnic Institute (WPI) and stores it in a JSON file.

## Overview

The script uses direct GraphQL queries to the Rate My Professors API to retrieve professor ratings, difficulty scores, and other metrics. It searches through the alphabet (a-z) to find all professors at WPI; each search result already carries the professor's ratings, so no per-professor request is made.

## Files

- `fetchRateMyProfessor.ts` - Main script that fetches professor data
- `types.ts` - TypeScript type definitions for the data structures
- `README.md` - This file

## Usage

### Manual Execution

Run the script manually using npm:

```bash
npm run fetch-rmp-data
```

This will:
1. Search for all professors at WPI (by searching through a-z), ratings included
2. Save the data to `public/rateMyProfessor.json`

### Automated Execution

The GitHub Action workflow (`.github/workflows/update-rmp-data.yml`) runs this script automatically:

- **Schedule**: 4 times per year (once per WPI term)
  - September 1st (A term)
  - November 1st (B term)
  - February 1st (C term)
  - March 25th (D term)
- **Manual**: Can be triggered manually via GitHub Actions UI

## Output Format

The script generates a JSON file (`public/rateMyProfessor.json`) with the following structure:

```json
{
  "lastUpdated": "2025-11-01T22:51:06.989Z",
  "school": {
    "id": "1220",
    "name": "Worcester Polytechnic Institute",
    "city": "Worcester",
    "state": "MA"
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
  ],
  "totalProfessors": 908
}
```

### Data Fields

- **lastUpdated**: ISO 8601 timestamp of when the data was fetched
- **school**: WPI school information
  - **id**: School ID on Rate My Professors (1220)
  - **name**: School name
  - **city**: City location
  - **state**: State abbreviation
- **professors**: Array of professor objects
  - **id**: Base64-encoded Rate My Professor ID
  - **firstName**: Professor's first name
  - **lastName**: Professor's last name
  - **department**: Academic department
  - **avgRating**: Average rating (0-5.0 scale)
  - **avgDifficulty**: Average difficulty rating (0-5.0 scale)
  - **numRatings**: Total number of ratings
  - **wouldTakeAgainPercent**: Percentage of students who would take again (0-100)
- **totalProfessors**: Total count of professors found

## How It Works

### 1. Search Strategy

Since the Rate My Professors API doesn't support fetching all professors at once, the script uses an alphabet search strategy:

1. For each letter (a-z), search for professors whose names contain that letter
2. Store results in a Map to avoid duplicates
3. This typically finds 900+ professors at WPI

### 2. Data Fetching

The search query requests each teacher's legacy ID, department, rating, difficulty, rating count and would-take-again percentage directly, so the 26 letter searches are the only requests made.

### 3. Rate Limiting

- **Between letter searches**: 100ms delay
- Typical execution time: a few seconds

## Technical Details

### GraphQL API

The script communicates directly with the Rate My Professors GraphQL API:

- **Endpoint**: `https://www.ratemyprofessors.com/graphql`
- **Authentication**: Basic auth token
- **School ID Format**: Base64-encoded `School-{legacyId}` (e.g., "School-1220" → "U2Nob29sLTEyMjA=")

### Queries Used

1. **Search Teachers**: Finds professors by name/letter at a specific school, with their rating fields

## Troubleshooting

### No professors found
- Check that WPI_SCHOOL_ID is correctly encoded
- Verify the Rate My Professors API is accessible
- Check for GraphQL API changes

### Incomplete data
- Some professors may not have all fields (e.g., wouldTakeAgainPercent)
- Professors with 0 ratings will have 0 values for metrics
