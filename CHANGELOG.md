# Changelog

## [2026-01-23]

### Why I removed cloud sync
- Im just trying to get a clean product that I would be happy putting on the offical site so cloud save will return eventually, but for now it is gone.

### Improved
- Right panel now adjusts its width based on screen size for better proportions on smaller displays
- Panel width preferences are saved and persist across sessions
- Added tooltip to full term badges
- Schedules modal now shows inline actions at lower screen widths and displays icon-only buttons on smaller screens
- Mobile detection now uses device type instead of screen width for more reliable phone vs tablet distinction
- Added swipe navigation on mobile phones to switch between Classes and Schedule pages
- Mobile menus can now be closed by swiping in the opposite direction they opened from
- Schedule mobile menu button moved to left side of screen for better accessibility

### Fixed
- Course select button now reliably shows checkmark icon when selected
- Removed staggered animations from checkmark for instant appearance
- Fixed header navigation layout issues at specific screen widths by using device detection
- Fixed mobile menu panels not appearing when hamburger button is clicked
- Fixed header navigation being left-aligned instead of centered on mobile devices

### Removed
- Removed all cloud sync functionality and infrastructure
- Removed Export ICS button from schedules modal footer

## [2026-01-21]

### Changed
- Replaced export format with new compact format reducing file size
- BREAKING: Old exports (v3 and earlier) are no longer supported

### Fixed
- Fixed term bounds data not loading correctly
- Fixed ICS calendar events appearing one year in the future
- Fixed schedule imports failing with "Import data does not contain valid schedules array" error
- Fixed schedule exports using bloated format instead of compact format
- Fixed import/export unit tests to work with new compact format
- Fixed UI hydration tests to work with v4 minimal format

## [2026-01-20]

### Fixed
- Finished fixing unit tests

## [2026-01-19]

### Fixed
- Started fixing unit tests

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
