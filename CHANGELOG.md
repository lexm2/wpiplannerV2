# Changelog

## [2026-02-07]

### Improved
- Replaced auto-schedule settings modal with unified filter interface
- Auto-schedule now uses the same filter UI as regular filtering for consistency
- Wake-up time and calendar event blocking now available in filter modal
- Refactored auto-schedule constraints into unified filter system
- Simplified auto-schedule API by removing config parameter
- Wake-up time now works as a hard filter (excludes sections before set time)
- Unified conflict detection system - calendar events and section conflicts now use the same filtering mechanism
- Simplified filter architecture by merging BlockedTimesFilter into ConflictFilter
- Calendar event conflict toggle now appears within Schedule Conflicts section for better discoverability

## [2026-02-06]

### Improved
- Simplified course selection architecture by removing redundant section tracking
- Cleaned up unused schedule preference fields
- Removed unnecessary ConflictType enum (only one type exists)
- Removed unused conflict descriptions and fields
- Refactored conflict detection to return conflict map directly (simpler and faster)
- Added F (Fall) and S (Spring) to term system for proper graduate course handling
- Completed migration to component-based course selection system
- Renamed confusing "legacy" schedule methods (no actual legacy format exists)
- Added helper functions to get CRNs from selected courses
- Converted event type from string literals to proper enum for better type safety

### Fixed
- Fixed blocked times not applying to Fall (F) and Spring (S) graduate courses
- Fixed auto-scheduler ignoring time blocks for multi-term courses
- Fixed all AcademicTerm type errors by using proper enum values instead of strings
- Fixed data loss bug where only one section per course was saved during export (now saves all lecture/discussion/lab selections)

## [2026-01-25]

### Improved
- Grid rendering is now dramatically faster with optimized conflict detection (70-75% faster)
- Schedule grid now renders 80-85% faster with optimized string building and color caching
- Schedule saves and loads now use background workers for smoother performance
- Schedules with preferred wake-up times are now shown first properly
- Auto-schedule navigation is now significantly faster with optimized rendering (90% faster)

### Fixed
- Fixed grid cells not clearing properly when navigating between auto-generated schedules
- Fixed auto-schedule generation failing after worker pool optimization
- Fixed failing TermBoundsService test
- Fixed type errors in course selection and schedule rendering

## [2026-01-24]

### Added
- Wake up time preference in auto-schedule settings to prioritize schedules without early classes

### Improved
- Course selection button is now more responsive with optimistic UI

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
- Schedule mobile menu button moved to header
- Disabled term focus mode on mobile for better viewing experience
- Term filter toggles now display as colored buttons at narrow widths

### Fixed
- Course select button now reliably shows checkmark icon when selected
- Removed staggered animations from checkmark for instant appearance
- Fixed header navigation layout issues at specific screen widths by using device detection
- Fixed mobile menu panels not appearing when hamburger button is clicked
- Fixed header navigation being left-aligned instead of centered on mobile devices
- Schedule mobile menu button now visible on screens smaller than 1250px
- Fixed unintended page switches after using header navigation following swipe gestures

### Removed
- Removed all cloud sync functionality and infrastructure
- Removed all calendar integration features
- Removed Export ICS button from schedules modal footer
- Removed cloud calendar integration - local events continue to work

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
