# Changelog

## [2026-03-17]

### Improved
- Tutorial box is now larger by default and text scales as you resize it
- Tutorial box repositions itself to stay on screen when step text changes

### Added
- Tutorial now creates a dedicated "Tutorial" schedule so your real schedules stay untouched
- Added individual tutorial buttons to the settings panel so you can restart specific tutorials
- Tutorial courses no longer persist to storage between sessions
- Added a Tutorials menu accessible from Settings — browse and launch any tutorial from one place

### Fixed
- Tutorial step 11 (Open section selection) now correctly highlights the course on the Schedule tab
- Tutorial no longer creates a stray "My Schedule" on every page reload
- Tutorial schedule is properly cleaned up when the tutorial finishes

## [2026-03-16]

### Added
- Added an interactive tutorial that walks new users through adding a course and setting up sections
- Added a built-in Tutorial course (TUT-1001) to practice with before diving into real courses
- Updated tutorial course schedules to better reflect realistic WPI timetables
- Added two more tutorial courses (TUT-1002 and TUT-9001) to support upcoming tutorial steps
- Added a second tutorial that teaches the academic year filter, chaining automatically after the first
- Tutorial courses are removed from the course list once the tutorial is complete
- The app now remembers if you've visited before
- Courses now include a WPI category (1, 2, or 3) parsed from their description
- Click a custom event in the schedule grid to delete it via a confirmation dialog

### Fixed
- Tutorial "Next" button now directly performs each step's action (tab switch, course select, open wizard) instead of simulating clicks
- Dragging the tutorial box no longer stretches it vertically
- Tutorial box now repositions to a free corner when it would cover the highlighted element
- Course select and bookmark buttons no longer flash when deselected while hovering
- Deleting a local calendar event now correctly updates the event count on the calendar button

### Improved
- Removed the course listing header label — the content header now only shows the search and filter controls
- Term graphs no longer show a separate header — the term letter (A/B/C/D) is now embedded in the schedule grid's first cell, giving more space to the actual schedule
- Course and bookmark buttons now respond instantly with no delay
- Added a "New Schedule" button at the bottom of the schedule list for quicker access
- Import button on each schedule now imports courses directly into that schedule
- Switching schedules and importing now update the UI in a single pass instead of multiple renders, making transitions noticeably faster

## [2026-03-15]

### Added
- Academic year mismatch notice in wizard with a switch button when course year differs from active filter
- Filtered sections notice in wizard with a clear filters button
- Wizard section toggle-unselect and hover glow preview
- Calendar event conflict filter and auto-schedule modal mode

### Improved
- Reduced DOM queries by caching element references and using event delegation for faster interactions
- Course component tabs (lectures, labs, discussions) now load sections lazily for faster course description rendering
- Department sidebar course counts now update when filters change
- Courses are now removed from results when filters eliminate all sections of a required component type
- Unified CourseFilterService and ScheduleFilterService into a single FilterService
- Course selection bugs fixed with filter instances scoped to wizard only
- Separated non-UI concerns from MainController and ScheduleController
- Renamed WorkerPoolManager to StorageWorkerManager and simplified to single worker
- Course sections expand/collapse animation rewritten for smooth transitions
- Merged duplicated ScheduleController methods and removed dead code
- Moved TermBoundsService to utils
- Replaced ConflictEngine with BitMaskEngine for conflict detection
- Search logic consolidated into utilities (removed SearchService)
- Refactored mobile notice to use ModalService/BaseModal
- Schedule grid fixes: conflict overlay, dead CSS cleanup, preview pipeline refactor
- Strong typing overhaul: replaced all `any` types with proper types, extracted shared interfaces, removed dead/duplicate type definitions

### Fixed
- Fixed permanent performance degradation after expanding large courses
- Fixed term graph preview rendering in wrong term
- Fixed course button lag with optimistic updates and bookmark handler
- Fixed clear sections refresh

### Removed
- Removed all tests and test infrastructure
- Removed PerformanceMonitor, PerformanceMetrics, and all perf instrumentation
- Removed verbose console logs from MainController and ScheduleController
- Removed unused variables, imports, and dead code across codebase
- Removed unused UIStateBuffer and constants files
- Removed empty vendor-microsoft chunk and unused dependencies
- Removed excessive comments from RateMyProfessorService and sidebar module
- Removed mobile overlay UI (hamburger, backdrop, swipe-to-open panels)

## [2026-03-06]

### Fixed
- Creating a new schedule no longer inherits courses from the previously active schedule — new schedules start empty
- Creating a new schedule now automatically switches to it
- Clicking the bookmark or select button on a course card no longer feels sluggish — buttons now respond instantly without triggering unintended side effects
- Course list now renders all at once instead of in small batches, eliminating a race condition where button clicks during loading would revert

### Changed
- Removed mobile hamburger/overlay UI; panels follow standard responsive layout at all screen sizes
- Mobile devices now see a notice that mobile support is temporarily unavailable
- Improved internal conflict detection performance by switching to a bitmask-based engine

## [2026-03-03]

### Improved
- The course component wizard now shows only the steps relevant to the selected lecture — lectures with no labs or discussions skip those steps entirely and go straight to Finish

### Fixed
- ICS export now uses each course's own academic year for event dates instead of defaulting to the most recent year
- Importing schedules exported from v4.2 no longer fails with "Unsupported import format"



### Fixed
- Hovering a section in the wizard after clicking it no longer shows it as a dashed preview — it stays solid
- Re-opening the wizard in editing mode no longer shows already-confirmed sections (like discussions) as ghost previews when hovering a lecture card

## [2026-02-28]

### Improved
- Schedule grid no longer re-renders when navigating away from the schedule page, reducing unnecessary work on startup and schedule switches
- Schedule grid rendering is now faster — course data is scanned once per render instead of once per grid cell

## [2026-02-25]

### Improved
- Error messages shown when the app fails to load now include a "Clear Data & Reload" button with a note that saved data may be outdated
- Period type filter now supports partial matching (e.g. filtering "lec" excludes Lecture sections)
- Schedule generation now correctly respects blocked times from calendar events

### Fixed
- Academic year now always defaults to the newest available year

### Improved
- Moved separator bar in sidebar calendar events section to appear below the button instead of above
- Schedules modal footer redesigned with a pill-style tab nav; body now slides between Schedules and Settings pages
- Academic Year filter in course and schedule filter modals — filter courses by 2025–2026 or 2026–2027
- Reduced course data file size by removing redundant fields from sections (legacy term code and duplicate description)

## [2026-02-07]

### Added
- "Clear All Data" button in schedules modal to reset all schedules and data

### Removed
- "Exclude Period Types" filter (unused feature)

### Fixed
- Course selection buttons now work correctly (validator updated to match current data structure)

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
- Eliminated circular references between Course and Department by flattening department data
- Simplified JSON serialization by removing custom circular reference handling
- Standard JSON.stringify/parse now works directly with course data

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
