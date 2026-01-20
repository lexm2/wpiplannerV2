# Changelog

## [2026-01-20]

### Fixed
- Fixed all remaining test failures achieving 100% test pass rate (447/447 tests passing)
- Improved test reliability for UI hydration after cloud sync imports
- Fixed 8 additional failing tests reducing total from 16 to 8 (50% improvement)
- Fixed TermBoundsService mock to include all required schema fields
- Fixed import/export tests to use ProfileStateManager API instead of raw mock data
- Added lastModified field to export data structure
- Simplified error handling tests for better reliability
- Fixed event batching test in unit tests

## [2026-01-19]

### Fixed
- Fixed test suite stability and reduced failing tests from 50 to 17 (66% improvement)
- Fixed singleton state not resetting between tests causing state pollution
- Fixed async timing issues in batch operations
- Fixed MockIndexedDB configuration not resetting between tests
- Fixed import/export tests using incorrect database name and fake CRNs
- Fixed test assertions expecting raw IndexedDB structure instead of application state

## [2026-01-16]

### Changed
- Replaced custom ICS generator with ical-generator library for improved calendar compatibility
- Calendar exports now use actual term dates from course data instead of approximations
- Centralized term date management for consistent dates across calendar and ICS exports

### Fixed
- Fixed ICS calendar export not importing into Google Calendar and other calendar apps
- Fixed ICS export RRULE format to be RFC 5545 compliant with UTC timestamps

## [2026-01-15]

### Fixed
- Identified ICS calendar export generating blank files or "no courses found" error
- Fixed header navigation and controls overlapping on smaller screens
- Fixed schedule menu positioning and implemented CSS modules

## [2026-01-14]

- A bunch of stuff was fixed before I added in the changelog. Im not going over it here but there was a bunch of other bug fixes.

### Removed
- Removed cloud sync provider implementations (Google Drive, OneDrive, Google Calendar)
- Cloud sync WILL NOT WORK UNTIL REIMPLEMENTED


### Added
- Added changelog modal that displays on startup (parses this CHANGELOG.md file directly)

### Fixed
- Fixed availability filter "hide conflicting periods" toggle - now properly persists and filters out courses that conflict with selected sections
- Fixed term-badges-container not reappearing after filtering/unfiltering
- Fixed cloud status button inconsistently displaying "Sync with cloud" when cloud sync is unavailable
