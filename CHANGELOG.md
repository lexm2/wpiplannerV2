# Changelog

## [2026-11-04]

### Added
- Schedule Preferences in Auto-Schedule settings. Set how much you care about early classes, late classes, time between classes, a lunch break, fewer days with class, keeping days free, balanced terms, open seats and professor ratings. They decide which schedules come first and never rule one out
- Import calendar events from an .ics file (Google, Outlook or Apple Calendar). Events that repeat weekly on the same day and time for at least 30% of a term's weeks are added to every week of those terms. Find it under Calendar Events, or drop the file on the schedule
- Calendar Events lists your events. Edit them, delete several at once, or add and import more. One-time events show here too
- Click an event on the schedule to edit or delete it
- Courses in a calendar you export are marked, so importing that calendar later skips them instead of adding them as events
- A subtle "may not count" hint on the Degree page when a requirement's rules don't list a course. Placement is never blocked

### Changed
- Auto-Schedule picks each course's sections by your preferences instead of only by the least time between classes
- Filter Courses shows terms, course level and availability first. Academic year, departments, times, credit hours, minimum seats, calendar event conflicts and Rate My Professor are under More filters, which shows how many of them are on and stays open once you open it
- Auto-Schedule settings show a preference's times and limits only once it is turned on, and its filters fold into one Filters section
- What's New, Tutorials and Clear All Data are in the gear menu in the header. The Schedules window no longer has a Settings tab: New Schedule, Import and Export All are at the bottom of the list
- Each schedule in the Schedules list shows Rename and Duplicate, with Copy Into, Export, Export ICS, Import and Delete in its ⋮ menu
- The List/Grid view switch is in the gear menu
- Clear all sections is at the end of the schedule's course list instead of in the sidebar's top bar
- On the Degree page, Configure buckets, Re-import and Clear record are in the ⋯ menu on the summary card
- Auto-Schedule keeps classes clear of your calendar events. Turn this off in Auto-Schedule settings, under Filters
- Classes that overlap a calendar event show as a conflict on the schedule
- Adding, importing or deleting calendar events can be undone
- Thursday shows as R in Add Event, like the rest of the planner
- The planner's academic year switches to next year once next year is published
- Adding a course from another academic year offers to switch to, or create, a schedule of that year instead of mixing years
- A course offered in alternating years shows as Cat. II instead of Cat. I, in its details and in the offering filter
- The Filter Courses window applies filters as you set them and closes with Done
- The details panel shows "Also listed as ..." and instructor ratings
- Adding the second listing of a cross-listed class asks before counting it twice
- Selected Courses links to the Schedule page for picking sections
- The "incomplete" marker in the schedule sidebar now reads "Pick sections"
- Previous/next schedule use chevrons, and Restart auto-schedule uses an adjustments icon
- Requirements that depend on in-progress courses read "Satisfied (in progress)", and the Degree summary shows how many are complete
- Undo and Redo are much faster with many schedules, and undo history uses far less memory
- Redesigned the WPI Classic theme around the official crimson and WPI grey: a crimson header over light grey-tinted panels, with readable text and clearer input borders and focus rings
- Searching MQP or IQP explains what they are, as they aren't in the course catalog, and lists any course named for them. The full names and plurals find the same courses
- Renaming a schedule edits its name right where it is, instead of swapping in a text box
- Auto-Schedule's time settings follow how classes actually run. Time between classes is in free hours, lunch in hours, and every time is on the hour

### Removed
- The Bookmarks section of Filter Courses. The bookmark button next to the filter button does the same thing
- The clear-filters eraser button. Clear filters from the Filter Courses window

### Fixed
- The Managing Schedules tutorial no longer gets stuck on windows narrower than 1250px, where the Schedules button is in the gear menu. It points at the gear and moves on when you choose Schedules
- Tutorial steps scroll to their target on a page they have just switched to, and the tutorial box moves off it once the target settles
- Skipping a tutorial closes the window it had open, and the end of the first tutorial tells you where Tutorials is now
- Hiding sections that conflict with calendar events now follows events you add or delete after turning it on
- The calendar events count leaves out one-time events, which don't block any time
- Undo and redo shortcuts no longer change the schedule behind an open window
- Two planner tabs no longer overwrite each other. Changes show up in the other tab, a schedule deleted in one tab stays deleted, and a tab that would overwrite a newer copy keeps the newer one and tells you
- Clear All Data resets the whole screen (degree record, theme, panel widths) and can no longer be undone by another open tab
- Export, Export All and Duplicate keep calendar events, required courses, locked sections and custom colours. Imported schedules keep the name saved in the file
- Import from the schedule list adds every schedule in an Export All file. Importing into one schedule takes the file's active schedule and tells you when there are more
- A course missing from the catalog no longer rejects a whole import: the rest is imported and the missing ones are named. Wrong or damaged files get their own message
- Undo after a failed import no longer brings back an empty schedule, and schedules removed or restored by undo and redo stay that way after a reload
- One unreadable saved schedule or setting no longer hides the others; you are told how many could not be read
- You are told when saved sections are no longer offered or saved courses are from an older catalog, and adding the current version of such a course replaces the old one
- A failed course catalog download says so and offers Retry instead of suggesting you delete your data. Clear Data and Reload asks first, and the error banner no longer covers the page tabs
- Fall and Spring sections now show as conflicting with the A/B and C/D classes they overlap in the schedule grid
- A section that meets twice in a day is drawn as separate blocks, and conflicts cover only the time actually shared
- Narrow grid blocks show a readable compact label, and each block's tooltip names the course, section and time
- Schedule time labels no longer overlap at larger text sizes
- ICS export ends a section on its own last day when it has one, and includes a proper time zone definition and a valid product ID
- On a phone, the Schedule page opens on the current term instead of always A, and a term pager shows the other terms
- Section wizard cards show every meeting of a section, not just the first
- "Change Sections" opens the wizard on your current picks and keeps them unless you change them
- The section wizard names its course at every width, takes focus when it opens, keeps the hidden course list out of the Tab order, and returns focus when it closes
- Undo and redo no longer change the schedule behind an open section wizard, and the wizard closes if its course is removed
- Double-clicking Next in the section wizard no longer skips a step
- Escape closes the section wizard even when a professor link has focus or a term is zoomed in
- Auto-Schedule no longer applies a finished run to a different schedule. If you switch schedules or change courses while it runs, the result is discarded and you are told
- Undo after Auto-Schedule returns to exactly what you had before pressing Generate, and Redo brings the generated schedule back
- A blank or half-typed start or end time on a calendar event is rejected instead of saving as 12:00 AM
- Turning off "Keep classes clear of my calendar events" shows in the Filters "N active" badge in Auto-Schedule, and Clear All turns it back on
- Auto-Schedule's Filters section no longer shows filters it ignores (Course Level, Departments, Academic Year, Credit Hours), and its preview no longer reads "0 sections" when Generate would work
- The calendar import's "Not added" list no longer says "and N more" when there are no more titles, and a series made only of listed dates keeps its first meeting
- A term whose only sections are hidden by your calendar-event filter is no longer marked "All sections full"
- Auto-Schedule results show "Schedule N of M", are announced to screen readers, and focus lands on Next schedule after Generate
- Auto-Schedule term chips are larger on touch screens
- Events that end between 5-minute marks (for example 10:03) now keep a class from starting inside them, matching the grid
- Auto-Schedule warns when a lunch break is longer than its window, or when "Free days" has no days ticked
- The default academic year no longer counts as an active filter in the Filter button, its window and the Auto-Schedule filters badge. It counts only when you change it
- A search made only of punctuation or emoji is treated as no search instead of reordering the list
- Empty results say which search and filters are narrowing the list, with a one-click way to clear them
- Collapsed department categories no longer leave their departments in the Tab order, and show how many are selected
- Professor suggestions list individual instructors only
- Double-clicking a trash icon in Selected Courses removes one course
- Panels can no longer be dragged until the course list is unusably narrow, and old oversized widths are repaired
- Term badges and term pickers in course rows follow the list's width instead of the window's
- Picking another course scrolls the details panel back to the top
- The department search in Filter Courses matches full names
- Minimum Available Seats rejects negatives and exponent notation, and Credit Hours now reaches 0, 0.75 and 1.5-credit courses
- The last-updated time reads "Nov 4, 2026 at 6:11 PM"
- Toggling professor search keeps your typed text
- Department counts in the bookmarks view follow the bookmarked list
- Schedule switching, the header and gear menus, and the theme menu work from the keyboard. Arrow keys, Home and End move between items, Escape returns to the button, and focus is no longer lost after closing What's New or a confirmation
- Clicking outside a schedule's menu in the Schedules window closes only the menu
- New Schedule, Import and Export All stay visible however many schedules there are
- At narrow widths all four themes are available from the settings menu, and High Contrast is no longer dropped by the theme toggle
- The header reflows at larger text sizes instead of clipping the title or covering the Degree tab
- Added a "Skip to main content" link and page landmarks, and many controls now tell screen readers their name and state
- Uploading a corrupt, empty or non-Excel file on the Degree page says what is wrong and which file to export from Workday
- The Total Credits and Residency cards count scheduled courses, matching the summary
- "Needs N more" on a requirement is no longer capped at 12
- Focus stays in place after assigning, moving or removing a course on the Degree page; menus respond to arrow keys; Escape cancels a course drag
- Undo on the Degree page steps back through course placements before schedule edits
- Clicking a course code while a Browse filter is on opens that course, and ending Browse restores your course-level filter
- Clear record explains what it removes. Deleted Workday requirements can be restored from the Buckets window
- The Degree course finder matches "CS2223" as well as "CS 2223"
- A placed course no longer vanishes under a status filter; a note explains it
- Empty-schedule message, "1 course" plural and an import-warning typo on the Degree page
- The planner no longer falls behind on saving when you edit quickly with many schedules. Saves that took up to a minute to catch up now finish almost at once
- Borders in the High Contrast theme are the normal size and no longer move the page when you hover over something
- The Low, Medium and High labels in Auto-Schedule settings are readable in the High Contrast theme

## [2026-10-10]

### Added
- Copy Into button in the Schedules list. Pick a schedule, then click another to add its courses to that one
- Auto-Schedule shows F and S term badges for semester courses
- Conflict filter option to count semester courses (F, S) as conflicting with their quarters (A and B, C and D). On by default
- On narrow screens, the department list, course details and the schedule's course panel open as drawers from buttons in the header and toolbar
- The course list shows F and S term badges for semester courses, so their sections can be opened

### Changed
- Auto-Schedule is much faster with many courses
- When Auto-Schedule can't build a schedule, it names the courses that caused it
- The Times picker fits on laptop and phone screens, and Avoid times are striped so they look different from Only times
- The course list stays wider on laptop screens
- Over-enrolled sections show as Full instead of a negative seat count
- "Only these times" now requires every meeting of a section to fit, not just one
- Once you pick times, async classes are left out unless you turn on "Include async classes", now at the bottom of the Times window
- The Times picker covers every hour classes meet (6 AM to 9 PM), and its grid lines draw in every browser
- The schedule grid grows to fit classes before 8 AM or after 8 PM instead of cutting them off

### Fixed
- Auto-Schedule no longer overlaps semester (F/S) courses with quarter courses, or ignores courses you kept locked
- Auto-Schedule no longer gets stuck after it times out
- The calendar events toggle in Auto-Schedule shows when it's on and turns off properly
- Undo works after copying, importing or duplicating a schedule, and starts off when the page loads
- Escape closes only the top window, and cancels a rename instead of saving it
- Change Sections works on narrow screens
- The settings button can be tapped on phones
- Selected days now show as selected in Add Event
- A failed import no longer leaves an empty schedule behind
- Classes before 7 AM are now checked for time conflicts
- Menus close when you click anywhere else, including inside a window
- Selected courses show current seat counts right after the page loads
- Reloading during the tutorial no longer leaves you on a missing schedule

## [2026-09-01]

### Added
- Times filter. Drag across a weekly grid to pick times, then choose to show only courses in those times, or to avoid them
- Toggle to hide async courses

### Changed
- The wake up time filter was replaced by the Times filter

## [2026-08-29]

### Changed
- The Degree page opens in the full layout by default, with a notice explaining the view
- Clearer wording and sizing in modals and tutorial text

### Fixed
- The tutorial Skip button now skips the tutorial instead of moving to the next step
- The Add Event button in the Add Event modal now works

## [2026-08-27]

### Changed
- Reworked the term grid view in the schedule

### Fixed
- Undo and redo fixes

## [2026-08-26]

### Added
- The course list loads more courses as you scroll, so you no longer click Load next 100 courses

### Changed
- The schedule sidebar scrolls to the course you point at

### Fixed
- Auto scrolling on the Degree page

## [2026-08-25]

### Changed
- Course finder results are clickable. Clicking one takes you to that requirement

### Fixed
- Degree wide totals are no longer highlighted as if they were a course's own requirement

## [2026-08-24]

### Added
- Course finder on the Degree page, for finding courses that fill a requirement
- Degree side panels can be resized by dragging

### Changed
- Degree requirements are laid out as a grid of cards
- Modals open with a darken and rise animation

### Fixed
- Progress bar tracks are visible in every theme. In WPI Dark the unfilled part was invisible
- Sticky group headings in the course finder
- Empty slot markers in the degree buckets

## [2026-08-23]

### Added
- Degree buckets are editable. You can add your own, such as a minor, and rename, retarget or remove any bucket
- The app offers you a backup before the error banner clears your data

### Changed
- Degree courses are placed by hand instead of guessed for you
- Removed the Build Schedule button and the header from the Degree page

### Fixed
- The wizard selection no longer breaks every save
- Loading a schedule no longer hangs on a bad read
- Errors show a readable message instead of [object Object]
- Failed schedule deletes and switches are reported instead of failing silently

## [2026-08-22]

### Fixed
- Tutorial fixes
- Font loading

## [2026-08-20]

### Added
- The tutorial box can be dragged by touch
- The find element dot respects your reduced motion setting

### Changed
- Browser alert, confirm and prompt dialogs were replaced with the app's own
- Professor links have a visible underline

### Fixed
- Flash of the wrong theme on page load
- Themes no longer override your panel widths
- The wizard plays its close animation instead of skipping it

## [2026-06-24]

### Added
- The Degree page is connected to the planner schedule
- Sidebar panels can be resized by dragging

### Changed
- Degree progress updates live from the courses you have placed
- Umbrella requirements are hidden, and status filters allow more than one choice
- Course needed tiles are larger and show details on hover

## [2026-06-23]

### Added
- Degree page. Import your Workday Academic Progress file to see your requirements and what is left
- Build a schedule from your planned degree courses

## [2026-06-22]

### Added
- Change Sections button in the schedule course info modal

### Changed
- The selected courses panel expands with a slide and a staggered fly in
- Myriad Pro loads correctly and is used across the app
- Modals keep keyboard focus inside them and lock background scrolling

### Fixed
- Tutorial highlighting
- Section info modal header alignment

## [2026-06-16]

### Changed
- Refined the term badge animation in the classes list

### Fixed
- The wizard modal no longer opens above the viewport when the sidebar is scrolled

## [2026-06-15]

### Changed
- The interface was rebuilt in Svelte. What the app does is the same, but the UI updates more smoothly

## [2026-06-13]

### Changed
- The year filter defaults to the current academic year

## [2026-04-08]

### Added
- Hovering a course block in the schedule grid now highlights the corresponding course in the sidebar
- Schedule sidebar now groups courses by term (A, B, C, D) with labeled separators
- Focused term view now has a header bar with a back button and term label instead of a floating undo button

## [2026-03-31]

### Changed
- Courses with already-selected sections now appear as locked (excluded) by default in the auto-schedule modal, making it clear they won't be touched

### Added
- X button on the right side of the course search bar to quickly clear the search
- Professor search mode toggle in the search bar. Click the school icon to search by professor name only, with a live suggestions dropdown as you type
- Removed course and professor search bars from the filter modal (search is now handled from the main search bar)

### Fixed
- Tutorial course selection UI now properly refreshes when advancing past a course-selection step using the Next button after going back

## [2026-03-28]

### Added
- "Find Element" button in the tutorial floating text box. It animates a dot from the center of the screen to the highlighted element with a dark overlay, helping you locate the target
- First tutorial step now introduces the Find Element button by asking you to click it

### Changed
- Normalized z-indexes across the app to a clean tiered system (1-95 for UI, 100-300 for tutorial layers)
- Tutorial step descriptions now support inline HTML, with a marching ants highlight on the welcome step

## [2026-03-25]

### Fixed
- Tutorials now load significantly faster. Course selections during setup are batched into a single storage write instead of one per course
- Fixed a race condition where the first tutorial highlight would sometimes not appear on the auto-schedule tutorial
- Fixed tutorial highlight disappearing from the Auto Schedule button after the wizard closes

## [2026-03-24]

### Fixed
- Section selection wizard now shows a warning instead of hiding the Finish button when you haven't selected all required sections, letting you finish with an incomplete course if needed
- Fixed the Import button in the Schedules settings tab. It now opens a file picker immediately and names the new schedule after the imported file
- Auto-scheduler now respects locked sections when distributing courses across terms. A locked course in a term counts toward that term's course limit

### Removed
- Removed the "Clear Filters" button from the schedule sidebar header

### Changed
- Replaced the schedule counter (1/N) with a restart button that re-runs auto-schedule generation using your original section locks
- Added a thin progress bar at the bottom of the schedule sidebar footer showing your current position in the generated schedules

### Added
- The tutorial autoscheduler demo now includes 12 additional courses with realistic varied section times.
- Auto-schedule now picks the schedule with the least wasted time between classes. Schedules are generated by first deciding which term each course belongs to, then finding the section combination within each term that minimizes daily gaps.
- Auto-schedule intro screen now lets you toggle which terms to include per course. Deselecting all terms for a course excludes it from scheduling.
- Loading spinner on the Auto-Schedule button while schedules are being generated.

## [2026-03-23]

### Fixed
- Fixed courses from 2026-2027 not appearing when the year filter defaulted to 2026. The course data converter now correctly separates sections by academic year, so each year's offering of a course is listed independently with accurate sections and calendar dates.

## [2026-03-18]

### Changed
- Moved Calendar Events button to the schedule sidebar header, replacing the search bar

### Fixed
- Fixed course color picker freezing/crashing the page when used multiple times
- Custom course colors now persist correctly after page reload
- Fixed undo/redo requiring multiple steps after navigating between views, theme changes and automated updates
## [2026-03-17]

### Fixed
- Fixed a bug where all sections were filtered out in the course selection wizard when filters were active

### Fixed
- Tutorial highlight outline is now perfectly centered around bordered elements
- Tutorial highlight now appears correctly on elements that are hidden or not yet laid out when a step starts

### Added
- Each tutorial now ends with a wrap-up step; the Next button shows "Next Tutorial" on the final step of each tutorial
- Tutorial now creates a dedicated "Tutorial" schedule so your real schedules stay untouched
- Added individual tutorial buttons to the settings panel so you can restart specific tutorials
- Tutorial courses no longer persist to storage between sessions

### Fixed
- Tutorial no longer creates a stray "My Schedule" on every page reload
- Tutorial schedule is properly cleaned up when the tutorial finishes

## [2026-03-16]

### Added
- Added an interactive tutorial that walks new users through adding a course and setting up sections
- Tutorial courses are removed from the course list once the tutorial is complete
- The app now remembers if you've visited before
- Courses now include a WPI category (1, 2, or 3) parsed from their description
- Click a custom event in the schedule grid to delete it via a confirmation dialog

### Fixed
- Tutorial "Next" button now directly performs each step's action
- Dragging the tutorial box no longer stretches it vertically
- Tutorial box now repositions to a free corner when it would cover the highlighted element
- Course select and bookmark buttons no longer flash when deselected while hovering (Most annoying bug ever)
- Deleting a local calendar event now correctly updates the event count on the calendar button

### Improved
- Removed the course listing header label. The content header now only shows the search and filter controls
- Term graphs no longer show a separate header. The term letter (A/B/C/D) is now embedded in the schedule grid's first cell, giving more space to the actual schedule
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
- Creating a new schedule no longer inherits courses from the previously active schedule. New schedules start empty
- Creating a new schedule now automatically switches to it
- Clicking the bookmark or select button on a course card no longer feels sluggish. Buttons now respond instantly without triggering unintended side effects
- Course list now renders all at once instead of in small batches, eliminating a race condition where button clicks during loading would revert

### Changed
- Removed mobile hamburger/overlay UI; panels follow standard responsive layout at all screen sizes
- Mobile devices now see a notice that mobile support is temporarily unavailable
- Improved internal conflict detection performance by switching to a bitmask-based engine

## [2026-03-03]

### Improved
- The course component wizard now shows only the steps relevant to the selected lecture. Lectures with no labs or discussions skip those steps entirely and go straight to Finish

### Fixed
- ICS export now uses each course's own academic year for event dates instead of defaulting to the most recent year
- Importing schedules exported from v4.2 no longer fails with "Unsupported import format"



### Fixed
- Hovering a section in the wizard after clicking it no longer shows it as a dashed preview. It stays solid
- Re-opening the wizard in editing mode no longer shows already-confirmed sections (like discussions) as ghost previews when hovering a lecture card

## [2026-02-28]

### Improved
- Schedule grid no longer re-renders when navigating away from the schedule page, reducing unnecessary work on startup and schedule switches
- Schedule grid rendering is now faster. Course data is scanned once per render instead of once per grid cell

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
- Academic Year filter in course and schedule filter modals. Filter courses by 2025-2026 or 2026-2027
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
- Unified conflict detection system. Calendar events and section conflicts now use the same filtering mechanism
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
- Removed cloud calendar integration. Local events continue to work

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
- Fixed availability filter "hide conflicting periods" toggle. It now properly persists and filters out courses that conflict with selected sections
- Fixed term-badges-container not reappearing after filtering/unfiltering
- Fixed cloud status button inconsistently displaying "Sync with cloud" when cloud sync is unavailable
