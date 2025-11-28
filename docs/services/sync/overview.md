# Cloud Sync System - Overview

## Purpose

The Cloud Sync System is a comprehensive, event-driven architecture that synchronizes WPI Planner user data across multiple devices using cloud storage providers. The system implements a **push-only sync strategy** with intelligent conflict detection during sign-in (SSO - Sign-in Single Opportunity), ensuring data consistency while maintaining simplicity and reliability.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Provider Pattern](#provider-pattern)
4. [Data Flow](#data-flow)
5. [Event System](#event-system)
6. [Configuration](#configuration)
7. [File Locations](#file-locations)
8. [Design Principles](#design-principles)

---

## Architecture Overview

The Cloud Sync System is built on a modular, extensible architecture that separates concerns into distinct layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI Layer                                 │
│  ┌────────────────────┐         ┌─────────────────────────┐     │
│  │ CloudStatusButton  │ ◄─────► │    ModalService         │     │
│  │ (Status Display)   │         │ (Conflict Resolution UI)│     │
│  └────────────────────┘         └─────────────────────────┘     │
└───────────────────┬──────────────────────────┬───────────────────┘
                    │                          │
                    ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Event Communication Layer                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    SyncEventBus                          │    │
│  │  (Centralized pub/sub for all sync events)              │    │
│  └─────────────────────────────────────────────────────────┘    │
└───────────────────┬──────────────────────────┬───────────────────┘
                    │                          │
                    ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   State Management Layer                         │
│  ┌──────────────────────┐       ┌─────────────────────────┐     │
│  │ ProfileStateManager  │◄─────►│     SyncManager         │     │
│  │ (Local State & Save) │       │ (Sync Orchestration)    │     │
│  └──────────────────────┘       └──────────┬──────────────┘     │
│                                             │                    │
│                                             ▼                    │
│                                 ┌───────────────────────┐        │
│                                 │  ProviderRegistry     │        │
│                                 │  (Provider Lookup)    │        │
│                                 └───────────┬───────────┘        │
└─────────────────────────────────────────────┼───────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Provider Layer                              │
│  ┌──────────────────────┐       ┌─────────────────────────┐     │
│  │ GoogleDriveProvider  │       │   OneDriveProvider      │     │
│  │ ┌────────────────┐   │       │   ┌────────────────┐    │     │
│  │ │ Auth Service   │   │       │   │ Auth Service   │    │     │
│  │ │ (OAuth/Google) │   │       │   │ (MSAL/Azure)   │    │     │
│  │ └────────────────┘   │       │   └────────────────┘    │     │
│  │ ┌────────────────┐   │       │   ┌────────────────┐    │     │
│  │ │ Sync Service   │   │       │   │ Sync Service   │    │     │
│  │ │ (Drive API)    │   │       │   │ (Graph API)    │    │     │
│  │ └────────────────┘   │       │   └────────────────┘    │     │
│  └──────────────────────┘       └─────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                    │                          │
                    ▼                          ▼
         ┌─────────────────┐        ┌─────────────────┐
         │  Google Drive   │        │    OneDrive     │
         │  appDataFolder  │        │   AppFolder     │
         └─────────────────┘        └─────────────────┘
```

---

## Core Components

### 1. SyncManager

**Location**: `/home/lex/Documents/Github/wpiplannerV2/src/services/sync/SyncManager.ts`

The central orchestrator responsible for:
- Managing the sync lifecycle (sign-in, sign-out, push)
- Coordinating with the active cloud provider
- Detecting and managing conflicts during sign-in
- Implementing push debouncing (3 seconds default)
- Emitting sync events via SyncEventBus

**Key Features**:
- Singleton pattern ensures single point of coordination
- Push-only strategy (no automatic pull after sign-in)
- SSO conflict checking (checks for conflicts only during sign-in)
- 3-second debouncing for push operations to reduce API calls

### 2. SyncEventBus

**Location**: `/home/lex/Documents/Github/wpiplannerV2/src/services/sync/SyncEventBus.ts`

A centralized publish-subscribe event bus for all sync-related events:
- Decouples components through event-driven communication
- Supports wildcard listeners (`'*'`) for debugging/monitoring
- Type-safe event handling with TypeScript
- Error-isolated event processing (one listener error won't break others)

**Event Types**:
```typescript
type SyncEventType =
    | 'auth-changed'           // Authentication state changed
    | 'sync-conflict'          // Conflict detected during sign-in
    | 'sync-resolved'          // User resolved a conflict
    | 'sync-pushed'            // Data pushed to cloud
    | 'sync-failed'            // Sync operation failed
    | 'local-save-completed';  // Local save completed (triggers push)
```

### 3. ProviderRegistry

**Location**: `/home/lex/Documents/Github/wpiplannerV2/src/services/sync/ProviderRegistry.ts`

A registry that manages cloud provider instances:
- Dynamic provider registration/unregistration
- Provider lookup by ID
- Provider lifecycle management (dispose on unregister)
- Listing available providers and their authentication status

### 4. ProfileStateManager

**Location**: `/home/lex/Documents/Github/wpiplannerV2/src/core/ProfileStateManager.ts`

The single source of truth for application state:
- Manages schedules, courses, and preferences
- Handles local persistence to localStorage
- Emits `local-save-completed` events that trigger cloud push
- Provides data export for cloud sync

### 5. CloudStatusButton

**Location**: `/home/lex/Documents/Github/wpiplannerV2/src/ui/components/CloudStatusButton.ts`

The UI component that:
- Displays sync status to users
- Handles sign-in/sign-out user interactions
- Shows real-time sync progress and states
- Adapts display based on provider (shows provider icon)

---

## Provider Pattern

The system uses an extensible provider pattern to support multiple cloud storage services. Each provider implements the `CloudProvider` interface:

```typescript
export interface CloudProvider {
    readonly id: string;           // Unique identifier (e.g., 'googledrive')
    readonly displayName: string;  // User-facing name (e.g., 'Google Drive')
    readonly icon?: string;        // Icon identifier

    // Lifecycle
    initialize(): Promise<void>;   // Load SDKs, setup client
    dispose(): void;               // Cleanup resources

    // Authentication
    signIn(): Promise<void>;       // Authenticate user
    signOut(): Promise<void>;      // Sign out user
    isAuthenticated(): boolean;    // Check auth status

    // Data operations
    pushData(data: SyncData): Promise<void>;      // Push data to cloud
    pullData(): Promise<SyncData | null>;          // Pull data from cloud
}
```

---

## Data Structure

The sync system uses an **optimized data structure** that stores only IDs and references, not full objects. This reduces cloud file size by 80-90% and improves sync performance.

### SyncData Interface

```typescript
export interface SyncData {
    version: string;                    // Format version (for migrations)
    timestamp: number;                  // Last modified timestamp
    checksum: string;                   // Data integrity hash
    activeScheduleId: string | null;   // Currently active schedule ID
    schedules: ScheduleData[];          // Array of schedules
    preferences?: unknown;              // User preferences
}
```

### ScheduleData Interface

```typescript
export interface ScheduleData {
    id: string;                         // Schedule UUID
    name: string;                       // User-provided name
    selectedCourses: SelectedCourseData[];  // Selected courses
}
```

### SelectedCourseData Interface (Optimized)

**IMPORTANT**: This structure stores only **IDs and CRNs**, not full course/section objects:

```typescript
export interface SelectedCourseData {
    courseId: string;               // Course ID (e.g., "CS-1101")
    selectedSectionCrn?: string;   // Selected section CRN (e.g., "12345")
    lockedSectionCrn?: string;      // Locked section CRN if any
    isRequired: boolean;            // Required vs optional course
    timestamp?: number;             // Selection timestamp (for merge conflicts)
}
```

**Storage Optimization**:
```
OLD (full objects):
{
    courseId: "CS-1101",
    courseName: "Introduction to Program Design",
    selectedSection: {
        crn: "12345",
        sectionCode: "A01",
        instructor: "John Doe",
        periods: [ /* 5+ period objects with full details */ ],
        // ... 50+ more fields
    }
}
Size per course: ~15-20 KB

NEW (IDs only):
{
    courseId: "CS-1101",
    selectedSectionCrn: "12345",
    isRequired: true,
    timestamp: 1701234567890
}
Size per course: ~100 bytes

Reduction: 99% smaller!
```

**Reconstruction on Load**:
When pulling from cloud, the system:
1. Downloads minimal SyncData (~5-10 KB instead of 500 KB)
2. Looks up course IDs in local catalog (`course-data-constructed.json`)
3. Looks up section CRNs within those courses
4. Rebuilds full object graph in memory
5. Total time: ~50ms (vs 200ms+ parsing large JSON)

**Benefits**:
- 80-90% reduction in cloud file size
- Faster upload/download (less bandwidth)
- O(n) reconstruction instead of O(n×m) object reconciliation
- No risk of catalog/cloud data mismatch (IDs are stable)
- Enables efficient merge strategies (timestamp per selection)

---

### Current Providers

1. **GoogleDriveProvider**
   - Uses Google Identity Services (GIS) for OAuth
   - Stores data in `appDataFolder` (hidden from user)
   - File name: `wpi-planner-state.json`

2. **OneDriveProvider** *(Legacy - uses old pattern)*
   - Uses Microsoft Authentication Library (MSAL)
   - Stores data in OneDrive AppFolder
   - File name: `wpi-planner-state.json`

### Adding a New Provider

To add a new cloud provider:

1. **Implement the `CloudProvider` interface**:
```typescript
export class DropboxProvider implements CloudProvider {
    readonly id = 'dropbox';
    readonly displayName = 'Dropbox';
    readonly icon = 'BRAND_DROPBOX';

    async initialize(): Promise<void> {
        // Load Dropbox SDK, initialize client
    }

    dispose(): void {
        // Cleanup
    }

    async signIn(): Promise<void> {
        // OAuth flow
        syncEventBus.emitEvent('auth-changed', { authenticated: true });
    }

    async signOut(): Promise<void> {
        // Revoke token
        syncEventBus.emitEvent('auth-changed', { authenticated: false });
    }

    isAuthenticated(): boolean {
        // Check token validity
    }

    async pushData(data: SyncData): Promise<void> {
        // Upload to Dropbox
    }

    async pullData(): Promise<SyncData | null> {
        // Download from Dropbox
    }
}
```

2. **Register the provider**:
```typescript
import { providerRegistry } from './ProviderRegistry';

const dropboxProvider = new DropboxProvider();
await dropboxProvider.initialize();
providerRegistry.register(dropboxProvider);
```

3. **Create configuration file** (e.g., `src/config/dropbox.config.ts`):
```typescript
export interface DropboxConfig {
    clientId: string;
    redirectUri: string;
    appFolderPath: string;
}

export const DROPBOX_CONFIG: DropboxConfig = {
    clientId: import.meta.env.VITE_DROPBOX_CLIENT_ID,
    redirectUri: window.location.origin,
    appFolderPath: 'wpi-planner-state.json',
};
```

---

## Data Flow

### Complete Sync Flow: Local Save to Cloud Push

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. User Action (Add/Remove Course, Change Section)                   │
└────────────────┬─────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. ProfileStateManager.withStateUpdate()                             │
│    - Modifies in-memory state                                        │
│    - Calls persistState()                                            │
└────────────────┬─────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. TransactionalStorageManager.saveState()                           │
│    - Serializes state with JSON replacer                            │
│    - Writes to localStorage atomically                              │
│    - Returns success/failure                                         │
└────────────────┬─────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. ProfileStateManager emits 'save_state_changed'                    │
│    - hasUnsavedChanges: false                                        │
└────────────────┬─────────────────────────────────────────────────────┘
                 │
                 ├─────────────────────────────────────────────────────┐
                 │                                                     │
                 ▼                                                     ▼
┌──────────────────────────────────┐   ┌───────────────────────────────┐
│ 5a. CloudStatusButton            │   │ 5b. SyncEventBus              │
│     - Updates UI to "Saving..."  │   │     - Emits 'local-save-      │
│     - Then "Saved" (500ms)       │   │       completed'              │
└──────────────────────────────────┘   └────────────┬──────────────────┘
                                                      │
                                                      ▼
                                        ┌──────────────────────────────┐
                                        │ 6. SyncManager.schedulePush()│
                                        │    - Clears existing timer   │
                                        │    - Sets 3s debounce timer  │
                                        └────────────┬─────────────────┘
                                                      │
                                    ┌─────────────────┴─────────────────┐
                                    │ Wait 3 seconds                    │
                                    │ (Additional saves reset timer)    │
                                    └─────────────────┬─────────────────┘
                                                      │
                                                      ▼
                                        ┌──────────────────────────────┐
                                        │ 7. SyncManager.pushToCloud() │
                                        │    - Get local sync data     │
                                        │    - Set status: 'syncing'   │
                                        └────────────┬─────────────────┘
                                                      │
                                                      ▼
                                        ┌──────────────────────────────┐
                                        │ 8. Provider.pushData()       │
                                        │    - Enrich with metadata    │
                                        │    - Upload to cloud API     │
                                        │    - Update/create file      │
                                        └────────────┬─────────────────┘
                                                      │
                                                      ▼
                                        ┌──────────────────────────────┐
                                        │ 9. SyncEventBus              │
                                        │    - Emit 'sync-pushed'      │
                                        └────────────┬─────────────────┘
                                                      │
                                                      ▼
                                        ┌──────────────────────────────┐
                                        │ 10. CloudStatusButton        │
                                        │     - Shows "Uploaded"       │
                                        │     - Transitions to idle    │
                                        └──────────────────────────────┘
```

### Sign-In Flow with SSO Conflict Check

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. User clicks CloudStatusButton (unauthenticated)                   │
└────────────────┬─────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. CloudStatusButton.handleClick()                                   │
│    - Export local data from ProfileStateManager                      │
│    - Convert to SyncData format                                      │
└────────────────┬─────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. SyncManager.handleSignIn(localData)                               │
│    - Call provider.signIn()                                          │
└────────────────┬─────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. Provider.signIn() (OAuth/MSAL flow)                               │
│    - User authenticates                                              │
│    - Emit 'auth-changed' event                                       │
└────────────────┬─────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 5. SyncManager.handleSignIn() continues                              │
│    - Pull cloud data with provider.pullData()                        │
└────────────────┬─────────────────────────────────────────────────────┘
                 │
                 ├─────────────────────────────────────────────────────┐
                 │                                                     │
                 ▼                                                     ▼
┌──────────────────────────────────┐   ┌───────────────────────────────┐
│ 6a. No Cloud File Found          │   │ 6b. Cloud File Exists         │
│     - Push local data as initial │   │     - Detect conflicts        │
│     - Emit 'sync-pushed'         │   │     - Compare courses/sections│
└──────────────────────────────────┘   └────────────┬──────────────────┘
                                                      │
                                    ┌─────────────────┴─────────────────┐
                                    │                                   │
                                    ▼                                   ▼
                        ┌───────────────────────┐   ┌─────────────────────────┐
                        │ 7a. No Conflict       │   │ 7b. Conflict Detected   │
                        │     - Push local data │   │     - Set status:       │
                        │     - Emit 'sync-     │   │       'conflict'        │
                        │       pushed'         │   │     - Emit 'sync-       │
                        └───────────────────────┘   │       conflict' with    │
                                                    │       ConflictInfo      │
                                                    └────────────┬────────────┘
                                                                 │
                                                                 ▼
                                                    ┌──────────────────────────┐
                                                    │ 8. ModalService          │
                                                    │    - Show conflict modal │
                                                    │    - User chooses:       │
                                                    │      • local             │
                                                    │      • cloud             │
                                                    │      • cancel            │
                                                    └────────────┬─────────────┘
                                                                 │
                                                                 ▼
                                                    ┌──────────────────────────┐
                                                    │ 9. SyncManager.resolve   │
                                                    │    Conflict()            │
                                                    │    - Apply chosen data   │
                                                    │    - Push to cloud       │
                                                    │    - Emit 'sync-resolved'│
                                                    └──────────────────────────┘
```

---

## Event System

The Cloud Sync System uses `SyncEventBus` as the central communication hub. All components subscribe to and emit events through this bus.

### Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        SyncEventBus                              │
│                    (Central Event Hub)                           │
└────┬────────┬────────┬────────┬────────┬────────┬───────────────┘
     │        │        │        │        │        │
     │        │        │        │        │        │
     ▼        ▼        ▼        ▼        ▼        ▼
┌─────────┐ ┌────┐ ┌────────┐ ┌──────┐ ┌────────┐ ┌────────────┐
│Profile  │ │Sync│ │Provider│ │Cloud │ │Modal   │ │  Other     │
│State    │ │Mgr │ │Registry│ │Status│ │Service │ │ Listeners  │
│Manager  │ │    │ │        │ │Button│ │        │ │            │
└─────────┘ └────┘ └────────┘ └──────┘ └────────┘ └────────────┘
```

### Event Subscriptions

| Component               | Subscribes To                     | Emits                          |
|------------------------|-----------------------------------|--------------------------------|
| **SyncManager**         | `local-save-completed`           | `auth-changed`, `sync-conflict`, `sync-resolved`, `sync-pushed`, `sync-failed` |
| **CloudStatusButton**   | All events (`*`)                 | None (UI only)                 |
| **ProfileStateManager** | None                             | `local-save-completed` (via SyncEventBus) |
| **GoogleDriveProvider** | None                             | `auth-changed`                 |
| **OneDriveAuthService** | None                             | `auth-changed`                 |
| **ModalService**        | `sync-conflict`                  | None                           |

### Example: Event Subscription

```typescript
import { syncEventBus } from './SyncEventBus';

// Subscribe to specific event
syncEventBus.on('sync-pushed', (event) => {
    console.log('Data pushed at:', event.timestamp);
    console.log('Source:', event.data?.source);
});

// Subscribe to all events (debugging)
syncEventBus.on('*', (event) => {
    console.log(`[SyncEvent] ${event.type}`, event);
});

// Unsubscribe
const unsubscribe = syncEventBus.on('auth-changed', handler);
unsubscribe(); // Call returned function to unsubscribe
```

---

## Configuration

### Google Drive Configuration

**Location**: `/home/lex/Documents/Github/wpiplannerV2/src/config/googledrive.config.ts`

```typescript
export const GOOGLE_DRIVE_CONFIG: GoogleDriveConfig = {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    appDataFolderName: 'wpi-planner-state.json',
    syncDebounceMs: 2500,                          // Not used (SyncManager controls)
    autoSyncEnabled: true,                         // Not used (always auto-sync)
    conflictResolutionStrategy: 'manual',          // Always manual
};
```

**Environment Variable Required**:
```bash
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### OneDrive Configuration

**Location**: `/home/lex/Documents/Github/wpiplannerV2/src/config/onedrive.config.ts`

```typescript
export const ONEDRIVE_CONFIG: OneDriveConfig = {
    msalConfig: {
        auth: {
            clientId: import.meta.env.VITE_ONEDRIVE_CLIENT_ID,
            authority: 'https://login.microsoftonline.com/common',
            redirectUri: window.location.origin,
        },
        cache: {
            cacheLocation: 'localStorage',
            storeAuthStateInCookie: false,
        },
    },
    scopes: ['Files.ReadWrite.AppFolder', 'offline_access', 'User.Read'],
    appFolderPath: 'wpi-planner-state.json',
    syncDebounceMs: 2500,
    autoSyncEnabled: true,
    conflictResolutionStrategy: 'manual',
};
```

**Environment Variable Required**:
```bash
VITE_ONEDRIVE_CLIENT_ID=your-azure-app-id
```

---

## File Locations

### Core Sync System
```
src/services/sync/
├── SyncManager.ts              # Main orchestrator
├── SyncEventBus.ts             # Event bus
├── ProviderRegistry.ts         # Provider registry
├── CloudSyncFactory.ts         # Legacy factory (deprecated)
├── types.ts                    # TypeScript type definitions
└── interfaces/
    ├── CloudAuthService.ts     # Auth interface (OneDrive pattern)
    └── CloudSyncService.ts     # Sync interface (OneDrive pattern)
```

### Providers
```
src/services/sync/providers/
├── googledrive/
│   ├── GoogleDriveProvider.ts      # New provider pattern
│   ├── GoogleDriveAuthService.ts   # Legacy (deprecated)
│   └── GoogleDriveSyncService.ts   # Legacy (deprecated)
└── onedrive/
    ├── OneDriveAuthService.ts      # MSAL authentication
    └── OneDriveSyncService.ts      # Graph API sync
```

### Configuration
```
src/config/
├── googledrive.config.ts      # Google Drive settings
└── onedrive.config.ts         # OneDrive/MSAL settings
```

### UI Components
```
src/ui/components/
└── CloudStatusButton.ts       # Sync status UI
```

### State Management
```
src/core/
└── ProfileStateManager.ts     # Application state & local storage
```

---

## Design Principles

### 1. Push-Only Strategy

The system uses a **push-only** approach:
- **Local changes trigger push**: Every local save triggers a debounced push to cloud
- **No automatic pull**: The system never automatically pulls from cloud (except during sign-in)
- **Conflict detection only at SSO**: Conflicts are checked only during sign-in

**Rationale**:
- Simplifies sync logic (unidirectional flow)
- Prevents unexpected data overwrites during active work
- User maintains control over when cloud data is retrieved

### 2. SSO Conflict Checking

**SSO (Sign-in Single Opportunity)**: Conflicts are detected only when signing in.

**Flow**:
1. User signs in
2. System pulls cloud data
3. Compares local vs. cloud
4. If conflict exists, shows modal
5. User chooses resolution
6. System applies chosen data and pushes to cloud

**After sign-in**: No more conflict checking. Local changes always push to cloud.

### 3. Debounced Push (3 seconds)

To reduce API calls and improve performance:
- Each local save schedules a push operation
- Timer is reset if another save occurs within 3 seconds
- Final push happens 3 seconds after the last save

**Example**:
```
User adds Course A → Timer starts (3s)
User adds Course B (2s later) → Timer resets (3s)
User removes Course A (1s later) → Timer resets (3s)
... wait 3 seconds ...
→ Single push operation (final state only)
```

### 4. Event-Driven Architecture

All components communicate via `SyncEventBus`:
- **Decoupling**: Components don't need direct references to each other
- **Extensibility**: New components can listen to existing events
- **Debugging**: Wildcard listeners enable comprehensive logging
- **Error isolation**: One component's error doesn't cascade

### 5. Provider Abstraction

The `CloudProvider` interface enables:
- **Multiple providers**: Easy to add new cloud services
- **Provider switching**: Users can change providers without code changes
- **Testability**: Mock providers for unit tests
- **Consistency**: All providers implement the same contract

---

## Next Steps

For detailed information on specific components:

1. **[SyncManager Documentation](./sync-manager.md)** - Orchestration and lifecycle
2. **[SyncEventBus Documentation](./event-bus.md)** - Event system details
3. **[Google Drive Provider Documentation](./google-drive-provider.md)** - OAuth and Drive API
4. **[OneDrive Provider Documentation](./onedrive-provider.md)** - MSAL and Graph API
5. **[Conflict Resolution Documentation](./conflict-resolution.md)** - Conflict detection and UI

---

## API Quick Reference

### SyncManager

```typescript
const syncManager = SyncManager.getInstance();

// Set active provider
syncManager.setProvider('googledrive');

// Sign in with conflict check
const conflict = await syncManager.handleSignIn(localData);

// Resolve conflict
await syncManager.resolveConflict('local', onApplyCloudData);

// Sign out
await syncManager.signOut();

// Get status
const status = syncManager.getStatus(); // 'idle' | 'syncing' | 'conflict' | 'error' | 'not_authenticated'
```

### SyncEventBus

```typescript
import { syncEventBus } from './SyncEventBus';

// Subscribe
const unsubscribe = syncEventBus.on('sync-pushed', (event) => {
    console.log('Pushed:', event.data);
});

// Emit
syncEventBus.emitEvent('local-save-completed');

// Unsubscribe
unsubscribe();
```

### ProviderRegistry

```typescript
import { providerRegistry } from './ProviderRegistry';

// Register provider
providerRegistry.register(myProvider);

// Get provider
const provider = providerRegistry.get('googledrive');

// List all providers
const providers = providerRegistry.listProviders();
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-27
**Maintainer**: WPI Planner V2 Team
