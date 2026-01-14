# Changelog

## [Unreleased]

### Removed
- **Removed cloud sync provider implementations** (Google Drive, OneDrive, Google Calendar)
  - Cloud sync feature was buggy and unreliable, causing data sync issues for users
  - All cloud provider implementations deleted: GoogleDriveProvider, OneDriveProvider, GoogleCalendarProvider
  - Provider configuration files removed
  - MainController no longer initializes any cloud providers
  - CloudStatusButton now shows "Cloud sync unavailable" with disabled state
  - **Infrastructure preserved**: SyncManager, SyncEventBus, ProviderRegistry, types, UI components remain intact
  - All sync infrastructure is provider-agnostic and ready for future reimplementation
  - Tests updated to use mock providers only
  - Documentation updated to reflect infrastructure-only state
  - To re-enable: Implement CloudProvider interface, register with ProviderRegistry, all infrastructure works immediately

### Fixed
- Fixed cloud sync sign-in flow to properly detect and resolve conflicts when signing in on different devices
  - Separated authentication from data synchronization operations in SyncManager
  - Added `performInitialSync()` method that pulls cloud data first before any upload
  - **First-time sign-in**: If local device has no schedules, cloud data is automatically imported without showing conflict modal
  - **Existing data**: Cloud data is compared with local data, triggering conflict modal when checksums differ
  - Silent authentication (on app startup) now triggers sync check and conflict resolution
  - Upload to cloud only occurs when user explicitly chooses "Use Local" in conflict modal
  - If user chooses "Use Cloud", no upload is performed (data is imported locally)
  - Disabled legacy GoogleDriveSyncService auto-push behavior that was bypassing conflict detection
  - GoogleDriveSyncService no longer auto-syncs on authentication or local save events
- Fixed CloudStatusButton not updating after sync conflict resolution
  - Added dedicated 'conflict-pending' state with no auto-timeout to prevent timer collisions
  - Conflict state persists until user explicitly resolves via modal (no 3-second auto-transition)
  - `sync-resolved` event now explicitly clears pending states and transitions button to idle
  - Button immediately shows "Cloud connected" status after user resolves conflict

### Tests
- Added comprehensive test suite for `performInitialSync()` with 8 tests covering all scenarios
- Tests validate pull-before-push behavior, first-time auto-import, conflict detection, and error handling
