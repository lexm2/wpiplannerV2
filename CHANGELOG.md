# Changelog

## [2026-01-15]

### Fixed
- Fixed ICS calendar export generating blank files or "no courses found" error
- Fixed header navigation and controls overlapping on smaller screens

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
